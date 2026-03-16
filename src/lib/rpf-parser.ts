// RPF7 アーカイブパーサー — ファイル抽出・ネスト RPF 対応
import { inflateRaw } from "pako";
import type { ParsedRPF, RPFEntry } from "./types";

const RPF7_MAGIC = 0x52504637;
const DIR_MARKER = 0x7fffff00;
const OPEN_TAG = 0x4e45504f;

export async function parseRPFFile(file: File): Promise<ParsedRPF> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  return parseRPF7(data, true);
}

// ページフラグからサイズ算出
function getResourcePageSize(flags: number): number {
  if (flags === 0) return 0;
  const s0 = (flags >>> 27) & 0x1;
  const s1 = ((flags >>> 26) & 0x1) << 1;
  const s2 = ((flags >>> 25) & 0x1) << 2;
  const s3 = ((flags >>> 24) & 0x1) << 3;
  const s4 = ((flags >>> 17) & 0x7f) << 4;
  const s5 = ((flags >>> 11) & 0x3f) << 5;
  const s6 = ((flags >>> 7) & 0xf) << 6;
  const s7 = ((flags >>> 5) & 0x3) << 7;
  const s8 = ((flags >>> 4) & 0x1) << 8;
  const baseSize = 0x200 << (flags & 0xf);
  return baseSize * (s0 + s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8);
}

// エントリからファイルデータ情報を取得
interface FileDataInfo {
  byteOffset: number;
  compressedSize: number;
  uncompressedSize: number;
  isResource: boolean;
}

function parseFileEntry(data: Uint8Array, view: DataView, off: number): FileDataInfo {
  const b = data.subarray(off, off + 16);
  const isResource = (b[7]! & 0x80) !== 0;
  const blockOffset = b[5]! | (b[6]! << 8) | ((b[7]! & 0x7f) << 16);
  const byteOffset = blockOffset * 512;

  if (isResource) {
    const systemFlags = view.getUint32(off + 8, true);
    const graphicsFlags = view.getUint32(off + 12, true);
    const size = getResourcePageSize(systemFlags) + getResourcePageSize(graphicsFlags) + 16;
    return { byteOffset, compressedSize: 0, uncompressedSize: size, isResource: true };
  }

  const compressedSize = b[2]! | (b[3]! << 8) | (b[4]! << 16);
  const uncompressedSize = view.getUint32(off + 8, true);
  return { byteOffset, compressedSize, uncompressedSize, isResource: false };
}

// RPF からファイルデータを抽出
function extractFileData(
  rpfData: Uint8Array,
  info: FileDataInfo,
): Uint8Array | null {
  const { byteOffset, compressedSize, uncompressedSize, isResource } = info;

  if (isResource) {
    // リソースファイル: RSC7ヘッダー + 圧縮データをそのまま返す
    // サイズは展開後のサイズを使う（ディスク上のサイズは不明なので範囲チェック緩め）
    const end = Math.min(byteOffset + uncompressedSize, rpfData.length);
    if (byteOffset >= rpfData.length) return null;
    return rpfData.subarray(byteOffset, end);
  }

  const isCompressed = compressedSize > 0;
  const dataSize = isCompressed ? compressedSize : uncompressedSize;
  if (byteOffset + dataSize > rpfData.length || dataSize === 0) return null;

  const rawChunk = rpfData.subarray(byteOffset, byteOffset + dataSize);
  if (!isCompressed) return rawChunk;

  try {
    return inflateRaw(rawChunk);
  } catch {
    return null;
  }
}

