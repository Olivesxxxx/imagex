import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from "react";
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
import { createDefaultProductSuiteSlots, createDevelopmentProductSuiteTask, createProductSuiteBatchId, createProductSuiteTask, deleteProductSuiteTask, DEVELOPMENT_PRODUCT_SUITE_TASK_ID, hashProductSuiteImage, loadProductSuiteTasks, renderProductSuitePrompt, saveProductSuiteTask, type ProductSuiteAsset, type ProductSuiteSlot, type ProductSuiteSlotKey, type ProductSuiteTask } from "@/lib/product-suite";
import { MAX_EDIT_INPUT_IMAGES, type AppSettings, type ConsoleMode, type ImageRequestRecord } from "@/lib/image-console";
import { cn } from "@/lib/utils";

function assetFromFile(file: File): ProductSuiteAsset {
  return { blob: file, name: file.name, mimeType: file.type || "image/png" };
}

function productAssets(task: ProductSuiteTask): ProductSuiteAsset[] {
  return task.productImages?.length ? task.productImages : (task.productImage ? [task.productImage] : []);
}

function brandAssets(task: ProductSuiteTask): ProductSuiteAsset[] {
  return task.brandAssets?.length ? task.brandAssets : (task.brandAsset ? [task.brandAsset] : []);
}

const PROMPT_REFERENCE_KEYS = ["商品名", "材质颜色", "核心卖点", "尺寸", "品牌语气", "目标平台"] as const;
type PromptReferenceKey = (typeof PROMPT_REFERENCE_KEYS)[number];

function promptReferenceValues(task: ProductSuiteTask, language: "zh" | "en"): Record<PromptReferenceKey, string> {
  return {
    商品名: task.name || (language === "en" ? "the product" : "该商品"),
    材质颜色: task.info.materialAndColor || (language === "en" ? "not specified" : "未填写"),
    核心卖点: task.info.sellingPoints || (language === "en" ? "not specified" : "未填写"),
    尺寸: task.info.dimensions || (language === "en" ? "not specified" : "未填写"),
    品牌语气: task.info.brandTone || (language === "en" ? "clean ecommerce product photography" : "干净的电商产品摄影"),
    目标平台: task.info.targetPlatform || (language === "en" ? "ecommerce" : "电商平台"),
  };
}

function renderPromptWithReferences(task: ProductSuiteTask, slot: ProductSuiteSlot, language: "zh" | "en"): ReactNode {
  const template = slot.promptTemplate;
  const values = promptReferenceValues(task, language);
  const sourceValues: Record<PromptReferenceKey, string> = {
    商品名: task.name,
    材质颜色: task.info.materialAndColor,
    核心卖点: task.info.sellingPoints,
    尺寸: task.info.dimensions,
    品牌语气: task.info.brandTone,
    目标平台: task.info.targetPlatform,
  };
  const tokenPattern = /(\{\{(?:商品名|材质颜色|核心卖点|尺寸|品牌语气|目标平台)\}\})/g;
  const body = template.split(tokenPattern).map((part, index) => {
    const key = part.startsWith("{{") ? part.slice(2, -2) as PromptReferenceKey : null;
    if (!key) return <span key={`text-${index}`}>{part}</span>;
    const value = values[key];
    const isUserValue = Boolean(sourceValues[key]?.trim());
    return isUserValue ? (
      <mark key={`reference-${index}`} className="rounded bg-sky-100 px-1 font-semibold text-sky-800 dark:bg-sky-900/60 dark:text-sky-100" title="引用用户填写的信息">{value}</mark>
    ) : <span key={`fallback-${index}`}>{value}</span>;
  });
  const forbidden = task.info.forbiddenElements.trim();
  const consistency = task.info.consistencyRequirement.trim();
  return <>{body}{forbidden ? <>{"\n"}{language === "en" ? "Avoid" : "不要出现"}: {forbidden}</> : null}{consistency ? <>{"\n\n"}{consistency}</> : null}</>;
}

