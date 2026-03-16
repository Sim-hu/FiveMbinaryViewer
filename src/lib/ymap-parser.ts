// YMAP (CMapData) パーサー — XML / PSO binary 両対応
import { parseRSC7 } from "./rsc7";
import type { ParsedYMAP, YMAPEntity } from "./types";

const DEFAULT_VEC3 = { x: 0, y: 0, z: 0 };

export async function parseYMAPFile(file: File): Promise<ParsedYMAP> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  // XML 判定
  const head = new TextDecoder("utf-8", { fatal: false }).decode(
    data.subarray(0, Math.min(256, data.length)),
  );
  if (head.trimStart().startsWith("<?xml") || head.trimStart().startsWith("<CMapData")) {
    return parseYMAPXml(new TextDecoder().decode(data));
  }

  // RSC7 binary (PSO format)
  return parseYMAPBinary(data);
}

// --- XML パーサー ---
function parseYMAPXml(xmlStr: string): ParsedYMAP {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "text/xml");
  const root = doc.querySelector("CMapData");
  if (!root) throw new Error("CMapData element not found");

  const entities: YMAPEntity[] = [];
  for (const item of root.querySelectorAll("entities > Item")) {
    entities.push({
      archetypeName: txt(item, "archetypeName"),
      flags: num(item, "flags"),
      guid: txt(item, "guid"),
      position: vec3(item, "position"),
      rotation: vec4(item, "rotation"),
      scaleXY: numVal(item, "scaleXY"),
      scaleZ: numVal(item, "scaleZ"),
      parentIndex: numVal(item, "parentIndex"),
      lodDist: numVal(item, "lodDist"),
      childLodDist: numVal(item, "childLodDist"),
      lodLevel: txt(item, "lodLevel"),
      numChildren: numVal(item, "numChildren"),
      priorityLevel: txt(item, "priorityLevel"),
    });
  }

  return {
    name: txt(root, "name"),
    parent: txt(root, "parent"),
    flags: num(root, "flags"),
    contentFlags: num(root, "contentFlags"),
    streamingExtentsMin: vec3(root, "streamingExtentsMin"),
    streamingExtentsMax: vec3(root, "streamingExtentsMax"),
    entities,
  };
}

function txt(el: Element, tag: string): string {
  return el.querySelector(`:scope > ${tag}`)?.textContent?.trim() ?? "";
}

function num(el: Element, tag: string): number {
  const node = el.querySelector(`:scope > ${tag}`);
  return parseInt(node?.getAttribute("value") ?? node?.textContent ?? "0", 10);
}

function numVal(el: Element, tag: string): number {
  const node = el.querySelector(`:scope > ${tag}`);
  return parseFloat(node?.getAttribute("value") ?? node?.textContent ?? "0");
}

function vec3(el: Element, tag: string) {
  const node = el.querySelector(`:scope > ${tag}`);
  if (!node) return { ...DEFAULT_VEC3 };
  return {
    x: parseFloat(node.getAttribute("x") ?? "0"),
    y: parseFloat(node.getAttribute("y") ?? "0"),
    z: parseFloat(node.getAttribute("z") ?? "0"),
  };
}

function vec4(el: Element, tag: string) {
  const node = el.querySelector(`:scope > ${tag}`);
  if (!node) return { x: 0, y: 0, z: 0, w: 1 };
  return {
    x: parseFloat(node.getAttribute("x") ?? "0"),
    y: parseFloat(node.getAttribute("y") ?? "0"),
    z: parseFloat(node.getAttribute("z") ?? "0"),
    w: parseFloat(node.getAttribute("w") ?? "1"),
  };
}

// --- PSO binary パーサー ---
// RSC7 version=2 のリソースは PSO (Packaged Serialized Object) フォーマット
// CEntityDef 構造 (128 bytes = 0x80):
//   +0x00: archetypeName (uint32 hash)
//   +0x04: flags (uint32)
//   +0x08: guid (uint32 hash)
//   +0x0C: padding
//   +0x10: unused (8)
//   +0x18: position (vec3 + padding) = 16 bytes
//   +0x28: rotation (vec4) = 16 bytes
//   +0x38: scaleXY (float)
//   +0x3C: scaleZ (float)
//   +0x40: parentIndex (int32)
//   +0x44: lodDist (float)
//   +0x48: childLodDist (float)
//   +0x4C: lodLevel (uint32)
//   +0x50: numChildren (uint32)
//   +0x54: priorityLevel (uint32)
const ENTITY_SIZE = 0x80;

