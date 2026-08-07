import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CheckIcon,
  DownloadIcon,
  ImageIcon,
  ListChecksIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedTabsList, SegmentedTabsTrigger } from "@/components/ui/segmented-tabs";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTimedConfirmation } from "@/hooks/use-timed-confirmation";
import {
  REQUEST_FILTERS,
  formatCompletionTime,
  formatRequestTiming,
  generationMethodDisplayName,
  payloadSize,
  requestStatusDisplayLabel,
  type AppSettings,
  type ImageRequestRecord,
  type RequestFilter,
} from "@/lib/image-console";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const DELETE_CONFIRMATION_TIMEOUT_MS = 3000;

function statusVariant(status: string) {
  if (status === "error" || status === "canceled") return "destructive" as const;
  return "default" as const;
}

function statusBadgeClassName(status: string) {
  if (status === "running") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
  }

  if (status === "queued") {
    return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300";
  }

  if (status === "done") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  }

  return "";
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function RequestRow({
  request,
  selected,
  timing,
  payloadSizeText,
  buttonRef,
  onCancelRequest,
  onDeleteRequest,
  onSelect,
  onExportRequest,
  imageSelectionMode,
  selectedImageKeys,
  onToggleImageSelection,
}: {
  request: ImageRequestRecord;
  selected: boolean;
  timing: string;
  payloadSizeText: string;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onCancelRequest?: (id: string) => void;
  onDeleteRequest?: (id: string) => void;
  onSelect: () => void;
  onExportRequest: (id: string) => void;
  imageSelectionMode: boolean;
  selectedImageKeys: ReadonlySet<string>;
  onToggleImageSelection: (key: string) => void;
}) {
  const { copy, language } = useI18n();
  const { pendingKey: pendingDeleteRequestId, requestConfirmation } = useTimedConfirmation(DELETE_CONFIRMATION_TIMEOUT_MS);
  const requestSummary = `${generationMethodDisplayName(request.method)} · ${payloadSizeText}`;
  const requestDetail =
    request.error || (request.status === "done" ? formatCompletionTime(request.completedAt, language === "en" ? "en" : "zh") : "");
  const thumbnail = request.thumbnail || null;
  const thumbnailSelectionKey = `${request.id}-0`;
  const thumbnailSelected = selectedImageKeys.has(thumbnailSelectionKey);
  const isActive = request.status === "queued" || request.status === "running";
  const isConfirmingDelete = !isActive && pendingDeleteRequestId === request.id;
  const actionLabel = isActive
    ? copy.requestCardStatus.cancel
    : isConfirmingDelete
      ? copy.requestCardStatus.confirmDelete
      : copy.requestCardStatus.delete;
  const actionAriaLabel = isActive
    ? copy.requestCardStatus.cancel
    : isConfirmingDelete
      ? `${copy.requestCardStatus.confirmDelete} ${request.title}`
      : language === "en"
        ? `Delete ${request.title}`
        : `删除 ${request.title}`;
  const ActionIcon = isActive ? XIcon : isConfirmingDelete ? CheckIcon : Trash2Icon;

  return (
    <div
      className={cn(
        "relative grid min-h-22 w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 overflow-hidden rounded-xl border border-border bg-card p-2 text-card-foreground transition-[border-color,background-color,box-shadow]",
        "hover:border-foreground/15 hover:bg-muted/40",
        selected && "border-foreground/20 bg-[oklch(0.985_0.006_255)]",
      )}
    >
      <button
        type="button"
        className="grid min-w-0 cursor-pointer grid-cols-[6rem_minmax(0,1fr)] items-start gap-3 text-left focus:outline-none"
        ref={buttonRef}
        onClick={onSelect}
        aria-label={language === "en" ? `View ${request.title} result` : `查看 ${request.title} 的生成结果`}
      >
        <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30">
          {thumbnail ? (
            <img
              src={thumbnail.src}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="block h-full w-full object-cover object-center"
            />
          ) : (
            <ImageIcon aria-hidden="true" className="size-6 text-muted-foreground" />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-1 overflow-hidden py-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <Badge variant={statusVariant(request.status)} className={statusBadgeClassName(request.status)}>
              {requestStatusDisplayLabel(copy.requestStatusLabels, request.status)}
            </Badge>
            <strong className="min-w-0 truncate text-sm font-semibold">{request.title}</strong>
          </span>
          <span className="block min-w-0 truncate text-xs font-medium text-muted-foreground">{timing}</span>
          <span className="block min-w-0 truncate text-xs text-muted-foreground" title={requestSummary}>
            {requestSummary}
          </span>
          {requestDetail ? (
            <span className="block min-w-0 truncate text-xs text-muted-foreground" title={requestDetail}>
              {requestDetail}
            </span>
          ) : null}
        </span>
      </button>
      {imageSelectionMode && request.status === "done" && !request.detailsMissing && thumbnail ? (
        <label
          className="absolute top-3 left-3 z-20 flex cursor-pointer items-center"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={thumbnailSelected}
            className="bg-background data-[state=checked]:bg-primary"
            onCheckedChange={() => onToggleImageSelection(thumbnailSelectionKey)}
            aria-label={copy.imageSelection.imageLabel(request.title, 1)}
          />
        </label>
      ) : null}
      <span className="flex h-full shrink-0 flex-col items-end justify-between gap-2 pt-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={cn(
                "shrink-0 text-muted-foreground hover:text-foreground",
                isConfirmingDelete && "text-destructive hover:text-destructive",
              )}
              aria-label={actionAriaLabel}
              onClick={(event) => {
                event.stopPropagation();
                if (isActive) {
                  onCancelRequest?.(request.id);
                  return;
                }
                if (!requestConfirmation(request.id)) return;
                onDeleteRequest?.(request.id);
              }}
            >
              <ActionIcon data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{actionLabel}</TooltipContent>
        </Tooltip>
        {request.status === "done" && !request.detailsMissing && thumbnail ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={copy.requestCardStatus.exportImage}
                onClick={(event) => {
                  event.stopPropagation();
                  onExportRequest(request.id);
                }}
              >
                <DownloadIcon data-icon="inline-start" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copy.requestCardStatus.exportImage}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
    </div>
  );
}

