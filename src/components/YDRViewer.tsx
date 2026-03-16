import { useRef, useEffect, useCallback } from "react";
import type { ParsedYDR } from "../lib/types";

interface YDRViewerProps {
  data: ParsedYDR;
  fileName: string;
}

export function YDRViewer({ data, fileName }: YDRViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ rotX: -0.5, rotY: 0.4, zoom: 2.0, dragging: false, lastX: 0, lastY: 0 });

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const s = stateRef.current;
    drawScene(gl, data, s.rotX, s.rotY, s.zoom);
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    initGL(gl, data);
    render();

    const onResize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      render();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [data, render]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    stateRef.current.dragging = true;
    stateRef.current.lastX = e.clientX;
    stateRef.current.lastY = e.clientY;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const s = stateRef.current;
      if (!s.dragging) return;
      const dx = e.clientX - s.lastX;
      const dy = e.clientY - s.lastY;
      s.rotY += dx * 0.01;
      s.rotX += dy * 0.01;
      s.rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, s.rotX));
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      render();
    },
    [render],
  );

  const handleMouseUp = useCallback(() => {
    stateRef.current.dragging = false;
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      stateRef.current.zoom *= e.deltaY > 0 ? 1.1 : 0.9;
      stateRef.current.zoom = Math.max(0.1, Math.min(100, stateRef.current.zoom));
      render();
    },
    [render],
  );

  const hasGeometry = data.models.length > 0 && data.models.some((m) => m.geometries.length > 0);

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
        <span className="font-mono">{fileName}</span>
        <span>&middot;</span>
        <span>
          {data.totalVertices.toLocaleString()} vertices &middot;{" "}
          {data.totalTriangles.toLocaleString()} triangles
        </span>
      </div>

      {/* 3D ビュー */}
      <div className="bg-gray-900 rounded-lg overflow-hidden mb-4" style={{ height: "400px" }}>
        {hasGeometry ? (
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            No geometry data could be extracted
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 mb-4">
        Drag to rotate &middot; Scroll to zoom
      </div>

      {/* メタデータ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <InfoCard label="Vertices" value={data.totalVertices.toLocaleString()} />
        <InfoCard label="Triangles" value={data.totalTriangles.toLocaleString()} />
        <InfoCard label="Models" value={String(data.models.length)} />
        <InfoCard
          label="Geometries"
          value={String(data.models.reduce((s, m) => s + m.geometries.length, 0))}
        />
        <InfoCard label="Bounds Min" value={fmtVec(data.boundsMin)} />
        <InfoCard label="Bounds Max" value={fmtVec(data.boundsMax)} />
        <InfoCard label="Centre" value={fmtVec(data.centre)} />
        <InfoCard label="Version" value={String(data.header.version)} />
      </div>
    </div>
  );
}

function fmtVec(v: { x: number; y: number; z: number }) {
  return `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-gray-200 font-mono text-sm">{value}</div>
    </div>
  );
}

// --- WebGL ---
const VERT_SRC = `
  attribute vec3 aPos;
  uniform mat4 uMVP;
  void main() {
    gl_Position = uMVP * vec4(aPos, 1.0);
  }
`;

const FRAG_SRC = `
  precision mediump float;
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4(uColor, 1.0);
  }
`;

let glProgram: WebGLProgram | null = null;
let glVBO: WebGLBuffer | null = null;
let glIBO: WebGLBuffer | null = null;
let glIndexCount = 0;

function initGL(gl: WebGLRenderingContext, data: ParsedYDR) {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, VERT_SRC);
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, FRAG_SRC);
  gl.compileShader(fs);

  glProgram = gl.createProgram()!;
  gl.attachShader(glProgram, vs);
  gl.attachShader(glProgram, fs);
  gl.linkProgram(glProgram);

  // 全ジオメトリの頂点とインデックスを結合
  let totalVerts = 0;
  let totalIdx = 0;
  for (const model of data.models) {
    for (const geom of model.geometries) {
      totalVerts += geom.vertexCount;
      totalIdx += geom.indexCount;
    }
  }

  const allVerts = new Float32Array(totalVerts * 3);
  const allIdx = new Uint16Array(totalIdx);
  let vOff = 0;
  let iOff = 0;
  let baseVertex = 0;

  for (const model of data.models) {
    for (const geom of model.geometries) {
      allVerts.set(geom.vertices, vOff);
      vOff += geom.vertexCount * 3;

      for (let i = 0; i < geom.indexCount; i++) {
        allIdx[iOff + i] = geom.indices[i]! + baseVertex;
      }
      iOff += geom.indexCount;
      baseVertex += geom.vertexCount;
    }
  }

  glVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, glVBO);
  gl.bufferData(gl.ARRAY_BUFFER, allVerts, gl.STATIC_DRAW);

  glIBO = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glIBO);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, allIdx, gl.STATIC_DRAW);

  glIndexCount = totalIdx;
}

function drawScene(
  gl: WebGLRenderingContext,
  data: ParsedYDR,
  rotX: number,
  rotY: number,
  zoom: number,
) {
  if (!glProgram) return;

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0.05, 0.05, 0.08, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(glProgram);

  // モデルの中心とスケール計算
  const cx = (data.boundsMin.x + data.boundsMax.x) / 2;
  const cy = (data.boundsMin.y + data.boundsMax.y) / 2;
  const cz = (data.boundsMin.z + data.boundsMax.z) / 2;
  const size = Math.max(
    data.boundsMax.x - data.boundsMin.x,
    data.boundsMax.y - data.boundsMin.y,
    data.boundsMax.z - data.boundsMin.z,
    0.01,
  );

  // MVP 行列計算
  const aspect = gl.canvas.width / gl.canvas.height;
  const mvp = mat4Multiply(
    mat4Perspective(45, aspect, 0.01, 1000),
    mat4Multiply(
      mat4Translate(0, 0, -zoom),
      mat4Multiply(
        mat4RotateX(rotX),
        mat4Multiply(mat4RotateY(rotY), mat4Multiply(mat4Scale(2 / size), mat4Translate(-cx, -cy, -cz))),
      ),
    ),
  );

  const loc = gl.getUniformLocation(glProgram, "uMVP");
  gl.uniformMatrix4fv(loc, false, mvp);

  const colorLoc = gl.getUniformLocation(glProgram, "uColor");

  // ワイヤーフレーム描画
  gl.bindBuffer(gl.ARRAY_BUFFER, glVBO);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glIBO);

  const aPos = gl.getAttribLocation(glProgram, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

  // ソリッド（暗めの色）
  gl.uniform3f(colorLoc, 0.15, 0.18, 0.25);
  gl.drawElements(gl.TRIANGLES, glIndexCount, gl.UNSIGNED_SHORT, 0);

  // ワイヤーフレーム（明るい色）
  gl.uniform3f(colorLoc, 0.4, 0.6, 0.9);
  for (let i = 0; i < glIndexCount; i += 3) {
    gl.drawElements(gl.LINE_LOOP, 3, gl.UNSIGNED_SHORT, i * 2);
  }
}

// 簡易行列ユーティリティ
function mat4Perspective(fovDeg: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function mat4Translate(x: number, y: number, z: number): Float32Array {
  const m = mat4Identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function mat4Scale(s: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = s;
  m[5] = s;
  m[10] = s;
  m[15] = 1;
  return m;
}

function mat4RotateX(rad: number): Float32Array {
  const m = mat4Identity();
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

function mat4RotateY(rad: number): Float32Array {
  const m = mat4Identity();
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

function mat4Identity(): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const r = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      r[j * 4 + i] =
        a[i]! * b[j * 4]! +
        a[4 + i]! * b[j * 4 + 1]! +
        a[8 + i]! * b[j * 4 + 2]! +
        a[12 + i]! * b[j * 4 + 3]!;
    }
  }
  return r;
}
