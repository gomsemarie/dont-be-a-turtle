import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Download,
  RotateCcw,
  RotateCw,
  Grid3x3,
  ZoomIn,
  ZoomOut,
  Pencil,
  Eraser,
  Droplet,
  Upload,
  Save,
  Loader2,
  Trash2,
  FolderOpen,
  X,
  ImageIcon,
  Check,
  Palette,
} from "lucide-react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { RankImage, bumpImageCache } from "./rank-image";
import type { TurtleRank } from "@/stores/use-rank-store";
import { useQueryClient } from "@tanstack/react-query";

interface PixelEditorProps {
  ranks?: TurtleRank[];
}

type Tool = "pencil" | "eraser" | "fill";

const GRID_SIZE = 32;

// ────────────────────────────────────────────────────────────
// Median-Cut color quantization (Photoshop 표준 알고리즘)
// ────────────────────────────────────────────────────────────
type RGB = [number, number, number];

function medianCutQuantize(pixels: Uint8ClampedArray, numColors: number): RGB[] {
  const colors: RGB[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 128) {
      colors.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
    }
  }
  if (colors.length === 0) return [[0, 0, 0]];

  function splitBox(box: RGB[]): [RGB[], RGB[]] {
    const ranges = [0, 1, 2].map((ch) => {
      const vals = box.map((c) => c[ch]);
      return Math.max(...vals) - Math.min(...vals);
    });
    const splitCh = ranges.indexOf(Math.max(...ranges));
    box.sort((a, b) => a[splitCh] - b[splitCh]);
    const mid = Math.floor(box.length / 2);
    return [box.slice(0, mid), box.slice(mid)];
  }

  let boxes: RGB[][] = [colors];
  while (boxes.length < numColors) {
    boxes.sort((a, b) => b.length - a.length);
    const biggest = boxes.shift()!;
    if (biggest.length <= 1) {
      boxes.push(biggest);
      break;
    }
    const [a, b] = splitBox(biggest);
    if (a.length > 0) boxes.push(a);
    if (b.length > 0) boxes.push(b);
  }

  return boxes.map((box) => {
    const avg = [0, 1, 2].map((ch) =>
      Math.round(box.reduce((s, c) => s + c[ch], 0) / box.length)
    );
    return avg as RGB;
  });
}

function nearestPaletteColor(r: number, g: number, b: number, palette: RGB[]): RGB {
  let best: RGB = palette[0];
  let bestDist = Infinity;
  for (const c of palette) {
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** Apply quantization + optional Floyd-Steinberg dithering to a 32x32 ImageData */
function quantizeImageData(
  src: ImageData,
  numColors: number,
  dither: boolean
): ImageData {
  const w = src.width;
  const h = src.height;
  const palette = medianCutQuantize(src.data, numColors);
  const out = new ImageData(new Uint8ClampedArray(src.data), w, h);
  const d = out.data;

  // Work on a float copy for dithering error propagation
  const buf = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) buf[i] = d[i];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (buf[idx + 3] < 128) {
        // Keep transparent
        d[idx] = d[idx + 1] = d[idx + 2] = 0;
        d[idx + 3] = 0;
        continue;
      }
      const or = buf[idx], og = buf[idx + 1], ob = buf[idx + 2];
      const [nr, ng, nb] = nearestPaletteColor(
        Math.round(Math.max(0, Math.min(255, or))),
        Math.round(Math.max(0, Math.min(255, og))),
        Math.round(Math.max(0, Math.min(255, ob))),
        palette
      );
      d[idx] = nr;
      d[idx + 1] = ng;
      d[idx + 2] = nb;
      d[idx + 3] = 255;

      if (dither) {
        const er = or - nr, eg = og - ng, eb = ob - nb;
        const spread = (dx: number, dy: number, frac: number) => {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const ni = (ny * w + nx) * 4;
            buf[ni] += er * frac;
            buf[ni + 1] += eg * frac;
            buf[ni + 2] += eb * frac;
          }
        };
        spread(1, 0, 7 / 16);
        spread(-1, 1, 3 / 16);
        spread(0, 1, 5 / 16);
        spread(1, 1, 1 / 16);
      }
    }
  }
  return out;
}


