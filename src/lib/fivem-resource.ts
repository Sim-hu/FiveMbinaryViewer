import { joaat, parseGxt2 } from "./gxt2-parser";

const STREAM_EXTENSIONS = new Set([
  "ybn",
  "ydd",
  "ydr",
  "yft",
  "ymap",
  "ynv",
  "ytyp",
  "ytd",
]);

const DATA_EXTENSIONS = new Set([
  "dat",
  "meta",
  "ymt",
  "xml",
]);

// gxt2 は FiveM が読まないのでそのままは入れず、AddTextEntry の Lua に変換する
const EXCLUDED_EXTENSIONS = new Set([
  "gxt2",
]);

// 音声メタ (.rel) の data_file 種別。FiveM 側は "151.rel" などを除いた
// "<name>.dat" で参照する (例: audio/foo_game.dat151.rel → 'audio/foo_game.dat')
const AUDIO_REL_DATA_FILE_TYPES: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /\.dat151\.rel$/i, type: "AUDIO_GAMEDATA" },
  { pattern: /\.dat54\.rel$/i, type: "AUDIO_SOUNDDATA" },
  { pattern: /\.dat10\.rel$/i, type: "AUDIO_SYNTHDATA" },
  { pattern: /\.dat15\.rel$/i, type: "AUDIO_DYNAMIXDATA" },
];

// fxmanifest の files {} に列挙が必要なフォルダ (stream/ は自動で配信される)
const MANIFEST_FILE_FOLDERS = ["data/", "audio/", "sfx/"];

// wavepack 名として使えない親フォルダ名。該当したら awc 名から dlc_<name> を作る
const GENERIC_AUDIO_FOLDERS = new Set(["", "sfx", "audio", "x64", "stream"]);

// 言語別に同梱される gxt2 のうち優先して使うもの (americandlc.rpf など)。
// アドオン車両は全言語に英語をコピーしているだけのものが大半なので英語を基準にする。
const PREFERRED_GXT2_LANGUAGE = "american";

// DLC パッケージ記述子。FiveM リソースでは不要で、混入するとマウントが壊れる
const EXCLUDED_FILENAMES = new Set([
  "content.xml",
  "setup2.xml",
]);

const META_DATA_FILE_TYPES: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /(^|\/)handling\.meta$/i, type: "HANDLING_FILE" },
  { pattern: /(^|\/)vehicles\.meta$/i, type: "VEHICLE_METADATA_FILE" },
  { pattern: /(^|\/)carcols\.meta$/i, type: "CARCOLS_FILE" },
  { pattern: /(^|\/)carvariations\.meta$/i, type: "VEHICLE_VARIATION_FILE" },
  { pattern: /(^|\/)vehiclelayouts\.meta$/i, type: "VEHICLE_LAYOUTS_FILE" },
  { pattern: /(^|\/)contentunlocks\.meta$/i, type: "CONTENT_UNLOCKING_META" },
  { pattern: /(^|\/)dlctext\.meta$/i, type: "DLC_TEXT_FILE" },
  { pattern: /(^|\/)weapon(?:animations|archetypes|components|pedpersonality|s)?\.meta$/i, type: "WEAPONINFO_FILE" },
  { pattern: /(^|\/)weapon(?:animations|archetypes|components|pedpersonality|s)?[^/]*\.meta$/i, type: "WEAPONINFO_FILE" },
  { pattern: /(^|\/)pedpersonality\.meta$/i, type: "PED_PERSONALITY_FILE" },
  { pattern: /(^|\/)peds\.meta$/i, type: "PED_METADATA_FILE" },
  { pattern: /(^|\/)shop_vehicle\.meta$/i, type: "VEHICLE_SHOP_DLC_FILE" },
];

export interface FiveMResourceFile {
  sourcePath: string;
  resourcePath: string;
  data: Uint8Array;
}

export interface FiveMResourceBuildResult {
  rootName: string;
  files: FiveMResourceFile[];
  manifest: string;
  isVehicle: boolean;
}

