// YBN (Bounds) パーサー — RSC7 binary
import { parseRSC7 } from "./rsc7";
import { BinaryReader, resolvePointer } from "./pointer";
import type { ParsedYBN, YBNBound } from "./types";

// Bound タイプ
const BOUND_TYPES: Record<number, string> = {
  0: "BoundSphere",
  1: "BoundCapsule",
  3: "BoundBox",
  4: "BoundGeometry",
  8: "BoundBVH",
  10: "BoundComposite",
  12: "BoundDisc",
  13: "BoundCylinder",
  15: "BoundPlane",
};

export async function parseYBNFile(file: File): Promise<ParsedYBN> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const { header, systemData, graphicsData } = parseRSC7(data);

  return parseBounds(header, systemData, graphicsData);
}

function parseBounds(
  header: { magic: number; version: number; systemFlags: number; graphicsFlags: number; systemSize: number; graphicsSize: number },
  systemData: Uint8Array,
  _graphicsData: Uint8Array,
): ParsedYBN {
  const reader = new BinaryReader(systemData);
  const view = new DataView(systemData.buffer, systemData.byteOffset, systemData.byteLength);

  // Bound 基本構造体（System segment offset 0）
  // 0x00: VTable (8)
  // 0x08: Unknown (8)
  // 0x10: Type (1) + Unknown (7)
  // 0x18: BoundingSphereRadius (float)
  // 0x1C: padding (4)
  // 0x20: BoundingBoxMax (Vector4: 16 bytes)
  // 0x30: BoundingBoxMin (Vector4: 16 bytes)
  // 0x40: BoundingBoxCenter (Vector4: 16 bytes) — or centroid
  // 0x50: Center (Vector4: 16 bytes) — center of mass
  // 0x60: Volume / Inertia etc.

  let centre = { x: 0, y: 0, z: 0 };
  let boundsMin = { x: 0, y: 0, z: 0 };
  let boundsMax = { x: 0, y: 0, z: 0 };
  let radius = 0;
  const bounds: YBNBound[] = [];

  if (systemData.length < 0x70) {
    return { header, bounds: [], boundsMin: centre, boundsMax: centre, centre, radius: 0 };
  }

  const boundType = view.getUint8(0x10);
  radius = view.getFloat32(0x18, true);

  // AABB
  boundsMax = readVec3(view, 0x20);
  boundsMin = readVec3(view, 0x30);
  centre = readVec3(view, 0x40);

  // 妥当性チェック
  if (!isValid(boundsMax) || !isValid(boundsMin)) {
    // 別のオフセットを試す
    boundsMin = readVec3(view, 0x20);
    boundsMax = readVec3(view, 0x30);
    centre = readVec3(view, 0x50);
  }

  // ルート Bound を追加
  bounds.push({
    type: BOUND_TYPES[boundType] ?? `Unknown(${boundType})`,
    center: centre,
    radius,
    bbMin: boundsMin,
    bbMax: boundsMax,
    material: 0,
    childCount: 0,
  });

  // BoundComposite (type=10) の場合、子 Bound を解析
  if (boundType === 10) {
    parseComposite(reader, systemData, bounds);
  }

  return { header, bounds, boundsMin, boundsMax, centre, radius };
}

function parseComposite(
  reader: BinaryReader,
  systemData: Uint8Array,
  bounds: YBNBound[],
) {
  const view = new DataView(systemData.buffer, systemData.byteOffset, systemData.byteLength);

  // BoundComposite:
  //   0x70: Children pointer (8) → ポインタ配列
  //   0x78: Children transforms pointer (8)
  //   0x80: Children types/flags pointer (8)
  //   0x88: padding
  //   0x90: Count (2)
  // オフセットは推定値、複数候補を試す
  const candidateOffsets = [0x70, 0x78, 0x80, 0x88, 0x90, 0x98, 0xA0];

  for (const ptrOff of candidateOffsets) {
    if (ptrOff + 10 > systemData.length) continue;

    const ptr = reader.readUint64At(ptrOff);
    const resolved = resolvePointer(ptr);
    if (!resolved || resolved.segment !== "system") continue;

    // count を次の数バイトから探す
    for (const countOff of [ptrOff + 8, ptrOff + 16, ptrOff + 24]) {
      if (countOff + 2 > systemData.length) continue;
      const count = reader.readUint16At(countOff);
      if (count === 0 || count > 1000) continue;

      // ポインタ配列として読む
      const arrayOff = resolved.offset;
      if (arrayOff + count * 8 > systemData.length) continue;

      let valid = true;
      const childBounds: YBNBound[] = [];

      for (let i = 0; i < count; i++) {
        const childPtr = reader.readUint64At(arrayOff + i * 8);
        const childResolved = resolvePointer(childPtr);
        if (!childResolved || childResolved.segment !== "system") {
          valid = false;
          break;
        }

        const off = childResolved.offset;
        if (off + 0x50 > systemData.length) {
          valid = false;
          break;
        }

        const childType = view.getUint8(off + 0x10);
        const childRadius = view.getFloat32(off + 0x18, true);
        const childMax = readVec3(view, off + 0x20);
        const childMin = readVec3(view, off + 0x30);
        const childCentre = readVec3(view, off + 0x40);

        if (!isValid(childCentre)) {
          valid = false;
          break;
        }

        childBounds.push({
          type: BOUND_TYPES[childType] ?? `Unknown(${childType})`,
          center: childCentre,
          radius: childRadius,
          bbMin: childMin,
          bbMax: childMax,
          material: 0,
          childCount: 0,
        });
      }

      if (valid && childBounds.length > 0) {
        bounds[0]!.childCount = childBounds.length;
        bounds.push(...childBounds);
        return;
      }
    }
  }
}

function readVec3(view: DataView, offset: number) {
  return {
    x: view.getFloat32(offset, true),
    y: view.getFloat32(offset + 4, true),
    z: view.getFloat32(offset + 8, true),
  };
}

function isValid(v: { x: number; y: number; z: number }): boolean {
  return isFinite(v.x) && isFinite(v.y) && isFinite(v.z) &&
    Math.abs(v.x) < 100000 && Math.abs(v.y) < 100000 && Math.abs(v.z) < 100000;
}
