// YTD ファイルオーケストレーター
import { parseRSC7 } from "./rsc7";
import { parseTextureDictionary } from "./texture-dict";
import { decodeTexture } from "./dds-decode";
import type { ParsedYTD, TextureInfo } from "./types";

export async function parseYTDFile(file: File): Promise<ParsedYTD> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  const { header, systemData, graphicsData } = parseRSC7(data);
  const textures = parseTextureDictionary(systemData, graphicsData);

  return { header, textures, systemData, graphicsData };
}

export function decodeTextureToRGBA(
  texture: TextureInfo,
  graphicsData: Uint8Array,
): Uint8Array {
  const texData = graphicsData.subarray(
    texture.dataOffset,
    texture.dataOffset + texture.dataSize,
  );
  return decodeTexture(texData, texture.width, texture.height, texture.format);
}
