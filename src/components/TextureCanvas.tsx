import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

interface TextureCanvasProps {
  rgbaData: Uint8Array;
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
}

export interface TextureCanvasHandle {
  toBlob: (callback: BlobCallback, type?: string) => void;
}

export const TextureCanvas = forwardRef<TextureCanvasHandle, TextureCanvasProps>(
  ({ rgbaData, width, height, className, style }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useImperativeHandle(ref, () => ({
      toBlob: (callback: BlobCallback, type?: string) => {
        canvasRef.current?.toBlob(callback, type);
      },
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.createImageData(width, height);
      imageData.data.set(rgbaData);
      ctx.putImageData(imageData, 0, 0);
    }, [rgbaData, width, height]);

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={style}
      />
    );
  },
);

TextureCanvas.displayName = "TextureCanvas";