const SLOT_ACCENT_CLASSES: Record<ProductSuiteSlotKey, { border: string; background: string }> = {
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
          "flex min-h-32 min-w-0 flex-col gap-2 rounded-md border border-dashed p-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
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
        <div className="flex min-h-20 w-full flex-wrap items-center gap-2 rounded-md border bg-background/70 p-2">
          {previewUrls.length ? previewUrls.map((previewUrl, index) => (
            <div key={`${previewUrl}-${index}`} className="relative size-20 shrink-0 overflow-hidden rounded-md border bg-background">
              <img src={previewUrl} alt={`${label} ${index + 1}`} className="h-full w-full object-cover" />
              <Button type="button" variant="secondary" size="icon-xs" className="absolute right-1 top-1 shadow-sm" aria-label={index === 0 ? removeLabel : `${removeLabel} ${index + 1}`} onClick={() => onRemove(index)}><XIcon /></Button>
            </div>
          )) : <div className="flex min-h-16 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"><UploadIcon className="size-5 shrink-0" /><span>{hint}</span></div>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}><UploadIcon data-icon="inline-start" />{chooseLabel}</Button>
          {previewUrls.length ? <span className="text-xs text-muted-foreground">{previewUrls.length}</span> : null}
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
    if (!open || (loadedOnceRef.current && !(import.meta.env.DEV && settings.developmentMode))) return;
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

  async function setProductAssets(assets: ProductSuiteAsset[]) {
    if (!draft) return;
    const hasTaskRequests = requestRecords.some((request) => request.productSuiteTaskId === draft.id);
    if (!hasTaskRequests) {
      updateDraft((current) => ({ ...current, productImage: assets[0] || null, productImages: assets, productImageHash: "" }));
      const hash = await hashProductAssets(assets);
      updateDraft((current) => current.productImages === assets ? { ...current, productImageHash: hash } : current);
      return;
    }

    const hash = await hashProductAssets(assets);
    const currentImageHash = draft.productImageHash || await hashProductAssets(productAssets(draft));
    if (hash === currentImageHash) {
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
      await setProductAssets(next);
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
        onOpenChange(false);
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

  if (!open) return null;

  return (
    <>
      <section aria-label={suiteCopy.title} className={`flex w-full min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-none ${draft ? "" : "min-h-full"}`}>
        <header className="shrink-0">
          <div className="flex w-full min-w-0 max-w-full flex-wrap items-end gap-2">
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

        <div className={cn("flex min-w-0", draft ? "flex-none" : "min-h-0 flex-1")}>
          <div className={cn("grid w-full min-w-0 max-w-full gap-3", draft ? "flex-none" : "flex-1 lg:grid-rows-[auto_minmax(0,1fr)]")}>
            <div className="flex h-4 min-h-4 items-center gap-3 text-xs font-medium leading-none text-muted-foreground">
              <span>{suiteCopy.title}</span>
            </div>
            <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/20 p-2">
              <Button type="button" variant="outline" className="shrink-0" onClick={createTask}><PlusIcon data-icon="inline-start" />{suiteCopy.newTask}</Button>
              <div className="standard-scrollbar product-suite-task-scroll flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5">
                {tasks.map((task) => (
                  <button key={task.id} type="button" className={`flex h-8 min-h-8 max-w-56 shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm ${activeId === task.id ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted"}`} onClick={() => selectTask(task)}>
                    <ImageIcon className="size-4 shrink-0" />
                    <span className="min-w-0 truncate">{task.name || suiteCopy.untitled}</span>
                  </button>
                ))}
                {import.meta.env.DEV && settings.developmentMode ? Array.from({ length: 19 }, (_, index) => (
                  <button
                    key={`development-scroll-placeholder-${index}`}
                    type="button"
                    disabled
                    aria-disabled="true"
                    title={suiteCopy.developmentTaskPlaceholder(index + 2)}
                    className="flex h-8 min-h-8 max-w-56 shrink-0 items-center gap-2 rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-1.5 text-left text-sm text-muted-foreground opacity-70"
                  >
                    <ImageIcon className="size-4 shrink-0" />
                    <span className="min-w-0 truncate">{suiteCopy.developmentTaskPlaceholder(index + 2)}</span>
                  </button>
                )) : null}
                {!tasks.length && !loading ? <p className="px-2 py-1.5 text-xs text-muted-foreground">{suiteCopy.empty}</p> : null}
              </div>
            </div>

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
                <div className="grid gap-1.5 sm:col-span-2"><label htmlFor="product-suite-selling" className="text-xs font-medium text-muted-foreground">{suiteCopy.sellingPoints}</label><Textarea id="product-suite-selling" value={draft.info.sellingPoints} onChange={(event) => updateDraft((current) => ({ ...current, info: { ...current.info, sellingPoints: event.target.value } }))} rows={2} className="standard-scrollbar" /></div>
                <div className="grid gap-1.5"><label htmlFor="product-suite-dimensions" className="text-xs font-medium text-muted-foreground">{suiteCopy.dimensions}</label><Input id="product-suite-dimensions" value={draft.info.dimensions} onChange={(event) => updateDraft((current) => ({ ...current, info: { ...current.info, dimensions: event.target.value } }))} placeholder={suiteCopy.dimensionsPlaceholder} /></div>
                <div className="grid gap-1.5"><label htmlFor="product-suite-tone" className="text-xs font-medium text-muted-foreground">{suiteCopy.brandTone}</label><Input id="product-suite-tone" value={draft.info.brandTone} onChange={(event) => updateDraft((current) => ({ ...current, info: { ...current.info, brandTone: event.target.value } }))} /></div>
                <div className="grid gap-1.5 sm:col-span-2"><label htmlFor="product-suite-forbidden" className="text-xs font-medium text-muted-foreground">{suiteCopy.forbiddenElements}</label><Textarea id="product-suite-forbidden" value={draft.info.forbiddenElements} onChange={(event) => updateDraft((current) => ({ ...current, info: { ...current.info, forbiddenElements: event.target.value } }))} rows={2} className="standard-scrollbar" /></div>
                <div className="grid gap-1.5 sm:col-span-2"><label htmlFor="product-suite-consistency" className="text-xs font-medium text-muted-foreground">{suiteCopy.consistencyRequirement}</label><Textarea id="product-suite-consistency" value={draft.info.consistencyRequirement} onChange={(event) => updateDraft((current) => ({ ...current, info: { ...current.info, consistencyRequirement: event.target.value } }))} placeholder={suiteCopy.consistencyRequirementPlaceholder} rows={2} className="standard-scrollbar" /></div>
              </div>

              <section className="grid min-w-0 gap-3 rounded-lg border bg-muted/10 p-3">
                <div>
                  <h3 className="text-sm font-semibold">{suiteCopy.slotsTitle}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{suiteCopy.slotsDescription}</p>
                </div>
                <div className="grid min-w-0 items-start gap-3">
                  {draft.slots.map((slot) => {
                    const slotLabel = suiteCopy.slotLabels[slot.key] || slot.key;
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
                    const slotAccent = SLOT_ACCENT_CLASSES[slot.key];
                    return (
                      <article key={slot.key} aria-labelledby={slotHeadingId} className={cn("grid min-w-0 content-start gap-2 self-start rounded-lg border p-3", slot.enabled ? `${slotAccent.border} ${slotAccent.background}` : "border-border bg-muted/30 opacity-70")}>
                        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                            <h4 id={slotHeadingId} className="min-w-0 truncate text-sm font-medium">{slotLabel}</h4>
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
                            <Button type="button" variant="ghost" size="sm" disabled={!requestHistory.length} onClick={() => setClearVersionsTarget(slot.key)}>
                              <Trash2Icon data-icon="inline-start" />{suiteCopy.clearVersionHistory}
                            </Button>
                          </div>
                        </div>
                        <div className="grid min-w-0 gap-3 lg:grid-cols-2 lg:items-stretch">
                          <div className="grid min-w-0 grid-rows-[1rem_auto] gap-1.5">
                            <label htmlFor={slotId} className="flex h-4 min-h-4 items-center text-xs font-medium leading-4 text-muted-foreground">{suiteCopy.slotPrompt}</label>
                            <Textarea id={slotId} value={slot.promptTemplate} onChange={(event) => updateSlot(slot.key, event.target.value)} rows={5} disabled={!slot.enabled} className="standard-scrollbar min-h-32 resize-y self-stretch" />
                          </div>
                          <div className="grid min-w-0 grid-rows-[1rem_auto] gap-1.5">
                            <span className="flex h-4 min-h-4 items-center text-xs font-medium leading-4 text-muted-foreground">{suiteCopy.renderedPrompt}</span>
                            <p className="standard-scrollbar min-h-32 h-full overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed">{renderPromptWithReferences(draft, slot, language === "en" ? "en" : "zh")}</p>
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
              <DialogFooter className="min-w-0 flex-wrap gap-2 sm:justify-between">
                 <div className="flex min-w-0 flex-wrap items-center gap-2">
                   <Button type="button" variant="destructive" disabled={!draft} onClick={() => void removeTask()}><Trash2Icon data-icon="inline-start" />{suiteCopy.deleteTask}</Button>
                   <Button type="button" variant="outline" disabled={!hasVersionRecords || submitting || retryingFailed || exportingSuite} onClick={() => setClearVersionsTarget("all")}>
                     <Trash2Icon data-icon="inline-start" />{suiteCopy.clearAllVersionHistory}
                   </Button>
                 </div>
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                  <Button type="button" variant="outline" disabled={!failedSlotKeys.length || submitting || retryingFailed} onClick={() => void retryFailedSlots()}>
                    <RefreshCwIcon data-icon="inline-start" />{suiteCopy.retryFailedSlots(failedSlotKeys.length)}
                  </Button>
                  <Button type="button" variant="outline" disabled={!completedSlotCount || exportingSuite || submitting || retryingFailed} onClick={() => void exportSuite()}>
                    <DownloadIcon data-icon="inline-start" />{exportingSuite ? suiteCopy.exportingSuite : suiteCopy.exportSuite}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void saveDraft()}><SaveIcon data-icon="inline-start" />{suiteCopy.saveTask}</Button>
                  <Button type="button" onClick={openSubmitConfirmation}><PlayIcon data-icon="inline-start" />{suiteCopy.generateSuite}</Button>
                </div>
              </DialogFooter>
              <p className="sr-only" aria-live="polite">{activeTaskName}</p>
            </section>
          ) : (
            <div className="flex h-full min-h-64 lg:min-h-0 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-3 text-center">
              <BriefcaseBusinessIcon className="size-6 text-muted-foreground" />
              <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{suiteCopy.description}</p>
              <Button type="button" onClick={createTask}><PlusIcon data-icon="inline-start" />{suiteCopy.newTask}</Button>
            </div>
          )}
          </div>
        </div>
      </section>
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
