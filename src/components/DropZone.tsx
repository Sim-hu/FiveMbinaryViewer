import { useState, useRef, useCallback } from "react";

const SUPPORTED_EXTS = [".ytd", ".ydr", ".ymap", ".ytyp", ".rpf", ".ybn", ".ymt"];

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export function DropZone({ onFileSelect, disabled }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const ext = "." + (file.name.toLowerCase().split(".").pop() ?? "");
      if (!SUPPORTED_EXTS.includes(ext)) {
        alert(`Unsupported file type. Supported: ${SUPPORTED_EXTS.join(", ")}`);
        return;
      }
      onFileSelect(file);
    },
    [onFileSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile, disabled],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
        transition-colors duration-200
        ${isDragging
          ? "border-blue-400 bg-blue-400/10"
          : "border-gray-600 hover:border-gray-400 bg-gray-800/50"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={SUPPORTED_EXTS.join(",")}
        onChange={handleChange}
        className="hidden"
      />
      <div className="text-4xl mb-4 opacity-60">📂</div>
      <p className="text-lg text-gray-300">
        Drop RAGE file here
      </p>
      <p className="text-sm text-gray-500 mt-2">
        {SUPPORTED_EXTS.join(" ")} &mdash; or click to browse
      </p>
    </div>
  );
}