function parseYMAPBinary(data: Uint8Array): ParsedYMAP {
  const { systemData } = parseRSC7(data);
  const entities = scanForEntities(systemData);

  // extents を計算
  let sMin = { ...DEFAULT_VEC3 };
  let sMax = { ...DEFAULT_VEC3 };
  if (entities.length > 0) {
    sMin = { x: Infinity, y: Infinity, z: Infinity };
    sMax = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const e of entities) {
      sMin.x = Math.min(sMin.x, e.position.x);
      sMin.y = Math.min(sMin.y, e.position.y);
      sMin.z = Math.min(sMin.z, e.position.z);
      sMax.x = Math.max(sMax.x, e.position.x);
      sMax.y = Math.max(sMax.y, e.position.y);
      sMax.z = Math.max(sMax.z, e.position.z);
    }
  }

  return {
    name: "",
    parent: "",
    flags: 0,
    contentFlags: 0,
    streamingExtentsMin: sMin,
    streamingExtentsMax: sMax,
    entities,
  };
}

// CEntityDef をパターンマッチングで検出
function scanForEntities(data: Uint8Array): YMAPEntity[] {
  const entities: YMAPEntity[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // position (vec3) + pad(0) + rotation (vec4 with w close to 1 or -1) パターンを探す
  for (let i = 0; i <= data.length - ENTITY_SIZE; i += 4) {
    // position at +0x18 from candidate start
    const posOff = i + 0x18;
    if (posOff + 32 > data.length) break;

    const px = view.getFloat32(posOff, true);
    const py = view.getFloat32(posOff + 4, true);
    const pz = view.getFloat32(posOff + 8, true);
    const ppad = view.getFloat32(posOff + 12, true);

    // 位置が妥当な範囲か
    if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) continue;
    if (Math.abs(px) < 1 || Math.abs(px) > 20000) continue;
    if (Math.abs(py) < 1 || Math.abs(py) > 20000) continue;
    if (Math.abs(ppad) > 0.01) continue; // padding は 0

    // rotation
    const rx = view.getFloat32(posOff + 16, true);
    const ry = view.getFloat32(posOff + 20, true);
    const rz = view.getFloat32(posOff + 24, true);
    const rw = view.getFloat32(posOff + 28, true);

    if (!isFinite(rx) || !isFinite(ry) || !isFinite(rz) || !isFinite(rw)) continue;
    if (Math.abs(rx) > 1.01 || Math.abs(ry) > 1.01 || Math.abs(rz) > 1.01 || Math.abs(rw) > 1.01) continue;

    // scaleXY, scaleZ at +0x38
    const scaleXY = view.getFloat32(i + 0x38, true);
    const scaleZ = view.getFloat32(i + 0x3c, true);
    if (!isFinite(scaleXY) || scaleXY <= 0 || scaleXY > 1000) continue;
    if (!isFinite(scaleZ) || scaleZ <= 0 || scaleZ > 1000) continue;

    // archetype hash at +0x00
    const hash = view.getUint32(i, true);
    if (hash === 0) continue;

    const flags = view.getUint32(i + 0x04, true);
    const guid = view.getUint32(i + 0x08, true);
    const parentIndex = view.getInt32(i + 0x40, true);
    const lodDist = view.getFloat32(i + 0x44, true);
    const childLodDist = view.getFloat32(i + 0x48, true);
    const lodLevel = view.getUint32(i + 0x4c, true);

    entities.push({
      archetypeName: `0x${hash.toString(16)}`,
      flags,
      guid: `0x${guid.toString(16)}`,
      position: { x: px, y: py, z: pz },
      rotation: { x: rx, y: ry, z: rz, w: rw },
      scaleXY,
      scaleZ,
      parentIndex,
      lodDist: isFinite(lodDist) ? lodDist : 0,
      childLodDist: isFinite(childLodDist) ? childLodDist : 0,
      lodLevel: lodLevelToString(lodLevel),
      numChildren: 0,
      priorityLevel: "",
    });

    // 次のエンティティは ENTITY_SIZE バイト先
    i += ENTITY_SIZE - 4; // -4 because loop does +4
  }

  return entities;
}

function lodLevelToString(level: number): string {
  switch (level) {
    case 0: return "LODTYPES_DEPTH_HD";
    case 1: return "LODTYPES_DEPTH_LOD";
    case 2: return "LODTYPES_DEPTH_SLOD1";
    case 3: return "LODTYPES_DEPTH_SLOD2";
    case 4: return "LODTYPES_DEPTH_SLOD3";
    case 5: return "LODTYPES_DEPTH_ORPHANHD";
    default: return String(level);
  }
}
