// BCn テクスチャデコーダー
import { TextureFormat } from "./types";

// RGB565 → [R8, G8, B8]
function unpackRGB565(c: number): [number, number, number] {
  const r = ((c >>> 11) & 0x1f) * 255 / 31;
  const g = ((c >>> 5) & 0x3f) * 255 / 63;
  const b = (c & 0x1f) * 255 / 31;
  return [r | 0, g | 0, b | 0];
}

// BC1 (DXT1) デコード — 8 bytes/block
function decodeBC1Block(
  src: Uint8Array,
  srcOff: number,
  dst: Uint8Array,
  dstX: number,
  dstY: number,
  width: number,
): void {
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const c0 = view.getUint16(srcOff, true);
  const c1 = view.getUint16(srcOff + 2, true);
  const indices = view.getUint32(srcOff + 4, true);

  const [r0, g0, b0] = unpackRGB565(c0);
  const [r1, g1, b1] = unpackRGB565(c1);

  const colors: [number, number, number, number][] = [
    [r0, g0, b0, 255],
    [r1, g1, b1, 255],
    [0, 0, 0, 255],
    [0, 0, 0, 255],
  ];

  if (c0 > c1) {
    // 4色補間
    colors[2] = [
      ((2 * r0 + r1 + 1) / 3) | 0,
      ((2 * g0 + g1 + 1) / 3) | 0,
      ((2 * b0 + b1 + 1) / 3) | 0,
      255,
    ];
    colors[3] = [
      ((r0 + 2 * r1 + 1) / 3) | 0,
      ((g0 + 2 * g1 + 1) / 3) | 0,
      ((b0 + 2 * b1 + 1) / 3) | 0,
      255,
    ];
  } else {
    // 3色+透明
    colors[2] = [
      ((r0 + r1) / 2) | 0,
      ((g0 + g1) / 2) | 0,
      ((b0 + b1) / 2) | 0,
      255,
    ];
    colors[3] = [0, 0, 0, 0];
  }

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const px = dstX + x;
      const py = dstY + y;
      if (px >= width) continue;
      const idx = (indices >>> (2 * (4 * y + x))) & 0x3;
      const color = colors[idx]!;
      const dstOff = (py * width + px) * 4;
      dst[dstOff] = color[0];
      dst[dstOff + 1] = color[1];
      dst[dstOff + 2] = color[2];
      dst[dstOff + 3] = color[3];
    }
  }
}

// BC4 alpha ブロックデコード（BC3のアルファ部分、BC4単体でも使用）
function decodeBC4Block(
  src: Uint8Array,
  srcOff: number,
): number[] {
  const a0 = src[srcOff]!;
  const a1 = src[srcOff + 1]!;

  const alphas = [a0, a1, 0, 0, 0, 0, 0, 0];

  if (a0 > a1) {
    for (let i = 1; i <= 6; i++) {
      alphas[i + 1] = (((7 - i) * a0 + i * a1 + 3) / 7) | 0;
    }
  } else {
    for (let i = 1; i <= 4; i++) {
      alphas[i + 1] = (((5 - i) * a0 + i * a1 + 2) / 5) | 0;
    }
    alphas[6] = 0;
    alphas[7] = 255;
  }

  // 16 x 3-bit インデックスを読む（6 bytes = 48 bits）
  const values: number[] = [];
  // 48ビットを読むため、3バイトずつ2回読む
  for (let row = 0; row < 2; row++) {
    const base = srcOff + 2 + row * 3;
    const bits =
      src[base]! | (src[base + 1]! << 8) | (src[base + 2]! << 16);
    for (let i = 0; i < 8; i++) {
      const idx = (bits >>> (3 * i)) & 0x7;
      values.push(alphas[idx]!);
    }
  }

  return values;
}

// BC2 (DXT3) デコード — 16 bytes/block: explicit alpha + BC1 color
function decodeBC2Block(
  src: Uint8Array,
  srcOff: number,
  dst: Uint8Array,
  dstX: number,
  dstY: number,
  width: number,
): void {
  // BC1 カラー部分（後半8バイト）をまずデコード
  decodeBC1Block(src, srcOff + 8, dst, dstX, dstY, width);

  // explicit 4-bit alpha（先頭8バイト）を上書き
  for (let y = 0; y < 4; y++) {
    const alphaBits = new DataView(
      src.buffer,
      src.byteOffset,
      src.byteLength,
    ).getUint16(srcOff + y * 2, true);
    for (let x = 0; x < 4; x++) {
      const px = dstX + x;
      const py = dstY + y;
      if (px >= width) continue;
      const a4 = (alphaBits >>> (x * 4)) & 0xf;
      const dstOff = (py * width + px) * 4;
      dst[dstOff + 3] = (a4 * 255 / 15) | 0;
    }
  }
}

