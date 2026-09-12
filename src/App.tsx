import { useEffect, useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { GeneratorPanel, PromptHistoryPanel, QuickStartDialog } from "@/components/generator-panel";
import { AnnotationWorkspace, type AnnotationImageSource } from "@/components/annotation-workspace";
import { MaskEditor, type MaskEditorImage } from "@/components/mask-editor";
import { RequestListPanel } from "@/components/request-list-panel";
import { ResultPanel } from "@/components/result-panel";
import { ProductSuitePanel } from "@/components/product-suite-panel";
import { SettingsDialog } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useImageConsole, type ExportZipProgress } from "@/hooks/use-image-console";
import { toast } from "sonner";
import {
  requestImageCount,
  type ConsoleMode,
  type EditInputImage,
  type GeneratedImage,
} from "@/lib/image-console";
import { useI18n } from "@/lib/i18n";
import { renderProductSuitePrompt, type ProductSuiteAsset, type ProductSuiteSlotKey, type ProductSuiteTask } from "@/lib/product-suite";
import { loadRequestDetails } from "@/lib/storage";

function productSuiteAssetToEditImage(asset: ProductSuiteAsset, sourceKey: string): EditInputImage {
  return {
    src: URL.createObjectURL(asset.blob),
    name: asset.name,
    mimeType: asset.mimeType,
    blob: asset.blob,
    sourceKey,
  };
}

function productSuiteProductAssets(task: ProductSuiteTask): ProductSuiteAsset[] {
  return task.productImages?.length ? task.productImages : (task.productImage ? [task.productImage] : []);
}

function productSuiteBrandAssets(task: ProductSuiteTask): ProductSuiteAsset[] {
  return task.brandAssets?.length ? task.brandAssets : (task.brandAsset ? [task.brandAsset] : []);
}

function productSuiteAssetsToEditImages(assets: ProductSuiteAsset[], sourcePrefix: string): EditInputImage[] {
  return assets.map((asset, index) => productSuiteAssetToEditImage(asset, `${sourcePrefix}:${index + 1}`));
}

function ClearRequestsDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const { copy } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{copy.clearDialog.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ExportZipConfirmDialog({
  open,
  completedCount,
  selectedImageCount,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  completedCount: number;
  selectedImageCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { copy } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{selectedImageCount > 0 ? copy.exportZip.selectionTitle : copy.exportZip.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {selectedImageCount > 0 ? copy.exportZip.selectionDescription(selectedImageCount) : copy.exportZip.description(completedCount)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{copy.clearDialog.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{copy.exportZip.confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ExportZipProgressDialog({
  open,
  progress,
}: {
  open: boolean;
  progress: ExportZipProgress;
}) {
  const { copy } = useI18n();
  const percent = progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{copy.exportZip.progressTitle}</DialogTitle>
          <DialogDescription>{copy.exportZip.progressDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <div
            className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground"
            aria-live="polite"
            aria-busy={open}
          >
            <span>{copy.exportZip.progressStatus(progress.current, progress.total)}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResponseJsonDialog({
  open,
  json,
  onOpenChange,
}: {
  open: boolean;
  json: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { copy } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="min-w-0 border-b px-5 py-4">
          <DialogTitle>{copy.responseJson.title}</DialogTitle>
          <DialogDescription className="sr-only">{copy.responseJson.description}</DialogDescription>
        </DialogHeader>
        <div className="standard-scrollbar min-h-0 min-w-0 overflow-auto">
          <pre className="min-h-96 max-w-full whitespace-pre-wrap break-all bg-foreground p-5 text-xs leading-relaxed text-background">
            {json}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function App() {
  const { copy, language } = useI18n();
  const consoleState = useImageConsole();
  const [promptFocusSignal, setPromptFocusSignal] = useState(0);
  const [cancelRequestsDialogOpen, setCancelRequestsDialogOpen] = useState(false);
  const [clearFailedDialogOpen, setClearFailedDialogOpen] = useState(false);
  const [clearCompletedDialogOpen, setClearCompletedDialogOpen] = useState(false);
  const [productSuiteOpen, setProductSuiteOpen] = useState(false);
  const [productSuiteHasDraft, setProductSuiteHasDraft] = useState(false);
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [annotationTarget, setAnnotationTarget] = useState<{ image: AnnotationImageSource; originalPrompt: string } | null>(null);
  const [maskEditorTarget, setMaskEditorTarget] = useState<EditInputImage | null>(null);
  const [exportZipConfirmOpen, setExportZipConfirmOpen] = useState(false);
  const [exportZipProgressOpen, setExportZipProgressOpen] = useState(false);
  const [exportZipProgress, setExportZipProgress] = useState<ExportZipProgress>({ current: 0, total: 0 });
  const [imageSelectionMode, setImageSelectionMode] = useState(false);
  const [selectedImageKeys, setSelectedImageKeys] = useState<Set<string>>(new Set());
  const [previewTarget, setPreviewTarget] = useState<{ requestId: string; imageIndex: number; signal: number } | null>(null);
  const extraModalOpen =
    cancelRequestsDialogOpen ||
    clearFailedDialogOpen ||
    clearCompletedDialogOpen ||
    quickStartOpen ||
    Boolean(annotationTarget) ||
    Boolean(maskEditorTarget) ||
    exportZipConfirmOpen ||
    exportZipProgressOpen;

  async function runImageExport(selectedKeys?: readonly string[]) {
    setExportZipProgress({ current: 0, total: 0 });
    setExportZipProgressOpen(true);

    try {
      const result = await consoleState.exportCompletedImagesZip(setExportZipProgress, selectedKeys);
      setExportZipProgressOpen(false);
      toast.success(copy.exportZip.success(result.count));
    } catch (error) {
      setExportZipProgressOpen(false);
      toast.error((error as Error).message || copy.exportZip.failed);
    }
  }

  function handleExportZipConfirm() {
    setExportZipConfirmOpen(false);
    const selectedKeys = imageSelectionMode && selectedImageKeys.size ? [...selectedImageKeys] : undefined;
    void runImageExport(selectedKeys);
  }

  function handleOpenImageExport() {
    if (imageSelectionMode && selectedImageKeys.size === 1) {
      void runImageExport([...selectedImageKeys]);
      return;
    }
    setExportZipConfirmOpen(true);
  }

  function handleExportRequest(requestId: string) {
    const request = consoleState.requestRecords.find((item) => item.id === requestId);
    if (!request || request.status !== "done") return;
    const imageCount = requestImageCount(request);
    if (!imageCount) return;
    const imageKeys = Array.from({ length: imageCount }, (_, index) => `${requestId}-${index}`);
    void runImageExport(imageKeys);
  }

  function scrollToResultPanel() {
    window.requestAnimationFrame(() => {
      document.getElementById("result-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleSelectRequest(requestId: string) {
    consoleState.setSelectedRequestId(requestId);
    scrollToResultPanel();
  }

  function handlePreviewRequest(requestId: string, imageIndex = 0) {
    consoleState.setSelectedRequestId(requestId);
    setPreviewTarget({ requestId, imageIndex, signal: Date.now() + Math.random() });
  }

  function handleSelectProductSuiteRequest(requestId: string) {
    consoleState.setSelectedRequestId(requestId);
    scrollToResultPanel();
  }

  function toggleImageSelectionMode() {
    setImageSelectionMode((current) => {
      if (current) setSelectedImageKeys(new Set());
      return !current;
    });
  }

  function toggleImageSelection(key: string) {
    setSelectedImageKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resetImageSelection() {
    setImageSelectionMode(false);
    setSelectedImageKeys(new Set());
  }

  function handleModeChange(mode: ConsoleMode) {
    const shouldFocusPrompt = consoleState.mode !== mode;
    consoleState.setMode(mode);

    if (shouldFocusPrompt) {
      setPromptFocusSignal((current) => current + 1);
    }
  }

  function handleEditImage(value: string) {
    handleModeChange("edit");
    void consoleState.addHistoricalEditImage(value);
  }

  async function handleAnnotateImage(value: string) {
    const [requestId, imageIndexText] = String(value || "").split(":");
    const imageIndex = Number.parseInt(imageIndexText, 10);
    const request = consoleState.requestRecords.find((item) => item.id === requestId);
    if (!request || request.status !== "done") return;
    let image: GeneratedImage | null = request.images?.[imageIndex] ?? null;
    if (!image && request.hasCachedDetails && !request.detailsMissing) {
      image = (await loadRequestDetails(requestId))?.images?.[imageIndex] ?? null;
    }
    if (!image && imageIndex === 0) image = request.thumbnail || null;
    if (!image) return;
    setAnnotationTarget({
      image: {
        src: image.src,
        blob: image.blob,
        mimeType: image.mimeType,
        name: `${request.title}-${imageIndex + 1}`,
      },
      originalPrompt: request.sourcePrompt,
    });
  }

  function handleAnnotationSubmit(file: File, instruction: string) {
    if (!annotationTarget) return;
    const originalPrompt = annotationTarget.originalPrompt.trim();
    const addition = instruction.trim() || (language === "en"
      ? "Use the arrows and notes outside the original image to apply the requested changes to the circled areas."
      : "请根据原图外的箭头和文字说明，对圈出的区域进行对应修改。");
    handleModeChange("edit");
    consoleState.setEditImages([
      {
        src: URL.createObjectURL(file),
        name: file.name,
        mimeType: file.type,
        file,
        sourceKey: `annotation:${Date.now()}`,
      },
    ]);
    consoleState.setPrompt(`${addition}\n\n${copy.annotation.originalPrompt}:\n${originalPrompt || copy.annotation.noPrompt}`);
    setAnnotationTarget(null);
    toast.success(copy.annotation.submitted);
  }

  function handleProductSuiteSubmit(task: ProductSuiteTask) {
    const productAssets = productSuiteProductAssets(task);
    if (!productAssets.length) return 0;
    const productImages = productSuiteAssetsToEditImages(productAssets, "product-suite:" + task.id + ":product");
    const brandAssets = productSuiteBrandAssets(task);
    const brandImages = productSuiteAssetsToEditImages(brandAssets, "product-suite:" + task.id + ":brand");
    const enabledSlots = task.slots.filter((slot) => slot.enabled);
    let submittedCount = 0;
    let lastPrompt = "";
    let lastImages: EditInputImage[] = productImages;
    let brandAssetsUsed = false;

    for (const slot of enabledSlots) {
      const prompt = renderProductSuitePrompt(task, slot.key, language === "en" ? "en" : "zh");
      const slotImages = slot.key === "hero" && brandImages.length ? [...productImages, ...brandImages] : productImages;
      const version = consoleState.requestRecords
        .filter((request) => request.productSuiteTaskId === task.id && request.productSuiteSlotKey === slot.key && (request.productSuiteBatchId === task.productBatchId || (!request.productSuiteBatchId && task.productBatchId === "batch-1")))
        .reduce((max, request) => Math.max(max, request.productSuiteVersion || 1), 0) + 1;
      const submitted = consoleState.enqueueEditGeneration({
        prompt,
        editImages: slotImages,
        count: 1,
        silent: true,
        productSuite: {
          taskId: task.id,
          batchId: task.productBatchId,
          batchNumber: task.productBatchNumber,
          slotKey: slot.key,
          slotLabel: slot.label,
          version,
        },
      });
      if (!submitted) break;
      submittedCount += 1;
      if (slot.key === "hero" && brandImages.length) brandAssetsUsed = true;
      lastPrompt = prompt;
      lastImages = slotImages;
    }

    if (submittedCount > 0) {
      consoleState.setEditImages(lastImages);
      consoleState.setPrompt(lastPrompt);
      if (!brandAssetsUsed) brandImages.forEach((image) => URL.revokeObjectURL(image.src));
    } else {
      productImages.forEach((image) => URL.revokeObjectURL(image.src));
      brandImages.forEach((image) => URL.revokeObjectURL(image.src));
    }

    return submittedCount;
  }

  function handleProductSuiteSlotSubmit(task: ProductSuiteTask, slotKey: ProductSuiteSlotKey, version: number) {
    const productAssets = productSuiteProductAssets(task);
    if (!productAssets.length) return 0;
    const productImages = productSuiteAssetsToEditImages(productAssets, `product-suite:${task.id}:product`);
    const brandImages = slotKey === "hero" ? productSuiteAssetsToEditImages(productSuiteBrandAssets(task), `product-suite:${task.id}:brand`) : [];
    const editImages = brandImages.length ? [...productImages, ...brandImages] : productImages;
    const prompt = renderProductSuitePrompt(task, slotKey, language === "en" ? "en" : "zh");
    const submitted = consoleState.enqueueEditGeneration({
      prompt,
      editImages,
      count: 1,
      silent: true,
      productSuite: {
        taskId: task.id,
        batchId: task.productBatchId,
        batchNumber: task.productBatchNumber,
        slotKey,
        slotLabel: task.slots.find((slot) => slot.key === slotKey)?.label,
        version,
      },
    });

    if (!submitted) {
      productImages.forEach((image) => URL.revokeObjectURL(image.src));
      brandImages.forEach((image) => URL.revokeObjectURL(image.src));
      return 0;
    }

    consoleState.setEditImages(editImages);
    consoleState.setPrompt(prompt);
    return 1;
  }

  return (
    <>
      <main id="main" className="grid min-h-dvh w-full max-w-full min-w-0 grid-cols-1 gap-3 overflow-x-hidden bg-muted/30 p-4 lg:h-dvh lg:min-h-0 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(320px,400px)] lg:overflow-hidden">
        <aside className={productSuiteOpen
          ? "flex min-h-0 min-w-0 flex-col gap-3 lg:grid lg:grid-rows-[clamp(300px,48dvh,620px)_minmax(0,1fr)] lg:h-full lg:overflow-hidden"
          : "flex min-h-0 min-w-0 flex-col lg:h-full lg:overflow-hidden"}>
          <div className={productSuiteOpen ? "flex min-h-48 min-w-0 flex-col rounded-2xl border border-border bg-card p-3 shadow-none lg:min-h-0" : "flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-border bg-card p-3 shadow-none"}>
            <PromptHistoryPanel
              promptHistory={consoleState.promptHistory}
              promptHistoryCount={consoleState.promptHistoryCount}
              promptHistoryPinnedCount={consoleState.promptHistoryPinnedCount}
              onSelectPrompt={consoleState.selectPromptHistory}
              onDeletePrompt={consoleState.deletePromptHistory}
              onTogglePromptPin={consoleState.togglePromptHistoryPin}
            />
          </div>
          <div id="product-suite-task-sidebar" className={productSuiteOpen ? "flex min-h-0 min-w-0 flex-col" : "hidden"} />
        </aside>
        <div className="standard-scrollbar main-column-scroll flex min-h-0 min-w-0 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain lg:overflow-y-scroll">
          <div id="result-panel" className="h-[clamp(300px,48dvh,620px)] shrink-0">
            <ResultPanel
              selectedRequest={consoleState.selectedRequest}
              selectedRequestDetailLoadingId={consoleState.selectedRequestDetailLoadingId}
              settings={consoleState.settings}
              connectionStatus={consoleState.connectionStatus}
              testConnectionStatus={consoleState.testConnectionStatus}
              onTestConnection={consoleState.testConnection}
              selectedRequestJson={consoleState.selectedRequestJson}
              setJsonDialogOpen={consoleState.setJsonDialogOpen}
              reusePrompt={consoleState.reusePrompt}
              onEditImage={handleEditImage}
              onAnnotateImage={handleAnnotateImage}
              previewTarget={previewTarget}
            />
          </div>
          <div
            className={productSuiteOpen
              ? productSuiteHasDraft
                ? "flex min-w-0 flex-none flex-col gap-3"
                : "flex min-h-0 min-w-0 flex-1 flex-col gap-3"
              : "hidden"}
          >
              <ProductSuitePanel
                open={productSuiteOpen}
                onOpenChange={setProductSuiteOpen}
                onModeChange={handleModeChange}
                onDraftStateChange={setProductSuiteHasDraft}
                settings={consoleState.settings}
                updateSettings={consoleState.updateSettings}
                connectionStatus={consoleState.connectionStatus}
                setSettingsOpen={consoleState.setSettingsOpen}
                onOpenQuickStart={() => setQuickStartOpen(true)}
                onSubmitBatch={handleProductSuiteSubmit}
                onSubmitSlot={handleProductSuiteSlotSubmit}
                onSelectRequest={handleSelectProductSuiteRequest}
                onPreviewRequest={handlePreviewRequest}
                onExportRequest={handleExportRequest}
                onExportSuite={(task) => consoleState.exportProductSuite(task)}
                onClearVersions={consoleState.clearProductSuiteVersions}
                onUseAsReference={(value) => {
                  setProductSuiteOpen(false);
                  handleEditImage(value);
                }}
                onAnnotateResult={(value) => {
                  setProductSuiteOpen(false);
                  void handleAnnotateImage(value);
                }}
                requestRecords={consoleState.requestRecords}
              />
          </div>
          <div className={productSuiteOpen ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col"}>
                <GeneratorPanel
                  mode={consoleState.mode}
                  editImages={consoleState.editImages}
                  editMask={consoleState.editMask}
                  historicalEditImageValue={consoleState.historicalEditImageValue}
                  historicalEditImageOptions={consoleState.historicalEditImageOptions}
                  settings={consoleState.settings}
                  prompt={consoleState.prompt}
                  connectionStatus={consoleState.connectionStatus}
                  promptFocusSignal={promptFocusSignal}
                  setPrompt={consoleState.setPrompt}
                  setEditImages={consoleState.setEditImages}
                  setEditMask={consoleState.setEditMask}
                  updateSettings={consoleState.updateSettings}
                  setSettingsOpen={consoleState.setSettingsOpen}
                  enqueueGeneration={consoleState.enqueueGeneration}
                  enqueueEditGeneration={consoleState.enqueueEditGeneration}
                  isGenerating={consoleState.requestCounts.active > 0}
                  onCancelGeneration={consoleState.cancelAllRequests}
                  addHistoricalEditImage={consoleState.addHistoricalEditImage}
                  onModeChange={handleModeChange}
                  onOpenQuickStart={() => setQuickStartOpen(true)}
                  onOpenProductSuite={() => setProductSuiteOpen(true)}
                  workflowOpen={productSuiteOpen}
                  onOpenMaskEditor={(image) => setMaskEditorTarget(image)}
                />
          </div>
        </div>
        <RequestListPanel
          filteredRequests={consoleState.filteredRequests}
          selectedRequestId={consoleState.selectedRequestId}
          selectedRequestFilter={consoleState.selectedRequestFilter}
          requestCounts={consoleState.requestCounts}
          now={consoleState.now}
          settingsOpen={consoleState.settingsOpen}
          clearDialogOpen={consoleState.clearDialogOpen}
          jsonDialogOpen={consoleState.jsonDialogOpen}
          onSelectRequest={handleSelectRequest}
          onCancelRequest={consoleState.cancelRequest}
          onDeleteRequest={consoleState.deleteRequest}
          onExportRequest={handleExportRequest}
          onPreviewRequest={handlePreviewRequest}
          onFilterChange={consoleState.setSelectedRequestFilter}
          onOpenClearFailed={() => setClearFailedDialogOpen(true)}
          onOpenExportZip={handleOpenImageExport}
          imageSelectionMode={imageSelectionMode}
          selectedImageCount={selectedImageKeys.size}
           selectedImageKeys={selectedImageKeys}
           onToggleImageSelectionMode={toggleImageSelectionMode}
           onToggleImageSelection={toggleImageSelection}
           extraModalOpen={extraModalOpen}
        />
      </main>

      <SettingsDialog
        settings={consoleState.settings}
        settingsOpen={consoleState.settingsOpen}
        endpointPreview={consoleState.endpointPreview}
        testConnectionStatus={consoleState.testConnectionStatus}
        setSettingsOpen={consoleState.setSettingsOpen}
        updateSettings={consoleState.updateSettings}
        saveCurrentSettings={consoleState.saveCurrentSettings}
        clearAllData={() => {
          resetImageSelection();
          consoleState.clearAllData();
        }}
        testConnection={consoleState.testConnection}
      />
      <QuickStartDialog open={quickStartOpen} onOpenChange={setQuickStartOpen} />
      <AnnotationWorkspace
        open={Boolean(annotationTarget)}
        image={annotationTarget?.image || null}
        originalPrompt={annotationTarget?.originalPrompt || ""}
        onOpenChange={(open) => {
          if (!open) setAnnotationTarget(null);
        }}
        onSubmit={handleAnnotationSubmit}
      />
      <MaskEditor
        open={Boolean(maskEditorTarget)}
        image={maskEditorTarget ? { src: maskEditorTarget.src, name: maskEditorTarget.name } : null}
        language={language === "en" ? "en" : "zh"}
        onOpenChange={(open) => { if (!open) setMaskEditorTarget(null); }}
        onApply={(blob) => {
          consoleState.setEditMask({ src: URL.createObjectURL(blob), name: "mask.png", mimeType: "image/png", blob, sourceKey: maskEditorTarget?.sourceKey });
          setMaskEditorTarget(null);
          toast.success(language === "en" ? "Mask applied" : "遮罩已应用");
        }}
      />
      <ExportZipConfirmDialog
        open={exportZipConfirmOpen}
        completedCount={consoleState.requestCounts.done}
        selectedImageCount={imageSelectionMode ? selectedImageKeys.size : 0}
        onOpenChange={setExportZipConfirmOpen}
        onConfirm={handleExportZipConfirm}
      />
      <ExportZipProgressDialog open={exportZipProgressOpen} progress={exportZipProgress} />
      <ClearRequestsDialog
        open={consoleState.clearDialogOpen}
        onOpenChange={consoleState.setClearDialogOpen}
        title={copy.clearDialog.clearAll.title}
        description={copy.clearDialog.clearAll.description}
        confirmLabel={copy.clearDialog.clearAll.confirm}
        onConfirm={() => {
          consoleState.setClearDialogOpen(false);
          resetImageSelection();
          consoleState.clearAllRequests();
        }}
      />
      <ClearRequestsDialog
        open={cancelRequestsDialogOpen}
        onOpenChange={setCancelRequestsDialogOpen}
        title={copy.clearDialog.cancelRequests.title}
        description={copy.clearDialog.cancelRequests.description}
        confirmLabel={copy.clearDialog.cancelRequests.confirm}
        onConfirm={() => {
          setCancelRequestsDialogOpen(false);
          consoleState.cancelAllRequests();
        }}
      />
      <ClearRequestsDialog
        open={clearFailedDialogOpen}
        onOpenChange={setClearFailedDialogOpen}
        title={copy.clearDialog.clearFailed.title}
        description={copy.clearDialog.clearFailed.description}
        confirmLabel={copy.clearDialog.clearFailed.confirm}
        onConfirm={() => {
          setClearFailedDialogOpen(false);
          resetImageSelection();
          consoleState.clearFailedRequests();
        }}
      />
      <ClearRequestsDialog
        open={clearCompletedDialogOpen}
        onOpenChange={setClearCompletedDialogOpen}
        title={copy.clearDialog.clearCompleted.title}
        description={copy.clearDialog.clearCompleted.description}
        confirmLabel={copy.clearDialog.clearCompleted.confirm}
        onConfirm={() => {
          setClearCompletedDialogOpen(false);
          resetImageSelection();
          consoleState.clearCompletedRequests();
        }}
      />
      <ResponseJsonDialog
        open={consoleState.jsonDialogOpen}
        json={consoleState.selectedRequestJson}
        onOpenChange={consoleState.setJsonDialogOpen}
      />
    </>
  );
}
