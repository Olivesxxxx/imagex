import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { BriefcaseBusinessIcon, CheckIcon, DownloadIcon, EyeIcon, ImageIcon, PencilRulerIcon, PlayIcon, PlusIcon, QuoteIcon, RefreshCwIcon, SaveIcon, Trash2Icon, UploadIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedTabsList, SegmentedTabsTrigger } from "@/components/ui/segmented-tabs";
import { Tabs } from "@/components/ui/tabs";
import { WorkflowHeaderControls } from "@/components/generator-panel";
import { type ConnectionStatus } from "@/hooks/use-image-console";
import { useI18n } from "@/lib/i18n";
import { createDefaultProductSuiteSlots, createProductSuiteBatchId, createProductSuiteTask, deleteProductSuiteTask, DEVELOPMENT_PRODUCT_SUITE_TASK_ID, hashProductSuiteImage, loadProductSuiteTasks, saveProductSuiteTask, type ProductSuiteAsset, type ProductSuiteSlotKey, type ProductSuiteTask } from "@/lib/product-suite";
import { MAX_EDIT_INPUT_IMAGES, type AppSettings, type ConsoleMode, type ImageRequestRecord } from "@/lib/image-console";
import { cn } from "@/lib/utils";
import { Dialog as DialogPrimitive } from "radix-ui";

function assetFromFile(file: File): ProductSuiteAsset {
  return { blob: file, name: file.name, mimeType: file.type || "image/png" };
}

function productAssets(task: ProductSuiteTask): ProductSuiteAsset[] {
  return task.productImages?.length ? task.productImages : (task.productImage ? [task.productImage] : []);
}

function brandAssets(task: ProductSuiteTask): ProductSuiteAsset[] {
  return task.brandAssets?.length ? task.brandAssets : (task.brandAsset ? [task.brandAsset] : []);
}

const PROMPT_REFERENCE_KEYS = ["商品名", "材质颜色", "核心卖点", "卖点1", "卖点2", "卖点3", "卖点4", "卖点5", "卖点6", "卖点7", "卖点8", "卖点9", "卖点10", "尺寸", "品牌语气", "目标平台"] as const;
type PromptReferenceKey = (typeof PROMPT_REFERENCE_KEYS)[number];

const PROMPT_REFERENCE_TOKENS: Record<PromptReferenceKey, string> = {
  商品名: "{{商品名}}",
  材质颜色: "{{材质颜色}}",
  核心卖点: "{{核心卖点}}",
  卖点1: "{{卖点1}}", 卖点2: "{{卖点2}}", 卖点3: "{{卖点3}}", 卖点4: "{{卖点4}}", 卖点5: "{{卖点5}}",
  卖点6: "{{卖点6}}", 卖点7: "{{卖点7}}", 卖点8: "{{卖点8}}", 卖点9: "{{卖点9}}", 卖点10: "{{卖点10}}",
  尺寸: "{{尺寸}}",
  品牌语气: "{{品牌语气}}",
  目标平台: "{{目标平台}}",
};

function promptReferenceValues(task: ProductSuiteTask, language: "zh" | "en"): Record<PromptReferenceKey, string> {
  return {
    商品名: task.name || (language === "en" ? "the product" : "该商品"),
    材质颜色: task.info.materialAndColor || (language === "en" ? "not specified" : "未填写"),
    核心卖点: task.info.sellingPoints || task.info.sellingPointItems.join("\n") || (language === "en" ? "not specified" : "未填写"),
    卖点1: task.info.sellingPointItems[0] || (language === "en" ? "not specified" : "未填写"),
    卖点2: task.info.sellingPointItems[1] || (language === "en" ? "not specified" : "未填写"),
    卖点3: task.info.sellingPointItems[2] || (language === "en" ? "not specified" : "未填写"),
    卖点4: task.info.sellingPointItems[3] || (language === "en" ? "not specified" : "未填写"),
    卖点5: task.info.sellingPointItems[4] || (language === "en" ? "not specified" : "未填写"),
    卖点6: task.info.sellingPointItems[5] || (language === "en" ? "not specified" : "未填写"),
    卖点7: task.info.sellingPointItems[6] || (language === "en" ? "not specified" : "未填写"),
    卖点8: task.info.sellingPointItems[7] || (language === "en" ? "not specified" : "未填写"),
    卖点9: task.info.sellingPointItems[8] || (language === "en" ? "not specified" : "未填写"),
    卖点10: task.info.sellingPointItems[9] || (language === "en" ? "not specified" : "未填写"),
    尺寸: task.info.dimensions || (language === "en" ? "not specified" : "未填写"),
    品牌语气: task.info.brandTone || (language === "en" ? "clean ecommerce product photography" : "干净的电商产品摄影"),
    目标平台: task.info.targetPlatform || (language === "en" ? "ecommerce" : "电商平台"),
  };
}

type PromptReferenceMenuState = { slotKey: ProductSuiteSlotKey; start: number; left: number; top: number } | null;

const PROMPT_REFERENCE_PATTERN = /(\{\{(?:商品名|材质颜色|核心卖点|卖点(?:[1-9]|10)|尺寸|品牌语气|目标平台)\}\})/g;

function promptReferenceKeys(task: ProductSuiteTask): PromptReferenceKey[] {
  const pointCount = Math.min(10, Math.max(1, task.info.sellingPointItems.length));
  return ["商品名", "材质颜色", "核心卖点", ...Array.from({ length: pointCount }, (_, index) => `卖点${index + 1}` as PromptReferenceKey), "尺寸", "品牌语气", "目标平台"];
}

function referenceKeyFromToken(token: string): PromptReferenceKey | null {
  return token.startsWith("{{") && token.endsWith("}}") ? token.slice(2, -2) as PromptReferenceKey : null;
}

function serializePromptEditor(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as HTMLElement;
  const key = element.dataset.referenceKey as PromptReferenceKey | undefined;
  if (key && PROMPT_REFERENCE_TOKENS[key]) return PROMPT_REFERENCE_TOKENS[key];
  return Array.from(node.childNodes).map(serializePromptEditor).join("");
}

function renderPromptEditorDom(root: HTMLElement, template: string, task: ProductSuiteTask, language: "zh" | "en", labels: Record<PromptReferenceKey, string>) {
  const values = promptReferenceValues(task, language);
  root.replaceChildren();
  template.split(PROMPT_REFERENCE_PATTERN).forEach((part) => {
    const key = referenceKeyFromToken(part);
    if (!key) {
      root.appendChild(document.createTextNode(part));
      return;
    }
    const chip = document.createElement("span");
    chip.dataset.referenceKey = key;
    chip.contentEditable = "false";
    chip.title = labels[key];
    chip.className = "inline-flex max-w-full cursor-default select-none items-center rounded bg-sky-100 px-1 font-semibold text-sky-800 align-baseline dark:bg-sky-900/60 dark:text-sky-100";
    chip.textContent = values[key];
    root.appendChild(chip);
  });
}