// BC3 (DXT5) デコード — 16 bytes/block: interpolated alpha + BC1 color
function decodeBC3Block(
  src: Uint8Array,
  srcOff: number,
  dst: Uint8Array,
  dstX: number,
  dstY: number,
  width: number,
): void {
  // BC1 カラー部分（後半8バイト）をまずデコード
  decodeBC1Block(src, srcOff + 8, dst, dstX, dstY, width);

  // BC4 アルファ部分（先頭8バイト）
  const alphaValues = decodeBC4Block(src, srcOff);

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const px = dstX + x;
      const py = dstY + y;
      if (px >= width) continue;
      const dstOff = (py * width + px) * 4;
      dst[dstOff + 3] = alphaValues[y * 4 + x]!;
    }
  }
}

// メインデコード関数
export function decodeTexture(
  data: Uint8Array,
  width: number,
  height: number,
  format: number,
): Uint8Array {
  const output = new Uint8Array(width * height * 4);

  switch (format) {
    case TextureFormat.D3DFMT_DXT1:
      decodeBlockCompressed(data, width, height, output, 8, decodeBC1Block);
      break;
    case TextureFormat.D3DFMT_DXT3:
      decodeBlockCompressed(data, width, height, output, 16, decodeBC2Block);
      break;
    case TextureFormat.D3DFMT_DXT5:
      decodeBlockCompressed(data, width, height, output, 16, decodeBC3Block);
      break;
    case TextureFormat.D3DFMT_ATI1:
      decodeATI1(data, width, height, output);
      break;
    case TextureFormat.D3DFMT_ATI2:
      decodeATI2(data, width, height, output);
      break;
    case TextureFormat.D3DFMT_BC7:
      decodeBC7(data, width, height, output);
      break;
    case TextureFormat.D3DFMT_A8R8G8B8:
      decodeA8R8G8B8(data, width, height, output);
      break;
    case TextureFormat.D3DFMT_A8B8G8R8:
      decodeA8B8G8R8(data, width, height, output);
      break;
    case TextureFormat.D3DFMT_L8:
      decodeL8(data, width, height, output);
      break;
    case TextureFormat.D3DFMT_A8:
      decodeA8(data, width, height, output);
      break;
    case TextureFormat.D3DFMT_A1R5G5B5:
      decodeA1R5G5B5(data, width, height, output);
      break;
    default:
      console.warn(`Unsupported format: 0x${format.toString(16)}`);
      // フォールバック: グレーで埋める
      for (let i = 0; i < output.length; i += 4) {
        output[i] = 128;
        output[i + 1] = 128;
        output[i + 2] = 128;
        output[i + 3] = 255;
      }
  }

  return output;
}

type BlockDecoder = (
  src: Uint8Array,
  srcOff: number,
  dst: Uint8Array,
  dstX: number,
  dstY: number,
  width: number,
) => void;

function decodeBlockCompressed(
  data: Uint8Array,
  width: number,
  height: number,
  output: Uint8Array,
  bytesPerBlock: number,
  decoder: BlockDecoder,
): void {
  const blocksX = Math.max(1, Math.ceil(width / 4));
  const blocksY = Math.max(1, Math.ceil(height / 4));
  let srcOff = 0;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      decoder(data, srcOff, output, bx * 4, by * 4, width);
      srcOff += bytesPerBlock;
    }
  }
}

// BC4 (ATI1) — 単一チャンネル → R
function decodeATI1(
  data: Uint8Array,
  width: number,
  height: number,
  output: Uint8Array,
): void {
  const blocksX = Math.max(1, Math.ceil(width / 4));
  const blocksY = Math.max(1, Math.ceil(height / 4));
  let srcOff = 0;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const values = decodeBC4Block(data, srcOff);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const px = bx * 4 + x;
          const py = by * 4 + y;
          if (px >= width || py >= height) continue;
          const v = values[y * 4 + x]!;
          const dstOff = (py * width + px) * 4;
          output[dstOff] = v;
          output[dstOff + 1] = v;
          output[dstOff + 2] = v;
          output[dstOff + 3] = 255;
        }
      }
      srcOff += 8;
    }
  }
}

