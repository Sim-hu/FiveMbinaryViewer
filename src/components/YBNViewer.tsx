import { useMemo } from "react";
import type { ParsedYBN } from "../lib/types";

interface YBNViewerProps {
  data: ParsedYBN;
  fileName: string;
}

export function YBNViewer({ data, fileName }: YBNViewerProps) {
  const sizeX = data.boundsMax.x - data.boundsMin.x;
  const sizeY = data.boundsMax.y - data.boundsMin.y;
  const sizeZ = data.boundsMax.z - data.boundsMin.z;

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
        <span className="font-mono">{fileName}</span>
        <span>&middot;</span>
        <span>{data.bounds.length} bound(s)</span>
        <span>&middot;</span>
        <span>Version {data.header.version}</span>
      </div>

      {/* AABB ビジュアライゼーション */}
      <BoundsVisualizer data={data} />

      {/* メタデータ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
        <Info label="Type" value={data.bounds[0]?.type ?? "Unknown"} />
        <Info label="Centre" value={fmtVec(data.centre)} />
        <Info label="Radius" value={data.radius.toFixed(3)} />
        <Info label="Size" value={`${sizeX.toFixed(2)} x ${sizeY.toFixed(2)} x ${sizeZ.toFixed(2)}`} />
        <Info label="Bounds Min" value={fmtVec(data.boundsMin)} />
        <Info label="Bounds Max" value={fmtVec(data.boundsMax)} />
        <Info label="Children" value={String(data.bounds[0]?.childCount ?? 0)} />
        <Info label="System Size" value={`${data.header.systemSize} B`} />
      </div>

      {/* 子 Bound テーブル */}
      {data.bounds.length > 1 && (
        <div className="mt-4">
          <h3 className="text-sm text-gray-400 mb-2">Child Bounds</h3>
          <div className="overflow-auto max-h-80 rounded-lg border border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-400">#</th>
                  <th className="text-left px-3 py-2 text-gray-400">Type</th>
                  <th className="text-right px-3 py-2 text-gray-400">Center</th>
                  <th className="text-right px-3 py-2 text-gray-400">Radius</th>
                </tr>
              </thead>
              <tbody>
                {data.bounds.slice(1).map((b, i) => (
                  <tr key={i} className="hover:bg-gray-700/50">
                    <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                    <td className="px-3 py-1.5 text-gray-300">{b.type}</td>
                    <td className="px-3 py-1.5 text-right text-gray-400 font-mono text-xs">
                      {fmtVec(b.center)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-400">
                      {b.radius.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function BoundsVisualizer({ data }: { data: ParsedYBN }) {
  const { viewBox, rects } = useMemo(() => {
    const all = data.bounds;
    if (all.length === 0) return { viewBox: "0 0 100 100", rects: [] };

    // XY 平面で AABB を可視化
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const b of all) {
      mnx = Math.min(mnx, b.bbMin.x, b.center.x - b.radius);
      mxx = Math.max(mxx, b.bbMax.x, b.center.x + b.radius);
      mny = Math.min(mny, b.bbMin.y, b.center.y - b.radius);
      mxy = Math.max(mxy, b.bbMax.y, b.center.y + b.radius);
    }
    const pad = Math.max(mxx - mnx, mxy - mny) * 0.05 || 1;
    mnx -= pad; mny -= pad; mxx += pad; mxy += pad;
    const w = mxx - mnx || 1;
    const h = mxy - mny || 1;

    const rects = all.map((b, i) => ({
      x: b.bbMin.x - mnx,
      y: h - (b.bbMax.y - mny),
      w: b.bbMax.x - b.bbMin.x,
      h: b.bbMax.y - b.bbMin.y,
      isRoot: i === 0,
    }));

    return { viewBox: `0 0 ${w} ${h}`, rects };
  }, [data.bounds]);

  return (
    <div className="bg-gray-900 rounded-lg p-2 h-64 overflow-hidden">
      <svg viewBox={viewBox} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {rects.map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={Math.max(r.w, 0.01)}
            height={Math.max(r.h, 0.01)}
            fill="none"
            stroke={r.isRoot ? "#3b82f6" : "#6b7280"}
            strokeWidth={r.isRoot ? 0.5 : 0.2}
            opacity={r.isRoot ? 1 : 0.6}
          />
        ))}
      </svg>
    </div>
  );
}

function fmtVec(v: { x: number; y: number; z: number }) {
  return `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-gray-200 font-mono text-sm break-all">{value}</div>
    </div>
  );
}
