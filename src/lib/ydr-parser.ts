// YDR (Drawable) パーサー — RSC7 binary
import { parseRSC7 } from "./rsc7";
import { BinaryReader, resolvePointer } from "./pointer";
import type { ParsedYDR, YDRModel, YDRGeometry, RSC7Header } from "./types";

export async function parseYDRFile(file: File): Promise<ParsedYDR> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const { header, systemData, graphicsData } = parseRSC7(data);
  return parseDrawable(header, systemData, graphicsData);
}

function parseDrawable(
  header: RSC7Header,
  systemData: Uint8Array,
  graphicsData: Uint8Array,
): ParsedYDR {
  const sys = new BinaryReader(systemData);
  const gfx = new BinaryReader(graphicsData);

  // Drawable 構造体（System segment offset 0）
  // DrawableBase:
  //   0x00: VTable (8)
  //   0x08: BlockMapPointer (8)
  //   0x10: ShaderGroup pointer (8)
  //   0x18: Skeleton pointer (8)
  //   0x20: Centre (Vector3: 12 bytes)
  //   0x2C: BoundsMin (Vector3: 12 bytes) — or padded to 16
  //   0x30: BoundsMin (Vector4: 16 bytes)
  //   0x40: BoundsMax (Vector4: 16 bytes)
  //   0x50: DrawableModelsHigh pointer (8)
  //   0x58: DrawableModelsMed pointer (8)
  //   0x60: DrawableModelsLow pointer (8)
  //   0x68: DrawableModelsVlow pointer (8)
  // 実際のオフセットは構造体バージョンにより若干変動

  const view = new DataView(systemData.buffer, systemData.byteOffset, systemData.byteLength);

  // Bounds — 複数の候補オフセットを試す
  let centre = { x: 0, y: 0, z: 0 };
  let boundsMin = { x: 0, y: 0, z: 0 };
  let boundsMax = { x: 0, y: 0, z: 0 };

  // Centre is typically at 0x20 (after VTable + 2 pointers)
  if (systemData.length >= 0x70) {
    centre = readVec3(view, 0x20);
    boundsMin = readVec3(view, 0x30);
    boundsMax = readVec3(view, 0x40);

    // 妥当性チェック
    if (!isValidBounds(centre) || !isValidBounds(boundsMin)) {
      // 別のオフセットを試行
      centre = readVec3(view, 0x28);
      boundsMin = readVec3(view, 0x38);
      boundsMax = readVec3(view, 0x48);
    }
  }

  // DrawableModelsHigh を探す
  const models = tryParseModels(sys, systemData, graphicsData, gfx);

  let totalVertices = 0;
  let totalTriangles = 0;
  for (const model of models) {
    for (const geom of model.geometries) {
      totalVertices += geom.vertexCount;
      totalTriangles += geom.indexCount / 3;
    }
  }

  return {
    header,
    boundsMin,
    boundsMax,
    centre,
    models,
    totalVertices,
    totalTriangles: Math.floor(totalTriangles),
  };
}

function readVec3(view: DataView, offset: number) {
  return {
    x: view.getFloat32(offset, true),
    y: view.getFloat32(offset + 4, true),
    z: view.getFloat32(offset + 8, true),
  };
}

function isValidBounds(v: { x: number; y: number; z: number }): boolean {
  return isFinite(v.x) && isFinite(v.y) && isFinite(v.z) &&
    Math.abs(v.x) < 100000 && Math.abs(v.y) < 100000 && Math.abs(v.z) < 100000;
}

function tryParseModels(
  sys: BinaryReader,
  systemData: Uint8Array,
  graphicsData: Uint8Array,
  _gfx: BinaryReader,
): YDRModel[] {
  const models: YDRModel[] = [];

  // DrawableModelsHigh pointer — 候補オフセット
  const modelPtrOffsets = [0x50, 0x48, 0x58, 0x60, 0x68, 0x70, 0x78, 0x80, 0xA0, 0xA8, 0xB0, 0xB8];

  for (const ptrOff of modelPtrOffsets) {
    if (ptrOff + 8 > systemData.length) continue;

    const ptr = sys.readUint64At(ptrOff);
    const resolved = resolvePointer(ptr);
    if (!resolved || resolved.segment !== "system") continue;

    // DrawableModel ポインタリストを読む
    // ResourcePointerList64: pointer(8) + count(2) + capacity(2) + padding(4)
    const listOff = resolved.offset;
    if (listOff + 16 > systemData.length) continue;

    // ポインタリストの最初のエントリ
    const firstModelPtr = sys.readUint64At(listOff);
    const firstModel = resolvePointer(firstModelPtr);
    if (!firstModel || firstModel.segment !== "system") continue;

    // DrawableModel を解析
    const model = tryParseDrawableModel(sys, firstModel.offset, systemData, graphicsData);
    if (model && model.geometries.length > 0) {
      models.push(model);
      break;
    }
  }

  return models;
}