export function buildFiveMResourceFiles(
  sourceFiles: Map<string, Uint8Array>,
  sourceFileName: string,
): FiveMResourceBuildResult {
  const files: FiveMResourceFile[] = [];
  const usedResourcePaths = new Set<string>();

  for (const [sourcePath, data] of sourceFiles) {
    const normalizedPath = normalizeArchivePath(sourcePath);
    if (!normalizedPath || shouldExcludeFromResource(normalizedPath)) continue;

    const resourcePath = getUniqueResourcePath(
      getFiveMResourcePath(normalizedPath),
      usedResourcePaths,
    );

    files.push({
      sourcePath: normalizedPath,
      resourcePath,
      data,
    });
  }

  files.sort((a, b) => a.resourcePath.localeCompare(b.resourcePath));

  // 車両リソースの場合は車両モデル名 (例: 23rc390) をリソース名として使う
  const isVehicle = isVehicleResource(files);
  const vehicleName = isVehicle ? detectVehicleModelName(files) : null;
  const rootName =
    vehicleName ?? sanitizeResourceName(sourceFileName.replace(/\.rpf$/i, ""));

  // gxt2 (表示名・改造パーツ名) を AddTextEntry の Lua に変換して同梱する。
  // 複数車両を 1 リソースにまとめても衝突しないようファイル名にリソース名を入れる。
  const labelsFile = createTextLabelsFile(sourceFiles, `client/${rootName}_labels.lua`);
  if (labelsFile) files.push(labelsFile);

  return {
    rootName,
    files,
    manifest: createFxManifest(files),
    isVehicle,
  };
}

// 同梱 gxt2 から 1 言語ぶんを選び、AddTextEntry を並べた Lua を作る
function createTextLabelsFile(
  sourceFiles: Map<string, Uint8Array>,
  resourcePath: string,
): FiveMResourceFile | null {
  const gxt2Paths = [...sourceFiles.keys()]
    .map(normalizeArchivePath)
    .filter((path) => getExtension(path) === "gxt2")
    .sort();
  if (gxt2Paths.length === 0) return null;

  const language = pickGxt2Language(gxt2Paths);
  const texts = new Map<number, string>();
  let sourcePath = "";

  for (const [rawPath, data] of sourceFiles) {
    const path = normalizeArchivePath(rawPath);
    if (getExtension(path) !== "gxt2" || getParentName(path) !== language) continue;

    try {
      for (const { hash, text } of parseGxt2(data)) texts.set(hash, text);
      sourcePath ||= path;
    } catch {
      // 壊れた gxt2 は無視して残りを使う
    }
  }
  if (texts.size === 0) return null;

  // gxt2 のキーはハッシュなので、meta に書かれたラベル名と突き合わせて復元する。
  // 復元できたものは読みやすい AddTextEntry、できないものは AddTextEntryByHash で出す。
  const labelNames = collectLabelNames(sourceFiles);
  const named: string[] = [];
  const hashed: string[] = [];

  for (const [hash, text] of texts) {
    const name = labelNames.get(hash);
    if (name) {
      named.push(`AddTextEntry('${escapeLuaString(name)}', '${escapeLuaString(text)}')`);
    } else {
      const hex = hash.toString(16).toUpperCase().padStart(8, "0");
      hashed.push(`AddTextEntryByHash(0x${hex}, '${escapeLuaString(text)}')`);
    }
  }

  named.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  hashed.sort();

  const lines = [`-- Generated from ${sourcePath}`, ...named];
  if (hashed.length > 0) {
    lines.push("", "-- ラベル名を復元できなかったエントリ (ハッシュ指定)", ...hashed);
  }
  lines.push("");

  return {
    sourcePath,
    resourcePath,
    data: new TextEncoder().encode(lines.join("\n")),
  };
}

// gxt2 の親フォルダ名 (americandlc.rpf など) を言語キーとして 1 つ選ぶ
function pickGxt2Language(sortedGxt2Paths: string[]): string {
  const languages = sortedGxt2Paths.map(getParentName);
  return (
    languages.find((name) => name.toLowerCase().startsWith(PREFERRED_GXT2_LANGUAGE)) ??
    languages[0]!
  );
}

