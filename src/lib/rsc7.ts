// RSC7 リソースファイルパーサー
import { inflateRaw } from "pako";
import type { RSC7Header } from "./types";

const RSC7_MAGIC = 0x37435352; // "RSC7" LE

// CodeWalker RpfResourcePageFlags 準拠のサイズ算出
function getResourcePageSize(flags: number): number {
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

export function parseRSC7(data: Uint8Array): {
  header: RSC7Header;
  systemData: Uint8Array;
  graphicsData: Uint8Array;
} {
  if (data.byteLength < 16) {
    throw new Error("File too small for RSC7 header");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== RSC7_MAGIC) {
    throw new Error(
      `Invalid RSC7 magic: 0x${magic.toString(16)} (expected 0x${RSC7_MAGIC.toString(16)})`,
    );
  }

  const version = view.getUint32(4, true);
  const systemFlags = view.getUint32(8, true);
  const graphicsFlags = view.getUint32(12, true);

  const systemSize = getResourcePageSize(systemFlags);
  const graphicsSize = getResourcePageSize(graphicsFlags);

  const header: RSC7Header = {
    magic,
    version,
    systemFlags,
    graphicsFlags,
    systemSize,
    graphicsSize,
  };

  // ヘッダー以降のデータを deflate 展開
  const compressedData = data.subarray(16);
  const decompressed = inflateRaw(compressedData);

  if (decompressed.byteLength < systemSize + graphicsSize) {
    throw new Error(
      `Decompressed size ${decompressed.byteLength} < expected ${systemSize + graphicsSize}`,
    );
  }

  const systemData = decompressed.subarray(0, systemSize);
  const graphicsData = decompressed.subarray(
    systemSize,
    systemSize + graphicsSize,
  );

  return { header, systemData, graphicsData };
}
