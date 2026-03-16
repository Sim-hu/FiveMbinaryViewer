// RAGE リソースポインタ解決ユーティリティ

export interface ResolvedPointer {
  segment: "system" | "graphics";
  offset: number;
}

// 64-bit ポインタの上位ニブルでセグメント判定
export function resolvePointer(ptr: bigint): ResolvedPointer | null {
  if (ptr === 0n) return null;
  const segment = Number((ptr >> 28n) & 0xfn);
  const offset = Number(ptr & 0x0fffffffn);
  if (segment === 5) return { segment: "system", offset };
  if (segment === 6) return { segment: "graphics", offset };
  return null;
}

// DataView ラッパー（位置自動進行、Little-Endian 固定）
export class BinaryReader {
  private view: DataView;
  private _offset: number;

  constructor(
    private data: Uint8Array,
    offset = 0,
  ) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this._offset = offset;
  }

  get offset(): number {
    return this._offset;
  }

  get length(): number {
    return this.data.byteLength;
  }

  seek(offset: number): void {
    this._offset = offset;
  }

  skip(bytes: number): void {
    this._offset += bytes;
  }

  readUint8(): number {
    const val = this.view.getUint8(this._offset);
    this._offset += 1;
    return val;
  }

  readUint16(): number {
    const val = this.view.getUint16(this._offset, true);
    this._offset += 2;
    return val;
  }

  readUint32(): number {
    const val = this.view.getUint32(this._offset, true);
    this._offset += 4;
    return val;
  }

  readInt32(): number {
    const val = this.view.getInt32(this._offset, true);
    this._offset += 4;
    return val;
  }

  readUint64(): bigint {
    const val = this.view.getBigUint64(this._offset, true);
    this._offset += 8;
    return val;
  }

  readUint8At(offset: number): number {
    return this.view.getUint8(offset);
  }

  readUint16At(offset: number): number {
    return this.view.getUint16(offset, true);
  }

  readUint32At(offset: number): number {
    return this.view.getUint32(offset, true);
  }

  readUint64At(offset: number): bigint {
    return this.view.getBigUint64(offset, true);
  }

  // null 終端文字列を読む
  readStringAt(offset: number): string {
    const bytes: number[] = [];
    let i = offset;
    while (i < this.data.byteLength) {
      const b = this.data[i]!;
      if (b === 0) break;
      bytes.push(b);
      i++;
    }
    return new TextDecoder("ascii").decode(new Uint8Array(bytes));
  }
}
