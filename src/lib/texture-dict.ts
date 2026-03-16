// TextureDictionary パーサー
import { BinaryReader, resolvePointer } from "./pointer";
import { calcTextureDataSize } from "./types";
import type { TextureInfo } from "./types";

// System segment と Graphics segment のデータを受け取り、
// テクスチャメタデータを抽出する
export function parseTextureDictionary(
  systemData: Uint8Array,
  _graphicsData: Uint8Array,
): TextureInfo[] {
  const reader = new BinaryReader(systemData);

  // TextureDictionary (offset 0x00, 64 bytes)
  // 0x00: VTable (8 bytes) — skip
  // 0x08: PagesInfo (8 bytes) — skip
  // 0x10: Unknown (16 bytes) — skip
  // 0x20: TextureNameHashes pointer (8 bytes)
  // 0x28: HashesCount(2) + Capacity(2) + padding(4)
  // 0x30: Textures pointer (8 bytes)
  // 0x38: TextureCount(2) + Capacity(2) + padding(4)

  reader.seek(0x30);
  const texturesPtr = reader.readUint64();
  reader.seek(0x38);
  const textureCount = reader.readUint16();

  if (textureCount === 0) return [];

  // Textures pointer → ResourcePointerList64
  // ポインタ配列のアドレスを解決
  const resolvedTexturesPtr = resolvePointer(texturesPtr);
  if (!resolvedTexturesPtr || resolvedTexturesPtr.segment !== "system") {
    throw new Error("Invalid Textures pointer");
  }

  // ポインタリストを読む（各エントリ 8 bytes）
  const textures: TextureInfo[] = [];
  const ptrListOffset = resolvedTexturesPtr.offset;

  for (let i = 0; i < textureCount; i++) {
    const texPtr = reader.readUint64At(ptrListOffset + i * 8);
    const resolvedTexPtr = resolvePointer(texPtr);
    if (!resolvedTexPtr || resolvedTexPtr.segment !== "system") {
      continue;
    }

    const texOffset = resolvedTexPtr.offset;
    const texture = readTexture(reader, texOffset, systemData);
    if (texture) {
      textures.push(texture);
    }
  }

  return textures;
}

function readTexture(
  reader: BinaryReader,
  offset: number,
  systemData: Uint8Array,
): TextureInfo | null {
  // Texture 構造体（144 bytes = 0x90）
  // TextureBase: 0x00-0x4F (80 bytes)
  //   0x28: NamePointer (8 bytes)
  // Texture 固有:
  //   0x50: Width (2)
  //   0x52: Height (2)
  //   0x54: Depth (2)
  //   0x56: Stride (2)
  //   0x58: Format (4)
  //   0x5C: Unknown (1)
  //   0x5D: MipLevels (1)
  //   ...
  //   0x70: DataPointer (8)

  // テクスチャ名
  const namePtr = reader.readUint64At(offset + 0x28);
  let name = "unknown";
  const resolvedNamePtr = resolvePointer(namePtr);
  if (resolvedNamePtr && resolvedNamePtr.segment === "system") {
    const nameReader = new BinaryReader(systemData);
    name = nameReader.readStringAt(resolvedNamePtr.offset);
  }

  const width = reader.readUint16At(offset + 0x50);
  const height = reader.readUint16At(offset + 0x52);
  const depth = reader.readUint16At(offset + 0x54);
  const stride = reader.readUint16At(offset + 0x56);
  const format = reader.readUint32At(offset + 0x58);
  const mipLevels = reader.readUint8At(offset + 0x5d);

  // DataPointer → Graphics segment 内のピクセルデータ
  const dataPtr = reader.readUint64At(offset + 0x70);
  const resolvedDataPtr = resolvePointer(dataPtr);
  if (!resolvedDataPtr) {
    return null;
  }

  const dataOffset =
    resolvedDataPtr.segment === "graphics" ? resolvedDataPtr.offset : 0;
  const dataSize = calcTextureDataSize(width, height, format);

  return {
    name,
    width,
    height,
    depth,
    stride,
    format,
    mipLevels,
    dataOffset,
    dataSize,
  };
}