// meta 内のラベル名 (改造パーツ名・車名・メーカー名) を集めてハッシュ → 名前の表を作る
function collectLabelNames(sourceFiles: Map<string, Uint8Array>): Map<number, string> {
  const names = new Map<number, string>();
  const decoder = new TextDecoder("utf-8");
  const metaTexts = [...sourceFiles]
    .filter(([path]) => getExtension(normalizeArchivePath(path)) === "meta")
    .map(([, data]) => decoder.decode(data));

  // joaat は大文字小文字を区別しないため sun1_bon1 と SUN1_BON1 は同じハッシュになる。
  // ラベル用タグの表記を優先し、modelName は車名キー (例: sunrise1) 用の保険にする。
  const tagPasses = [
    /<(modShopLabel|gameName|vehicleMakeName)>\s*([^<\s][^<]*?)\s*<\/\1>/g,
    /<(modelName)>\s*([^<\s][^<]*?)\s*<\/\1>/g,
  ];

  for (const tags of tagPasses) {
    for (const text of metaTexts) {
      for (const match of text.matchAll(tags)) {
        const name = match[2]!;
        const hash = joaat(name);
        if (!names.has(hash)) names.set(hash, name);
      }
    }
  }

  return names;
}

function isVehicleResource(files: FiveMResourceFile[]): boolean {
  return files.some(
    (file) =>
      /(^|\/)(vehicles|handling|carcols|carvariations)\.meta$/i.test(
        file.resourcePath,
      ) || /(^|\/)vehicles\.meta$/i.test(file.sourcePath),
  );
}

// stream 内の .yft 名から車両モデル名を推定する (例: 23rc390.yft → 23rc390)
function detectVehicleModelName(files: FiveMResourceFile[]): string | null {
  const counts = new Map<string, number>();

  for (const file of files) {
    if (getExtension(file.resourcePath) !== "yft") continue;
    const base = getBaseName(file.resourcePath).replace(/\.yft$/i, "");
    // 高ディテール／変種サフィックスを除去 (_hi, +hi, _hi など)
    const model = base.replace(/[_+]hi$/i, "").trim();
    if (!model) continue;
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  let bestName: string | null = null;
  let bestCount = -1;
  for (const [name, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && bestName !== null && name.length < bestName.length)
    ) {
      bestName = name;
      bestCount = count;
    }
  }

  return bestName ? sanitizeResourceName(bestName) : null;
}

function sanitizeResourceName(name: string): string {
  const normalized = name
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return normalized || "fivem_resource";
}

function normalizeArchivePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/(?:^|\/)\.\.(?=\/|$)/g, "")
    .split("/")
    .filter(Boolean)
    .join("/");
}

function shouldExcludeFromResource(path: string): boolean {
  return (
    EXCLUDED_EXTENSIONS.has(getExtension(path)) ||
    EXCLUDED_FILENAMES.has(getBaseName(path).toLowerCase())
  );
}

// FiveM リソースは stream/ と data/ のフラット構造を取る。
// DLC RPF の common/data/... や dlc/... といった深いパスは basename に
// 平坦化し、data/common/data/... のようなネストを作らない。
// 音声だけは別扱い: .awc は stream/ に置いても鳴らないので sfx/<wavepack>/ に、
// .rel は audio/ に置き、fxmanifest の AUDIO_* data_file で登録する。
function getFiveMResourcePath(path: string): string {
  const ext = getExtension(path);
  const base = getBaseName(path);

  if (ext === "awc") return `sfx/${getWavepackName(path)}/${base}`;
  if (ext === "rel") return `audio/${base}`;
  if (STREAM_EXTENSIONS.has(ext)) return `stream/${base}`;
  if (DATA_EXTENSIONS.has(ext)) return `data/${base}`;
  return `stream/${base}`;
}

// .awc の wavepack フォルダ名。dat54.rel が "DLC_FOO\foo" の形でフォルダ名ごと
// 参照しているため、元の親フォルダ名 (dlc_foo / dlc_foo.rpf) を維持する必要がある。
function getWavepackName(path: string): string {
  const parent = getParentName(path).replace(/\.rpf$/i, "");
  if (!GENERIC_AUDIO_FOLDERS.has(parent.toLowerCase())) return parent;

  const awcName = getBaseName(path).replace(/\.awc$/i, "").replace(/_npc$/i, "");
  return `dlc_${awcName}`;
}

