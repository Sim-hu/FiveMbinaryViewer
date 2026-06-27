import { useState, useCallback, useEffect } from "react";
import { DropZone } from "./components/DropZone";
import { TextureGrid } from "./components/TextureGrid";
import { TextureDetail } from "./components/TextureDetail";
import { YMAPViewer } from "./components/YMAPViewer";
import { YTYPViewer } from "./components/YTYPViewer";
import { YDRViewer } from "./components/YDRViewer";
import { RPFViewer } from "./components/RPFViewer";
import { YBNViewer } from "./components/YBNViewer";
import { YMTViewer } from "./components/YMTViewer";
import { parseYTDFile, decodeTextureToRGBA } from "./lib/ytd-parser";
import { parseYMAPFile } from "./lib/ymap-parser";
import { parseYTYPFile } from "./lib/ytyp-parser";
import { parseYDRFile } from "./lib/ydr-parser";
import { parseRPFFile } from "./lib/rpf-parser";
import { parseYBNFile } from "./lib/ybn-parser";
import { parseYMTFile } from "./lib/ymt-parser";
import { detectFileType } from "./lib/types";
import type {
  ParsedYTD, ParsedYMAP, ParsedYTYP, ParsedYDR, ParsedRPF, ParsedYBN, ParsedYMT,
  FileType,
} from "./lib/types";

const SUPPORTED_EXTS = [".ytd", ".ydr", ".ymap", ".ytyp", ".rpf", ".ybn", ".ymt"];
const TITLES: Record<FileType, string> = {
  ytd: "Texture Dictionary",
  ydr: "Drawable Model",
  ymap: "Map Data",
  ytyp: "Type Data",
  rpf: "RPF Archive",
  ybn: "Bounds",
  ymt: "Meta Data",
  unknown: "File Viewer",
};

function App() {
  const [fileType, setFileType] = useState<FileType>("unknown");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // YTD
  const [parsedYTD, setParsedYTD] = useState<ParsedYTD | null>(null);
  const [decodedTextures, setDecodedTextures] = useState<Map<number, Uint8Array>>(new Map());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Other formats
  const [parsedYMAP, setParsedYMAP] = useState<ParsedYMAP | null>(null);
  const [parsedYTYP, setParsedYTYP] = useState<ParsedYTYP | null>(null);
  const [parsedYDR, setParsedYDR] = useState<ParsedYDR | null>(null);
  const [parsedRPF, setParsedRPF] = useState<ParsedRPF | null>(null);
  const [parsedYBN, setParsedYBN] = useState<ParsedYBN | null>(null);
  const [parsedYMT, setParsedYMT] = useState<ParsedYMT | null>(null);

  const resetState = useCallback(() => {
    setParsedYTD(null);
    setDecodedTextures(new Map());
    setSelectedIndex(null);
    setParsedYMAP(null);
    setParsedYTYP(null);
    setParsedYDR(null);
    setParsedRPF(null);
    setParsedYBN(null);
    setParsedYMT(null);
    setError(null);
  }, []);

  const handleFileSelect = useCallback(
    async (file: File) => {
      setLoading(true);
      resetState();
      setFileName(file.name);

      const type = detectFileType(file.name);
      setFileType(type);

      try {
        switch (type) {
          case "ytd":
            setParsedYTD(await parseYTDFile(file));
            break;
          case "ymap":
            setParsedYMAP(await parseYMAPFile(file));
            break;
          case "ytyp":
            setParsedYTYP(await parseYTYPFile(file));
            break;
          case "ydr":
            setParsedYDR(await parseYDRFile(file));
            break;
          case "rpf":
            setParsedRPF(await parseRPFFile(file));
            break;
          case "ybn":
            setParsedYBN(await parseYBNFile(file));
            break;
          case "ymt":
            setParsedYMT(await parseYMTFile(file));
            break;
          default:
            setError(`Unsupported file type: ${file.name}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to parse file");
      } finally {
        setLoading(false);
      }
    },
    [resetState],
  );

  // YTD テクスチャを段階的にデコード
  useEffect(() => {
    if (!parsedYTD) return;
    let cancelled = false;

    async function decodeAll() {
      const newMap = new Map<number, Uint8Array>();
      for (let i = 0; i < parsedYTD!.textures.length; i++) {
        if (cancelled) break;
        const tex = parsedYTD!.textures[i]!;
        try {
          const rgba = decodeTextureToRGBA(tex, parsedYTD!.graphicsData);
          newMap.set(i, rgba);
          setDecodedTextures(new Map(newMap));
        } catch (e) {
          console.warn(`Failed to decode texture "${tex.name}":`, e);
        }
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    decodeAll();
    return () => {
      cancelled = true;
    };
  }, [parsedYTD]);

  const selectedTexture = selectedIndex !== null ? parsedYTD?.textures[selectedIndex] : null;
  const selectedRGBA = selectedIndex !== null ? decodedTextures.get(selectedIndex) : null;
  const hasData = parsedYTD || parsedYMAP || parsedYTYP || parsedYDR || parsedRPF || parsedYBN || parsedYMT;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">
          RAGE File Viewer
          <span className="text-sm font-normal text-gray-500 ml-3">
            {hasData ? TITLES[fileType] : "GTA V / FiveM"}
          </span>
          <span className="text-xs font-normal text-gray-600 ml-2">
            v{__APP_VERSION__}
          </span>
        </h1>

        <DropZone onFileSelect={handleFileSelect} disabled={loading} />

        {loading && (
          <div className="mt-6 text-center text-gray-400">Parsing...</div>
        )}

        {error && (
          <div className="mt-6 bg-red-900/40 border border-red-700 rounded-lg p-4 text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6">
          {parsedYTD && (
            <div>
              <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
                <span className="font-mono">{fileName}</span>
                <span>&middot;</span>
                <span>{parsedYTD.textures.length} textures</span>
                <span>&middot;</span>
                <span>Version {parsedYTD.header.version}</span>
              </div>
              <TextureGrid
                textures={parsedYTD.textures}
                decodedTextures={decodedTextures}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
              />
              {selectedTexture && selectedRGBA && (
                <TextureDetail
                  texture={selectedTexture}
                  rgbaData={selectedRGBA}
                  onClose={() => setSelectedIndex(null)}
                />
              )}
            </div>
          )}
          {parsedYMAP && <YMAPViewer data={parsedYMAP} fileName={fileName} />}
          {parsedYTYP && <YTYPViewer data={parsedYTYP} fileName={fileName} />}
          {parsedYDR && <YDRViewer data={parsedYDR} fileName={fileName} />}
          {parsedRPF && <RPFViewer data={parsedRPF} fileName={fileName} />}
          {parsedYBN && <YBNViewer data={parsedYBN} fileName={fileName} />}
          {parsedYMT && <YMTViewer data={parsedYMT} fileName={fileName} />}
        </div>

        {!hasData && !loading && !error && (
          <div className="mt-8 text-center text-sm text-gray-600">
            Supported: {SUPPORTED_EXTS.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
