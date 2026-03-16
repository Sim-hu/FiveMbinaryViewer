import { TextureCanvas } from "./TextureCanvas";
import { getFormatName } from "../lib/types";
import type { TextureInfo } from "../lib/types";

interface TextureGridProps {
  textures: TextureInfo[];
  decodedTextures: Map<number, Uint8Array>;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

export function TextureGrid({
  textures,
  decodedTextures,
  selectedIndex,
  onSelect,
}: TextureGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {textures.map((tex, i) => {
        const rgba = decodedTextures.get(i);
        const isSelected = selectedIndex === i;

        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`
              rounded-lg p-2 text-left transition-all duration-150
              hover:bg-gray-700/80
              ${isSelected
                ? "bg-blue-600/30 ring-2 ring-blue-500"
                : "bg-gray-800/60"
              }
            `}
          >
            <div className="aspect-square bg-gray-900 rounded overflow-hidden mb-2 flex items-center justify-center">
              {rgba ? (
                <TextureCanvas
                  rgbaData={rgba}
                  width={tex.width}
                  height={tex.height}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    imageRendering: tex.width <= 128 ? "pixelated" : "auto",
                  }}
                />
              ) : (
                <div className="text-gray-600 text-xs">Decoding...</div>
              )}
            </div>
            <p className="text-xs text-gray-300 truncate font-mono">
              {tex.name}
            </p>
            <p className="text-xs text-gray-500">
              {tex.width}x{tex.height} &middot; {getFormatName(tex.format)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