// BC5 (ATI2) — 2チャンネル → R, G
function decodeATI2(
  data: Uint8Array,
  width: number,
  height: number,
  output: Uint8Array,
): void {
  const blocksX = Math.max(1, Math.ceil(width / 4));
  const blocksY = Math.max(1, Math.ceil(height / 4));
  let srcOff = 0;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const redValues = decodeBC4Block(data, srcOff);
      const greenValues = decodeBC4Block(data, srcOff + 8);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const px = bx * 4 + x;
          const py = by * 4 + y;
          if (px >= width || py >= height) continue;
          const dstOff = (py * width + px) * 4;
          output[dstOff] = redValues[y * 4 + x]!;
          output[dstOff + 1] = greenValues[y * 4 + x]!;
          output[dstOff + 2] = 0;
          output[dstOff + 3] = 255;
        }
      }
      srcOff += 16;
    }
  }
}

// BC7 デコード（簡易実装: モード0-7全対応は複雑なため、よく使われるモードのみ）
// BC7 は 16 bytes/block、各ブロック先頭の 1~8 bit でモード判定
function decodeBC7(
  data: Uint8Array,
  width: number,
  height: number,
  output: Uint8Array,
): void {
  const blocksX = Math.max(1, Math.ceil(width / 4));
  const blocksY = Math.max(1, Math.ceil(height / 4));
  let srcOff = 0;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      decodeBC7Block(data, srcOff, output, bx * 4, by * 4, width, height);
      srcOff += 16;
    }
  }
}

// BC7 モード情報テーブル
interface BC7ModeInfo {
  numSubsets: number;
  partitionBits: number;
  rotationBits: number;
  indexSelBits: number;
  colorBits: number;
  alphaBits: number;
  endpointPBits: number;
  sharedPBits: number;
  indexBits1: number;
  indexBits2: number;
}

const BC7_MODES: BC7ModeInfo[] = [
  { numSubsets: 3, partitionBits: 4, rotationBits: 0, indexSelBits: 0, colorBits: 4, alphaBits: 0, endpointPBits: 1, sharedPBits: 0, indexBits1: 3, indexBits2: 0 },
  { numSubsets: 2, partitionBits: 6, rotationBits: 0, indexSelBits: 0, colorBits: 6, alphaBits: 0, endpointPBits: 0, sharedPBits: 1, indexBits1: 3, indexBits2: 0 },
  { numSubsets: 3, partitionBits: 6, rotationBits: 0, indexSelBits: 0, colorBits: 5, alphaBits: 0, endpointPBits: 0, sharedPBits: 0, indexBits1: 2, indexBits2: 0 },
  { numSubsets: 2, partitionBits: 6, rotationBits: 0, indexSelBits: 0, colorBits: 7, alphaBits: 0, endpointPBits: 1, sharedPBits: 0, indexBits1: 2, indexBits2: 0 },
  { numSubsets: 1, partitionBits: 0, rotationBits: 2, indexSelBits: 1, colorBits: 5, alphaBits: 6, endpointPBits: 0, sharedPBits: 0, indexBits1: 2, indexBits2: 3 },
  { numSubsets: 1, partitionBits: 0, rotationBits: 2, indexSelBits: 0, colorBits: 7, alphaBits: 8, endpointPBits: 0, sharedPBits: 0, indexBits1: 2, indexBits2: 2 },
  { numSubsets: 1, partitionBits: 0, rotationBits: 0, indexSelBits: 0, colorBits: 7, alphaBits: 7, endpointPBits: 1, sharedPBits: 0, indexBits1: 4, indexBits2: 0 },
  { numSubsets: 2, partitionBits: 6, rotationBits: 0, indexSelBits: 0, colorBits: 5, alphaBits: 5, endpointPBits: 1, sharedPBits: 0, indexBits1: 2, indexBits2: 0 },
];