function PromptEditor({
  slotKey,
  slotId,
  enabled,
  template,
  task,
  language,
  ariaLabel,
  labels,
  onInput,
  onKeyDown,
  onPaste,
  onBlur,
  editorRef,
}: {
  slotKey: ProductSuiteSlotKey;
  slotId: string;
  enabled: boolean;
  template: string;
  task: ProductSuiteTask;
  language: "zh" | "en";
  ariaLabel: string;
  labels: Record<PromptReferenceKey, string>;
  onInput: (event: FormEvent<HTMLDivElement>) => void;
  onKeyDown: (slotKey: ProductSuiteSlotKey, event: KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  onBlur: () => void;
  editorRef: (element: HTMLDivElement | null) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const valueSignature = Object.values(promptReferenceValues(task, language)).join("\u0000");
  const previousSignatureRef = useRef(valueSignature);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const signatureChanged = previousSignatureRef.current !== valueSignature;
    previousSignatureRef.current = valueSignature;
    if (!signatureChanged && serializePromptEditor(root) === template) return;
    renderPromptEditorDom(root, template, task, language, labels);
  }, [labels, language, task, template, valueSignature]);

  return (
    <div
      id={slotId}
      ref={(element) => { rootRef.current = element; editorRef(element); }}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="true"
      contentEditable={enabled}
      suppressContentEditableWarning
      spellCheck={false}
      onInput={onInput}
      onKeyDown={(event) => onKeyDown(slotKey, event)}
      onPaste={onPaste}
      onBlur={onBlur}
      className="standard-scrollbar min-h-32 max-h-64 resize-y overflow-auto whitespace-pre-wrap break-words rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-6 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  );
}

function modelLength(node: Node): number {
  return serializePromptEditor(node).length;
}

function modelOffsetAt(root: HTMLElement, target: Node, targetOffset: number): number {
  const parentElement = target.parentNode instanceof Element ? target.parentNode : null;
  let referenceNode: HTMLElement | null = target.nodeType === Node.ELEMENT_NODE && (target as HTMLElement).dataset.referenceKey
    ? target as HTMLElement
    : parentElement?.closest<HTMLElement>("[data-reference-key]") || null;
  if (referenceNode && !root.contains(referenceNode)) referenceNode = null;

  // A non-editable reference chip can still be reported as the Range
  // container by the browser. Its rendered text length is not the model token
  // length, so normalize any position inside the chip to its two boundaries.
  if (referenceNode) {
    let before = 0;
    let found = false;
    const visitBefore = (node: Node): void => {
      if (found) return;
      if (node === referenceNode) {
        found = true;
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).dataset.referenceKey) {
        before += modelLength(node);
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        before += node.textContent?.length || 0;
        return;
      }
      node.childNodes.forEach(visitBefore);
    };
    visitBefore(root);
    const atStart = target === referenceNode ? targetOffset === 0 : targetOffset === 0;
    return before + (atStart ? 0 : modelLength(referenceNode));
  }

  let total = 0;
  let found = false;
  const visit = (node: Node): void => {
    if (found) return;
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) total += Math.min(targetOffset, node.textContent?.length || 0);
      else total += Array.from(node.childNodes).slice(0, targetOffset).reduce((sum, child) => sum + modelLength(child), 0);
      found = true;
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).dataset.referenceKey) {
      total += modelLength(node);
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      total += node.textContent?.length || 0;
      return;
    }
    node.childNodes.forEach(visit);
  };
  visit(root);
  return total;
}

function editorSelection(root: HTMLElement): { start: number; end: number } {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !root.contains(selection.anchorNode)) return { start: modelLength(root), end: modelLength(root) };
  // Browsers may expose a collapsed contenteditable caret through an element
  // container with a stale anchor offset. The range focus position is the
  // canonical insertion point for a collapsed selection.
  const collapsed = selection.isCollapsed;
  const range = selection.getRangeAt(0);
  const startNode = collapsed ? range.startContainer : selection.anchorNode!;
  const startOffset = collapsed ? range.startOffset : selection.anchorOffset;
  const start = modelOffsetAt(root, startNode, startOffset);
  const end = collapsed
    ? start
    : selection.focusNode && root.contains(selection.focusNode)
      ? modelOffsetAt(root, selection.focusNode, selection.focusOffset)
      : start;
  return start <= end ? { start, end } : { start: end, end: start };
}

function setEditorCaret(root: HTMLElement, offset: number) {
  const range = document.createRange();
  let remaining = Math.max(0, offset);
  let placed = false;
  const visit = (node: Node): void => {
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length || 0;
      if (remaining <= length) {
        range.setStart(node, remaining);
        range.collapse(true);
        placed = true;
      } else remaining -= length;
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).dataset.referenceKey) {
      const parent = node.parentNode;
      if (!parent) return;
      const index = Array.prototype.indexOf.call(parent.childNodes, node);
      if (remaining <= modelLength(node)) {
        range.setStart(parent, remaining === 0 ? index : index + 1);
        range.collapse(true);
        placed = true;
      } else remaining -= modelLength(node);
      return;
    }
    node.childNodes.forEach(visit);
  };
  visit(root);
  if (!placed) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function insertEditorText(root: HTMLElement, text: string, onChange: (value: string) => void) {
  const current = serializePromptEditor(root);
  const { start, end } = editorSelection(root);
  const next = `${current.slice(0, start)}${text}${current.slice(end)}`;
  onChange(next);
  requestAnimationFrame(() => {
    root.focus();
    setEditorCaret(root, start + text.length);
  });
}

const SLOT_ACCENT_CLASSES: Partial<Record<ProductSuiteSlotKey, { border: string; background: string }>> = {
  hero: { border: "border-rose-200", background: "bg-rose-50/50" },
  whiteBackground: { border: "border-slate-300", background: "bg-slate-50/70" },
  detail: { border: "border-amber-200", background: "bg-amber-50/50" },
  size: { border: "border-sky-200", background: "bg-sky-50/50" },
  closeUp: { border: "border-emerald-200", background: "bg-emerald-50/50" },
  scene: { border: "border-violet-200", background: "bg-violet-50/50" },
};

