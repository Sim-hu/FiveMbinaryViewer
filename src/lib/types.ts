// テクスチャフォーマット（CodeWalker 準拠）
export const TextureFormat = {
  D3DFMT_A8R8G8B8: 21,
  D3DFMT_A1R5G5B5: 25,
  D3DFMT_A8: 28,
  D3DFMT_A8B8G8R8: 32,
  D3DFMT_L8: 50,
  D3DFMT_DXT1: 0x31545844, // "DXT1" LE = 827611204
  D3DFMT_DXT3: 0x33545844, // "DXT3" LE = 861165636
  D3DFMT_DXT5: 0x35545844, // "DXT5" LE = 894720068
  D3DFMT_ATI1: 0x31495441, // "ATI1" LE = 826889281
  D3DFMT_ATI2: 0x32495441, // "ATI2" LE = 843666497
  D3DFMT_BC7: 0x20374342, // "BC7 " LE
} as const;

export type TextureFormatValue =
  (typeof TextureFormat)[keyof typeof TextureFormat];

export function getFormatName(format: number): string {
  for (const [name, value] of Object.entries(TextureFormat)) {
    if (value === format) return name;
  }
  return `Unknown(0x${format.toString(16)})`;
}

export function getFormatBytesPerBlock(format: number): number {
  switch (format) {
    case TextureFormat.D3DFMT_DXT1:
    case TextureFormat.D3DFMT_ATI1:
      return 8;
    case TextureFormat.D3DFMT_DXT3:
    case TextureFormat.D3DFMT_DXT5:
    case TextureFormat.D3DFMT_ATI2:
    case TextureFormat.D3DFMT_BC7:
      return 16;
    case TextureFormat.D3DFMT_A8R8G8B8:
    case TextureFormat.D3DFMT_A8B8G8R8:
      return 4; // bytes per pixel
    case TextureFormat.D3DFMT_A1R5G5B5:
      return 2;
    case TextureFormat.D3DFMT_L8:
    case TextureFormat.D3DFMT_A8:
      return 1;
    default:
      return 4;
  }
}

export function isBlockCompressed(format: number): boolean {
  switch (format) {
    case TextureFormat.D3DFMT_DXT1:
    case TextureFormat.D3DFMT_DXT3:
    case TextureFormat.D3DFMT_DXT5:
    case TextureFormat.D3DFMT_ATI1:
    case TextureFormat.D3DFMT_ATI2:
    case TextureFormat.D3DFMT_BC7:
      return true;
    default:
      return false;
  }
}

export function calcTextureDataSize(
  width: number,
  height: number,
  format: number,
): number {
  if (isBlockCompressed(format)) {
    const blocksX = Math.max(1, Math.ceil(width / 4));
    const blocksY = Math.max(1, Math.ceil(height / 4));
    return blocksX * blocksY * getFormatBytesPerBlock(format);
  }
  return width * height * getFormatBytesPerBlock(format);
}

export interface RSC7Header {
  magic: number;
  version: number;
  systemFlags: number;
  graphicsFlags: number;
  systemSize: number;
  graphicsSize: number;
}

export interface TextureInfo {
  name: string;
  width: number;
  height: number;
  depth: number;
  stride: number;
  format: number;
  mipLevels: number;
  dataOffset: number; // Graphics segment 内オフセット
  dataSize: number;
}

export interface ParsedYTD {
  header: RSC7Header;
  textures: TextureInfo[];
  systemData: Uint8Array;
  graphicsData: Uint8Array;
}

// --- YMAP ---
export interface YMAPEntity {
  archetypeName: string;
  flags: number;
  guid: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scaleXY: number;
  scaleZ: number;
  parentIndex: number;
  lodDist: number;
  childLodDist: number;
  lodLevel: string;
  numChildren: number;
  priorityLevel: string;
}

export interface ParsedYMAP {
  name: string;
  parent: string;
  flags: number;
  contentFlags: number;
  streamingExtentsMin: { x: number; y: number; z: number };
  streamingExtentsMax: { x: number; y: number; z: number };
  entities: YMAPEntity[];
}

// --- YTYP ---
export interface YTYPArchetype {
  name: string;
  type: string;
  textureDictionary: string;
  physicsDictionary: string;
  assetType: string;
  assetName: string;
  lodDist: number;
  hdTextureDist: number;
  flags: number;
  bbMin: { x: number; y: number; z: number };
  bbMax: { x: number; y: number; z: number };
  bsCentre: { x: number; y: number; z: number };
  bsRadius: number;
}

export interface ParsedYTYP {
  archetypes: YTYPArchetype[];
}

// --- YDR ---
export interface YDRGeometry {
  vertexCount: number;
  indexCount: number;
  vertices: Float32Array; // xyz interleaved
  indices: Uint16Array;
}

export interface YDRModel {
  geometries: YDRGeometry[];
}

export interface ParsedYDR {
  header: RSC7Header;
  boundsMin: { x: number; y: number; z: number };
  boundsMax: { x: number; y: number; z: number };
  centre: { x: number; y: number; z: number };
  models: YDRModel[]; // High LOD models
  totalVertices: number;
  totalTriangles: number;
}

// --- RPF ---
export interface RPFEntry {
  name: string;
  isDirectory: boolean;
  children: RPFEntry[];
  // ファイル用
  offset?: number;
  size?: number;
  compressedSize?: number;
  isResource?: boolean;
}

export interface ParsedRPF {
  root: RPFEntry;
  totalFiles: number;
  totalDirectories: number;
  rawData?: Uint8Array;
}

// --- YBN ---
export interface YBNBound {
  type: string;
  center: { x: number; y: number; z: number };
  radius: number;
  bbMin: { x: number; y: number; z: number };
  bbMax: { x: number; y: number; z: number };
  material: number;
  childCount: number;
}

export interface ParsedYBN {
  header: RSC7Header;
  bounds: YBNBound[];
  boundsMin: { x: number; y: number; z: number };
  boundsMax: { x: number; y: number; z: number };
  centre: { x: number; y: number; z: number };
  radius: number;
}

// --- YMT ---
export interface YMTField {
  name: string;
  value: string;
}

export interface ParsedYMT {
  format: "xml" | "pso" | "rbf" | "binary";
  fields: YMTField[];
  rawXml?: string;
}

// ファイルタイプ判定
export type FileType = "ytd" | "ydr" | "ymap" | "ytyp" | "rpf" | "ybn" | "ymt" | "unknown";

export function detectFileType(fileName: string, data?: Uint8Array): FileType {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "rpf") return "rpf";
  if (ext === "ytd") return "ytd";
  if (ext === "ydr") return "ydr";
  if (ext === "ymap") return "ymap";
  if (ext === "ytyp") return "ytyp";
  if (ext === "ybn") return "ybn";
  if (ext === "ymt") return "ymt";

  // マジックナンバーで判定
  if (data && data.length >= 4) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const magic = view.getUint32(0, true);
    if (magic === 0x37435352) return "ytd"; // RSC7 — デフォルト
    if (magic === 0x52504637) return "rpf"; // RPF7
  }

  return "unknown";
}