// BC7 パーティションテーブル（2サブセット用、64エントリ）
const BC7_PARTITION2: number[][] = [
  [0,0,1,1,0,0,1,1,0,0,1,1,0,0,1,1],[0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1],
  [0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],[0,0,0,1,0,0,1,1,0,0,1,1,0,1,1,1],
  [0,0,0,0,0,0,0,1,0,0,0,1,0,0,1,1],[0,0,1,1,0,1,1,1,0,1,1,1,1,1,1,1],
  [0,0,0,1,0,0,1,1,0,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1,0,0,1,1,0,1,1,1],
  [0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,1],[0,0,1,1,0,1,1,1,1,1,1,1,1,1,1,1],
  [0,0,0,0,0,0,0,1,0,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0,0,1,0,1,1,1],
  [0,0,0,1,0,1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1],
  [0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1],
  [0,0,0,0,1,0,0,0,1,1,1,0,1,1,1,1],[0,1,1,1,0,0,0,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,0,0,0,1,1,1,0],[0,1,1,1,0,0,1,1,0,0,0,1,0,0,0,0],
  [0,0,1,1,0,0,0,1,0,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,1,1,0,0,1,1,1,0],
  [0,0,0,0,0,0,0,0,1,0,0,0,1,1,0,0],[0,1,1,1,0,0,1,1,0,0,1,1,0,0,0,1],
  [0,0,1,1,0,0,0,1,0,0,0,1,0,0,0,0],[0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0],
  [0,1,1,0,0,1,1,0,0,1,1,0,0,1,1,0],[0,0,1,1,0,1,1,0,0,1,1,0,1,1,0,0],
  [0,0,0,1,0,1,1,1,1,1,1,0,1,0,0,0],[0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,1,1,1,0,0,0,1,1,0,0,0,1,1,1,0],[0,0,1,1,1,0,0,1,1,0,0,1,1,1,0,0],
  [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],[0,0,0,0,1,1,1,1,0,0,0,0,1,1,1,1],
  [0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0],[0,0,1,1,0,0,1,1,1,1,0,0,1,1,0,0],
  [0,0,1,1,1,1,0,0,0,0,1,1,1,1,0,0],[0,1,0,1,0,1,0,1,1,0,1,0,1,0,1,0],
  [0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1],[0,1,0,1,1,0,1,0,1,0,1,0,0,1,0,1],
  [0,1,1,1,0,0,1,1,1,1,0,0,1,1,1,0],[0,0,0,1,0,0,1,1,1,1,0,0,1,0,0,0],
  [0,0,1,1,0,0,1,0,0,1,0,0,1,1,0,0],[0,0,1,1,1,0,1,1,1,1,0,1,1,1,0,0],
  [0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0],[0,0,1,1,1,1,0,0,1,1,0,0,0,0,1,1],
  [0,1,1,0,0,1,1,0,1,0,0,1,1,0,0,1],[0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0],
  [0,1,0,0,1,1,1,0,0,1,0,0,0,0,0,0],[0,0,1,0,0,1,1,1,0,0,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,1,1,1,0,0,1,0],[0,0,0,0,0,1,0,0,1,1,1,0,0,1,0,0],
  [0,1,1,0,1,1,0,0,1,0,0,1,0,0,1,1],[0,0,1,1,0,1,1,0,1,1,0,0,1,0,0,1],
  [0,1,1,0,0,0,1,1,1,0,0,1,1,1,0,0],[0,0,1,1,1,0,0,1,1,1,0,0,0,1,1,0],
  [0,1,1,0,1,1,0,0,1,1,0,0,1,0,0,1],[0,1,1,0,0,0,1,1,0,0,1,1,1,0,0,1],
  [0,1,1,1,1,1,1,0,1,0,0,0,0,0,0,1],[0,0,0,1,1,0,0,0,1,1,1,0,0,1,1,1],
  [0,0,0,0,1,1,1,1,0,0,1,1,0,0,1,1],[0,0,1,1,0,0,1,1,1,1,1,1,0,0,0,0],
  [0,0,1,0,0,0,1,0,1,1,1,0,1,1,1,0],[0,1,0,0,0,1,0,0,0,1,1,1,0,1,1,1],
];

