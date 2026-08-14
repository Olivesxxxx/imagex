import {
  ArrowUpRightIcon,
  CircleIcon,
  EraserIcon,
  MousePointer2Icon,
  PencilIcon,
  Redo2Icon,
  RectangleHorizontalIcon,
  RotateCcwIcon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type AnnotationTool = "select" | "brush" | "arrow" | "rectangle" | "ellipse" | "text";
type Point = { x: number; y: number };
type ResizeHandle = "start" | "end" | "north-west" | "north-east" | "south-east" | "south-west";
type Annotation = {
  id: string;
  type: Exclude<AnnotationTool, "select">;
  color: string;
  size: number;
  points?: Point[];
  start?: Point;
  end?: Point;
  text?: string;
  fontSize?: number;
  textWidth?: number;
  textHeight?: number;
};

export interface AnnotationImageSource {
  src: string;
  blob?: Blob;
  mimeType?: string;
  name?: string;
}

interface AnnotationWorkspaceProps {
  open: boolean;
  image: AnnotationImageSource | null;
  originalPrompt: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (file: File, instruction: string) => void;
}

const MARK_COLOR = "#ef4444";

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function annotationBounds(annotation: Annotation): { left: number; top: number; right: number; bottom: number } {
  if (annotation.type === "brush" && annotation.points?.length) {
    const xs = annotation.points.map((point) => point.x);
    const ys = annotation.points.map((point) => point.y);
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  }
  if (annotation.type === "text" && annotation.start) {
    const fontSize = annotation.fontSize || 28;
    return {
      left: annotation.start.x,
      top: annotation.start.y,
      right: annotation.start.x + Math.max(fontSize, annotation.textWidth || (annotation.text?.length || 1) * fontSize * 0.62),
      bottom: annotation.start.y + Math.max(fontSize, annotation.textHeight || fontSize),
    };
  }
  if (annotation.start && annotation.end) {
    return {
      left: Math.min(annotation.start.x, annotation.end.x),
      top: Math.min(annotation.start.y, annotation.end.y),
      right: Math.max(annotation.start.x, annotation.end.x),
      bottom: Math.max(annotation.start.y, annotation.end.y),
    };
  }
  return { left: annotation.start?.x || 0, top: annotation.start?.y || 0, right: annotation.start?.x || 0, bottom: annotation.start?.y || 0 };
}

function hitTest(annotation: Annotation, point: Point, screenTolerance = 12) {
  const tolerance = Math.max(screenTolerance, annotation.size * 2);
  if (annotation.type === "brush") {
    const points = annotation.points || [];
    return points.some((current, index) => index > 0 && distanceToSegment(point, points[index - 1], current) <= tolerance);
  }
  if (annotation.type === "arrow" && annotation.start && annotation.end) {
    return distanceToSegment(point, annotation.start, annotation.end) <= tolerance;
  }
  const bounds = annotationBounds(annotation);
  return point.x >= bounds.left - tolerance && point.x <= bounds.right + tolerance && point.y >= bounds.top - tolerance && point.y <= bounds.bottom + tolerance;
}

function resizeHandles(annotation: Annotation): Array<{ handle: ResizeHandle; point: Point }> {
  if (annotation.type === "arrow" && annotation.start && annotation.end) {
    return [
      { handle: "start", point: annotation.start },
      { handle: "end", point: annotation.end },
    ];
  }
  if ((annotation.type === "rectangle" || annotation.type === "ellipse") && annotation.start && annotation.end) {
    const bounds = annotationBounds(annotation);
    return [
      { handle: "north-west", point: { x: bounds.left, y: bounds.top } },
      { handle: "north-east", point: { x: bounds.right, y: bounds.top } },
      { handle: "south-east", point: { x: bounds.right, y: bounds.bottom } },
      { handle: "south-west", point: { x: bounds.left, y: bounds.bottom } },
    ];
  }
  return [];
}

function hitResizeHandle(annotation: Annotation, point: Point, tolerance: number) {
  return resizeHandles(annotation).find((item) => Math.hypot(point.x - item.point.x, point.y - item.point.y) <= tolerance)?.handle || null;
}

function resizeAnnotation(annotation: Annotation, handle: ResizeHandle, point: Point): Annotation {
  if (annotation.type === "arrow" && annotation.start && annotation.end) {
    if (handle === "start") return { ...annotation, start: point };
    if (handle === "end") return { ...annotation, end: point };
    return annotation;
  }
  if ((annotation.type === "rectangle" || annotation.type === "ellipse") && annotation.start && annotation.end) {
    const bounds = annotationBounds(annotation);
    if (handle === "north-west") return { ...annotation, start: point, end: { x: bounds.right, y: bounds.bottom } };
    if (handle === "north-east") return { ...annotation, start: { x: bounds.left, y: point.y }, end: { x: point.x, y: bounds.bottom } };
    if (handle === "south-east") return { ...annotation, start: { x: bounds.left, y: bounds.top }, end: point };
    if (handle === "south-west") return { ...annotation, start: { x: point.x, y: bounds.top }, end: { x: bounds.right, y: point.y } };
  }
  return annotation;
}

function translateAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  return {
    ...annotation,
    points: annotation.points?.map((point) => ({ x: point.x + dx, y: point.y + dy })),
    start: annotation.start ? { x: annotation.start.x + dx, y: annotation.start.y + dy } : undefined,
    end: annotation.end ? { x: annotation.end.x + dx, y: annotation.end.y + dy } : undefined,
  };
}

