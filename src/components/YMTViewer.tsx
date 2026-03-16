import { useState } from "react";
import type { ParsedYMT } from "../lib/types";

interface YMTViewerProps {
  data: ParsedYMT;
  fileName: string;
}

export function YMTViewer({ data, fileName }: YMTViewerProps) {
  const [showRawXml, setShowRawXml] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search
    ? data.fields.filter(
        (f) =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.value.toLowerCase().includes(search.toLowerCase()),
      )
    : data.fields;

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
        <span className="font-mono">{fileName}</span>
        <span>&middot;</span>
        <span>Format: {data.format.toUpperCase()}</span>
        <span>&middot;</span>
        <span>{data.fields.length} fields</span>
      </div>

      {/* 検索 + 切り替え */}
      <div className="flex gap-3 mb-3">
        <input
          type="text"
          placeholder="Search fields..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        {data.rawXml && (
          <button
            onClick={() => setShowRawXml(!showRawXml)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
          >
            {showRawXml ? "Table" : "XML"}
          </button>
        )}
      </div>

      {/* Raw XML 表示 */}
      {showRawXml && data.rawXml ? (
        <pre className="bg-gray-900 rounded-lg border border-gray-700 p-4 overflow-auto max-h-[36rem] text-xs text-gray-300 font-mono whitespace-pre-wrap">
          {data.rawXml}
        </pre>
      ) : (
        /* フィールドテーブル */
        <div className="overflow-auto max-h-[36rem] rounded-lg border border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 text-gray-400">Field</th>
                <th className="text-left px-3 py-2 text-gray-400">Value</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => (
                <tr key={i} className="hover:bg-gray-700/50">
                  <td className="px-3 py-1.5 text-gray-400 font-mono text-xs break-all max-w-64">
                    {f.name}
                  </td>
                  <td className="px-3 py-1.5 text-gray-200 font-mono text-xs break-all">
                    {f.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