// BC7 パーティションテーブル（3サブセット用、64エントリ）
const BC7_PARTITION3: number[][] = [
  [0,0,1,1,0,0,1,1,0,2,2,1,2,2,2,2],[0,0,0,1,0,0,1,1,2,2,1,1,2,2,2,1],
  [0,0,0,0,2,0,0,1,2,2,1,1,2,2,1,1],[0,2,2,2,0,0,2,2,0,0,1,1,0,1,1,1],
  [0,0,0,0,0,0,0,0,1,1,2,2,1,1,2,2],[0,0,1,1,0,0,1,1,0,0,2,2,0,0,2,2],
  [0,0,2,2,0,0,2,2,1,1,1,1,1,1,1,1],[0,0,1,1,0,0,1,1,2,2,1,1,2,2,1,1],
  [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2],[0,0,0,0,1,1,1,1,1,1,1,1,2,2,2,2],
  [0,0,0,0,1,1,1,1,2,2,2,2,2,2,2,2],[0,0,1,2,0,0,1,2,0,0,1,2,0,0,1,2],
  [0,1,1,2,0,1,1,2,0,1,1,2,0,1,1,2],[0,1,2,2,0,1,2,2,0,1,2,2,0,1,2,2],
  [0,0,1,1,0,1,1,2,1,1,2,2,1,2,2,2],[0,0,1,1,2,0,0,1,2,2,0,0,2,2,2,0],
  [0,0,0,1,0,0,1,1,0,1,1,2,1,1,2,2],[0,1,1,1,0,0,1,1,2,0,0,1,2,2,0,0],
  [0,0,0,0,1,1,2,2,1,1,2,2,1,1,2,2],[0,0,2,2,0,0,2,2,0,0,2,2,1,1,1,1],
  [0,1,1,1,0,1,1,1,0,2,2,2,0,2,2,2],[0,0,0,1,0,0,0,1,2,2,2,1,2,2,2,1],
  [0,0,0,0,0,0,1,1,0,1,2,2,0,1,2,2],[0,0,0,0,1,1,0,0,2,2,1,0,2,2,1,0],
  [0,1,2,2,0,1,2,2,0,0,1,1,0,0,0,0],[0,0,1,2,0,0,1,2,1,1,2,2,2,2,2,2],
  [0,1,1,0,1,2,2,1,1,2,2,1,0,1,1,0],[0,0,0,0,0,1,1,0,1,2,2,1,1,2,2,1],
  [0,0,2,2,1,1,0,2,1,1,0,2,0,0,2,2],[0,1,1,0,0,1,1,0,2,0,0,2,2,2,2,2],
  [0,0,1,1,0,1,2,2,0,1,2,2,0,0,1,1],[0,0,0,0,2,0,0,0,2,2,1,1,2,2,2,1],
  [0,0,0,0,0,0,0,2,1,1,2,2,1,2,2,2],[0,2,2,2,0,0,2,2,0,0,1,2,0,0,1,1],
  [0,0,1,1,0,0,1,2,0,0,1,2,0,0,0,1],[0,1,2,0,0,1,2,0,0,1,2,0,0,1,2,0],
  [0,0,0,0,1,1,1,1,2,2,2,2,0,0,0,0],[0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0],
  [0,1,2,0,2,0,1,2,1,2,0,1,0,1,2,0],[0,0,1,1,2,2,0,0,1,1,2,2,0,0,1,1],
  [0,0,1,1,1,1,2,2,2,2,0,0,0,0,1,1],[0,1,0,1,0,1,0,1,2,2,2,2,2,2,2,2],
  [0,0,0,0,0,0,0,0,2,1,2,1,2,1,2,1],[0,0,2,2,1,1,2,2,0,0,2,2,1,1,2,2],
  [0,0,2,2,0,0,1,1,0,0,2,2,0,0,1,1],[0,2,2,0,1,2,2,1,0,2,2,0,1,2,2,1],
  [0,1,0,1,2,2,2,2,2,2,2,2,0,1,0,1],[0,0,0,0,2,1,2,1,2,1,2,1,2,1,2,1],
  [0,1,0,1,0,1,0,1,0,1,0,1,2,2,2,2],[0,2,2,2,0,1,1,1,0,2,2,2,0,1,1,1],
  [0,0,0,2,1,1,1,2,0,0,0,2,1,1,1,2],[0,0,0,0,2,1,1,2,2,1,1,2,2,1,1,2],
  [0,2,2,2,0,1,1,1,0,1,1,1,0,2,2,2],[0,0,0,2,1,1,1,2,1,1,1,2,0,0,0,2],
  [0,1,1,0,0,1,1,0,0,1,1,0,2,2,2,2],[0,0,0,0,0,0,0,0,2,1,1,2,2,1,1,2],
  [0,1,1,0,0,1,1,0,2,2,2,2,2,2,2,2],[0,0,2,2,0,0,1,1,0,0,1,1,0,0,2,2],
  [0,0,2,2,1,1,2,2,1,1,2,2,0,0,2,2],[0,0,0,0,0,0,0,0,0,0,0,0,2,1,1,2],
  [0,0,0,2,0,0,0,1,0,0,0,2,0,0,0,1],[0,2,2,2,1,2,2,2,0,2,2,2,1,2,2,2],
  [0,1,0,1,2,2,2,2,2,2,2,2,2,2,2,2],[0,1,1,1,2,0,1,1,2,2,0,1,2,2,2,0],
];