function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

interface SlotData {
  dataUrl: string;
  timestamp: number;
}

const SLOT_KEY = "pixel-editor-slots";
const MAX_SLOTS = 5;

export const PixelEditor: React.FC<PixelEditorProps> = ({ ranks = [] }) => {
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#000000");
  const [zoom, setZoom] = useState(10);
  const [showGrid, setShowGrid] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedRankIndex, setSelectedRankIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Track used colors (auto-palette)
  const [usedColors, setUsedColors] = useState<Set<string>>(new Set());

  // Image-to-pixel converter state
  const [converterOpen, setConverterOpen] = useState(false);
  const [converterSrcImg, setConverterSrcImg] = useState<HTMLImageElement | null>(null);
  const [converterColors, setConverterColors] = useState(16);
  const [converterDither, setConverterDither] = useState(false);
  const converterPreviewRef = useRef<HTMLCanvasElement>(null);

  // Temp save slots
  const [slots, setSlots] = useState<(SlotData | null)[]>(() => {
    try {
      const raw = localStorage.getItem(SLOT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as (SlotData | null)[];
        return Array.from({ length: MAX_SLOTS }, (_, i) => parsed[i] ?? null);
      }
    } catch {}
    return Array(MAX_SLOTS).fill(null);
  });

  const persistSlots = useCallback((newSlots: (SlotData | null)[]) => {
    setSlots(newSlots);
    try { localStorage.setItem(SLOT_KEY, JSON.stringify(newSlots)); } catch {}
  }, []);

  // History for undo/redo
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(-1);
  const [historyLength, setHistoryLength] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(imgData);
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
    setHistoryLength(historyRef.current.length);
    setHistoryIndex(historyIndexRef.current);
  }, []);

  const restoreHistory = useCallback((idx: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const state = historyRef.current[idx];
    if (!state) return;
    ctx.putImageData(state, 0, 0);
    historyIndexRef.current = idx;
    setHistoryIndex(idx);
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    restoreHistory(historyIndexRef.current - 1);
  }, [restoreHistory]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    restoreHistory(historyIndexRef.current + 1);
  }, [restoreHistory]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = GRID_SIZE;
    canvas.height = GRID_SIZE;
    ctx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
    pushHistory();
  }, [pushHistory]);

  // Render display canvas (zoomed + checkerboard + grid)
  const renderDisplay = useCallback(() => {
    const src = canvasRef.current;
    const dst = displayCanvasRef.current;
    if (!src || !dst) return;

    const dstCtx = dst.getContext("2d");
    if (!dstCtx) return;

    const w = GRID_SIZE * zoom;
    const h = GRID_SIZE * zoom;
    dst.width = w;
    dst.height = h;

    dstCtx.imageSmoothingEnabled = false;

    // Checkerboard for transparent areas — one check per pixel cell
    for (let py = 0; py < GRID_SIZE; py++) {
      for (let px = 0; px < GRID_SIZE; px++) {
        const isLight = (px + py) % 2 === 0;
        dstCtx.fillStyle = isLight ? "#e8e8e8" : "#d0d0d0";
        dstCtx.fillRect(px * zoom, py * zoom, zoom, zoom);
      }
    }

    // Draw source pixels on top
    dstCtx.drawImage(src, 0, 0, GRID_SIZE, GRID_SIZE, 0, 0, w, h);

    // Grid lines
    if (showGrid) {
      dstCtx.strokeStyle = "rgba(0,0,0,0.25)";
      dstCtx.lineWidth = 1;
      dstCtx.beginPath();
      for (let x = 0; x <= GRID_SIZE; x++) {
        dstCtx.moveTo(x * zoom + 0.5, 0);
        dstCtx.lineTo(x * zoom + 0.5, h);
      }
      for (let y = 0; y <= GRID_SIZE; y++) {
        dstCtx.moveTo(0, y * zoom + 0.5);
        dstCtx.lineTo(w, y * zoom + 0.5);
      }
      dstCtx.stroke();
    }
  }, [zoom, showGrid]);

  useEffect(() => {
    renderDisplay();
  }, [renderDisplay, historyIndex]);

  // Scan all colors from the data canvas and rebuild usedColors
  const syncPaletteFromCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
    const colors = new Set<string>();
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 0) {
        const hex = rgbToHex(imgData.data[i], imgData.data[i + 1], imgData.data[i + 2]);
        if (hex !== "#000000" && hex !== "#ffffff") colors.add(hex);
      }
    }
    setUsedColors(colors);
  }, []);

  // Slot save/load/delete
  const saveToSlot = useCallback((slotIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const newSlots = [...slots];
    newSlots[slotIndex] = { dataUrl, timestamp: Date.now() };
    persistSlots(newSlots);
  }, [slots, persistSlots]);

  const loadFromSlot = useCallback((slotIndex: number) => {
    const slot = slots[slotIndex];
    if (!slot) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = GRID_SIZE;
      canvas.height = GRID_SIZE;
      ctx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
      ctx.drawImage(img, 0, 0, GRID_SIZE, GRID_SIZE);
      syncPaletteFromCanvas();
      renderDisplay();
      pushHistory();
    };
    img.src = slot.dataUrl;
  }, [slots, renderDisplay, pushHistory, syncPaletteFromCanvas]);

  const deleteSlot = useCallback((slotIndex: number) => {
    const newSlots = [...slots];
    newSlots[slotIndex] = null;
    persistSlots(newSlots);
  }, [slots, persistSlots]);

  // Get grid coords from mouse event
  const getGridCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / zoom);
      const y = Math.floor((e.clientY - rect.top) / zoom);
      if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return null;
      return { x, y };
    },
    [zoom]
  );

  // Track color usage (quick add without full scan)
  const addUsedColor = useCallback((c: string) => {
    if (c === "#000000" || c === "#ffffff") return;
    setUsedColors((prev) => {
      if (prev.has(c)) return prev;
      const next = new Set(prev);
      next.add(c);
      return next;
    });
  }, []);

  // Draw pixel
  const drawPixelAt = useCallback(
    (gx: number, gy: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (tool === "eraser") {
        ctx.clearRect(gx, gy, 1, 1);
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(gx, gy, 1, 1);
        addUsedColor(color);
      }
      renderDisplay();
    },
    [tool, color, renderDisplay, addUsedColor]
  );

  // Flood fill
  const floodFill = useCallback(
    (startX: number, startY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imgData = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
      const data = imgData.data;
      const startIdx = (startY * GRID_SIZE + startX) * 4;
      const origR = data[startIdx], origG = data[startIdx + 1], origB = data[startIdx + 2], origA = data[startIdx + 3];
      const fillRgb = hexToRgb(color);
      if (!fillRgb) return;
      if (origR === fillRgb.r && origG === fillRgb.g && origB === fillRgb.b && origA === 255) return;
      const queue: [number, number][] = [[startX, startY]];
      const visited = new Uint8Array(GRID_SIZE * GRID_SIZE);
      while (queue.length > 0) {
        const [cx, cy] = queue.pop()!;
        const key = cy * GRID_SIZE + cx;
        if (visited[key]) continue;
        visited[key] = 1;
        const idx = key * 4;
        if (data[idx] !== origR || data[idx+1] !== origG || data[idx+2] !== origB || data[idx+3] !== origA) continue;
        data[idx] = fillRgb.r; data[idx+1] = fillRgb.g; data[idx+2] = fillRgb.b; data[idx+3] = 255;
        if (cx > 0) queue.push([cx-1, cy]);
        if (cx < GRID_SIZE-1) queue.push([cx+1, cy]);
        if (cy > 0) queue.push([cx, cy-1]);
        if (cy < GRID_SIZE-1) queue.push([cx, cy+1]);
      }
      ctx.putImageData(imgData, 0, 0);
      addUsedColor(color);
      renderDisplay();
    },
    [color, renderDisplay, addUsedColor]
  );

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return;
      const coords = getGridCoords(e);
      if (!coords) return;
      if (tool === "fill") { floodFill(coords.x, coords.y); pushHistory(); return; }
      setIsDrawing(true);
      drawPixelAt(coords.x, coords.y);
    },
    [getGridCoords, tool, floodFill, pushHistory, drawPixelAt]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || tool === "fill") return;
      const coords = getGridCoords(e);
      if (!coords) return;
      drawPixelAt(coords.x, coords.y);
    },
    [isDrawing, tool, getGridCoords, drawPixelAt]
  );

  const handleMouseUp = useCallback(() => {
    if (isDrawing) {
      pushHistory();
      syncPaletteFromCanvas();
      setIsDrawing(false);
    }
  }, [isDrawing, pushHistory, syncPaletteFromCanvas]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" || e.key === "Z") { e.shiftKey ? redo() : undo(); e.preventDefault(); }
        else if (e.key === "y" || e.key === "Y") { redo(); e.preventDefault(); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
    renderDisplay();
    pushHistory();
  }, [renderDisplay, pushHistory]);

  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `rank-${ranks[selectedRankIndex]?.level || 0}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [ranks, selectedRankIndex]);

  const importPNG = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          canvas.width = GRID_SIZE;
          canvas.height = GRID_SIZE;
          ctx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
          ctx.drawImage(img, 0, 0, GRID_SIZE, GRID_SIZE);
          syncPaletteFromCanvas();
          renderDisplay();
          pushHistory();
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    },
    [renderDisplay, pushHistory, syncPaletteFromCanvas]
  );

  // ── Image → Pixel Art converter ──
  const converterLoadFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setConverterSrcImg(img);
        setConverterOpen(true);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  // Render converter preview whenever settings change
  useEffect(() => {
    if (!converterOpen || !converterSrcImg) return;
    const preview = converterPreviewRef.current;
    if (!preview) return;

    // Draw source → 32x32 temp canvas
    const tmp = document.createElement("canvas");
    tmp.width = GRID_SIZE;
    tmp.height = GRID_SIZE;
    const tmpCtx = tmp.getContext("2d")!;
    tmpCtx.imageSmoothingEnabled = true;
    tmpCtx.imageSmoothingQuality = "high";
    tmpCtx.drawImage(converterSrcImg, 0, 0, GRID_SIZE, GRID_SIZE);

    // Quantize
    const srcData = tmpCtx.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
    const quantized = quantizeImageData(srcData, converterColors, converterDither);

    // Render preview at 8x zoom with checkerboard
    const pZoom = 8;
    const pw = GRID_SIZE * pZoom;
    preview.width = pw;
    preview.height = pw;
    const pCtx = preview.getContext("2d")!;
    pCtx.imageSmoothingEnabled = false;

    // Checkerboard
    for (let py = 0; py < GRID_SIZE; py++) {
      for (let px = 0; px < GRID_SIZE; px++) {
        pCtx.fillStyle = (px + py) % 2 === 0 ? "#e8e8e8" : "#d0d0d0";
        pCtx.fillRect(px * pZoom, py * pZoom, pZoom, pZoom);
      }
    }

    // Draw quantized pixels
    const tCanvas = document.createElement("canvas");
    tCanvas.width = GRID_SIZE;
    tCanvas.height = GRID_SIZE;
    const tCtx = tCanvas.getContext("2d")!;
    tCtx.putImageData(quantized, 0, 0);
    pCtx.drawImage(tCanvas, 0, 0, GRID_SIZE, GRID_SIZE, 0, 0, pw, pw);
  }, [converterOpen, converterSrcImg, converterColors, converterDither]);

  const converterApply = useCallback(() => {
    if (!converterSrcImg) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw source → 32x32
    canvas.width = GRID_SIZE;
    canvas.height = GRID_SIZE;
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = GRID_SIZE;
    tmpCanvas.height = GRID_SIZE;
    const tmpCtx = tmpCanvas.getContext("2d")!;
    tmpCtx.imageSmoothingEnabled = true;
    tmpCtx.imageSmoothingQuality = "high";
    tmpCtx.drawImage(converterSrcImg, 0, 0, GRID_SIZE, GRID_SIZE);

    const srcData = tmpCtx.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
    const quantized = quantizeImageData(srcData, converterColors, converterDither);

    ctx.putImageData(quantized, 0, 0);

    // Extract used colors
    const newColors = new Set(usedColors);
    for (let i = 0; i < quantized.data.length; i += 4) {
      if (quantized.data[i + 3] > 0) {
        const hex = rgbToHex(quantized.data[i], quantized.data[i + 1], quantized.data[i + 2]);
        if (hex !== "#000000" && hex !== "#ffffff") newColors.add(hex);
      }
    }
    setUsedColors(newColors);
    renderDisplay();
    pushHistory();
    setConverterOpen(false);
    setConverterSrcImg(null);
  }, [converterSrcImg, converterColors, converterDither, usedColors, renderDisplay, pushHistory]);

  const saveToRank = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rank = ranks[selectedRankIndex];
    if (!rank) return;
    setIsSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Failed to create blob");
      const formData = new FormData();
      formData.append("file", blob, `rank-${rank.level}.png`);
      const response = await fetch(`http://127.0.0.1:18765/api/ranks/${rank.level}/image`, { method: "POST", body: formData });
      if (!response.ok) throw new Error("Failed to save rank image");
      // Bust browser image cache and invalidate rank queries
      bumpImageCache();
      queryClient.invalidateQueries({ queryKey: ["rank"] });
      queryClient.invalidateQueries({ queryKey: ["rankConfig"] });
      alert(`${rank.name} 칭호 이미지가 변경되었습니다!`);
    } catch (error) {
      console.error("Error saving rank image:", error);
      alert("칭호 이미지 변경에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }, [ranks, selectedRankIndex, queryClient]);

  // Build palette: black + white + used colors (max 14 used)
  const palette = useMemo(() => {
    const base = ["#000000", "#ffffff"];
    const used = Array.from(usedColors).slice(0, 14);
    return [...base, ...used];
  }, [usedColors]);

  const selectedRank = ranks[selectedRankIndex];
  const canvasSize = GRID_SIZE * zoom;

  return (
    <div className="flex flex-col gap-2 p-1 h-full">
      {/* Toolbar */}
      <div className="flex gap-0.5 flex-wrap items-center">
        {([
          { t: "pencil" as Tool, Icon: Pencil, label: "펜 (P)" },
          { t: "eraser" as Tool, Icon: Eraser, label: "지우개 (E)" },
          { t: "fill" as Tool, Icon: Droplet, label: "채우기 (F)" },
        ] as const).map(({ t, Icon, label }) => (
          <Button key={t} size="sm" variant={tool === t ? "default" : "outline"} onClick={() => setTool(t)} title={label} className="h-7 w-7 p-0">
            <Icon className="w-3.5 h-3.5" />
          </Button>
        ))}

        <div className="w-px h-5 bg-border mx-0.5" />

        <Button size="sm" variant="outline" onClick={undo} disabled={historyIndex <= 0} title="실행 취소 (Ctrl+Z)" className="h-7 w-7 p-0">
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="outline" onClick={redo} disabled={historyIndex >= historyLength - 1} title="다시 실행 (Ctrl+Y)" className="h-7 w-7 p-0">
          <RotateCw className="w-3.5 h-3.5" />
        </Button>

        <div className="w-px h-5 bg-border mx-0.5" />

        <Button size="sm" variant={showGrid ? "default" : "outline"} onClick={() => setShowGrid(!showGrid)} title="격자 표시" className="h-7 w-7 p-0">
          <Grid3x3 className="w-3.5 h-3.5" />
        </Button>

        <Button size="sm" variant="outline" onClick={() => setZoom(Math.max(4, zoom - 2))} title="축소" className="h-7 w-7 p-0">
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <span className="text-[10px] text-muted-foreground px-0.5">{zoom}x</span>
        <Button size="sm" variant="outline" onClick={() => setZoom(Math.min(16, zoom + 2))} title="확대" className="h-7 w-7 p-0">
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>

        <div className="w-px h-5 bg-border mx-0.5" />

        <Button size="sm" variant="outline" onClick={clearCanvas} title="전체 지우기" className="h-7 w-7 p-0">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Canvas area */}
      <canvas ref={canvasRef} width={GRID_SIZE} height={GRID_SIZE} className="hidden" />
      <div className="flex-1 flex items-center justify-center min-h-0 bg-muted/20 rounded border overflow-auto">
        <canvas
          ref={displayCanvasRef}
          width={canvasSize}
          height={canvasSize}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ width: canvasSize, height: canvasSize, imageRendering: "pixelated", cursor: tool === "fill" ? "cell" : "crosshair" }}
          className="border border-border"
        />
      </div>

      {/* Color palette: black + white + used colors + color picker */}
      <div className="flex flex-col gap-1">
        <div className="flex gap-0.5 flex-wrap">
          {palette.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-5 w-5 rounded-sm border transition-all ${
                color === c ? "border-primary ring-1 ring-primary scale-110" : "border-border"
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
        <div className="flex gap-1 items-center">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-6 w-8 cursor-pointer border-0 rounded"
          />
          <span className="text-[10px] font-mono text-muted-foreground flex-1">{color}</span>
          {usedColors.size > 0 && (
            <button onClick={() => setUsedColors(new Set())} className="text-[9px] text-muted-foreground hover:text-foreground">
              팔레트 초기화
            </button>
          )}
        </div>
      </div>

      {/* Import/Export + Converter */}
      <div className="flex gap-1">
        <label className="flex-1 cursor-pointer">
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) importPNG(file); e.target.value = ""; }}
            className="hidden"
          />
          <div className="w-full h-7 inline-flex items-center justify-center gap-1 rounded-md border border-input bg-background px-2 text-[11px] font-medium hover:bg-accent hover:text-accent-foreground">
            <Upload className="w-3 h-3" />
            <span>가져오기</span>
          </div>
        </label>
        <label className="flex-1 cursor-pointer">
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) converterLoadFile(file); e.target.value = ""; }}
            className="hidden"
          />
          <div className="w-full h-7 inline-flex items-center justify-center gap-1 rounded-md border border-input bg-violet-500/10 text-violet-400 px-2 text-[11px] font-medium hover:bg-violet-500/20">
            <ImageIcon className="w-3 h-3" />
            <span>도트 변환</span>
          </div>
        </label>
        <Button size="sm" variant="outline" onClick={exportPNG} className="flex-1 h-7 text-[11px]">
          <Download className="w-3 h-3 mr-0.5" />
          내보내기
        </Button>
      </div>

      {/* Image → Pixel Art Converter Panel */}
      {converterOpen && converterSrcImg && (
        <div className="rounded-lg border-2 border-violet-500/40 bg-violet-500/5 p-2 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[11px] font-semibold text-violet-400">이미지 → 도트 변환</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0"
              onClick={() => { setConverterOpen(false); setConverterSrcImg(null); }}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>

          {/* Preview: original → result side by side */}
          <div className="flex gap-2 justify-center">
            {/* Original thumbnail */}
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground mb-0.5">원본</p>
              <img
                src={converterSrcImg.src}
                alt="원본"
                className="w-[64px] h-[64px] rounded border object-cover"
                style={{ imageRendering: "auto" }}
              />
            </div>
            <div className="flex items-center text-muted-foreground text-lg">→</div>
            {/* Quantized preview */}
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground mb-0.5">변환 결과 ({converterColors}색)</p>
              <canvas
                ref={converterPreviewRef}
                className="rounded border"
                style={{ width: 128, height: 128, imageRendering: "pixelated" }}
              />
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-2 px-1">
            <div className="flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <Slider
                label="색상 수"
                value={converterColors}
                min={2}
                max={64}
                step={2}
                unit="색"
                onChange={setConverterColors}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">디더링 (Floyd-Steinberg)</span>
              <Switch checked={converterDither} onCheckedChange={setConverterDither} />
            </div>
          </div>

          {/* Apply */}
          <Button
            size="sm"
            className="w-full h-7 text-[11px] bg-violet-600 hover:bg-violet-700"
            onClick={converterApply}
          >
            <Check className="w-3 h-3 mr-0.5" />
            에디터에 적용
          </Button>
        </div>
      )}

      {/* Temp save slots */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <FolderOpen className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium">임시 저장</span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {slots.map((slot, i) => (
            <div key={i} className="relative group">
              <button
                onClick={() => slot ? loadFromSlot(i) : saveToSlot(i)}
                title={slot ? `슬롯 ${i + 1} 불러오기` : `슬롯 ${i + 1}에 저장`}
                className={`w-full aspect-square rounded border-2 overflow-hidden flex items-center justify-center transition-colors ${
                  slot ? "border-primary/50 hover:border-primary" : "border-dashed border-muted-foreground/30 hover:border-muted-foreground/60"
                }`}
                style={{
                  // Checkerboard bg to show transparency behind img
                  background: slot
                    ? "repeating-conic-gradient(#d0d0d0 0% 25%, #e8e8e8 0% 50%) 0 0 / 8px 8px"
                    : undefined,
                }}
              >
                {slot ? (
                  <img
                    src={slot.dataUrl}
                    alt={`슬롯 ${i + 1}`}
                    className="w-full h-full"
                    style={{ imageRendering: "pixelated" }}
                    draggable={false}
                  />
                ) : (
                  <Save className="w-3 h-3 text-muted-foreground/40" />
                )}
              </button>
              {slot && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSlot(i); }}
                  title="삭제"
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground items-center justify-center text-[8px] hidden group-hover:flex"
                >
                  <X className="w-2 h-2" />
                </button>
              )}
              <span className="text-[8px] text-muted-foreground text-center block">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rank selector and save */}
      <div className="flex flex-col gap-1">
        <select
          value={selectedRankIndex}
          onChange={(e) => setSelectedRankIndex(Number(e.target.value))}
          className="text-[11px] h-7 px-2 rounded border border-input bg-background"
        >
          {ranks.map((rank, idx) => (
            <option key={rank.level} value={idx}>
              {rank.step_label ?? rank.name} - {rank.name}
            </option>
          ))}
        </select>

        <Button onClick={saveToRank} disabled={isSaving || ranks.length === 0} className="w-full h-7 text-[11px]">
          {isSaving ? (
            <><Loader2 className="w-3 h-3 animate-spin mr-0.5" />저장 중...</>
          ) : (
            <><Save className="w-3 h-3 mr-0.5" />칭호 이미지 변경</>
          )}
        </Button>

        {selectedRank && (
          <div className="flex items-center justify-center gap-2 p-1.5 rounded bg-muted/50">
            <RankImage rank={selectedRank} size="28px" />
            <div className="text-[11px]">
              <div className="font-semibold">{selectedRank.name}</div>
              <div className="text-muted-foreground">{selectedRank.step_label ?? selectedRank.name}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