export function AnnotationWorkspace({ open, image, originalPrompt, onOpenChange, onSubmit }: AnnotationWorkspaceProps) {
  const { copy } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasStageRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const cancelTextEntryRef = useRef(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const annotationsRef = useRef<Annotation[]>([]);
  const [past, setPast] = useState<Annotation[][]>([]);
  const pastRef = useRef<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);
  const futureRef = useRef<Annotation[][]>([]);
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [strokeSize, setStrokeSize] = useState(2);
  const [strokeColor, setStrokeColor] = useState(MARK_COLOR);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [textAnchor, setTextAnchor] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState("");
  const [textEditorStyle, setTextEditorStyle] = useState<CSSProperties>({});
  const [instruction, setInstruction] = useState("");
  const [exportError, setExportError] = useState("");
  const interactionRef = useRef<{
    kind: "move" | "resize";
    id: string;
    start: Point;
    original: Annotation;
    before: Annotation[];
    handle?: ResizeHandle;
    changed: boolean;
  } | null>(null);

  const setCurrentAnnotations = useCallback((next: Annotation[]) => {
    annotationsRef.current = next;
    setAnnotations(next);
  }, []);

  const commit = useCallback((next: Annotation[]) => {
    const nextPast = [...pastRef.current, annotationsRef.current];
    pastRef.current = nextPast;
    futureRef.current = [];
    setPast(nextPast);
    setFuture([]);
    setCurrentAnnotations(next);
  }, [setCurrentAnnotations]);

  useEffect(() => {
    if (!open || !image) return;
    setAnnotations([]);
    annotationsRef.current = [];
    pastRef.current = [];
    futureRef.current = [];
    setPast([]);
    setFuture([]);
    setSelectedId(null);
    setDraft(null);
    interactionRef.current = null;
    setTextAnchor(null);
    setTextValue("");
    cancelTextEntryRef.current = false;
    setInstruction("");
    setExportError("");
    setImageReady(false);
    setLoadError(false);
    let objectUrl = "";
    let cancelled = false;
    const element = new Image();
    element.decoding = "async";
    element.crossOrigin = "anonymous";
    if (image.blob) {
      objectUrl = URL.createObjectURL(image.blob);
      element.src = objectUrl;
    } else {
      element.src = image.src;
    }
    element.onload = () => {
      if (cancelled) return;
      imageRef.current = element;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = element.naturalWidth;
        canvas.height = element.naturalHeight;
      }
      setImageReady(true);
    };
    element.onerror = () => {
      if (!cancelled) setLoadError(true);
    };
    return () => {
      cancelled = true;
      imageRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image, open]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const element = imageRef.current;
    if (!canvas || !element || !canvas.width || !canvas.height) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    const all = draft ? [...annotations, draft] : annotations;
    for (const annotation of all) {
      context.save();
      context.strokeStyle = annotation.color;
      context.fillStyle = annotation.color;
      context.lineWidth = annotation.size;
      context.lineCap = "round";
      context.lineJoin = "round";
      if (annotation.type === "brush") {
        const points = annotation.points || [];
        if (points.length) {
          context.beginPath();
          context.moveTo(points[0].x, points[0].y);
          points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
          context.stroke();
        }
      } else if (annotation.start && annotation.end && annotation.type === "arrow") {
        const { start, end } = annotation;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (!length) {
          context.restore();
          continue;
        }
        const unitX = dx / length;
        const unitY = dy / length;
        const headLength = Math.min(length, Math.max(18, annotation.size * 4));
        const headWidth = Math.max(14, annotation.size * 3.25);
        const baseX = end.x - unitX * headLength;
        const baseY = end.y - unitY * headLength;
        const normalX = -unitY;
        const normalY = unitX;
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(baseX, baseY);
        context.stroke();
        context.beginPath();
        context.moveTo(end.x, end.y);
        context.lineTo(baseX + normalX * headWidth / 2, baseY + normalY * headWidth / 2);
        context.lineTo(baseX - normalX * headWidth / 2, baseY - normalY * headWidth / 2);
        context.closePath();
        context.fill();
      } else if (annotation.start && annotation.end && annotation.type === "rectangle") {
        context.strokeRect(annotation.start.x, annotation.start.y, annotation.end.x - annotation.start.x, annotation.end.y - annotation.start.y);
      } else if (annotation.start && annotation.end && annotation.type === "ellipse") {
        const centerX = (annotation.start.x + annotation.end.x) / 2;
        const centerY = (annotation.start.y + annotation.end.y) / 2;
        context.beginPath();
        context.ellipse(centerX, centerY, Math.abs(annotation.end.x - annotation.start.x) / 2, Math.abs(annotation.end.y - annotation.start.y) / 2, 0, 0, Math.PI * 2);
        context.stroke();
      } else if (annotation.type === "text" && annotation.start && annotation.text) {
        context.font = `${annotation.fontSize || 28}px sans-serif`;
        context.textBaseline = "top";
        context.fillText(annotation.text, annotation.start.x, annotation.start.y);
      }
      if (annotation.id === selectedId) {
        const bounds = annotationBounds(annotation);
        const canvasRect = canvas.getBoundingClientRect();
        const displayScale = canvasRect.width > 0 ? canvas.width / canvasRect.width : 1;
        const selectionOffset = 8 * displayScale;
        context.setLineDash([8 * displayScale, 5 * displayScale]);
        context.lineWidth = 2 * displayScale;
        context.strokeStyle = "#0ea5e9";
        context.strokeRect(
          bounds.left - selectionOffset,
          bounds.top - selectionOffset,
          Math.max(selectionOffset * 2, bounds.right - bounds.left + selectionOffset * 2),
          Math.max(selectionOffset * 2, bounds.bottom - bounds.top + selectionOffset * 2),
        );
        const handleRadius = 6 * displayScale;
        context.setLineDash([]);
        context.lineWidth = 2 * displayScale;
        for (const item of resizeHandles(annotation)) {
          context.beginPath();
          context.arc(item.point.x, item.point.y, handleRadius, 0, Math.PI * 2);
          context.fillStyle = "#ffffff";
          context.fill();
          context.strokeStyle = "#0284c7";
          context.stroke();
        }
      }
      context.restore();
    }
  }, [annotations, draft, selectedId]);

  useEffect(() => {
    if (!imageReady) return;
    const canvas = canvasRef.current;
    const element = imageRef.current;
    if (!canvas || !element) return;
    if (canvas.width !== element.naturalWidth || canvas.height !== element.naturalHeight) {
      canvas.width = element.naturalWidth;
      canvas.height = element.naturalHeight;
    }
    draw();
  }, [draw, imageReady]);

  const positionTextEditor = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = canvasStageRef.current;
    if (!canvas || !stage || !textAnchor) return;
    const canvasRect = canvas.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const rawLeft = canvasRect.left - stageRect.left + (textAnchor.x / canvas.width) * canvasRect.width;
    const rawTop = canvasRect.top - stageRect.top + (textAnchor.y / canvas.height) * canvasRect.height;
    const context = canvas.getContext("2d");
    const fontSize = Math.max(28, strokeSize * 3);
    let measuredWidth = Math.max(72, textValue.length * 14);
    if (context && typeof context.measureText === "function" && textValue) {
      context.save();
      context.font = `${fontSize}px sans-serif`;
      measuredWidth = context.measureText(textValue).width * (canvasRect.width / canvas.width);
      context.restore();
    }
    const availableWidth = Math.max(48, stageRect.width - 16);
    const width = Math.min(availableWidth, Math.max(96, measuredWidth + 28));
    const left = Math.max(8, Math.min(rawLeft, stageRect.width - width - 8));
    const top = Math.max(20, Math.min(rawTop, stageRect.height - 20));
    setTextEditorStyle({ left, top, width });
  }, [strokeSize, textAnchor, textValue]);

  useEffect(() => {
    if (!textAnchor) return;
    positionTextEditor();
    const focusFrame = window.requestAnimationFrame(() => {
      textInputRef.current?.focus({ preventScroll: true });
    });
    const canvas = canvasRef.current;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(positionTextEditor);
    if (canvas) observer?.observe(canvas);
    window.addEventListener("resize", positionTextEditor);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      observer?.disconnect();
      window.removeEventListener("resize", positionTextEditor);
    };
  }, [positionTextEditor, textAnchor]);

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * (canvas.width / rect.width))),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * (canvas.height / rect.height))),
    };
  }

  function canvasUnitsForScreenPixels(pixels: number) {
    const canvas = canvasRef.current;
    if (!canvas) return pixels;
    const rect = canvas.getBoundingClientRect();
    return rect.width > 0 ? pixels * (canvas.width / rect.width) : pixels;
  }

  function beginTextEditing(annotation: Annotation) {
    if (annotation.type !== "text" || !annotation.start) return;
    cancelTextEntryRef.current = false;
    setSelectedId(annotation.id);
    setTextAnchor(annotation.start);
    setTextValue(annotation.text || "");
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!imageReady) return;
    const point = pointFromEvent(event);
    if (textAnchor) return;
    const handleTolerance = canvasUnitsForScreenPixels(10);
    const selected = annotationsRef.current.find((item) => item.id === selectedId);
    const selectedHandle = selected ? hitResizeHandle(selected, point, handleTolerance) : null;
    if (selected && selectedHandle) {
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture?.(event.pointerId);
      interactionRef.current = {
        kind: "resize",
        id: selected.id,
        start: point,
        original: selected,
        before: annotationsRef.current,
        handle: selectedHandle,
        changed: false,
      };
      return;
    }
    const hitTolerance = canvasUnitsForScreenPixels(12);
    const hit = [...annotationsRef.current].reverse().find((item) => hitTest(item, point, hitTolerance));
    if (hit) {
      event.currentTarget.focus({ preventScroll: true });
      setSelectedId(hit.id);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      interactionRef.current = {
        kind: "move",
        id: hit.id,
        start: point,
        original: hit,
        before: annotationsRef.current,
        changed: false,
      };
      return;
    }
    setSelectedId(null);
    if (tool === "text") {
      cancelTextEntryRef.current = false;
      setTextAnchor(point);
      setTextValue("");
      return;
    }
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (tool === "select") {
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (tool === "brush") {
      setDraft({ id, type: "brush", color: strokeColor, size: strokeSize, points: [point] });
    } else {
      setDraft({ id, type: tool, color: strokeColor, size: strokeSize, start: point, end: point });
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = pointFromEvent(event);
    if (interactionRef.current) {
      const interaction = interactionRef.current;
      const changed = Math.hypot(point.x - interaction.start.x, point.y - interaction.start.y) > 0.5;
      interaction.changed ||= changed;
      const updated = interaction.kind === "resize" && interaction.handle
        ? resizeAnnotation(interaction.original, interaction.handle, point)
        : translateAnnotation(interaction.original, point.x - interaction.start.x, point.y - interaction.start.y);
      const next = annotationsRef.current.map((item) => item.id === interaction.id ? updated : item);
      setCurrentAnnotations(next);
      return;
    }
    if (!draft) return;
    setDraft((current) => current ? current.type === "brush" ? { ...current, points: [...(current.points || []), point] } : { ...current, end: point } : current);
  }

  function handlePointerUp() {
    if (interactionRef.current) {
      const interaction = interactionRef.current;
      interactionRef.current = null;
      if (interaction.changed) {
        const nextPast = [...pastRef.current, interaction.before];
        pastRef.current = nextPast;
        futureRef.current = [];
        setPast(nextPast);
        setFuture([]);
      } else if (interaction.original.type === "text") {
        beginTextEditing(interaction.original);
      }
      return;
    }
    if (draft) {
      const completed = draft;
      setDraft(null);
      if (completed.type !== "brush" || (completed.points?.length || 0) > 1) commit([...annotationsRef.current, completed]);
    }
  }

  function finishTextEntry() {
    const editingId = selectedId && annotationsRef.current.find((item) => item.id === selectedId && item.type === "text")?.id;
    if (!cancelTextEntryRef.current && textAnchor && textValue.trim()) {
      const text = textValue.trim();
      const fontSize = Math.max(28, strokeSize * 3);
      const context = canvasRef.current?.getContext("2d");
      let textWidth = Math.max(fontSize, text.length * fontSize * 0.62);
      let textHeight = fontSize;
      if (context && typeof context.measureText === "function") {
        context.save();
        context.font = `${fontSize}px sans-serif`;
        const metrics = context.measureText(text);
        context.restore();
        textWidth = Math.max(fontSize, metrics.width);
        textHeight = Math.max(fontSize, (metrics.actualBoundingBoxAscent || 0) + (metrics.actualBoundingBoxDescent || 0));
      }
      if (editingId) {
        commit(annotationsRef.current.map((item) => item.id === editingId ? { ...item, text, fontSize, textWidth, textHeight, start: textAnchor } : item));
      } else {
        commit([...annotationsRef.current, { id: `${Date.now()}-text`, type: "text", color: strokeColor, size: 2, fontSize, textWidth, textHeight, start: textAnchor, text }]);
      }
    }
    cancelTextEntryRef.current = false;
    setTextAnchor(null);
    setTextValue("");
    setTool("select");
  }

  function undo() {
    const previous = pastRef.current[pastRef.current.length - 1];
    if (!previous) return;
    const nextPast = pastRef.current.slice(0, -1);
    const nextFuture = [annotationsRef.current, ...futureRef.current];
    pastRef.current = nextPast;
    futureRef.current = nextFuture;
    setPast(nextPast);
    setFuture(nextFuture);
    setCurrentAnnotations(previous);
    setSelectedId(null);
  }

  function redo() {
    const next = futureRef.current[0];
    if (!next) return;
    const nextFuture = futureRef.current.slice(1);
    const nextPast = [...pastRef.current, annotationsRef.current];
    futureRef.current = nextFuture;
    pastRef.current = nextPast;
    setFuture(nextFuture);
    setPast(nextPast);
    setCurrentAnnotations(next);
    setSelectedId(null);
  }

  function deleteSelected() {
    if (!selectedId) return;
    commit(annotationsRef.current.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }

  function clearAnnotations() {
    if (annotationsRef.current.length) commit([]);
    setSelectedId(null);
  }

  useEffect(() => {
    if (!open) return;
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || Boolean(target?.isContentEditable);
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;

      if (modifier && key === "z") {
        if (isTypingTarget) return;
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && key === "y") {
        if (isTypingTarget) return;
        event.preventDefault();
        redo();
        return;
      }
      if (!isTypingTarget && (event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        deleteSelected();
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [future.length, open, past.length, selectedId]);

  function submit() {
    const canvas = canvasRef.current;
    if (!canvas || !imageReady) return;
    setExportError("");
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          setExportError(copy.annotation.exportFailed);
          return;
        }
        const name = `${(image?.name || "image").replace(/\.[^/.]+$/, "")}-marked.png`;
        onSubmit(new File([blob], name, { type: "image/png" }), instruction.trim());
      }, "image/png");
    } catch {
      setExportError(copy.annotation.exportFailed);
    }
  }

  const toolItems = useMemo(() => [
    ["select", MousePointer2Icon, copy.annotation.tools.select],
    ["brush", PencilIcon, copy.annotation.tools.brush],
    ["arrow", ArrowUpRightIcon, copy.annotation.tools.arrow],
    ["rectangle", RectangleHorizontalIcon, copy.annotation.tools.rectangle],
    ["ellipse", CircleIcon, copy.annotation.tools.ellipse],
    ["text", TypeIcon, copy.annotation.tools.text],
  ] as const, [copy]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden p-4 sm:max-w-6xl">
        <DialogHeader className="min-w-0">
          <DialogTitle>{copy.annotation.title}</DialogTitle>
          <DialogDescription>{copy.annotation.description}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 min-w-0 gap-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(220px,0.32fr)]">
          <div className="flex min-w-0 flex-wrap items-start gap-1 rounded-md border bg-muted/30 p-1 lg:flex-col">
            {toolItems.map(([value, Icon, label]) => (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <Button type="button" variant={tool === value ? "default" : "ghost"} size="icon-sm" aria-label={label} aria-pressed={tool === value} onClick={() => setTool(value)}>
                    <Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ))}
            <div className="hidden h-px w-full bg-border lg:block" />
            <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={copy.annotation.undo} disabled={!past.length} onClick={undo}><Undo2Icon /></Button></TooltipTrigger><TooltipContent side="right">{copy.annotation.undo}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={copy.annotation.redo} disabled={!future.length} onClick={redo}><Redo2Icon /></Button></TooltipTrigger><TooltipContent side="right">{copy.annotation.redo}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={copy.annotation.deleteSelected} disabled={!selectedId} onClick={deleteSelected}><Trash2Icon /></Button></TooltipTrigger><TooltipContent side="right">{copy.annotation.deleteSelected}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={copy.annotation.clear} disabled={!annotations.length} onClick={clearAnnotations}><EraserIcon /></Button></TooltipTrigger><TooltipContent side="right">{copy.annotation.clear}</TooltipContent></Tooltip>
          </div>
          <div ref={canvasStageRef} className="standard-scrollbar image-checkerboard relative flex min-h-0 min-w-0 items-center justify-center overflow-auto rounded-md border p-2">
            {imageReady ? (
              <div className="relative flex max-h-full max-w-full items-center justify-center">
                <canvas ref={canvasRef} tabIndex={0} aria-label={copy.annotation.canvasLabel} className="block h-auto max-h-[58vh] max-w-full touch-none object-contain focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} />
              </div>
            ) : <span role={loadError ? "alert" : undefined} className={cn("max-w-md px-4 text-center text-sm text-muted-foreground", loadError && "text-destructive")}>{loadError ? copy.annotation.loadFailed : copy.annotation.loading}</span>}
            {textAnchor ? (
              <Input
                ref={textInputRef}
                value={textValue}
                aria-label={copy.annotation.textInput}
                placeholder={copy.annotation.textPlaceholder}
                className="absolute z-20 h-8 border-primary bg-background/95 text-sm shadow-md backdrop-blur"
                style={textEditorStyle}
                onChange={(event) => setTextValue(event.target.value)}
                onBlur={finishTextEntry}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelTextEntryRef.current = true;
                    event.currentTarget.blur();
                  }
                }}
              />
            ) : null}
          </div>
          <div className="standard-scrollbar flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto rounded-md border bg-card p-3">
            <div className="grid gap-1">
              <label htmlFor="annotation-size" className="text-xs font-medium text-muted-foreground">{copy.annotation.strokeSize}</label>
              <Input id="annotation-size" type="number" min={2} max={48} value={strokeSize} onChange={(event) => setStrokeSize(Math.min(48, Math.max(2, Number(event.target.value) || 2)))} />
            </div>
            <div className="grid gap-1">
              <label htmlFor="annotation-color" className="text-xs font-medium text-muted-foreground">{copy.annotation.strokeColor}</label>
              <div className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1">
                <Input id="annotation-color" type="color" value={strokeColor} aria-label={copy.annotation.strokeColor} onChange={(event) => setStrokeColor(event.target.value)} className="h-7 w-10 shrink-0 cursor-pointer p-1" />
                <span className="truncate font-mono text-xs text-muted-foreground">{strokeColor.toUpperCase()}</span>
              </div>
            </div>
            <div className="grid min-h-0 gap-1">
              <label htmlFor="annotation-instruction" className="text-xs font-medium text-muted-foreground">{copy.annotation.instructionLabel}</label>
              <Textarea id="annotation-instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={5} className="min-h-24 resize-none" placeholder={copy.annotation.instructionPlaceholder} />
            </div>
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.annotation.originalPrompt}</span>
              <p className="standard-scrollbar max-h-28 overflow-auto rounded-md border bg-muted/20 p-2 text-xs leading-relaxed text-muted-foreground">{originalPrompt || copy.annotation.noPrompt}</p>
            </div>
            {exportError ? <p role="alert" className="text-xs font-medium text-destructive">{exportError}</p> : null}
          </div>
        </div>
        <DialogFooter className="flex-wrap sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}><RotateCcwIcon data-icon="inline-start" />{copy.annotation.cancel}</Button>
          <Button type="button" onClick={submit} disabled={!imageReady}><PencilIcon data-icon="inline-start" />{copy.annotation.submit}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