// 各サブセットのアンカーインデックス（2サブセット用）
const BC7_ANCHOR2: number[] = [
  15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,
  15,2,8,2,2,8,8,15,2,8,2,2,8,8,2,2,
  15,15,6,8,2,8,15,15,2,8,2,2,2,15,15,6,
  6,2,6,8,15,15,2,2,15,15,15,15,15,2,2,15,
];

// 各サブセットのアンカーインデックス（3サブセット用、サブセット1）
const BC7_ANCHOR3_1: number[] = [
  3,3,15,15,8,3,15,15,8,8,6,6,6,5,3,3,
  3,3,8,15,3,3,6,10,5,8,8,6,8,5,15,15,
  8,15,3,5,6,10,8,15,15,3,15,5,15,15,15,15,
  3,15,5,5,5,8,5,10,5,10,8,13,15,12,3,3,
];

// 各サブセットのアンカーインデックス（3サブセット用、サブセット2）
const BC7_ANCHOR3_2: number[] = [
  15,8,8,3,15,15,3,8,15,15,15,15,15,15,15,8,
  15,8,15,3,15,8,15,8,3,15,6,10,15,15,10,8,
  15,3,15,10,10,8,9,10,6,15,8,15,3,6,6,8,
  15,3,15,15,15,15,15,15,15,15,15,15,3,15,15,8,
];

class BitReader {
  private data: Uint8Array;
  private _bitPos: number;

  constructor(data: Uint8Array, offset: number) {
    this.data = data.subarray(offset, offset + 16);
    this._bitPos = 0;
  }

  read(numBits: number): number {
    let result = 0;
    for (let i = 0; i < numBits; i++) {
      const byteIdx = this._bitPos >> 3;
      const bitIdx = this._bitPos & 7;
      if ((this.data[byteIdx]! >> bitIdx) & 1) {
        result |= 1 << i;
      }
      this._bitPos++;
    }
    return result;
  }
}

function unquantize(val: number, bits: number): number {
  if (bits >= 8) return val;
  if (val === 0) return 0;
  if (val === (1 << bits) - 1) return 255;
  return ((val << 8) + 128) >> bits;
}

function interpolate(e0: number, e1: number, index: number, indexBits: number): number {
  const weights2 = [0, 21, 43, 64];
  const weights3 = [0, 9, 18, 27, 37, 46, 55, 64];
  const weights4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];

  let w: number;
  if (indexBits === 2) w = weights2[index]!;
  else if (indexBits === 3) w = weights3[index]!;
  else w = weights4[index]!;

  return (((64 - w) * e0 + w * e1 + 32) >> 6) & 0xff;
}