function tryParseDrawableModel(
  sys: BinaryReader,
  offset: number,
  systemData: Uint8Array,
  graphicsData: Uint8Array,
): YDRModel | null {
  if (offset + 0x30 > systemData.length) return null;

  // DrawableModel:
  //   0x00: VTable (8)
  //   0x08: Geometries pointer (8) → ResourcePointerArray64
  //   0x10: GeometriesCount (2)
  //   0x18: BoundsPointer (8)
  const geomPtr = sys.readUint64At(offset + 0x08);
  const geomResolved = resolvePointer(geomPtr);
  if (!geomResolved || geomResolved.segment !== "system") return null;

  const geomCount = sys.readUint16At(offset + 0x10);
  if (geomCount === 0 || geomCount > 256) return null;

  const geometries: YDRGeometry[] = [];

  for (let i = 0; i < geomCount; i++) {
    const gPtr = sys.readUint64At(geomResolved.offset + i * 8);
    const gResolved = resolvePointer(gPtr);
    if (!gResolved || gResolved.segment !== "system") continue;

    const geom = tryParseGeometry(sys, gResolved.offset, systemData, graphicsData);
    if (geom) geometries.push(geom);
  }

  return { geometries };
}

function tryParseGeometry(
  sys: BinaryReader,
  offset: number,
  systemData: Uint8Array,
  graphicsData: Uint8Array,
): YDRGeometry | null {
  if (offset + 0x50 > systemData.length) return null;

  // Geometry 構造体:
  //   0x00: VTable (8)
  //   0x08: Unknown (8)
  //   0x10: Unknown (8)
  //   0x18: VertexBuffer pointer (8)
  //   0x20: Unknown (8)
  //   0x28: Unknown (8)
  //   0x30: Unknown (8)
  //   0x38: IndexBuffer pointer (8)

  const vbPtr = sys.readUint64At(offset + 0x18);
  const ibPtr = sys.readUint64At(offset + 0x38);

  const vb = resolvePointer(vbPtr);
  const ib = resolvePointer(ibPtr);
  if (!vb || !ib || vb.segment !== "system" || ib.segment !== "system") return null;

  // VertexBuffer:
  //   0x00: VTable (8)
  //   0x08: VertexCount (2)
  //   0x0A: Locked (2)
  //   0x0C: Unknown (4)
  //   0x10: DataPointer1 (8) → graphics data
  //   0x18: Stride (4)
  if (vb.offset + 0x20 > systemData.length) return null;

  const vertexCount = sys.readUint16At(vb.offset + 0x08);
  const vertexStride = sys.readUint32At(vb.offset + 0x18);
  const vDataPtr = sys.readUint64At(vb.offset + 0x10);
  const vData = resolvePointer(vDataPtr);

  if (vertexCount === 0 || vertexStride === 0 || vertexStride > 256) return null;
  if (!vData) return null;

  // IndexBuffer:
  //   0x00: VTable (8)
  //   0x08: IndexCount (4)
  //   0x0C: Unknown (4)
  //   0x10: DataPointer (8) → graphics data
  if (ib.offset + 0x18 > systemData.length) return null;

  const indexCount = sys.readUint32At(ib.offset + 0x08);
  const iDataPtr = sys.readUint64At(ib.offset + 0x10);
  const iData = resolvePointer(iDataPtr);

  if (indexCount === 0 || !iData) return null;

  // 頂点データ読み取り（Position = 最初の 12 bytes を float32 x 3 として）
  const vertices = new Float32Array(vertexCount * 3);
  const targetData = vData.segment === "graphics" ? graphicsData : systemData;

  for (let i = 0; i < vertexCount; i++) {
    const vOff = vData.offset + i * vertexStride;
    if (vOff + 12 > targetData.length) break;

    const dv = new DataView(targetData.buffer, targetData.byteOffset, targetData.byteLength);
    vertices[i * 3] = dv.getFloat32(vOff, true);
    vertices[i * 3 + 1] = dv.getFloat32(vOff + 4, true);
    vertices[i * 3 + 2] = dv.getFloat32(vOff + 8, true);
  }

  // 妥当性チェック: 最初の頂点が有限値か
  if (!isFinite(vertices[0]!) || !isFinite(vertices[1]!) || !isFinite(vertices[2]!)) {
    return null;
  }

  // インデックスデータ読み取り
  const indices = new Uint16Array(indexCount);
  const iTargetData = iData.segment === "graphics" ? graphicsData : systemData;

  for (let i = 0; i < indexCount; i++) {
    const iOff = iData.offset + i * 2;
    if (iOff + 2 > iTargetData.length) break;
    const dv = new DataView(iTargetData.buffer, iTargetData.byteOffset, iTargetData.byteLength);
    indices[i] = dv.getUint16(iOff, true);
  }

  return { vertexCount, indexCount, vertices, indices };
}
