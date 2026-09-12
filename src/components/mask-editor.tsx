import { EraserIcon, MinusIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export interface MaskEditorImage {
  src: string;
  name?: string;
}

interface MaskEditorProps {
  open: boolean;
  image: MaskEditorImage | null;
  onOpenChange: (open: boolean) => void;
  onApply: (mask: Blob) => void;
  language?: "zh" | "en";
}

const MAX_EDGE = 1600;

export function MaskEditor({ open, image, onOpenChange, onApply, language = "zh" }: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [brushSize, setBrushSize] = useState(64);
  const [erasing, setErasing] = useState(false);

  useEffect(() => {
    if (!open || !image) return;
    const source = new Image();
    source.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(source.naturalWidth, source.naturalHeight));
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      imageRef.current = source;
      setReady(true);
    };
    source.onerror = () => setReady(false);
    source.src = image.src;
    return () => {
      imageRef.current = null;
      setReady(false);
    };
  }, [open, image]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !ready) return;
    const canvas = canvasRef.current;
    const p = point(event);
    const context = canvas?.getContext("2d");
    if (!canvas || !p || !context) return;
    context.save();
    context.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    context.fillStyle = "rgba(255,255,255,0.95)";
    context.beginPath();
    context.arc(p.x, p.y, Math.max(2, brushSize / 2), 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function clearMask() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function applyMask() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      onApply(blob);
      onOpenChange(false);
    }, "image/png");
  }

  if (!open || !image) return null;
  const en = language === "en";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={en ? "Mask editor" : "遮罩编辑"}>
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold">{en ? "Edit mask" : "编辑遮罩"}</div>
          <Button variant="ghost" size="icon-xs" onClick={() => onOpenChange(false)} aria-label="关闭"><XIcon /></Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/40 p-4">
          <div className="relative max-h-[65vh] max-w-full overflow-hidden rounded-lg border bg-white shadow-sm">
            <img src={image.src} alt="" className="pointer-events-none block max-h-[65vh] max-w-full object-contain opacity-45" />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-crosshair object-contain" onPointerDown={(event) => { drawingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); draw(event); }} onPointerMove={draw} onPointerUp={(event) => { drawingRef.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drawingRef.current = false; }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant={erasing ? "secondary" : "outline"} size="sm" onClick={() => setErasing((value) => !value)}><EraserIcon data-icon="inline-start" />{erasing ? (en ? "Erase mode" : "擦除模式") : (en ? "Mark edit area" : "标记修改区域")}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearMask}><RotateCcwIcon data-icon="inline-start" />{en ? "Clear mask" : "清空遮罩"}</Button>
            <div className="flex items-center gap-1 rounded-md border px-1"><Button type="button" variant="ghost" size="icon-xs" onClick={() => setBrushSize((value) => Math.max(8, value - 8))} aria-label="减小画笔"><MinusIcon /></Button><span className="w-10 text-center text-xs tabular-nums">{brushSize}</span><Button type="button" variant="ghost" size="icon-xs" onClick={() => setBrushSize((value) => Math.min(256, value + 8))} aria-label="增大画笔"><PlusIcon /></Button></div>
          </div>
          <div className="flex items-center gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{en ? "Cancel" : "取消"}</Button><Button type="button" onClick={applyMask} disabled={!ready}>{en ? "Apply mask" : "应用遮罩"}</Button></div>
        </div>
      </div>
    </div>
  );
}
