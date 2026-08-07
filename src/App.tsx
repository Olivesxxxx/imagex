import { useEffect, useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { GeneratorPanel, PromptHistoryPanel } from "@/components/generator-panel";
import { RequestListPanel } from "@/components/request-list-panel";
import { ResultPanel } from "@/components/result-panel";
import { SettingsDialog } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useImageConsole, type ExportZipProgress } from "@/hooks/use-image-console";
import { toast } from "sonner";
import {
  isDefaultStrictPromptText,
  normalizeStrictPromptText,
  requestImageCount,
  type ConsoleMode,
} from "@/lib/image-console";
import { useI18n } from "@/lib/i18n";

function StrictPromptEditorDialog({
  open,
  value,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
  onSave: (value: string) => void;
}) {
  const { copy } = useI18n();
  const defaultText = copy.promptEditor.defaultText;
  const normalizeForLanguage = (input: unknown) =>
    isDefaultStrictPromptText(input) ? defaultText : normalizeStrictPromptText(input);
  const [draft, setDraft] = useState(() => normalizeForLanguage(value));

  useEffect(() => {
    if (!open) return;
    setDraft(normalizeForLanguage(value));
  }, [defaultText, open, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.promptEditor.title}</DialogTitle>
          <DialogDescription>{copy.promptEditor.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="rounded-md border bg-muted/30 px-3 py-3">
            <p className="text-xs font-medium text-muted-foreground">{copy.promptEditor.header}</p>
            <Textarea
              id="strictPromptText"
              aria-label={copy.promptEditor.bodyLabel}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={8}
              className="mt-3 min-h-44 resize-none"
            />
            <p className="mt-3 text-xs font-medium text-muted-foreground">{copy.promptEditor.footer}</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {copy.promptEditor.cancel}
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(defaultText)}>
              {copy.promptEditor.restoreDefault}
            </Button>
            <Button
              type="button"
              onClick={() => {
                onSave(normalizeStrictPromptText(draft));
                onOpenChange(false);
              }}
            >
              {copy.promptEditor.confirm}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
        <div className="min-h-0 min-w-0 overflow-auto">
          <pre className="min-h-96 max-w-full whitespace-pre-wrap break-all bg-foreground p-5 text-xs leading-relaxed text-background">
            {json}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function App() {
  const { copy } = useI18n();
  const consoleState = useImageConsole();
  const [promptFocusSignal, setPromptFocusSignal] = useState(0);
  const [cancelRequestsDialogOpen, setCancelRequestsDialogOpen] = useState(false);
  const [clearFailedDialogOpen, setClearFailedDialogOpen] = useState(false);
  const [clearCompletedDialogOpen, setClearCompletedDialogOpen] = useState(false);
  const [strictPromptEditorOpen, setStrictPromptEditorOpen] = useState(false);
  const [exportZipConfirmOpen, setExportZipConfirmOpen] = useState(false);
  const [exportZipProgressOpen, setExportZipProgressOpen] = useState(false);
  const [exportZipProgress, setExportZipProgress] = useState<ExportZipProgress>({ current: 0, total: 0 });
  const [imageSelectionMode, setImageSelectionMode] = useState(false);
  const [selectedImageKeys, setSelectedImageKeys] = useState<Set<string>>(new Set());
  const extraModalOpen =
    cancelRequestsDialogOpen ||
    clearFailedDialogOpen ||
    clearCompletedDialogOpen ||
    strictPromptEditorOpen ||
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

  return (
    <>
      <main id="main" className="grid min-h-dvh min-w-0 grid-cols-1 gap-3 bg-muted/30 p-4 lg:h-dvh lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(280px,1.15fr)_minmax(340px,0.85fr)] gap-3 overflow-y-auto pr-1">
          <ResultPanel
            selectedRequest={consoleState.selectedRequest}
            selectedRequestDetailLoadingId={consoleState.selectedRequestDetailLoadingId}
            statusMessage={consoleState.statusMessage}
            selectedRequestJson={consoleState.selectedRequestJson}
            setJsonDialogOpen={consoleState.setJsonDialogOpen}
            reusePrompt={consoleState.reusePrompt}
            onEditImage={handleEditImage}
          />
          <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.35fr)]">
            <GeneratorPanel
              mode={consoleState.mode}
              editImages={consoleState.editImages}
              historicalEditImageValue={consoleState.historicalEditImageValue}
              historicalEditImageOptions={consoleState.historicalEditImageOptions}
              settings={consoleState.settings}
              prompt={consoleState.prompt}
              connectionStatus={consoleState.connectionStatus}
              promptFocusSignal={promptFocusSignal}
              setPrompt={consoleState.setPrompt}
              setEditImages={consoleState.setEditImages}
              updateSettings={consoleState.updateSettings}
              setSettingsOpen={consoleState.setSettingsOpen}
              enqueueGeneration={consoleState.enqueueGeneration}
              enqueueEditGeneration={consoleState.enqueueEditGeneration}
              isGenerating={consoleState.requestCounts.active > 0}
              onCancelGeneration={consoleState.cancelAllRequests}
              addHistoricalEditImage={consoleState.addHistoricalEditImage}
              onModeChange={handleModeChange}
              onOpenStrictPromptEditor={() => {
                setStrictPromptEditorOpen(true);
              }}
            />
            <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-card p-3 shadow-none">
              <PromptHistoryPanel
                promptHistory={consoleState.promptHistory}
                promptHistoryCount={consoleState.promptHistoryCount}
                promptHistoryPinnedCount={consoleState.promptHistoryPinnedCount}
                onSelectPrompt={consoleState.selectPromptHistory}
                onDeletePrompt={consoleState.deletePromptHistory}
                onTogglePromptPin={consoleState.togglePromptHistoryPin}
              />
            </div>
          </div>
        </div>
        <RequestListPanel
          filteredRequests={consoleState.filteredRequests}
          selectedRequestId={consoleState.selectedRequestId}
          selectedRequestFilter={consoleState.selectedRequestFilter}
          requestCounts={consoleState.requestCounts}
          now={consoleState.now}
          settings={consoleState.settings}
          settingsOpen={consoleState.settingsOpen}
          clearDialogOpen={consoleState.clearDialogOpen}
          jsonDialogOpen={consoleState.jsonDialogOpen}
          onSelectRequest={consoleState.setSelectedRequestId}
          onCancelRequest={consoleState.cancelRequest}
          onDeleteRequest={consoleState.deleteRequest}
          onExportRequest={handleExportRequest}
          onFilterChange={consoleState.setSelectedRequestFilter}
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
        resetSettings={consoleState.resetSettings}
        testConnection={consoleState.testConnection}
      />
      <StrictPromptEditorDialog
        open={strictPromptEditorOpen}
        value={consoleState.settings.strictPromptText}
        onOpenChange={setStrictPromptEditorOpen}
        onSave={(value) => {
          consoleState.updateSettings("strictPromptText", value);
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