function decodeBC7Block(
  src: Uint8Array,
  srcOff: number,
  dst: Uint8Array,
  dstX: number,
  dstY: number,
  width: number,
  height: number,
): void {
  const bits = new BitReader(src, srcOff);

  // モード判定: 最初の1ビットを見つける
  let mode = 0;
  while (mode < 8 && bits.read(1) === 0) {
    mode++;
  }

  if (mode >= 8) {
    // 無効ブロック
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const px = dstX + x;
        const py = dstY + y;
        if (px >= width || py >= height) continue;
        const dstOff = (py * width + px) * 4;
        dst[dstOff] = 0;
        dst[dstOff + 1] = 0;
        dst[dstOff + 2] = 0;
        dst[dstOff + 3] = 255;
      }
    }
    return;
  }

  const modeInfo = BC7_MODES[mode]!;
  const numSubsets = modeInfo.numSubsets;

  // パーティション
  const partition = bits.read(modeInfo.partitionBits);

  // 回転・インデックス選択
  const rotation = bits.read(modeInfo.rotationBits);
  const indexSel = bits.read(modeInfo.indexSelBits);

  // エンドポイントカラー
  const numEndpoints = numSubsets * 2;
  const colorEndpoints: number[][] = [];
  for (let i = 0; i < numEndpoints; i++) {
    colorEndpoints.push([0, 0, 0]);
  }

  // R, G, B チャンネルを順に読む
  for (let ch = 0; ch < 3; ch++) {
    for (let i = 0; i < numEndpoints; i++) {
      colorEndpoints[i]![ch] = bits.read(modeInfo.colorBits);
    }
  }

  // アルファエンドポイント
  const alphaEndpoints: number[] = [];
  if (modeInfo.alphaBits > 0) {
    for (let i = 0; i < numEndpoints; i++) {
      alphaEndpoints.push(bits.read(modeInfo.alphaBits));
    }
  } else {
    for (let i = 0; i < numEndpoints; i++) {
      alphaEndpoints.push((1 << modeInfo.colorBits) - 1);
    }
  }

  // P-bits
  if (modeInfo.endpointPBits > 0) {
    for (let i = 0; i < numEndpoints; i++) {
      const pbit = bits.read(1);
      for (let ch = 0; ch < 3; ch++) {
        colorEndpoints[i]![ch] = (colorEndpoints[i]![ch]! << 1) | pbit;
      }
      if (modeInfo.alphaBits > 0) {
        alphaEndpoints[i] = (alphaEndpoints[i]! << 1) | pbit;
      }
    }
  } else if (modeInfo.sharedPBits > 0) {
    for (let i = 0; i < numEndpoints; i += 2) {
      const pbit = bits.read(1);
      for (let j = 0; j < 2; j++) {
        for (let ch = 0; ch < 3; ch++) {
          colorEndpoints[i + j]![ch] = (colorEndpoints[i + j]![ch]! << 1) | pbit;
        }
        if (modeInfo.alphaBits > 0) {
          alphaEndpoints[i + j] = (alphaEndpoints[i + j]! << 1) | pbit;
        }
      }
    }
  }

  // Unquantize endpoints
  const colorPrec = modeInfo.colorBits + (modeInfo.endpointPBits | modeInfo.sharedPBits);
  const alphaPrec = modeInfo.alphaBits > 0 ? modeInfo.alphaBits + (modeInfo.endpointPBits | modeInfo.sharedPBits) : 0;

  for (let i = 0; i < numEndpoints; i++) {
    for (let ch = 0; ch < 3; ch++) {
      colorEndpoints[i]![ch] = unquantize(colorEndpoints[i]![ch]!, colorPrec);
    }
    if (alphaPrec > 0) {
      alphaEndpoints[i] = unquantize(alphaEndpoints[i]!, alphaPrec);
    }
  }

  // パーティションテーブル取得
  let partitionTable: number[];
  if (numSubsets === 1) {
    partitionTable = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  } else if (numSubsets === 2) {
    partitionTable = BC7_PARTITION2[partition]!;
  } else {
    partitionTable = BC7_PARTITION3[partition]!;
  }

  // アンカーインデックス取得
  // サブセット0のアンカーは常にインデックス0
  // サブセット1のアンカー: 2サブセット → BC7_ANCHOR2, 3サブセット → BC7_ANCHOR3_1
  // サブセット2のアンカー: 3サブセット → BC7_ANCHOR3_2
  const anchorSet = new Set<number>([0]);
  if (numSubsets >= 2) {
    anchorSet.add(numSubsets === 2 ? BC7_ANCHOR2[partition]! : BC7_ANCHOR3_1[partition]!);
  }
  if (numSubsets >= 3) {
    anchorSet.add(BC7_ANCHOR3_2[partition]!);
  }

  // インデックスデータ読み取り
  const indexBits1 = modeInfo.indexBits1;
  const indexBits2 = modeInfo.indexBits2;
  const indices1: number[] = [];
  const indices2: number[] = [];

  for (let i = 0; i < 16; i++) {
    const isAnchorIdx = anchorSet.has(i);
    indices1.push(bits.read(isAnchorIdx ? indexBits1 - 1 : indexBits1));
  }

  if (indexBits2 > 0) {
    for (let i = 0; i < 16; i++) {
      const isAnchor2 = i === 0;
      indices2.push(bits.read(isAnchor2 ? indexBits2 - 1 : indexBits2));
    }
  }

  // ピクセル出力
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const px = dstX + x;
      const py = dstY + y;
      if (px >= width || py >= height) continue;

      const pixIdx = y * 4 + x;
      const subset = partitionTable[pixIdx]!;
      const e0 = subset * 2;
      const e1 = subset * 2 + 1;

      let colorIdx: number;
      let alphaIdx: number;

      if (indexBits2 > 0) {
        if (indexSel === 0) {
          colorIdx = indices1[pixIdx]!;
          alphaIdx = indices2[pixIdx]!;
        } else {
          colorIdx = indices2[pixIdx]!;
          alphaIdx = indices1[pixIdx]!;
        }
      } else {
        colorIdx = indices1[pixIdx]!;
        alphaIdx = colorIdx;
      }

      const colorIdxBits = (indexBits2 > 0 && indexSel !== 0) ? indexBits2 : indexBits1;
      const alphaIdxBits = (indexBits2 > 0 && indexSel === 0) ? indexBits2 : indexBits1;

      let r = interpolate(colorEndpoints[e0]![0]!, colorEndpoints[e1]![0]!, colorIdx, colorIdxBits);
      let g = interpolate(colorEndpoints[e0]![1]!, colorEndpoints[e1]![1]!, colorIdx, colorIdxBits);
      let b = interpolate(colorEndpoints[e0]![2]!, colorEndpoints[e1]![2]!, colorIdx, colorIdxBits);
      let a = interpolate(alphaEndpoints[e0]!, alphaEndpoints[e1]!, alphaIdx, alphaIdxBits);

      // 回転適用
      switch (rotation) {
        case 1: [a, r] = [r, a]; break;
        case 2: [a, g] = [g, a]; break;
        case 3: [a, b] = [b, a]; break;
      }

      const dstOff = (py * width + px) * 4;
      dst[dstOff] = r;
      dst[dstOff + 1] = g;
      dst[dstOff + 2] = b;
      dst[dstOff + 3] = a;
    }
  }
}

