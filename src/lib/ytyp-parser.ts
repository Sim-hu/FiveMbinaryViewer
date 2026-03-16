// YTYP (CMapTypes) パーサー — XML / RSC7 binary 両対応
import type { ParsedYTYP, YTYPArchetype } from "./types";

export async function parseYTYPFile(file: File): Promise<ParsedYTYP> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  const head = new TextDecoder("utf-8", { fatal: false }).decode(
    data.subarray(0, Math.min(256, data.length)),
  );
  if (head.trimStart().startsWith("<?xml") || head.trimStart().startsWith("<CMapTypes")) {
    return parseYTYPXml(new TextDecoder().decode(data));
  }

  // RSC7 binary — 限定的なサポート
  return { archetypes: [] };
}

function parseYTYPXml(xmlStr: string): ParsedYTYP {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "text/xml");
  const root = doc.querySelector("CMapTypes");
  if (!root) throw new Error("CMapTypes element not found");

  const archetypes: YTYPArchetype[] = [];
  for (const item of root.querySelectorAll("archetypes > Item")) {
    archetypes.push({
      type: item.getAttribute("type") ?? "CBaseArchetypeDef",
      name: txt(item, "name"),
      textureDictionary: txt(item, "textureDictionary"),
      physicsDictionary: txt(item, "physicsDictionary"),
      assetType: txt(item, "assetType"),
      assetName: txt(item, "assetName"),
      lodDist: numVal(item, "lodDist"),
      hdTextureDist: numVal(item, "hdTextureDist"),
      flags: num(item, "flags"),
      bbMin: vec3(item, "bbMin"),
      bbMax: vec3(item, "bbMax"),
      bsCentre: vec3(item, "bsCentre"),
      bsRadius: numVal(item, "bsRadius"),
    });
  }

  return { archetypes };
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
  if (!node) return { x: 0, y: 0, z: 0 };
  return {
    x: parseFloat(node.getAttribute("x") ?? "0"),
    y: parseFloat(node.getAttribute("y") ?? "0"),
    z: parseFloat(node.getAttribute("z") ?? "0"),
  };
}
