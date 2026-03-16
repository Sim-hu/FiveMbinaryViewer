import { useState, useCallback, useMemo } from "react";
import { zipSync } from "fflate";
import { extractAllFiles } from "../lib/rpf-parser";
import type { ParsedRPF, RPFEntry } from "../lib/types";

interface RPFViewerProps {
  data: ParsedRPF;
  fileName: string;
}

export function RPFViewer({ data, fileName }: RPFViewerProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set([""]));
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<{
    entry: RPFEntry;
    path: string;
    content: Uint8Array | null;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const paths = new Set<string>();
    function walk(entry: RPFEntry, path: string) {
      paths.add(path);
      for (const child of entry.children) {
        if (child.isDirectory || child.children.length > 0) {
          walk(child, `${path}/${child.name}`);
        }
      }
    }
    walk(data.root, "");
    setExpandedPaths(paths);
  }, [data.root]);

  // 全ファイルキャッシュ（遅延生成）
  const allFilesRef = useMemo(() => {
    if (!data.rawData) return null;
    try {
      return extractAllFiles(data.rawData);
    } catch {
      return null;
    }
  }, [data.rawData]);

  // ファイル選択 → キャッシュからデータ取得
  const handleFileSelect = useCallback(
    (entry: RPFEntry, fullPath: string) => {
      if (entry.isDirectory) return;

      // パスから "(root)/" プレフィクスを除去
      const cleanPath = fullPath.replace(/^\/?\(root\)\//, "").replace(/^\//, "");
      const content = allFilesRef?.get(cleanPath) ?? null;
      setSelectedFile({ entry, path: fullPath, content });
    },
    [allFilesRef],
  );

  // ZIP ダウンロード
  const handleDownloadZip = useCallback(async () => {
    if (!allFilesRef) return;
    setDownloading(true);

    try {
      await new Promise((r) => setTimeout(r, 0));

      const zipInput: Record<string, Uint8Array> = {};
      for (const [path, fileData] of allFilesRef) {
        zipInput[path] = fileData;
      }

      const zipped = zipSync(zipInput);
      const blob = new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.rpf$/i, "") + ".zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("ZIP creation failed:", e);
    } finally {
      setDownloading(false);
    }
  }, [allFilesRef, fileName]);

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
        <span className="font-mono">{fileName}</span>
        <span>&middot;</span>
        <span>{data.totalFiles} files</span>
        <span>&middot;</span>
        <span>{data.totalDirectories} directories</span>
      </div>

      <div className="flex gap-3 mb-3">
        <input
          type="text"
          placeholder="Search files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={expandAll}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
        >
          Expand All
        </button>
        {allFilesRef && (
          <button
            onClick={handleDownloadZip}
            disabled={downloading}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {downloading ? "Creating..." : "Download ZIP"}
          </button>
        )}
      </div>

      <div className="flex gap-4">
        {/* ファイルツリー */}
        <div className="flex-1 bg-gray-900 rounded-lg border border-gray-700 overflow-auto max-h-[36rem] p-2 font-mono text-sm">
          {search ? (
            <SearchResults root={data.root} query={search.toLowerCase()} onSelect={handleFileSelect} />
          ) : (
            <TreeNode
              entry={data.root}
              path=""
              expandedPaths={expandedPaths}
              onToggle={toggleExpand}
              onFileSelect={handleFileSelect}
              selectedPath={selectedFile?.path ?? null}
              depth={0}
            />
          )}
        </div>

        {/* プレビューパネル */}
        {selectedFile && (
          <div className="w-1/2 max-w-xl">
            <FilePreview
              entry={selectedFile.entry}
              content={selectedFile.content}
              onClose={() => setSelectedFile(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// --- ファイルプレビュー ---
function FilePreview({
  entry,
  content,
  onClose,
}: {
  entry: RPFEntry;
  content: Uint8Array | null;
  onClose: () => void;
}) {
  const isText = useMemo(() => {
    if (!content) return false;
    const ext = entry.name.split(".").pop()?.toLowerCase();
    return ["xml", "meta", "txt", "cfg", "ini", "json", "lua", "html", "css", "js"].includes(ext ?? "");
  }, [entry.name, content]);

  const textContent = useMemo(() => {
    if (!content || !isText) return null;
    try {
      return new TextDecoder("utf-8").decode(content);
    } catch {
      return null;
    }
  }, [content, isText]);

  const handleDownload = useCallback(() => {
    if (!content) return;
    const blob = new Blob([content as Uint8Array<ArrayBuffer>]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = entry.name;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, entry.name]);

  return (
    <div className="bg-gray-800/80 rounded-lg border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm">{getFileIcon(entry.name)}</span>
          <span className="text-sm font-mono text-white truncate">{entry.name}</span>
          <span className="text-xs text-gray-500">{formatSize(entry.size ?? 0)}</span>
        </div>
        <div className="flex items-center gap-2">
          {content && (
            <button
              onClick={handleDownload}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium transition-colors"
            >
              Download
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-white px-1">
            ✕
          </button>
        </div>
      </div>

      <div className="max-h-[30rem] overflow-auto">
        {!content ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            Failed to extract file data
          </div>
        ) : textContent ? (
          <pre className="p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
            {textContent}
          </pre>
        ) : (
          <HexView data={content} />
        )}
      </div>
    </div>
  );
}

// --- Hex ビューア ---
function HexView({ data }: { data: Uint8Array }) {
  const rows = Math.min(Math.ceil(data.length / 16), 64);
  return (
    <div className="p-3 font-mono text-xs">
      {Array.from({ length: rows }, (_, row) => {
        const off = row * 16;
        let hex = "";
        let ascii = "";
        for (let col = 0; col < 16; col++) {
          if (off + col < data.length) {
            const b = data[off + col]!;
            hex += b.toString(16).padStart(2, "0") + " ";
            ascii += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".";
          } else {
            hex += "   ";
            ascii += " ";
          }
        }
        return (
          <div key={row} className="flex gap-4">
            <span className="text-gray-600">{off.toString(16).padStart(8, "0")}</span>
            <span className="text-gray-400">{hex}</span>
            <span className="text-green-400/60">{ascii}</span>
          </div>
        );
      })}
      {data.length > rows * 16 && (
        <div className="text-gray-600 mt-1">
          ... {(data.length - rows * 16).toLocaleString()} more bytes
        </div>
      )}
    </div>
  );
}

// --- ツリーノード ---
function TreeNode({
  entry,
  path,
  expandedPaths,
  onToggle,
  onFileSelect,
  selectedPath,
  depth,
}: {
  entry: RPFEntry;
  path: string;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onFileSelect: (entry: RPFEntry, path: string) => void;
  selectedPath: string | null;
  depth: number;
}) {
  const isExpanded = expandedPaths.has(path);
  const isExpandable = entry.isDirectory || entry.children.length > 0;
  const isRPF = !entry.isDirectory && entry.name.toLowerCase().endsWith(".rpf") && entry.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-0.5 px-1 rounded cursor-pointer hover:bg-gray-800 ${
          isExpandable ? "text-yellow-400" : "text-gray-300"
        } ${isRPF ? "text-orange-400" : ""} ${
          selectedPath === path ? "bg-blue-600/20 ring-1 ring-blue-500/40" : ""
        }`}
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={() => {
          if (isExpandable) onToggle(path);
          else onFileSelect(entry, path);
        }}
      >
        {isExpandable ? (
          <span className="w-4 text-center text-xs text-gray-500">
            {isExpanded ? "▼" : "▶"}
          </span>
        ) : (
          <span className="w-4 text-center text-xs">{getFileIcon(entry.name)}</span>
        )}
        <span className="truncate">
          {entry.name}
          {isRPF && <span className="text-xs text-gray-500 ml-1">(rpf)</span>}
        </span>
        {!isExpandable && entry.size !== undefined && entry.size > 0 && (
          <span className="text-xs text-gray-600 ml-auto shrink-0">
            {formatSize(entry.size)}
          </span>
        )}
        {isExpandable && (
          <span className="text-xs text-gray-600 ml-auto shrink-0">
            {entry.children.length}
          </span>
        )}
      </div>
      {isExpanded &&
        entry.children.map((child, i) => (
          <TreeNode
            key={i}
            entry={child}
            path={`${path}/${child.name}`}
            expandedPaths={expandedPaths}
            onToggle={onToggle}
            onFileSelect={onFileSelect}
            selectedPath={selectedPath}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

// --- 検索結果 ---
function SearchResults({
  root,
  query,
  onSelect,
}: {
  root: RPFEntry;
  query: string;
  onSelect: (entry: RPFEntry, path: string) => void;
}) {
  const results: { entry: RPFEntry; path: string }[] = [];

  function walk(entry: RPFEntry, path: string) {
    const fullPath = path ? `${path}/${entry.name}` : entry.name;
    if (entry.name.toLowerCase().includes(query)) {
      results.push({ entry, path: fullPath });
    }
    for (const child of entry.children) {
      walk(child, fullPath);
    }
  }
  walk(root, "");

  if (results.length === 0) {
    return <div className="text-gray-500 p-4 text-center">No results found</div>;
  }

  return (
    <div>
      <div className="text-xs text-gray-500 mb-2 px-1">{results.length} results</div>
      {results.slice(0, 500).map((r, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 py-0.5 px-1 rounded cursor-pointer hover:bg-gray-800 ${
            r.entry.isDirectory ? "text-yellow-400" : "text-gray-300"
          }`}
          onClick={() => !r.entry.isDirectory && onSelect(r.entry, r.path)}
        >
          <span className="w-4 text-center text-xs">
            {r.entry.isDirectory ? "📁" : getFileIcon(r.entry.name)}
          </span>
          <span className="truncate text-xs">{r.path}</span>
          {!r.entry.isDirectory && r.entry.size !== undefined && r.entry.size > 0 && (
            <span className="text-xs text-gray-600 ml-auto shrink-0">
              {formatSize(r.entry.size)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ytd": return "🖼";
    case "ydr": case "yft": case "ydd": return "🧊";
    case "ymap": return "🗺";
    case "ytyp": return "📋";
    case "ybn": return "💥";
    case "xml": case "meta": return "📝";
    case "rpf": return "📦";
    case "rel": return "🔊";
    default: return "📄";
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