// 非圧縮フォーマット
function decodeA8R8G8B8(
  data: Uint8Array,
  width: number,
  height: number,
  output: Uint8Array,
): void {
  for (let i = 0; i < width * height; i++) {
    const srcOff = i * 4;
    const dstOff = i * 4;
    output[dstOff] = data[srcOff + 2]!;     // R (src: ARGB → dst: RGBA)
    output[dstOff + 1] = data[srcOff + 1]!; // G
    output[dstOff + 2] = data[srcOff]!;      // B
    output[dstOff + 3] = data[srcOff + 3]!;  // A
  }
}

function decodeA8B8G8R8(
  data: Uint8Array,
  width: number,
  height: number,
  output: Uint8Array,
): void {
  for (let i = 0; i < width * height; i++) {
    const srcOff = i * 4;
    const dstOff = i * 4;
    output[dstOff] = data[srcOff]!;          // R (src: ABGR → but actually A8B8G8R8 = RGBA in memory)
    output[dstOff + 1] = data[srcOff + 1]!;  // G
    output[dstOff + 2] = data[srcOff + 2]!;  // B
    output[dstOff + 3] = data[srcOff + 3]!;  // A
  }
}

function decodeL8(
  data: Uint8Array,
  width: number,
  height: number,
  output: Uint8Array,
): void {
  for (let i = 0; i < width * height; i++) {
    const v = data[i]!;
    const dstOff = i * 4;
    output[dstOff] = v;
    output[dstOff + 1] = v;
    output[dstOff + 2] = v;
    output[dstOff + 3] = 255;
  }
}

function decodeA8(
  data: Uint8Array,
  width: number,
  height: number,
  output: Uint8Array,
): void {
  for (let i = 0; i < width * height; i++) {
    const dstOff = i * 4;
    output[dstOff] = 255;
    output[dstOff + 1] = 255;
    output[dstOff + 2] = 255;
    output[dstOff + 3] = data[i]!;
  }
}

function decodeA1R5G5B5(
  data: Uint8Array,
  width: number,
  height: number,
  output: Uint8Array,
): void {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < width * height; i++) {
    const val = view.getUint16(i * 2, true);
    const dstOff = i * 4;
    output[dstOff] = ((val >>> 10) & 0x1f) * 255 / 31 | 0;     // R
    output[dstOff + 1] = ((val >>> 5) & 0x1f) * 255 / 31 | 0;  // G
    output[dstOff + 2] = (val & 0x1f) * 255 / 31 | 0;           // B
    output[dstOff + 3] = (val >>> 15) ? 255 : 0;                 // A
  }
}