export function RequestListPanel({
  filteredRequests,
  selectedRequestId,
  selectedRequestFilter,
  requestCounts,
  now,
  settings,
  settingsOpen,
  clearDialogOpen,
  jsonDialogOpen,
  extraModalOpen,
  onSelectRequest,
  onCancelRequest,
  onDeleteRequest,
  onExportRequest,
  onFilterChange,
  onOpenExportZip,
  imageSelectionMode,
  selectedImageCount,
  selectedImageKeys,
  onToggleImageSelectionMode,
  onToggleImageSelection,
}: {
  filteredRequests: ImageRequestRecord[];
  selectedRequestId: string | null;
  selectedRequestFilter: RequestFilter;
  requestCounts: Record<RequestFilter, number>;
  now: number;
  settings: AppSettings;
  settingsOpen: boolean;
  clearDialogOpen: boolean;
  jsonDialogOpen: boolean;
  extraModalOpen: boolean;
  onSelectRequest: (id: string) => void;
  onCancelRequest: (id: string) => void;
  onDeleteRequest: (id: string) => void;
  onExportRequest: (id: string) => void;
  onFilterChange: (filter: RequestFilter) => void;
  onOpenExportZip: () => void;
  imageSelectionMode: boolean;
  selectedImageCount: number;
  selectedImageKeys: ReadonlySet<string>;
  onToggleImageSelectionMode: () => void;
  onToggleImageSelection: (key: string) => void;
}) {
  const { copy, language } = useI18n();
  const hasRequests = requestCounts.all > 0;
  const hasDoneRequests = requestCounts.done > 0;
  const requestSummary = copy.requestSummary(settings);
  const requestButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const [deleteSelectionDialogOpen, setDeleteSelectionDialogOpen] = useState(false);
  const selectedRequestIds = Array.from(
    new Set(
      Array.from(selectedImageKeys)
        .map((key) => key.slice(0, key.lastIndexOf("-")))
        .filter(Boolean),
    ),
  );

  function focusRequest(id: string) {
    requestButtonRefs.current.get(id)?.focus();
  }

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (isEditableKeyboardTarget(event.target)) return;
      if (settingsOpen || clearDialogOpen || jsonDialogOpen || extraModalOpen || deleteSelectionDialogOpen) return;
      if (!filteredRequests.length) return;

      event.preventDefault();

      const currentIndex = filteredRequests.findIndex((request) => request.id === selectedRequestId);
      const step = event.key === "ArrowDown" ? 1 : -1;
      const nextRequest =
        currentIndex >= 0
          ? filteredRequests[currentIndex + step] || filteredRequests[currentIndex]
          : event.key === "ArrowDown"
            ? filteredRequests[0]
            : filteredRequests[filteredRequests.length - 1];

      if (!nextRequest) return;

      onSelectRequest(nextRequest.id);
      focusRequest(nextRequest.id);
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [clearDialogOpen, deleteSelectionDialogOpen, extraModalOpen, filteredRequests, jsonDialogOpen, onSelectRequest, selectedRequestId, settingsOpen]);

  return (
    <aside className="relative flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card shadow-none" aria-label={copy.requestList}>
      <div className="flex min-h-14 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <strong className="shrink-0 text-sm leading-none">{copy.requestList}</strong>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="min-w-0 truncate text-xs font-medium tabular-nums text-muted-foreground">
                {requestSummary}
              </span>
            </TooltipTrigger>
            <TooltipContent>{requestSummary}</TooltipContent>
          </Tooltip>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={imageSelectionMode ? "secondary" : "outline"}
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2 text-xs"
              disabled={!hasDoneRequests}
              onClick={onToggleImageSelectionMode}
            >
              <ListChecksIcon data-icon="inline-start" />
              {imageSelectionMode
                ? selectedImageCount > 0
                  ? copy.imageSelection.selected(selectedImageCount)
                  : copy.imageSelection.exit
                : copy.imageSelection.enter}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{imageSelectionMode ? copy.imageSelection.exit : copy.imageSelection.enter}</TooltipContent>
        </Tooltip>
      </div>

      <div className="px-3 py-2">
        <Tabs value={selectedRequestFilter} onValueChange={(value) => onFilterChange(value as RequestFilter)}>
          <SegmentedTabsList className="w-full">
            {REQUEST_FILTERS.map((filter) => (
              <SegmentedTabsTrigger key={filter} value={filter} className="gap-1 px-1.5">
                <span className="truncate">{copy.filterLabels[filter]}</span>
                <span className="shrink-0 tabular-nums">{requestCounts[filter]}</span>
              </SegmentedTabsTrigger>
            ))}
          </SegmentedTabsList>
        </Tabs>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className={cn("grid gap-2 p-3", imageSelectionMode && selectedImageCount > 0 && "pb-24")}>
          {!hasRequests ? (
            <Empty className="min-h-40 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ImageIcon />
                </EmptyMedia>
                <EmptyTitle>{copy.filterEmptyText.all}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : filteredRequests.length ? (
            filteredRequests.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                selected={request.id === selectedRequestId}
                timing={formatRequestTiming(request, now, language === "en" ? "en" : "zh")}
                payloadSizeText={payloadSize(request.payload)}
                buttonRef={(element) => {
                  if (element) {
                    requestButtonRefs.current.set(request.id, element);
                  } else {
                    requestButtonRefs.current.delete(request.id);
                  }
                }}
                onCancelRequest={onCancelRequest}
                onDeleteRequest={onDeleteRequest}
                onSelect={() => {
                  onSelectRequest(request.id);
                }}
                onExportRequest={onExportRequest}
                imageSelectionMode={imageSelectionMode}
                selectedImageKeys={selectedImageKeys}
                onToggleImageSelection={onToggleImageSelection}
              />
            ))
          ) : (
            <Empty className="min-h-40 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AlertCircleIcon />
                </EmptyMedia>
                <EmptyTitle>{copy.filterEmptyText[selectedRequestFilter]}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </ScrollArea>

      {imageSelectionMode && selectedImageCount > 0 ? (
        <div className="absolute right-3 bottom-3 left-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/95 p-2.5 shadow-lg backdrop-blur">
          <span className="min-w-0 text-xs font-medium text-muted-foreground">
            {copy.imageSelection.selected(selectedImageCount)}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setDeleteSelectionDialogOpen(true)}
            >
              <Trash2Icon data-icon="inline-start" />
              {copy.imageSelection.deleteButton}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={onOpenExportZip}
            >
              <DownloadIcon data-icon="inline-start" />
              {copy.imageSelection.exportButton}
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={deleteSelectionDialogOpen} onOpenChange={setDeleteSelectionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.imageSelection.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.imageSelection.deleteDescription(selectedRequestIds.length)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.clearDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20"
              onClick={() => {
                selectedRequestIds.forEach((id) => onDeleteRequest(id));
                setDeleteSelectionDialogOpen(false);
                onToggleImageSelectionMode();
              }}
            >
              {copy.imageSelection.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