// RPF7 パーサー
export function parseRPF7(data: Uint8Array, recursive = false): ParsedRPF {
  if (data.length < 16) throw new Error("File too small for RPF7");

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== RPF7_MAGIC) {
    throw new Error(`Invalid RPF7 magic: 0x${magic.toString(16)}`);
  }

  const entryCount = view.getUint32(4, true);
  const namesLength = view.getUint32(8, true);
  const encryption = view.getUint32(12, true);

  if (encryption !== 0 && encryption !== OPEN_TAG) {
    throw new Error(`Encrypted RPF not supported (0x${encryption.toString(16)})`);
  }

  const tocOffset = 16;
  const namesOffset = tocOffset + entryCount * 16;
  if (namesOffset + namesLength > data.length) throw new Error("RPF7 file truncated");
  const namesData = data.subarray(namesOffset, namesOffset + namesLength);

  // ディレクトリ/ファイル情報
  interface RawEntry {
    nameOffset: number;
    isDir: boolean;
    childStart: number;
    childCount: number;
    fileInfo: FileDataInfo | null;
  }

  const rawEntries: RawEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    const off = tocOffset + i * 16;
    const v1 = view.getUint32(off + 4, true);

    if (v1 === DIR_MARKER) {
      rawEntries.push({
        nameOffset: view.getUint16(off, true),
        isDir: true,
        childStart: view.getUint32(off + 8, true),
        childCount: view.getUint32(off + 12, true),
        fileInfo: null,
      });
    } else {
      rawEntries.push({
        nameOffset: data[off]! | (data[off + 1]! << 8),
        isDir: false,
        childStart: 0,
        childCount: 0,
        fileInfo: parseFileEntry(data, view, off),
      });
    }
  }

  let totalFiles = 0;
  let totalDirectories = 0;

  function buildEntry(raw: RawEntry): RPFEntry {
    const name = readNullString(namesData, raw.nameOffset);

    if (raw.isDir) {
      totalDirectories++;
      const children: RPFEntry[] = [];
      for (let i = 0; i < raw.childCount; i++) {
        const childIdx = raw.childStart + i;
        if (childIdx >= 0 && childIdx < rawEntries.length) {
          children.push(buildEntry(rawEntries[childIdx]!));
        }
      }
      children.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return { name: name || "(root)", isDirectory: true, children };
    }

    totalFiles++;
    const info = raw.fileInfo!;
    const isCompressed = !info.isResource && info.compressedSize > 0;
    const entry: RPFEntry = {
      name,
      isDirectory: false,
      children: [],
      offset: info.byteOffset,
      size: info.uncompressedSize,
      compressedSize: isCompressed ? info.compressedSize : undefined,
      isResource: info.isResource,
    };

    // ネスト RPF を再帰的にパース
    if (recursive && name.toLowerCase().endsWith(".rpf") && info.uncompressedSize > 16) {
      try {
        const fileData = extractFileData(data, info);
        if (fileData && fileData.length >= 16) {
          const fv = new DataView(fileData.buffer, fileData.byteOffset, fileData.byteLength);
          if (fv.getUint32(0, true) === RPF7_MAGIC) {
            const innerRPF = parseRPF7(fileData, true);
            entry.children = innerRPF.root.children;
            entry.isDirectory = true;
            totalFiles--;
            totalDirectories++;
            totalFiles += innerRPF.totalFiles;
            totalDirectories += innerRPF.totalDirectories;
          }
        }
      } catch {
        // ネストパース失敗は無視
      }
    }

    return entry;
  }

  const root = rawEntries.length > 0
    ? buildEntry(rawEntries[0]!)
    : { name: "(empty)", isDirectory: true, children: [] };

  return { root, totalFiles, totalDirectories, rawData: data };
}

// RPF 内の全ファイルを抽出（ZIP ダウンロード用）
export function extractAllFiles(rpfData: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const view = new DataView(rpfData.buffer, rpfData.byteOffset, rpfData.byteLength);
  const entryCount = view.getUint32(4, true);
  const namesLength = view.getUint32(8, true);
  const tocOffset = 16;
  const namesOffset = tocOffset + entryCount * 16;
  const namesData = rpfData.subarray(namesOffset, namesOffset + namesLength);

  interface PathEntry {
    name: string;
    isDir: boolean;
    childStart: number;
    childCount: number;
  }

  const entries: PathEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    const off = tocOffset + i * 16;
    const v1 = view.getUint32(off + 4, true);
    const nameOff = rpfData[off]! | (rpfData[off + 1]! << 8);
    const name = readNullString(namesData, nameOff);

    if (v1 === DIR_MARKER) {
      entries.push({
        name,
        isDir: true,
        childStart: view.getUint32(off + 8, true),
        childCount: view.getUint32(off + 12, true),
      });
    } else {
      entries.push({ name, isDir: false, childStart: 0, childCount: 0 });
    }
  }

  function walk(entryIdx: number, prefix: string) {
    const entry = entries[entryIdx];
    if (!entry?.isDir) return;

    for (let i = 0; i < entry.childCount; i++) {
      const childIdx = entry.childStart + i;
      const child = entries[childIdx];
      if (!child) continue;
      const childPath = prefix ? `${prefix}/${child.name}` : child.name;

      if (child.isDir) {
        walk(childIdx, childPath);
      } else {
        const off = tocOffset + childIdx * 16;
        const info = parseFileEntry(rpfData, view, off);
        const fileData = extractFileData(rpfData, info);
        if (fileData) {
          // ネスト RPF の場合、再帰的に中身を抽出
          if (child.name.toLowerCase().endsWith(".rpf") && fileData.length >= 16) {
            const fv = new DataView(fileData.buffer, fileData.byteOffset, fileData.byteLength);
            if (fv.getUint32(0, true) === RPF7_MAGIC) {
              try {
                const innerFiles = extractAllFiles(fileData);
                for (const [innerPath, innerData] of innerFiles) {
                  files.set(`${childPath}/${innerPath}`, innerData);
                }
                continue;
              } catch { /* ネスト抽出失敗 → ファイルとして保存 */ }
            }
          }
          files.set(childPath, fileData);
        }
      }
    }
  }

  if (entries.length > 0) walk(0, "");
  return files;
}

function readNullString(data: Uint8Array, offset: number): string {
  const bytes: number[] = [];
  let i = offset;
  while (i < data.length && data[i] !== 0) {
    bytes.push(data[i]!);
    i++;
  }
  return new TextDecoder("ascii").decode(new Uint8Array(bytes));
}
