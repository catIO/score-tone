import React, { useRef, useEffect, useCallback } from 'react';
import type { AnnotationStroke, StrokePoint } from '../services/storageService';
import type { CurrentTool } from '../hooks/useAnnotationState';

interface PageAnnotationCanvasProps {
  pageNumber: number;
  strokes: AnnotationStroke[];
  isAnnotating: boolean;
  activeTool: CurrentTool;
  activeColor: string;
  activeSize: number;
  onAddStroke: (pageNumber: number, stroke: AnnotationStroke) => void;
  onRemoveStrokes: (pageNumber: number, strokeIds: string[]) => void;
  className?: string;
  style?: React.CSSProperties;
}

// Distance from point to line segment squared
function distToSegmentSquared(
  px: number, py: number,
  vx: number, vy: number,
  wx: number, wy: number
): number {
  const l2 = (wx - vx) * (wx - vx) + (wy - vy) * (wy - vy);
  if (l2 === 0) return (px - vx) * (px - vx) + (py - vy) * (py - vy);
  let t = ((px - vx) * (wx - vx) + (py - vy) * (wy - vy)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = vx + t * (wx - vx);
  const projY = vy + t * (wy - vy);
  return (px - projX) * (px - projX) + (py - projY) * (py - vy);
}

export const PageAnnotationCanvas: React.FC<PageAnnotationCanvasProps> = ({
  pageNumber,
  strokes,
  isAnnotating,
  activeTool,
  activeColor,
  activeSize,
  onAddStroke,
  onRemoveStrokes,
  className = '',
  style = {},
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const currentPointsRef = useRef<StrokePoint[]>([]);
  const currentStrokeIdRef = useRef<string>('');

  // Helper to render all strokes to canvas
  const renderStrokes = useCallback((
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    allStrokes: AnnotationStroke[],
    inProgressStroke?: { tool: 'pen' | 'highlighter'; color: string; size: number; points: StrokePoint[] }
  ) => {
    ctx.clearRect(0, 0, width, height);

    const drawList = inProgressStroke
      ? [...allStrokes, { id: 'live', tool: inProgressStroke.tool, color: inProgressStroke.color, size: inProgressStroke.size, points: inProgressStroke.points, createdAt: 0 }]
      : allStrokes;

    for (const stroke of drawList) {
      if (!stroke.points || stroke.points.length === 0) continue;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'highlighter') {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
      }

      const pts = stroke.points;
      if (pts.length === 1) {
        // Draw dot
        const x = pts[0].x * width;
        const y = pts[0].y * height;
        ctx.fillStyle = stroke.color;
        ctx.beginPath();
        ctx.arc(x, y, stroke.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (pts.length === 2) {
        // Draw straight line
        ctx.beginPath();
        ctx.moveTo(pts[0].x * width, pts[0].y * height);
        ctx.lineTo(pts[1].x * width, pts[1].y * height);
        ctx.stroke();
      } else {
        // Draw smooth Bézier curve through midpoints
        ctx.beginPath();
        ctx.moveTo(pts[0].x * width, pts[0].y * height);

        for (let i = 1; i < pts.length - 1; i++) {
          const xc = ((pts[i].x + pts[i + 1].x) / 2) * width;
          const yc = ((pts[i].y + pts[i + 1].y) / 2) * height;
          ctx.quadraticCurveTo(pts[i].x * width, pts[i].y * height, xc, yc);
        }

        const last = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        ctx.quadraticCurveTo(prev.x * width, prev.y * height, last.x * width, last.y * height);
        ctx.stroke();
      }

      ctx.restore();
    }
  }, []);

  // Sync canvas resolution with display size
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.round(rect.width);
    const displayHeight = Math.round(rect.height);

    if (displayWidth === 0 || displayHeight === 0) return;

    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const inProgress = isDrawingRef.current && (activeTool === 'pen' || activeTool === 'highlighter')
      ? {
          tool: activeTool,
          color: activeColor,
          size: activeSize,
          points: currentPointsRef.current,
        }
      : undefined;

    renderStrokes(ctx, displayWidth, displayHeight, strokes, inProgress);
  }, [strokes, activeTool, activeColor, activeSize, renderStrokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Resize observer to ensure responsive scale updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      redraw();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  // Check if a point hits any existing stroke (for stroke eraser)
  const hitTestStroke = useCallback((
    px: number,
    py: number,
    width: number,
    height: number,
    candidateStrokes: AnnotationStroke[]
  ): string | null => {
    const threshold = 14; // pixels tolerance
    const thresholdSq = threshold * threshold;

    for (let sIdx = candidateStrokes.length - 1; sIdx >= 0; sIdx--) {
      const stroke = candidateStrokes[sIdx];
      const pts = stroke.points;
      if (!pts || pts.length === 0) continue;

      if (pts.length === 1) {
        const sx = pts[0].x * width;
        const sy = pts[0].y * height;
        const d2 = (px - sx) * (px - sx) + (py - sy) * (py - sy);
        if (d2 <= Math.max(thresholdSq, (stroke.size / 2) * (stroke.size / 2))) {
          return stroke.id;
        }
      } else {
        for (let i = 0; i < pts.length - 1; i++) {
          const vx = pts[i].x * width;
          const vy = pts[i].y * height;
          const wx = pts[i + 1].x * width;
          const wy = pts[i + 1].y * height;
          const d2 = distToSegmentSquared(px, py, vx, vy, wx, wy);
          if (d2 <= Math.max(thresholdSq, (stroke.size / 2) * (stroke.size / 2))) {
            return stroke.id;
          }
        }
      }
    }
    return null;
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isAnnotating) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const p = e.pressure > 0 ? e.pressure : undefined;

    if (activeTool === 'eraser') {
      const hitId = hitTestStroke(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, strokes);
      if (hitId) {
        onRemoveStrokes(pageNumber, [hitId]);
      }
    } else {
      currentStrokeIdRef.current = crypto.randomUUID();
      currentPointsRef.current = [{ x, y, p }];
      redraw();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isAnnotating || !isDrawingRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    if (activeTool === 'eraser') {
      const hitId = hitTestStroke(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, strokes);
      if (hitId) {
        onRemoveStrokes(pageNumber, [hitId]);
      }
    } else {
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const p = e.pressure > 0 ? e.pressure : undefined;

      const pts = currentPointsRef.current;
      const lastPt = pts[pts.length - 1];

      // Don't append if movement is negligible
      if (!lastPt || Math.hypot((x - lastPt.x) * rect.width, (y - lastPt.y) * rect.height) >= 2) {
        pts.push({ x, y, p });
        redraw();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isAnnotating || !isDrawingRef.current) return;
    isDrawingRef.current = false;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already lost
    }

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      const pts = currentPointsRef.current;
      if (pts.length > 0) {
        const newStroke: AnnotationStroke = {
          id: currentStrokeIdRef.current || crypto.randomUUID(),
          tool: activeTool,
          color: activeColor,
          size: activeSize,
          points: [...pts],
          createdAt: Date.now(),
        };
        currentPointsRef.current = [];
        onAddStroke(pageNumber, newStroke);
      }
    }
  };

  const handlePointerCancel = () => {
    isDrawingRef.current = false;
    currentPointsRef.current = [];
    redraw();
  };

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{
        pointerEvents: isAnnotating ? 'auto' : 'none',
        touchAction: isAnnotating ? 'none' : 'auto',
        zIndex: 25,
        ...style,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );
};

export default PageAnnotationCanvas;
