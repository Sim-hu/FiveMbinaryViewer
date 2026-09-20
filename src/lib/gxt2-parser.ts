// GXT2 テキストテーブルパーサー — DLC の表示名・改造パーツ名 (global.gxt2)
//
// レイアウト:
//   "2TXG" | count | (hash, offset) * count | "2TXG" | endOffset | NUL 終端 UTF-8 文字列群
// キーはラベル名そのものではなく joaat ハッシュで格納されている。

const GXT2_MAGIC = 0x47585432;

export interface Gxt2Entry {
  hash: number;
  text: string;
}

export function parseGxt2(data: Uint8Array): Gxt2Entry[] {
  if (data.length < 8) throw new Error("File too small for GXT2");

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== GXT2_MAGIC) {
    throw new Error(`Invalid GXT2 magic: 0x${magic.toString(16)}`);
  }

  const count = view.getUint32(4, true);
  if (8 + count * 8 > data.length) throw new Error("GXT2 file truncated");

  const decoder = new TextDecoder("utf-8");
  const entries: Gxt2Entry[] = [];

  for (let i = 0; i < count; i++) {
    const hash = view.getUint32(8 + i * 8, true);
    const offset = view.getUint32(12 + i * 8, true);
    if (offset >= data.length) continue;

    let end = offset;
    while (end < data.length && data[end] !== 0) end++;
    entries.push({ hash, text: decoder.decode(data.subarray(offset, end)) });
  }

  return entries;
}

// RAGE の Jenkins one-at-a-time ハッシュ (小文字化してから計算)
export function joaat(text: string): number {
  const bytes = new TextEncoder().encode(text.toLowerCase());
  let hash = 0;

  for (const byte of bytes) {
    hash = (hash + byte) >>> 0;
    hash = (hash + (hash << 10)) >>> 0;
    hash = (hash ^ (hash >>> 6)) >>> 0;
  }

  hash = (hash + (hash << 3)) >>> 0;
  hash = (hash ^ (hash >>> 11)) >>> 0;
  hash = (hash + (hash << 15)) >>> 0;
  return hash >>> 0;
}
