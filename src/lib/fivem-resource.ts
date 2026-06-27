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
  "rel",
  "ymt",
  "xml",
]);

const EXCLUDED_EXTENSIONS = new Set([
  "gxt2",
]);

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

  return {
    rootName,
    files,
    manifest: createFxManifest(files),
    isVehicle,
  };
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
function getFiveMResourcePath(path: string): string {
  const ext = getExtension(path);
  const base = getBaseName(path);

  if (STREAM_EXTENSIONS.has(ext)) return `stream/${base}`;
  if (DATA_EXTENSIONS.has(ext)) return `data/${base}`;
  return `stream/${base}`;
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

function createFxManifest(files: FiveMResourceFile[]): string {
  const dataFiles = files.filter((file) => file.resourcePath.startsWith("data/"));
  const ytypFiles = files.filter((file) => file.resourcePath.toLowerCase().endsWith(".ytyp"));
  const manifestLines = [
    "fx_version 'cerulean'",
    "game 'gta5'",
    "",
    "author 'Generated by RAGE File Viewer'",
    "description 'FiveM resource exported from an RPF archive'",
  ];

  if (dataFiles.length > 0) {
    manifestLines.push("", "files {");
    for (const file of dataFiles) {
      manifestLines.push(`  '${escapeLuaString(file.resourcePath)}',`);
    }
    manifestLines.push("}");
  }

  for (const file of ytypFiles) {
    manifestLines.push(`data_file 'DLC_ITYP_REQUEST' '${escapeLuaString(file.resourcePath)}'`);
  }

  const dataFileLines = createDataFileLines(dataFiles);
  if (dataFileLines.length > 0) {
    manifestLines.push(...dataFileLines);
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

function getDataFileType(path: string): string | null {
  for (const { pattern, type } of META_DATA_FILE_TYPES) {
    if (pattern.test(path)) return type;
  }
  return null;
}

function escapeLuaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
