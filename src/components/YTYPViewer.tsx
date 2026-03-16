import { useState, useMemo } from "react";
import type { ParsedYTYP, YTYPArchetype } from "../lib/types";

interface YTYPViewerProps {
  data: ParsedYTYP;
  fileName: string;
}

export function YTYPViewer({ data, fileName }: YTYPViewerProps) {
  const [search, setSearch] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!search) return data.archetypes;
    const q = search.toLowerCase();
    return data.archetypes.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.assetType.toLowerCase().includes(q) ||
        a.textureDictionary.toLowerCase().includes(q),
    );
  }, [data.archetypes, search]);

  const selected = selectedIdx !== null ? data.archetypes[selectedIdx] : null;

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
        <span className="font-mono">{fileName}</span>
        <span>&middot;</span>
        <span>{data.archetypes.length} archetypes</span>
      </div>

      <input
        type="text"
        placeholder="Search archetypes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 mb-3 focus:outline-none focus:border-blue-500"
      />

      <div className="overflow-auto max-h-[32rem] rounded-lg border border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 text-gray-400">#</th>
              <th className="text-left px-3 py-2 text-gray-400">Name</th>
              <th className="text-left px-3 py-2 text-gray-400">Type</th>
              <th className="text-left px-3 py-2 text-gray-400">Asset Type</th>
              <th className="text-right px-3 py-2 text-gray-400">LOD Dist</th>
              <th className="text-right px-3 py-2 text-gray-400">BS Radius</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((arch, i) => {
              const realIdx = data.archetypes.indexOf(arch);
              return (
                <tr
                  key={i}
                  onClick={() => setSelectedIdx(realIdx)}
                  className={`cursor-pointer hover:bg-gray-700/50 ${
                    selected === arch ? "bg-blue-600/20" : ""
                  }`}
                >
                  <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-200 truncate max-w-48">
                    {arch.name}
                  </td>
                  <td className="px-3 py-1.5 text-gray-400 text-xs">{arch.type}</td>
                  <td className="px-3 py-1.5 text-gray-400 text-xs">{arch.assetType}</td>
                  <td className="px-3 py-1.5 text-right text-gray-400">{arch.lodDist}</td>
                  <td className="px-3 py-1.5 text-right text-gray-400">
                    {arch.bsRadius.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <ArchetypeDetail archetype={selected} onClose={() => setSelectedIdx(null)} />
      )}
    </div>
  );
}

function ArchetypeDetail({
  archetype: a,
  onClose,
}: {
  archetype: YTYPArchetype;
  onClose: () => void;
}) {
  return (
    <div className="mt-4 bg-gray-800/80 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-mono text-white">{a.name}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white px-2">
          ✕
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <Info label="Type" value={a.type} />
        <Info label="Asset Type" value={a.assetType} />
        <Info label="Asset Name" value={a.assetName || "-"} />
        <Info label="Texture Dict" value={a.textureDictionary || "-"} />
        <Info label="Physics Dict" value={a.physicsDictionary || "-"} />
        <Info label="LOD Distance" value={String(a.lodDist)} />
        <Info label="HD Tex Dist" value={String(a.hdTextureDist)} />
        <Info label="Flags" value={`0x${a.flags.toString(16)}`} />
        <Info label="BB Min" value={`${a.bbMin.x.toFixed(2)}, ${a.bbMin.y.toFixed(2)}, ${a.bbMin.z.toFixed(2)}`} />
        <Info label="BB Max" value={`${a.bbMax.x.toFixed(2)}, ${a.bbMax.y.toFixed(2)}, ${a.bbMax.z.toFixed(2)}`} />
        <Info label="BS Centre" value={`${a.bsCentre.x.toFixed(2)}, ${a.bsCentre.y.toFixed(2)}, ${a.bsCentre.z.toFixed(2)}`} />
        <Info label="BS Radius" value={a.bsRadius.toFixed(3)} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900/60 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-gray-200 font-mono text-xs break-all">{value}</div>
    </div>
  );
}