function getUniqueResourcePath(path: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(path)) {
    usedPaths.add(path);
    return path;
  }

  const slashIndex = path.lastIndexOf("/");
  const folder = slashIndex >= 0 ? path.slice(0, slashIndex + 1) : "";
  const fileName = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
  const dotIndex = fileName.lastIndexOf(".");
  const name = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex) : "";

  let index = 2;
  let candidate = `${folder}${name}_${index}${extension}`;
  while (usedPaths.has(candidate)) {
    index++;
    candidate = `${folder}${name}_${index}${extension}`;
  }

  usedPaths.add(candidate);
  return candidate;
}

function getExtension(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function getBaseName(path: string): string {
  return path.split("/").pop() ?? path;
}

// 直上のフォルダ名 (ルート直下なら空文字)
function getParentName(path: string): string {
  const parts = path.split("/");
  return parts.length >= 2 ? parts[parts.length - 2]! : "";
}

function createFxManifest(files: FiveMResourceFile[]): string {
  const manifestFiles = files.filter((file) =>
    MANIFEST_FILE_FOLDERS.some((folder) => file.resourcePath.startsWith(folder)),
  );
  const clientScripts = files.filter((file) => /^client\/.+\.lua$/i.test(file.resourcePath));
  const ytypFiles = files.filter((file) => file.resourcePath.toLowerCase().endsWith(".ytyp"));
  const manifestLines = [
    "fx_version 'cerulean'",
    "game 'gta5'",
    "",
    "author 'Generated by RAGE File Viewer'",
    "description 'FiveM resource exported from an RPF archive'",
  ];

  if (manifestFiles.length > 0) {
    manifestLines.push("", "files {");
    for (const file of manifestFiles) {
      manifestLines.push(`  '${escapeLuaString(file.resourcePath)}',`);
    }
    manifestLines.push("}");
  }

  for (const file of ytypFiles) {
    manifestLines.push(`data_file 'DLC_ITYP_REQUEST' '${escapeLuaString(file.resourcePath)}'`);
  }

  const dataFileLines = createDataFileLines(manifestFiles);
  if (dataFileLines.length > 0) {
    manifestLines.push(...dataFileLines);
  }

  const audioLines = createAudioDataFileLines(manifestFiles);
  if (audioLines.length > 0) {
    manifestLines.push("", ...audioLines);
  }

  if (clientScripts.length > 0) {
    manifestLines.push("", "client_scripts {");
    for (const file of clientScripts) {
      manifestLines.push(`  '${escapeLuaString(file.resourcePath)}',`);
    }
    manifestLines.push("}");
  }

  manifestLines.push("");
  return manifestLines.join("\n");
}

function createDataFileLines(files: FiveMResourceFile[]): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const type = getDataFileType(file.resourcePath);
    if (!type) continue;

    const line = `data_file '${type}' '${escapeLuaString(file.resourcePath)}'`;
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }

  return lines;
}

// 音声の data_file 行。.rel は種別ごとに、.awc は wavepack フォルダ単位で登録する
function createAudioDataFileLines(files: FiveMResourceFile[]): string[] {
  const lines: string[] = [];
  const wavepacks = new Set<string>();

  for (const file of files) {
    const path = file.resourcePath;

    if (getExtension(path) === "awc") {
      wavepacks.add(path.slice(0, path.lastIndexOf("/")));
      continue;
    }

    const rel = AUDIO_REL_DATA_FILE_TYPES.find(({ pattern }) => pattern.test(path));
    if (rel) {
      // 'audio/foo_game.dat151.rel' → 'audio/foo_game.dat'
      const datPath = path.replace(/\.dat\d+\.rel$/i, ".dat");
      lines.push(`data_file '${rel.type}' '${escapeLuaString(datPath)}'`);
    }
  }

  for (const wavepack of wavepacks) {
    lines.push(`data_file 'AUDIO_WAVEPACK' '${escapeLuaString(wavepack)}'`);
  }

  return lines;
}

function getDataFileType(path: string): string | null {
  for (const { pattern, type } of META_DATA_FILE_TYPES) {
    if (pattern.test(path)) return type;
  }
  return null;
}

function escapeLuaString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}
