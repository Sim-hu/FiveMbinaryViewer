// YMT (Meta/Type) パーサー — XML / PSO / RBF / RSC7 binary
import { parseRSC7 } from "./rsc7";
import type { ParsedYMT, YMTField } from "./types";

export async function parseYMTFile(file: File): Promise<ParsedYMT> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  // XML 判定
  const head = new TextDecoder("utf-8", { fatal: false }).decode(
    data.subarray(0, Math.min(256, data.length)),
  );
  if (head.trimStart().startsWith("<?xml") || /^<[A-Z]/.test(head.trimStart())) {
    const xmlStr = new TextDecoder().decode(data);
    return parseYMTXml(xmlStr);
  }

  // RSC7 判定
  if (data.length >= 4) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const magic = view.getUint32(0, true);
    if (magic === 0x37435352) {
      return parseYMTBinary(data);
    }
  }

  // PSO 判定 (magic "PSO\0" = 0x4F535000 or similar)
  // RBF 判定 (magic various)
  return {
    format: "binary",
    fields: [{ name: "info", value: `Unknown format (${data.length} bytes)` }],
  };
}

function parseYMTXml(xmlStr: string): ParsedYMT {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "text/xml");
  const fields: YMTField[] = [];

  // ルート要素から再帰的にフィールドを抽出
  const root = doc.documentElement;
  if (root) {
    extractFields(root, "", fields, 0);
  }

  return { format: "xml", fields, rawXml: xmlStr };
}

function extractFields(el: Element, prefix: string, fields: YMTField[], depth: number) {
  if (depth > 6) return; // 深すぎるネストを防止

  const path = prefix ? `${prefix}.${el.tagName}` : el.tagName;

  // 属性
  for (const attr of el.attributes) {
    if (attr.name !== "type") {
      fields.push({ name: `${path}@${attr.name}`, value: attr.value });
    }
  }

  // テキストコンテンツ（子要素がない場合）
  if (el.children.length === 0 && el.textContent?.trim()) {
    fields.push({ name: path, value: el.textContent.trim() });
  }

  // 子要素
  for (const child of el.children) {
    extractFields(child, path, fields, depth + 1);
  }
}

function parseYMTBinary(data: Uint8Array): ParsedYMT {
  const { header, systemData } = parseRSC7(data);
  const fields: YMTField[] = [];

  fields.push({ name: "RSC7 Version", value: String(header.version) });
  fields.push({ name: "System Size", value: `${header.systemSize} bytes` });
  fields.push({ name: "Graphics Size", value: `${header.graphicsSize} bytes` });

  // PSO チェック（展開後データの offset 0x10 に "0DRP" = 0x50524430）
  if (systemData.length >= 0x18) {
    const view = new DataView(systemData.buffer, systemData.byteOffset, systemData.byteLength);
    const psoMagic = view.getUint32(0x10, true);

    if (psoMagic === 0x50524430) { // "0DRP" LE
      fields.push({ name: "Internal Format", value: "PSO (Packaged Serialized Object)" });
      parsePSOData(systemData, fields);
      return { format: "pso", fields };
    }

    // 旧式 PSO magic チェック
    const magic = view.getUint32(0, true);
    if (magic === 0x50534348 || magic === 0x4E495350) {
      fields.push({ name: "Internal Format", value: "PSO (Packaged Serialized Object)" });
      parsePSOData(systemData, fields);
      return { format: "pso", fields };
    }

    // RBF magic チェック
    if (systemData[0] === 0x52 && systemData[1] === 0x42 && systemData[2] === 0x46) {
      fields.push({ name: "Internal Format", value: "RBF (Resource Binary Format)" });
      return { format: "rbf", fields };
    }
  }

  // 汎用メタデータ抽出を試行
  tryExtractMetaStrings(systemData, fields);

  fields.push({ name: "Internal Format", value: "Binary Meta" });
  return { format: "binary", fields };
}

// PSO データからフィールド抽出
function parsePSOData(data: Uint8Array, fields: YMTField[]) {
  if (data.length < 32) return;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // PSO ヘッダー
  // 0x00: magic (4)
  // 0x04: identifier (4)
  // 0x08: root type/id (4)
  // 0x0C: entries/sections info

  const ident = view.getUint32(4, true);
  const rootId = view.getUint32(8, true);
  fields.push({ name: "PSO Identifier", value: `0x${ident.toString(16)}` });
  fields.push({ name: "PSO Root ID", value: `0x${rootId.toString(16)}` });

  // 文字列を探す
  tryExtractMetaStrings(data, fields);
}

// バイナリデータから可読文字列を抽出
function tryExtractMetaStrings(data: Uint8Array, fields: YMTField[]) {
  // null 終端の ASCII 文字列を探す
  const strings: string[] = [];
  let start = -1;

  for (let i = 0; i < data.length; i++) {
    const b = data[i]!;
    if (b >= 0x20 && b < 0x7f) {
      if (start === -1) start = i;
    } else if (b === 0 && start !== -1) {
      const len = i - start;
      if (len >= 4 && len < 256) {
        const str = new TextDecoder("ascii").decode(data.subarray(start, i));
        // 意味がありそうな文字列のみ
        if (/[a-zA-Z_]/.test(str[0] ?? "")) {
          strings.push(str);
        }
      }
      start = -1;
    } else {
      start = -1;
    }
  }

  // 重複除去して追加
  const unique = [...new Set(strings)];
  if (unique.length > 0) {
    fields.push({
      name: "Embedded Strings",
      value: unique.slice(0, 50).join(", "),
    });
  }
}
