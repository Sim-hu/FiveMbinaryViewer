import { useState, useMemo } from "react";
import type { ParsedYMAP, YMAPEntity } from "../lib/types";

interface YMAPViewerProps {
  data: ParsedYMAP;
  fileName: string;
}

export function YMAPViewer({ data, fileName }: YMAPViewerProps) {
  const [search, setSearch] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<"name" | "x" | "y" | "z">("name");

  const filtered = useMemo(() => {
    let list = data.entities;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.archetypeName.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      if (sortKey === "name") return a.archetypeName.localeCompare(b.archetypeName);
      return a.position[sortKey] - b.position[sortKey];
    });
    return list;
  }, [data.entities, search, sortKey]);

  const selected = selectedIdx !== null ? data.entities[selectedIdx] : null;

  return (
    <div>
      {/* ヘッダー情報 */}
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
        <span className="font-mono">{fileName}</span>
        <span>&middot;</span>
        <span>{data.entities.length} entities</span>
        {data.name && (
          <>
            <span>&middot;</span>
            <span>{data.name}</span>
          </>
        )}
      </div>

      {/* 2Dマップビュー */}
      {data.entities.length > 0 && (
        <MiniMap
          entities={data.entities}
          selectedIdx={selectedIdx}
          onSelect={setSelectedIdx}
        />
      )}

      {/* 検索・ソート */}
      <div className="flex gap-3 mb-3 mt-4">
        <input
          type="text"
          placeholder="Search archetypes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
        >
          <option value="name">Sort: Name</option>
          <option value="x">Sort: X</option>
          <option value="y">Sort: Y</option>
          <option value="z">Sort: Z</option>
        </select>
      </div>

      {/* エンティティテーブル */}
      <div className="overflow-auto max-h-96 rounded-lg border border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 text-gray-400">#</th>
              <th className="text-left px-3 py-2 text-gray-400">Archetype</th>
              <th className="text-right px-3 py-2 text-gray-400">X</th>
              <th className="text-right px-3 py-2 text-gray-400">Y</th>
              <th className="text-right px-3 py-2 text-gray-400">Z</th>
              <th className="text-left px-3 py-2 text-gray-400">LOD</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ent, i) => (
              <tr
                key={i}
                onClick={() => setSelectedIdx(data.entities.indexOf(ent))}
                className={`cursor-pointer hover:bg-gray-700/50 ${
                  selected === ent ? "bg-blue-600/20" : ""
                }`}
              >
                <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                <td className="px-3 py-1.5 font-mono text-gray-200 truncate max-w-48">
                  {ent.archetypeName}
                </td>
                <td className="px-3 py-1.5 text-right text-gray-400">
                  {ent.position.x.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-right text-gray-400">
                  {ent.position.y.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-right text-gray-400">
                  {ent.position.z.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-gray-500 text-xs">
                  {ent.lodLevel || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 詳細パネル */}
      {selected && (
        <EntityDetail entity={selected} onClose={() => setSelectedIdx(null)} />
      )}
    </div>
  );
}

function EntityDetail({ entity, onClose }: { entity: YMAPEntity; onClose: () => void }) {
  return (
    <div className="mt-4 bg-gray-800/80 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-mono text-white">{entity.archetypeName}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white px-2">
          ✕
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <Info label="Position" value={`${entity.position.x.toFixed(3)}, ${entity.position.y.toFixed(3)}, ${entity.position.z.toFixed(3)}`} />
        <Info label="Rotation" value={`${entity.rotation.x.toFixed(3)}, ${entity.rotation.y.toFixed(3)}, ${entity.rotation.z.toFixed(3)}, ${entity.rotation.w.toFixed(3)}`} />
        <Info label="Scale" value={`${entity.scaleXY}, ${entity.scaleZ}`} />
        <Info label="Flags" value={`0x${entity.flags.toString(16)}`} />
        <Info label="LOD Dist" value={String(entity.lodDist)} />
        <Info label="LOD Level" value={entity.lodLevel || "-"} />
        <Info label="GUID" value={entity.guid} />
        <Info label="Priority" value={entity.priorityLevel || "-"} />
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

// ミニマップ（エンティティの XY 位置を 2D 表示）
function MiniMap({
  entities,
  selectedIdx,
  onSelect,
}: {
  entities: YMAPEntity[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
}) {
  const { minX, maxX, minY, maxY } = useMemo(() => {
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const e of entities) {
      if (e.position.x < mnx) mnx = e.position.x;
      if (e.position.x > mxx) mxx = e.position.x;
      if (e.position.y < mny) mny = e.position.y;
      if (e.position.y > mxy) mxy = e.position.y;
    }
    const pad = Math.max((mxx - mnx) * 0.05, (mxy - mny) * 0.05, 1);
    return { minX: mnx - pad, maxX: mxx + pad, minY: mny - pad, maxY: mxy + pad };
  }, [entities]);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  return (
    <div className="bg-gray-900 rounded-lg p-2 h-64 relative overflow-hidden">
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {entities.map((e, i) => {
          const x = ((e.position.x - minX) / rangeX) * 100;
          const y = 100 - ((e.position.y - minY) / rangeY) * 100;
          const isSelected = i === selectedIdx;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={isSelected ? 1.5 : 0.8}
              fill={isSelected ? "#3b82f6" : "#6b7280"}
              className="cursor-pointer hover:fill-blue-400"
              onClick={() => onSelect(i)}
            />
          );
        })}
      </svg>
      <div className="absolute bottom-2 right-2 text-xs text-gray-600">
        X: {minX.toFixed(0)}~{maxX.toFixed(0)} &middot; Y: {minY.toFixed(0)}~{maxY.toFixed(0)}
      </div>
    </div>
  );
}
