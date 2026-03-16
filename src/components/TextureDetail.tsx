import { useRef, useCallback } from "react";
import { TextureCanvas } from "./TextureCanvas";
import type { TextureCanvasHandle } from "./TextureCanvas";
import { getFormatName } from "../lib/types";
import type { TextureInfo } from "../lib/types";

interface TextureDetailProps {
  texture: TextureInfo;
  rgbaData: Uint8Array;
  onClose: () => void;
}

export function TextureDetail({ texture, rgbaData, onClose }: TextureDetailProps) {
  const canvasRef = useRef<TextureCanvasHandle>(null);

  const handleDownloadPNG = useCallback(() => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${texture.name}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [texture.name]);

  const formatDataSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-gray-800/80 rounded-xl p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white font-mono">
          {texture.name}
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-xl px-2"
        >
          ✕
        </button>
      </div>

      {/* プレビュー */}
      <div className="bg-gray-900 rounded-lg p-4 mb-4 flex justify-center overflow-auto">
        <TextureCanvas
          ref={canvasRef}
          rgbaData={rgbaData}
          width={texture.width}
          height={texture.height}
          style={{
            maxWidth: "100%",
            maxHeight: "512px",
            objectFit: "contain",
            imageRendering: texture.width <= 256 ? "pixelated" : "auto",
          }}
        />
      </div>

      {/* メタデータ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
        <InfoItem label="Size" value={`${texture.width} x ${texture.height}`} />
        <InfoItem label="Format" value={getFormatName(texture.format)} />
        <InfoItem label="Mip Levels" value={String(texture.mipLevels)} />
        <InfoItem label="Data Size" value={formatDataSize(texture.dataSize)} />
        {texture.stride > 0 && (
          <InfoItem label="Stride" value={String(texture.stride)} />
        )}
      </div>

      {/* アクション */}
      <div className="flex gap-3">
        <button
          onClick={handleDownloadPNG}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
        >
          Download PNG
        </button>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900/60 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-gray-200 font-mono">{value}</div>
    </div>
  );
}