function AssetDropZone({
  label,
  hint,
  chooseLabel,
  removeLabel,
  previewUrls,
  onFiles,
  onRemove,
}: {
  label: string;
  hint: string;
  chooseLabel: string;
  removeLabel: string;
  previewUrls: string[];
  onFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  function addFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length) onFiles(images);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) {
      files.push(...Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file)));
    }
    if (!files.length) return;
    event.preventDefault();
    addFiles(files);
  }

  function handleDrag(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className={cn(
          "flex min-h-24 min-w-0 flex-col gap-2 rounded-md border border-dashed p-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          dragActive ? "border-foreground/50 bg-muted/50" : "bg-muted/10",
        )}
        onPaste={handlePaste}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <div className="relative flex min-h-20 min-w-0 items-center gap-2 p-1">
          {previewUrls.length ? (
            <div className="standard-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
              {previewUrls.map((previewUrl, index) => (
                <div key={`${previewUrl}-${index}`} className="relative size-20 shrink-0 overflow-hidden rounded-md border bg-background">
                  <button type="button" className="block size-full cursor-zoom-in" aria-label={`${label} ${index + 1}`} onClick={() => setPreviewIndex(index)}>
                    <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                  <Button type="button" variant="secondary" size="icon-xs" className="absolute right-1 top-1 shadow-sm" aria-label={index === 0 ? removeLabel : `${removeLabel} ${index + 1}`} onClick={() => onRemove(index)}><XIcon /></Button>
                </div>
              ))}
            </div>
          ) : <div className="flex min-h-16 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"><UploadIcon className="size-5 shrink-0" /><span>{hint}</span></div>}
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => inputRef.current?.click()}><UploadIcon data-icon="inline-start" />{chooseLabel}</Button>
        </div>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            addFiles(Array.from(event.currentTarget.files || []));
            event.currentTarget.value = "";
          }}
        />
      </div>
      <DialogPrimitive.Root open={previewIndex !== null} onOpenChange={(open) => { if (!open) setPreviewIndex(null); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content onClick={() => setPreviewIndex(null)} aria-describedby={undefined} className="fixed inset-0 z-50 flex items-center justify-center outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-200">
            <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
            {previewIndex !== null && previewUrls[previewIndex] ? <img src={previewUrls[previewIndex]} alt={`${label} ${previewIndex + 1}`} className="block max-h-[85vh] w-auto max-w-[calc(100vw-7rem)] object-contain" onClick={(event) => event.stopPropagation()} /> : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

export function ProductSuitePanel({
  open,
  onOpenChange,
  onModeChange,
  onDraftStateChange,
  settings,
  updateSettings,
  connectionStatus,
  setSettingsOpen,
  onOpenQuickStart,
  onSubmitBatch,
  onSubmitSlot,
  onSelectRequest,
  onPreviewRequest,
  onExportRequest,
  onExportSuite,
  onClearVersions,
  onUseAsReference,
  onAnnotateResult,
  requestRecords,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: ConsoleMode) => void;
  onDraftStateChange: (hasDraft: boolean) => void;
  settings: AppSettings;
  updateSettings: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  connectionStatus: ConnectionStatus;
  setSettingsOpen: (open: boolean) => void;
  onOpenQuickStart: () => void;
  onSubmitBatch: (task: ProductSuiteTask) => number;
  onSubmitSlot: (task: ProductSuiteTask, slotKey: ProductSuiteSlotKey, version: number) => number;
  onSelectRequest: (requestId: string) => void;
  onPreviewRequest: (requestId: string) => void;
  onExportRequest: (requestId: string) => void;
  onExportSuite: (task: ProductSuiteTask) => Promise<{ count: number; filename: string }>;
  onClearVersions: (taskId: string, slotKey?: ProductSuiteSlotKey, batchId?: string) => void;
  onUseAsReference: (requestId: string) => void;
  onAnnotateResult: (requestId: string) => void;
  requestRecords: ImageRequestRecord[];
}) {
  const { copy, language } = useI18n();
  const suiteCopy = copy.productSuite;
  const [tasks, setTasks] = useState<ProductSuiteTask[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductSuiteTask | null>(null);
  const [productImageUrls, setProductImageUrls] = useState<string[]>([]);
  const [brandAssetUrls, setBrandAssetUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittingSlotKey, setSubmittingSlotKey] = useState<ProductSuiteSlotKey | null>(null);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [exportingSuite, setExportingSuite] = useState(false);
  const [clearVersionsTarget, setClearVersionsTarget] = useState<ProductSuiteSlotKey | "all" | null>(null);
  const [pendingProductImageChange, setPendingProductImageChange] = useState<{ assets: ProductSuiteAsset[]; hash: string } | null>(null);
  const [viewedVersionBySlot, setViewedVersionBySlot] = useState<Partial<Record<ProductSuiteSlotKey, number>>>({});
  const loadedOnceRef = useRef(false);
  const slotPromptRefs = useRef<Partial<Record<ProductSuiteSlotKey, HTMLDivElement | null>>>({});
  const [promptReferenceMenu, setPromptReferenceMenu] = useState<PromptReferenceMenuState>(null);
  const promptReferenceAnchorRef = useRef<Partial<Record<ProductSuiteSlotKey, number | null>>>({});
  const referenceLabels = suiteCopy.referenceLabels as Record<PromptReferenceKey, string>;

  useEffect(() => {
    onDraftStateChange(Boolean(draft));
  }, [draft, onDraftStateChange]);

  useEffect(() => {
    if (import.meta.env.DEV && settings.developmentMode) return;
    setTasks((current) => current.filter((task) => task.id !== DEVELOPMENT_PRODUCT_SUITE_TASK_ID));
    if (draft?.id === DEVELOPMENT_PRODUCT_SUITE_TASK_ID) {
      setDraft(null);
      setActiveId(null);
    }
  }, [draft?.id, settings.developmentMode]);

  useEffect(() => {
    if (loadedOnceRef.current && !(import.meta.env.DEV && settings.developmentMode)) return;
    loadedOnceRef.current = true;
    let cancelled = false;
    setLoading(true);
    void loadProductSuiteTasks().then(async (loaded) => {
      if (cancelled) return;
      const fixturesEnabled = import.meta.env.DEV && settings.developmentMode;
      const userTasks = loaded.filter((task) => task.id !== DEVELOPMENT_PRODUCT_SUITE_TASK_ID);
      let nextTasks = userTasks;
      if (fixturesEnabled) {
        // Rebuild the synthetic task so newly added slots and example fields are
        // visible even when an older fixture exists in IndexedDB.
        const { createDevelopmentProductSuiteTask } = await import("@/lib/product-suite-development");
        const fixture = await saveProductSuiteTask(await createDevelopmentProductSuiteTask(language === "en" ? "en" : "zh"));
        nextTasks = [fixture, ...userTasks];
      } else if (loaded.length !== userTasks.length) {
        void deleteProductSuiteTask(DEVELOPMENT_PRODUCT_SUITE_TASK_ID);
      }
      if (cancelled) return;
      setTasks(nextTasks);
      const first = nextTasks[0] || null;
      setActiveId(first?.id || null);
      setDraft(first ? structuredClone(first) : null);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [language, open, settings.developmentMode]);

  useEffect(() => {
    const urls = draft ? productAssets(draft).map((asset) => URL.createObjectURL(asset.blob)) : [];
    setProductImageUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [draft?.productImages, draft?.productImage]);

  useEffect(() => {
    const urls = draft ? brandAssets(draft).map((asset) => URL.createObjectURL(asset.blob)) : [];
    setBrandAssetUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [draft?.brandAssets, draft?.brandAsset]);

  useEffect(() => {
    setViewedVersionBySlot({});
  }, [draft?.id, draft?.productBatchId]);

  const activeTaskName = useMemo(() => draft?.name || suiteCopy.untitled, [draft?.name, suiteCopy.untitled]);
  const slotRequestHistory = useMemo(() => {
    const history = new Map<string, ImageRequestRecord[]>();
    if (!draft) return history;
    for (const request of requestRecords) {
      if (request.productSuiteTaskId !== draft.id || !request.productSuiteSlotKey) continue;
      const belongsToCurrentBatch = request.productSuiteBatchId === draft.productBatchId
        || (!request.productSuiteBatchId && draft.productBatchId === "batch-1");
      if (!belongsToCurrentBatch) continue;
      const slotHistory = history.get(request.productSuiteSlotKey) || [];
      slotHistory.push(request);
      history.set(request.productSuiteSlotKey, slotHistory);
    }
    for (const slotHistory of history.values()) {
      slotHistory.sort((left, right) =>
        (right.productSuiteVersion || 1) - (left.productSuiteVersion || 1) || right.createdAt - left.createdAt,
      );
    }
    return history;
  }, [draft, requestRecords]);
  const latestSlotRequests = useMemo(() => {
    const latest = new Map<string, ImageRequestRecord>();
    for (const [slotKey, history] of slotRequestHistory) {
      if (history[0]) latest.set(slotKey, history[0]);
    }
    return latest;
  }, [slotRequestHistory]);
  const failedSlotKeys = useMemo(() => {
    if (!draft) return [];
    return draft.slots
      .filter((slot) => slot.enabled && latestSlotRequests.get(slot.key)?.status === "error")
      .map((slot) => slot.key);
  }, [draft, latestSlotRequests]);
  const completedSlotCount = useMemo(() => {
    if (!draft) return 0;
    return draft.slots.filter((slot) => (slotRequestHistory.get(slot.key) || []).some((request) => request.status === "done")).length;
  }, [draft, slotRequestHistory]);
  const hasVersionRecords = useMemo(() => Array.from(slotRequestHistory.values()).some((history) => history.length > 0), [slotRequestHistory]);

  function slotStatusLabel(request: ImageRequestRecord | undefined) {
    if (!request) return suiteCopy.slotNotSubmitted;
    if (request.status === "queued") return suiteCopy.slotQueued;
    if (request.status === "running") return suiteCopy.slotRunning;
    if (request.status === "done") return suiteCopy.slotDone;
    if (request.status === "canceled") return suiteCopy.slotCanceled;
    return suiteCopy.slotFailed;
  }

  function updateDraft(updater: (current: ProductSuiteTask) => ProductSuiteTask) {
    setDraft((current) => current ? updater(current) : current);
  }

  function updateSellingPoint(index: number, value: string) {
    updateDraft((current) => {
      const items = [...current.info.sellingPointItems];
      while (items.length <= index) items.push("");
      items[index] = value;
      return { ...current, info: { ...current.info, sellingPointItems: items, sellingPoints: items.filter((item) => item.trim()).join("\n") } };
    });
  }

  function addSellingPoint() {
    updateDraft((current) => current.info.sellingPointItems.length >= 10
      ? current
      : { ...current, info: { ...current.info, sellingPointItems: [...current.info.sellingPointItems, ""] } });
  }

  function removeSellingPoint(index: number) {
    updateDraft((current) => {
      const items = current.info.sellingPointItems.filter((_, itemIndex) => itemIndex !== index);
      return { ...current, info: { ...current.info, sellingPointItems: items, sellingPoints: items.filter((item) => item.trim()).join("\n") } };
    });
  }

  function createTask() {
    const next = createProductSuiteTask(Date.now(), language === "en" ? "en" : "zh");
    setTasks((current) => [next, ...current]);
    setActiveId(next.id);
    setDraft(next);
  }

  async function saveDraft() {
    if (!draft) return;
    const saved = await saveProductSuiteTask(draft);
    setTasks((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setDraft(saved);
    setActiveId(saved.id);
    return saved;
  }

  async function removeTask() {
    if (!draft) return;
    await deleteProductSuiteTask(draft.id);
    const nextTasks = tasks.filter((item) => item.id !== draft.id);
    setTasks(nextTasks);
    const next = nextTasks[0] || null;
    setActiveId(next?.id || null);
    setDraft(next ? structuredClone(next) : null);
  }

  function applyProductImageChange(assets: ProductSuiteAsset[], hash: string, createNewBatch: boolean) {
    updateDraft((current) => ({
      ...current,
      productImage: assets[0] || null,
      productImages: assets,
      productImageHash: hash,
      ...(createNewBatch
        ? {
            productBatchId: createProductSuiteBatchId(),
            productBatchNumber: current.productBatchNumber + 1,
            slots: current.slots.map((slot) => ({ ...slot, selectedVersion: null })),
          }
        : {}),
    }));
    setPendingProductImageChange(null);
  }

  async function hashProductAssets(assets: ProductSuiteAsset[]) {
    const hashes = await Promise.all(assets.map((asset) => hashProductSuiteImage(asset.blob)));
    return hashes.length === 1 ? hashes[0] : hashes.join(":");
  }

  async function setAssetFiles(files: File[], field: "productImage" | "brandAsset") {
    if (!draft || !files.length) return;
    const additions = files.map(assetFromFile);
    if (field === "brandAsset") {
      updateDraft((current) => {
        const assets = [...brandAssets(current), ...additions];
        return { ...current, brandAsset: assets[0] || null, brandAssets: assets };
      });
      return;
    }

    const nextAssets = [...productAssets(draft), ...additions];
    await setProductAssets(nextAssets);
  }

  async function setProductAssets(assets: ProductSuiteAsset[], options?: { suppressBatchPrompt?: boolean }) {
    if (!draft) return;
    if (!assets.length) {
      updateDraft((current) => ({ ...current, productImage: null, productImages: [], productImageHash: "" }));
      setPendingProductImageChange(null);
      return;
    }
    const hasTaskRequests = requestRecords.some((request) => request.productSuiteTaskId === draft.id);
    if (!hasTaskRequests) {
      updateDraft((current) => ({ ...current, productImage: assets[0] || null, productImages: assets, productImageHash: "" }));
      const hash = await hashProductAssets(assets);
      updateDraft((current) => current.productImages === assets ? { ...current, productImageHash: hash } : current);
      return;
    }

    const hash = await hashProductAssets(assets);
    const currentImageHash = draft.productImageHash || await hashProductAssets(productAssets(draft));
    if (hash === currentImageHash || options?.suppressBatchPrompt) {
      applyProductImageChange(assets, hash, false);
      return;
    }
    setPendingProductImageChange({ assets, hash });
  }

  async function removeAsset(index: number, field: "productImage" | "brandAsset") {
    if (!draft) return;
    const current = field === "productImage" ? productAssets(draft) : brandAssets(draft);
    const next = current.filter((_, currentIndex) => currentIndex !== index);
    if (field === "productImage") {
      await setProductAssets(next, { suppressBatchPrompt: true });
      return;
    }
    updateDraft((task) => ({ ...task, brandAsset: next[0] || null, brandAssets: next }));
  }

  function selectTask(task: ProductSuiteTask) {
    setActiveId(task.id);
    setDraft(structuredClone(task));
  }

  function updateSlot(slotKey: ProductSuiteSlotKey, promptTemplate: string) {
    updateDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) => slot.key === slotKey ? { ...slot, promptTemplate } : slot),
    }));
  }

  function insertPromptReference(slotKey: ProductSuiteSlotKey, key: PromptReferenceKey, rangeStart?: number, rangeEnd?: number) {
    const editor = slotPromptRefs.current[slotKey];
    const token = PROMPT_REFERENCE_TOKENS[key];
    const current = draft?.slots.find((slot) => slot.key === slotKey)?.promptTemplate || "";
    const anchorStart = promptReferenceAnchorRef.current[slotKey] ?? null;
    const fallbackSelection = editor ? editorSelection(editor) : { start: current.length, end: current.length };
    const start = anchorStart !== null ? anchorStart : (rangeStart ?? fallbackSelection.start);
    const end = anchorStart !== null ? start + 1 : (rangeEnd ?? fallbackSelection.end);
    if (anchorStart !== null && current[start] !== "/") {
      promptReferenceAnchorRef.current[slotKey] = null;
      setPromptReferenceMenu(null);
      return;
    }
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
    promptReferenceAnchorRef.current[slotKey] = null;
    updateSlot(slotKey, next);
    requestAnimationFrame(() => {
      const nextEditor = slotPromptRefs.current[slotKey];
      if (!nextEditor) return;
        const cursor = start + token.length;
      nextEditor.focus();
      setEditorCaret(nextEditor, cursor);
    });
  }

  function handlePromptKeyDown(slotKey: ProductSuiteSlotKey, event: KeyboardEvent<HTMLDivElement>) {
    const editor = event.currentTarget;
    const current = draft?.slots.find((slot) => slot.key === slotKey)?.promptTemplate || "";
    const selection = editorSelection(editor);
    if (!event.ctrlKey && !event.metaKey && !event.altKey && selection.start === selection.end) {
      const cursor = selection.start;
      const tokenPattern = PROMPT_REFERENCE_PATTERN;
      let match: RegExpExecArray | null;
      while ((match = tokenPattern.exec(current))) {
        const tokenEnd = match.index + match[0].length;
        const removeToken = event.key === "Backspace" && cursor === tokenEnd
          ? { start: match.index, end: tokenEnd }
          : event.key === "Delete" && cursor === match.index
            ? { start: match.index, end: tokenEnd }
            : null;
        if (!removeToken) continue;
        event.preventDefault();
        const next = `${current.slice(0, removeToken.start)}${current.slice(removeToken.end)}`;
        updateSlot(slotKey, next);
        requestAnimationFrame(() => {
          const nextEditor = slotPromptRefs.current[slotKey];
          if (!nextEditor) return;
          nextEditor.focus();
          setEditorCaret(nextEditor, removeToken.start);
        });
        return;
      }
    }
    if (event.key === "Escape") setPromptReferenceMenu(null);
  }

  function handlePromptInput(slotKey: ProductSuiteSlotKey, event: FormEvent<HTMLDivElement>) {
    const editor = event.currentTarget;
    const value = serializePromptEditor(editor);
    const inputEvent = event.nativeEvent as InputEvent;
    const insertedSlash = inputEvent.inputType === "insertText" && inputEvent.data === "/";
    if (insertedSlash) {
      const caret = editorSelection(editor).start;
      const slashStart = Math.max(0, caret - 1);
      const selection = window.getSelection();
      const caretRect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
      const editorRect = editor.getBoundingClientRect();
      const containerRect = editor.parentElement?.getBoundingClientRect() || editorRect;
      promptReferenceAnchorRef.current[slotKey] = slashStart;
      updateSlot(slotKey, value);
      requestAnimationFrame(() => {
        const nextEditor = slotPromptRefs.current[slotKey];
        if (!nextEditor) return;
        nextEditor.focus();
        setEditorCaret(nextEditor, slashStart + 1);
        setPromptReferenceMenu({
          slotKey,
          start: slashStart,
          left: Math.round((caretRect?.left || editorRect.left) - containerRect.left),
          top: Math.round((caretRect?.bottom || editorRect.top + 28) - containerRect.top + 4),
        });
      });
      return;
    }

    const anchor = promptReferenceAnchorRef.current[slotKey];
    if (anchor !== null && anchor !== undefined && value[anchor] !== "/") {
      promptReferenceAnchorRef.current[slotKey] = null;
      setPromptReferenceMenu(null);
    }
    updateSlot(slotKey, value);
  }

  function toggleSlot(slotKey: ProductSuiteSlotKey, enabled: boolean) {
    updateDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) => slot.key === slotKey ? { ...slot, enabled } : slot),
    }));
  }

  function resetSlot(slotKey: ProductSuiteSlotKey) {
    const defaults = createDefaultProductSuiteSlots(language === "en" ? "en" : "zh");
    updateDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) => {
        const next = defaults.find((item) => item.key === slotKey);
        return slot.key === slotKey && next ? { ...slot, promptTemplate: next.promptTemplate } : slot;
      }),
    }));
  }

  function addCustomSlot() {
    updateDraft((current) => {
      const nextIndex = current.slots.filter((slot) => slot.key.startsWith("custom-")).length + 1;
      const key = `custom-${Date.now()}-${nextIndex}` as ProductSuiteSlotKey;
      return {
        ...current,
        slots: [...current.slots, {
          key,
          label: language === "en" ? `Custom slot ${nextIndex}` : `自定义槽位${nextIndex}`,
          enabled: true,
          promptTemplate: "",
          selectedVersion: null,
        }],
      };
    });
  }

  function removeCustomSlot(slotKey: ProductSuiteSlotKey) {
    updateDraft((current) => ({ ...current, slots: current.slots.filter((slot) => slot.key !== slotKey) }));
    if (promptReferenceMenu?.slotKey === slotKey) setPromptReferenceMenu(null);
  }

  function updateSlotLabel(slotKey: ProductSuiteSlotKey, label: string) {
    updateDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) => slot.key === slotKey ? { ...slot, label } : slot),
    }));
  }

  function openSubmitConfirmation() {
    if (!draft?.productImage) {
      toast.error(suiteCopy.missingProductImage);
      return;
    }
    if (productAssets(draft).length > MAX_EDIT_INPUT_IMAGES || (draft.slots.some((slot) => slot.enabled && slot.key === "hero") && productAssets(draft).length + brandAssets(draft).length > MAX_EDIT_INPUT_IMAGES)) {
      toast.error(suiteCopy.referenceLimit(MAX_EDIT_INPUT_IMAGES));
      return;
    }
    if (!draft.slots.some((slot) => slot.enabled)) {
      toast.error(suiteCopy.noEnabledSlots);
      return;
    }
    setSubmitConfirmOpen(true);
  }

  async function submitBatch() {
    if (!draft || submitting) return;
    setSubmitting(true);
    try {
      const saved = await saveProductSuiteTask(draft);
      setTasks((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraft(saved);
      setActiveId(saved.id);
      const submittedCount = onSubmitBatch(saved);
      if (submittedCount > 0) {
        toast.success(suiteCopy.submitted(submittedCount));
        setSubmitConfirmOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSlot(slotKey: ProductSuiteSlotKey) {
    if (!draft || submitting || submittingSlotKey || retryingFailed) return;
    if (productAssets(draft).length > MAX_EDIT_INPUT_IMAGES || (slotKey === "hero" && productAssets(draft).length + brandAssets(draft).length > MAX_EDIT_INPUT_IMAGES)) {
      toast.error(suiteCopy.referenceLimit(MAX_EDIT_INPUT_IMAGES));
      return;
    }
    const slotRequest = latestSlotRequests.get(slotKey);
    if (!slotRequest || !["done", "error", "canceled"].includes(slotRequest.status)) return;
    setSubmittingSlotKey(slotKey);
    try {
      const saved = await saveProductSuiteTask(draft);
      setTasks((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraft(saved);
      setActiveId(saved.id);
      const version = requestRecords
        .filter((request) => request.productSuiteTaskId === saved.id && request.productSuiteSlotKey === slotKey && (request.productSuiteBatchId === saved.productBatchId || (!request.productSuiteBatchId && saved.productBatchId === "batch-1")))
        .reduce((max, request) => Math.max(max, request.productSuiteVersion || 1), 0) + 1;
      const submittedCount = onSubmitSlot(saved, slotKey, version);
      if (submittedCount > 0) toast.success(suiteCopy.slotResubmitted);
    } finally {
      setSubmittingSlotKey(null);
    }
  }

  async function retryFailedSlots() {
    if (!draft || submitting || submittingSlotKey || retryingFailed || !failedSlotKeys.length) return;
    setRetryingFailed(true);
    try {
      const saved = await saveProductSuiteTask(draft);
      setTasks((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraft(saved);
      setActiveId(saved.id);
      let submittedCount = 0;
      for (const slotKey of failedSlotKeys) {
        const version = requestRecords
          .filter((request) => request.productSuiteTaskId === saved.id && request.productSuiteSlotKey === slotKey && (request.productSuiteBatchId === saved.productBatchId || (!request.productSuiteBatchId && saved.productBatchId === "batch-1")))
          .reduce((max, request) => Math.max(max, request.productSuiteVersion || 1), 0) + 1;
        submittedCount += onSubmitSlot(saved, slotKey, version);
      }
      if (submittedCount > 0) toast.success(suiteCopy.failedSlotsResubmitted(submittedCount));
    } finally {
      setRetryingFailed(false);
    }
  }

  async function selectFinalVersion(slotKey: ProductSuiteSlotKey, version: number) {
    if (!draft) return;
    const nextTask: ProductSuiteTask = {
      ...draft,
      slots: draft.slots.map((slot) => slot.key === slotKey ? { ...slot, selectedVersion: version } : slot),
    };
    setDraft(nextTask);
    const saved = await saveProductSuiteTask(nextTask);
    setTasks((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setDraft(saved);
    setActiveId(saved.id);
    toast.success(suiteCopy.finalVersionSelected(version));
  }

  async function clearVersionHistory() {
    if (!draft || !clearVersionsTarget) return;
    const target = clearVersionsTarget;
    const nextTask: ProductSuiteTask = {
      ...draft,
      slots: draft.slots.map((slot) => target === "all" || slot.key === target ? { ...slot, selectedVersion: null } : slot),
    };
    const saved = await saveProductSuiteTask(nextTask);
    setTasks((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setDraft(saved);
    setActiveId(saved.id);
    onClearVersions(saved.id, target === "all" ? undefined : target, saved.productBatchId);
    setClearVersionsTarget(null);
    toast.success(suiteCopy.versionsCleared);
  }

  async function exportSuite() {
    if (!draft || exportingSuite || completedSlotCount === 0) return;
    setExportingSuite(true);
    try {
      const saved = await saveProductSuiteTask(draft);
      setTasks((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraft(saved);
      setActiveId(saved.id);
      const result = await onExportSuite(saved);
      toast.success(suiteCopy.exportSuiteSuccess(result.count));
    } catch (error) {
      toast.error((error as Error).message || suiteCopy.exportSuiteFailed);
    } finally {
      setExportingSuite(false);
    }
  }

  const taskSidebarTarget = typeof document !== "undefined" ? document.getElementById("product-suite-task-sidebar") : null;
  const taskSidebar = (
    <section className="flex min-h-0 flex-1 flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-none" aria-label={`${suiteCopy.title} list`}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">{suiteCopy.title}</span>
      </div>
      <Button type="button" variant="outline" size="sm" className="h-8 w-full shrink-0 rounded-md px-3" onClick={createTask}>
        <PlusIcon data-icon="inline-start" />{suiteCopy.newTask}
      </Button>
      <div className="standard-scrollbar -mr-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pr-0">
        {tasks.map((task) => (
          <button key={task.id} type="button" className={`flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm ${activeId === task.id ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted"}`} onClick={() => selectTask(task)}>
            <ImageIcon className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{task.name || suiteCopy.untitled}</span>
          </button>
        ))}
        {import.meta.env.DEV && settings.developmentMode ? Array.from({ length: 19 }, (_, index) => (
          <button key={`development-sidebar-placeholder-${index}`} type="button" disabled aria-disabled="true" title={suiteCopy.developmentTaskPlaceholder(index + 2)} className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md border border-dashed border-border/70 bg-muted/30 px-2.5 py-1.5 text-left text-sm text-muted-foreground opacity-70">
            <ImageIcon className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{suiteCopy.developmentTaskPlaceholder(index + 2)}</span>
          </button>
        )) : null}
        {!tasks.length && !loading ? <p className="px-1 py-1.5 text-xs text-muted-foreground">{suiteCopy.empty}</p> : null}
      </div>
    </section>
  );

  const sellingPointItems = draft?.info.sellingPointItems?.length ? draft.info.sellingPointItems : [""];

  if (!open) return null;

  return (
    <>
      {taskSidebarTarget ? createPortal(taskSidebar, taskSidebarTarget) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <section
        aria-label={suiteCopy.title}
        className={cn(
          "isolate flex min-w-0 max-w-full flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-none",
          !draft && "h-full min-h-full",
        )}
      >
        <header className="shrink-0">
          <div className="flex w-full min-w-0 max-w-full flex-wrap items-end gap-2.5">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex h-4 min-h-4 items-center text-xs font-medium leading-none text-muted-foreground">{copy.generator.mode}</span>
              <Tabs
                value="workflow"
                onValueChange={(value) => {
                  if (value === "workflow") return;
                  onModeChange(value as ConsoleMode);
                  onOpenChange(false);
                }}
                className="w-fit max-w-full"
              >
                <SegmentedTabsList>
                  <SegmentedTabsTrigger value="generate" className="min-w-20">{copy.generator.generate}</SegmentedTabsTrigger>
                  <SegmentedTabsTrigger value="edit" className="min-w-20">{copy.generator.edit}</SegmentedTabsTrigger>
                  <SegmentedTabsTrigger value="workflow" className="min-w-20">{copy.generator.workflow}</SegmentedTabsTrigger>
                </SegmentedTabsList>
              </Tabs>
            </div>
            <WorkflowHeaderControls
              settings={settings}
              updateSettings={updateSettings}
              connectionStatus={connectionStatus}
              setSettingsOpen={setSettingsOpen}
              onOpenQuickStart={onOpenQuickStart}
            />
          </div>
        </header>

        <div className={draft ? "min-w-0" : "flex min-h-0 flex-1 flex-col"}>
            <div className={draft ? "grid w-full min-w-0 max-w-full gap-1" : "flex min-h-0 flex-1 flex-col"}>
          {draft ? (
            <section className="grid min-w-0 gap-3">
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2">
                <PencilRulerIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{suiteCopy.taskConfiguration}</h3>
                  <p className="truncate text-xs text-foreground/80">{draft.name || suiteCopy.untitled}</p>
                  <p className="truncate text-xs text-muted-foreground">{suiteCopy.batchLabel(draft.productBatchNumber)}</p>
                </div>
              </div>
              <div className="grid min-w-0 gap-3">
                <div className="grid gap-1.5">
                  <label htmlFor="product-suite-name" className="text-xs font-medium text-muted-foreground">{suiteCopy.productName}</label>
                  <Input id="product-suite-name" value={draft.name} onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))} placeholder={suiteCopy.productNamePlaceholder} />
                </div>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <AssetDropZone
                    label={suiteCopy.productReference}
                    hint={suiteCopy.dropImageHint}
                    chooseLabel={suiteCopy.chooseImage}
                    removeLabel={suiteCopy.removeImage}
                    previewUrls={productImageUrls}
                    onFiles={(files) => void setAssetFiles(files, "productImage")}
                    onRemove={(index) => void removeAsset(index, "productImage")}
                  />
                  <AssetDropZone
                    label={suiteCopy.brandAsset}
                    hint={suiteCopy.dropImageHint}
                    chooseLabel={suiteCopy.chooseImage}
                    removeLabel={suiteCopy.removeImage}
                    previewUrls={brandAssetUrls}
                    onFiles={(files) => void setAssetFiles(files, "brandAsset")}
                    onRemove={(index) => void removeAsset(index, "brandAsset")}
                  />
                </div>
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5"><label htmlFor="product-suite-material" className="text-xs font-medium text-muted-foreground">{suiteCopy.materialAndColor}</label><Input id="product-suite-material" value={draft.info.materialAndColor} onChange={(event) => updateDraft((current) => ({ ...current, info: { ...current.info, materialAndColor: event.target.value } }))} /></div>
                <div className="grid gap-1.5"><label htmlFor="product-suite-platform" className="text-xs font-medium text-muted-foreground">{suiteCopy.targetPlatform}</label><Input id="product-suite-platform" value={draft.info.targetPlatform} onChange={(event) => updateDraft((current) => ({ ...current, info: { ...current.info, targetPlatform: event.target.value } }))} placeholder={suiteCopy.targetPlatformPlaceholder} /></div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <span className="text-xs font-medium text-muted-foreground">{suiteCopy.sellingPoints}</span>
                  <div className="grid min-w-0 gap-2">
                    {sellingPointItems.map((value, index) => (
                      <div key={`selling-point-${index}`} className="flex min-w-0 items-center gap-2">
                        <span className="w-16 shrink-0 text-xs text-muted-foreground">{suiteCopy.sellingPointItem(index + 1)}</span>
                        <Input
                          id={`product-suite-selling-${index + 1}`}
                          value={value}
                          onChange={(event) => updateSellingPoint(index, event.target.value)}
                          className="min-w-0 flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          aria-label={suiteCopy.removeSellingPoint}
                          title={suiteCopy.removeSellingPoint}
                          disabled={sellingPointItems.length <= 1}
                          onClick={() => removeSellingPoint(index)}
                        >
                          <XIcon className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      disabled={sellingPointItems.length >= 10}
                      onClick={addSellingPoint}
                    >
                      <PlusIcon className="size-4" />
                      {suiteCopy.addSellingPoint}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-1.5"><label htmlFor="product-suite-dimensions" className="text-xs font-medium text-muted-foreground">{suiteCopy.dimensions}</label><Input id="product-suite-dimensions" value={draft.info.dimensions} onChange={(event) => updateDraft((current) => ({ ...current, info: { ...current.info, dimensions: event.target.value } }))} placeholder={suiteCopy.dimensionsPlaceholder} /></div>
                <div className="grid gap-1.5"><label htmlFor="product-suite-tone" className="text-xs font-medium text-muted-foreground">{suiteCopy.brandTone}</label><Input id="product-suite-tone" value={draft.info.brandTone} onChange={(event) => updateDraft((current) => ({ ...current, info: { ...current.info, brandTone: event.target.value } }))} /></div>
                <div className="grid gap-1.5 sm:col-span-2"><label htmlFor="product-suite-forbidden" className="text-xs font-medium text-muted-foreground">{suiteCopy.forbiddenElements}</label><Textarea id="product-suite-forbidden" value={draft.info.forbiddenElements} onChange={(event) => updateDraft((current) => ({ ...current, info: { ...current.info, forbiddenElements: event.target.value } }))} rows={2} className="standard-scrollbar" /></div>
                <div className="grid gap-1.5 sm:col-span-2"><label htmlFor="product-suite-consistency" className="text-xs font-medium text-muted-foreground">{suiteCopy.consistencyRequirement}</label><Textarea id="product-suite-consistency" value={draft.info.consistencyRequirement} onChange={(event) => updateDraft((current) => ({ ...current, info: { ...current.info, consistencyRequirement: event.target.value } }))} placeholder={suiteCopy.consistencyRequirementPlaceholder} rows={2} className="standard-scrollbar" /></div>
              </div>

              <section className="grid min-w-0 gap-3 rounded-lg border bg-muted/10 p-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{suiteCopy.slotsTitle}</h3>
                    <Button type="button" variant="outline" size="sm" onClick={addCustomSlot}>
                      <PlusIcon data-icon="inline-start" />{suiteCopy.addCustomSlot}
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{suiteCopy.slotsDescription} {suiteCopy.referenceHelp}</p>
                </div>
                <div className="grid min-w-0 items-start gap-3">
                  {draft.slots.map((slot) => {
                    const slotLabel = slot.label || suiteCopy.slotLabels[slot.key] || slot.key;
                    const slotId = "product-suite-slot-" + slot.key;
                    const slotHeadingId = slotId + "-heading";
                    const slotRequest = latestSlotRequests.get(slot.key);
                    const requestHistory = slotRequestHistory.get(slot.key) || [];
                    const completedHistory = requestHistory.filter((request) => request.status === "done");
                    const selectedFinalRequest = completedHistory.find((request) => (request.productSuiteVersion || 1) === slot.selectedVersion);
                    const viewedVersion = viewedVersionBySlot[slot.key] ?? slot.selectedVersion ?? completedHistory[0]?.productSuiteVersion ?? null;
                    const resultRequest = completedHistory.find((request) => (request.productSuiteVersion || 1) === viewedVersion) || completedHistory[0];
                    const resultVersion = resultRequest?.productSuiteVersion || 1;
                    const hasSelectedFinalVersion = Boolean(selectedFinalRequest && slot.selectedVersion);
                    const isFinalVersion = Boolean(resultRequest && slot.selectedVersion === resultVersion);
                    const slotNeedsRetry = Boolean(slotRequest && ["error", "canceled"].includes(slotRequest.status));
                    const slotAccent = SLOT_ACCENT_CLASSES[slot.key] || { border: "border-border", background: "bg-muted/10" };
                    return (
                      <article key={slot.key} aria-labelledby={slotHeadingId} className={cn("grid min-w-0 content-start gap-2 self-start rounded-lg border p-3", slot.enabled ? `${slotAccent.border} ${slotAccent.background}` : "border-border bg-muted/30 opacity-70")}>
                        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                            {slot.key.startsWith("custom-") ? (
                              <Input
                                value={slot.label || ""}
                                aria-label={suiteCopy.customSlotLabel}
                                className="h-8 min-w-0 max-w-64 text-sm font-medium"
                                onChange={(event) => updateSlotLabel(slot.key, event.target.value)}
                              />
                            ) : <h4 id={slotHeadingId} className="min-w-0 truncate text-sm font-medium">{slotLabel}</h4>}
                            <span className={cn(
                              "shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
                              hasSelectedFinalVersion ? "bg-foreground text-background" : "border text-muted-foreground",
                            )}>
                              {hasSelectedFinalVersion && slot.selectedVersion ? suiteCopy.finalVersionBadge(slot.selectedVersion) : suiteCopy.finalVersionUnselected}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input className="size-4 accent-foreground" type="checkbox" checked={slot.enabled} onChange={(event) => toggleSlot(slot.key, event.currentTarget.checked)} />
                              {suiteCopy.slotEnabled}
                            </label>
                            <Button type="button" variant="ghost" size="sm" onClick={() => resetSlot(slot.key)}>{suiteCopy.resetTemplate}</Button>
                            {slot.key.startsWith("custom-") ? (
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeCustomSlot(slot.key)}>
                                <XIcon data-icon="inline-start" />{suiteCopy.removeCustomSlot}
                              </Button>
                            ) : null}
                            <Button type="button" variant="ghost" size="sm" disabled={!requestHistory.length} onClick={() => setClearVersionsTarget(slot.key)}>
                              <Trash2Icon data-icon="inline-start" />{suiteCopy.clearVersionHistory}
                            </Button>
                          </div>
                        </div>
                <div className="grid min-w-0 gap-3">
                          <div className="grid min-w-0 gap-1.5">
                            <label htmlFor={slotId} className="flex h-4 min-h-4 items-center text-xs font-medium leading-4 text-muted-foreground">{suiteCopy.slotPrompt}</label>
                            <div className="relative min-w-0">
                              <PromptEditor
                                slotKey={slot.key}
                                slotId={slotId}
                                enabled={slot.enabled}
                                template={slot.promptTemplate}
                                task={draft}
                                language={language === "en" ? "en" : "zh"}
                                ariaLabel={suiteCopy.slotPrompt}
                                labels={referenceLabels}
                                editorRef={(element) => { slotPromptRefs.current[slot.key] = element; }}
                                onInput={(event) => handlePromptInput(slot.key, event)}
                                onKeyDown={handlePromptKeyDown}
                                onPaste={(event) => {
                                  event.preventDefault();
                                  insertEditorText(event.currentTarget, event.clipboardData.getData("text/plain"), (value) => updateSlot(slot.key, value));
                                }}
                                onBlur={() => window.setTimeout(() => setPromptReferenceMenu(null), 100)}
                              />
                              {promptReferenceMenu?.slotKey === slot.key ? (
                                <div className="absolute z-50 grid w-max max-w-[min(90vw,20rem)] max-h-56 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md" style={{ left: promptReferenceMenu.left, top: promptReferenceMenu.top }} role="menu" aria-label={suiteCopy.insertReference}>
                                  {promptReferenceKeys(draft).map((key) => (
                                    <button
                                      key={key}
                                      type="button"
                                      role="menuitem"
                                      className="flex items-center whitespace-nowrap rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => {
                                        insertPromptReference(slot.key, key, promptReferenceMenu.start, promptReferenceMenu.start + 1);
                                        setPromptReferenceMenu(null);
                                      }}
                                    >
                                      <span>{suiteCopy.referenceExamples[key]}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        {resultRequest ? (
                          <div className="grid gap-3 border-t pt-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-stretch">
                            <button
                              type="button"
                              className="image-checkerboard aspect-video min-w-0 cursor-zoom-in overflow-hidden rounded-md border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:aspect-auto sm:h-full sm:min-h-24"
                              aria-label={`${slotLabel} ${copy.requestCardStatus.previewImage}`}
                              onClick={() => onPreviewRequest(resultRequest.id)}
                            >
                              {resultRequest.images[0] || resultRequest.thumbnail ? (
                                <img
                                  src={(resultRequest.images[0] || resultRequest.thumbnail)?.src}
                                  alt={slotLabel}
                                  className="block h-full w-full object-contain"
                                  loading="lazy"
                                />
                              ) : <span className="flex h-full items-center justify-center text-xs text-muted-foreground">{suiteCopy.resultUnavailable}</span>}
                            </button>
                            <div className="flex min-w-0 flex-col justify-between gap-2 sm:h-full sm:self-stretch">
                                {requestHistory.length ? (
                                  <div className="grid min-w-0 gap-1.5">
                                    <span className="text-xs font-medium text-muted-foreground">{suiteCopy.versionHistory}</span>
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                      {requestHistory.map((request) => {
                                        const version = request.productSuiteVersion || 1;
                                        const selected = resultRequest.id === request.id;
                                        return (
                                          <Button
                                            key={request.id}
                                            type="button"
                                            variant={selected ? "secondary" : "outline"}
                                            size="sm"
                                            className="h-8 px-3 text-xs"
                                            disabled={request.status !== "done"}
                                            aria-pressed={selected}
                                            onClick={() => setViewedVersionBySlot((current) => ({ ...current, [slot.key]: version }))}
                                          >
                                            {`v${version} · ${slotStatusLabel(request)}`}
                                          </Button>
                                        );
                                      })}
                            </div>
                          </div>
                        ) : null}
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                 <Button type="button" variant="outline" size="sm" onClick={() => onSelectRequest(resultRequest.id)}>
                                   <EyeIcon data-icon="inline-start" />{suiteCopy.viewResult}
                                 </Button>
                                 <Button type="button" variant="outline" size="sm" onClick={() => onExportRequest(resultRequest.id)}>
                                   <DownloadIcon data-icon="inline-start" />{suiteCopy.exportResult}
                                 </Button>
                                 <Button type="button" variant="outline" size="sm" onClick={() => onUseAsReference(`${resultRequest.id}:0`)}>
                                   <QuoteIcon data-icon="inline-start" />{suiteCopy.useAsReference}
                                 </Button>
                                 <Button type="button" variant="outline" size="sm" onClick={() => onAnnotateResult(`${resultRequest.id}:0`)}>
                                   <PencilRulerIcon data-icon="inline-start" />{suiteCopy.annotateResult}
                                 </Button>
                                 <Button type="button" variant={isFinalVersion ? "secondary" : "outline"} size="sm" disabled={isFinalVersion} onClick={() => void selectFinalVersion(slot.key, resultVersion)}>
                                   <CheckIcon data-icon="inline-start" />{isFinalVersion ? suiteCopy.finalVersion : suiteCopy.selectFinalVersion}
                                 </Button>
                                 {slotRequest && slotRequest.status === "done" ? (
                                   <Button type="button" variant="default" size="sm" disabled={submittingSlotKey !== null} onClick={() => void submitSlot(slot.key)}>
                                     <RefreshCwIcon data-icon="inline-start" />{suiteCopy.regenerateSlot}
                                   </Button>
                                 ) : null}
                                 {slotNeedsRetry ? (
                                   <Button type="button" variant="default" size="sm" disabled={submittingSlotKey !== null} onClick={() => void submitSlot(slot.key)}>
                                     <RefreshCwIcon data-icon="inline-start" />{suiteCopy.retrySlot}
                                   </Button>
                                 ) : null}
                               </div>
                             </div>
                           </div>
                         ) : null}
                         {!resultRequest && slotNeedsRetry ? (
                           <div className="flex min-w-0 flex-wrap items-center gap-2">
                             <Button type="button" variant="default" size="sm" className="w-fit" disabled={submittingSlotKey !== null} onClick={() => void submitSlot(slot.key)}>
                               <RefreshCwIcon data-icon="inline-start" />{suiteCopy.retrySlot}
                             </Button>
                           </div>
                         ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
              <p className="text-xs text-muted-foreground">{suiteCopy.nextStepHint}</p>
              <p className="sr-only" aria-live="polite">{activeTaskName}</p>
            </section>
          ) : (
              <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-3 p-3 text-center lg:min-h-0">
               <BriefcaseBusinessIcon className="size-6 text-muted-foreground" />
               <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{suiteCopy.description}</p>
             </div>
          )}
          </div>
        </div>
      </section>
      {draft ? (
        <section className="sticky bottom-0 z-20 min-w-0 rounded-2xl border border-border bg-card p-3 shadow-none">
          <DialogFooter className="min-w-0 flex-wrap gap-2 sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button type="button" variant="destructive" size="sm" className="h-8 min-h-8 max-h-8 rounded-md px-3 text-xs" disabled={!draft} onClick={() => void removeTask()}><Trash2Icon data-icon="inline-start" />{suiteCopy.deleteTask}</Button>
              <Button type="button" variant="outline" size="sm" className="h-8 min-h-8 max-h-8 rounded-md px-3 text-xs" disabled={!hasVersionRecords || submitting || retryingFailed || exportingSuite} onClick={() => setClearVersionsTarget("all")}>
                <Trash2Icon data-icon="inline-start" />{suiteCopy.clearAllVersionHistory}
              </Button>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8 min-h-8 max-h-8 rounded-md px-3 text-xs" disabled={!failedSlotKeys.length || submitting || retryingFailed} onClick={() => void retryFailedSlots()}>
                <RefreshCwIcon data-icon="inline-start" />{suiteCopy.retryFailedSlots(failedSlotKeys.length)}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 min-h-8 max-h-8 rounded-md px-3 text-xs" disabled={!completedSlotCount || exportingSuite || submitting || retryingFailed} onClick={() => void exportSuite()}>
                <DownloadIcon data-icon="inline-start" />{exportingSuite ? suiteCopy.exportingSuite : suiteCopy.exportSuite}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 min-h-8 max-h-8 rounded-md px-3 text-xs" onClick={() => void saveDraft()}><SaveIcon data-icon="inline-start" />{suiteCopy.saveTask}</Button>
              <Button type="button" size="sm" className="h-8 min-h-8 max-h-8 rounded-md px-3 text-xs" onClick={openSubmitConfirmation}><PlayIcon data-icon="inline-start" />{suiteCopy.generateSuite}</Button>
            </div>
          </DialogFooter>
        </section>
      ) : null}
      </div>
      <AlertDialog open={clearVersionsTarget !== null} onOpenChange={(open) => { if (!open) setClearVersionsTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{suiteCopy.clearVersionsTitle}</AlertDialogTitle>
            <AlertDialogDescription>{suiteCopy.clearVersionsDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.clearDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void clearVersionHistory(); }}>
              {suiteCopy.clearVersionsConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{suiteCopy.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {draft ? suiteCopy.confirmDescription(draft.name || suiteCopy.untitled, draft.slots.filter((slot) => slot.enabled).length) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{suiteCopy.confirmReferenceRule}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>{copy.clearDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={submitting} onClick={(event) => { event.preventDefault(); void submitBatch(); }}>
              {submitting ? suiteCopy.submitting : suiteCopy.confirmSubmit}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={pendingProductImageChange !== null} onOpenChange={(open) => { if (!open) setPendingProductImageChange(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{suiteCopy.productImageChangedTitle}</AlertDialogTitle>
            <AlertDialogDescription>{suiteCopy.productImageChangedDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap sm:justify-end">
            <AlertDialogCancel>{suiteCopy.cancelImageChange}</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={!pendingProductImageChange}
              onClick={() => {
                if (pendingProductImageChange) applyProductImageChange(pendingProductImageChange.assets, pendingProductImageChange.hash, false);
              }}
            >
              {suiteCopy.continueCurrentBatch}
            </Button>
            <AlertDialogAction
              disabled={!pendingProductImageChange}
              onClick={(event) => {
                event.preventDefault();
                if (pendingProductImageChange) applyProductImageChange(pendingProductImageChange.assets, pendingProductImageChange.hash, true);
              }}
            >
              {suiteCopy.startNewBatch}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
