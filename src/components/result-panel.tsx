import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  FileJsonIcon,
  ImageIcon,
  Loader2Icon,
  PencilRulerIcon,
  QuoteIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  imageDownloadName,
  payloadSize,
  requestStatusDisplayLabel,
  revisedPromptForResponse,
  reusablePromptForRequest,
  type GeneratedImage,
  type ImageRequestRecord,
} from "@/lib/image-console";
import { getCopy, useI18n, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const REQUEST_ERROR_PREVIEW_LIMIT = 240;

interface StatusMessage {
  state: string;
  detail: string;
}

function truncateDisplayText(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

function downloadRequestImages(request: Pick<ImageRequestRecord, "images" | "payload" | "title" | "method">) {
  const images = request.images || [];
  for (const [index, image] of images.entries()) {
    if (!image?.src) continue;

    const isRemoteUrlFallback = /^https?:\/\//i.test(image.src);
    const anchor = document.createElement("a");
    anchor.href = image.src;
    anchor.rel = "noopener";
    if (isRemoteUrlFallback) {
      anchor.target = "_blank";
    } else {
      anchor.download = imageDownloadName(request, index);
    }
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
}

function selectedRequestEmptyText(request: ImageRequestRecord | null, loading = false, language: Language = "zh") {
  const copy = getCopy(language);
  if (!request) return copy.requestCardEmpty.noImage;
  if (request.status === "queued") return copy.requestCardEmpty.queued;
  if (request.status === "running") return copy.requestCardEmpty.running;
  if (request.status === "canceled") return truncateDisplayText(request.error || copy.requestCardEmpty.canceled, REQUEST_ERROR_PREVIEW_LIMIT);
  if (request.status === "error") return truncateDisplayText(request.error || copy.requestCardEmpty.error, REQUEST_ERROR_PREVIEW_LIMIT);
  if (loading) return copy.requestCardEmpty.loading;
  if (request.detailsMissing) return copy.requestCardEmpty.restored;
  return copy.requestCardEmpty.missing;
}

function selectedRequestImageResolution(request: ImageRequestRecord | null) {
  if (request?.imageResolution) return request.imageResolution;
  const image = request?.images?.[0];
  if (!image?.width || !image.height) return "";
  return `${image.width}x${image.height}`;
}

function selectedRequestImageSize(request: ImageRequestRecord | null) {
  const bytes = Number(request?.imageSizeBytes || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function ActionSlot({
  visible,
  label,
  children,
}: {
  visible: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="shrink-0">
      {visible ? (
        children
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="invisible pointer-events-none"
          tabIndex={-1}
          aria-hidden="true"
        >
          {label}
        </Button>
      )}
    </div>
  );
}

function Gallery({
  request,
  loading,
  onEditImage,
  onAnnotateImage,
}: {
  request: ImageRequestRecord | null;
  loading: boolean;
  onEditImage: (value: string) => void;
  onAnnotateImage: (value: string) => void;
}) {
  const { copy, language } = useI18n();
  const images = request?.status === "done" && !request.detailsMissing ? request.images : [];
  const requestId = request?.id || "";
  const [rotationByImageKey, setRotationByImageKey] = useState<Record<string, number>>({});
  const [previewImageIndex, setPreviewImageIndex] = useState<number | null>(null);
  const isDetailLoading = Boolean(
    request &&
      request.status === "done" &&
      !request.detailsMissing &&
      !images.length &&
      (loading || request.hasCachedDetails),
  );
  const displayImageCount = request?.status === "done" && !request.detailsMissing ? images.length : 0;

  useEffect(() => {
    setRotationByImageKey({});
    setPreviewImageIndex(null);
  }, [requestId]);

  useEffect(() => {
    if (previewImageIndex === null || displayImageCount < 2) return;
    function handlePreviewKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPreviewImageIndex((current) => current === null ? current : (current - 1 + displayImageCount) % displayImageCount);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setPreviewImageIndex((current) => current === null ? current : (current + 1) % displayImageCount);
      }
    }
    window.addEventListener("keydown", handlePreviewKeyDown);
    return () => window.removeEventListener("keydown", handlePreviewKeyDown);
  }, [displayImageCount, previewImageIndex]);

  if (isDetailLoading) {
    return (
      <div className="grid h-full min-h-0 w-full max-w-full place-items-center overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2Icon className="size-6 animate-spin" />
          <span className="text-sm">{selectedRequestEmptyText(request, true, language)}</span>
        </div>
      </div>
    );
  }

  if (!displayImageCount) {
    return (
      <div className="grid h-full min-h-0 w-full max-w-full grid-cols-1 gap-3 overflow-hidden">
        <Empty className="min-h-0 w-full max-w-full overflow-hidden border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {loading ? <Loader2Icon className="animate-spin" /> : <ImageIcon />}
            </EmptyMedia>
            <EmptyTitle>{selectedRequestEmptyText(request, loading, language)}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const gridClass = displayImageCount === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]";

  const previewImage = previewImageIndex === null ? null : images[previewImageIndex] || null;

  return (
    <>
      <div className={cn("grid h-full min-h-0 w-full max-w-full gap-3 overflow-hidden", gridClass)}>
      {Array.from({ length: displayImageCount }, (_, index) => {
        const image = (images[index] || null) as GeneratedImage | null;
        const imageKey = `${requestId || "empty"}-${index}`;
        const rotation = rotationByImageKey[imageKey] || 0;
        const altSize = payloadSize(request?.payload);
        const altMode = request?.method || "";
        return (
          <article
            key={imageKey}
            className={cn(
              "image-checkerboard group relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-lg border",
            )}
          >
            {image ? (
              <>
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 transition-opacity pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-xs"
                        aria-label={copy.requestCardStatus.annotateImage}
                        className="border border-border/70 bg-background/85 shadow-sm backdrop-blur"
                        onClick={() => onAnnotateImage(`${requestId}:${index}`)}
                      >
                        <PencilRulerIcon data-icon="inline-start" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={8}>{copy.requestCardStatus.annotateImage}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-xs"
                        aria-label={copy.requestCardStatus.editImage}
                        className="border border-border/70 bg-background/85 shadow-sm backdrop-blur"
                        onClick={() => onEditImage(`${requestId}:${index}`)}
                      >
                        <QuoteIcon data-icon="inline-start" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={8}>{copy.requestCardStatus.editImage}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-xs"
                        aria-label={copy.requestCardStatus.rotateCounterclockwise}
                        className="border border-border/70 bg-background/85 shadow-sm backdrop-blur"
                        onClick={() =>
                          setRotationByImageKey((current) => ({
                            ...current,
                            [imageKey]: (current[imageKey] || 0) - 90,
                          }))
                        }
                      >
                        <RotateCcwIcon data-icon="inline-start" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={8}>{copy.requestCardStatus.rotateCounterclockwise}</TooltipContent>
                  </Tooltip>
                </div>
                <button type="button" className="flex h-full w-full min-w-0 cursor-zoom-in items-center justify-center" aria-label={`${copy.requestCardStatus.previewImage} ${index + 1}`} onClick={() => setPreviewImageIndex(index)}>
                  <img
                    src={image.src}
                    alt={copy.generatedImageAlt(index, { size: altSize, mode: altMode })}
                    loading="lazy"
                    className="block h-auto max-h-full max-w-full min-w-0 object-contain transition-transform duration-200"
                    style={{ transform: `rotate(${rotation}deg)` }}
                  />
                </button>
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                {loading ? <Loader2Icon className="size-5 animate-spin text-muted-foreground" /> : <ImageIcon className="size-6 text-muted-foreground" />}
              </div>
            )}
          </article>
        );
      })}
      </div>
      <DialogPrimitive.Root open={previewImageIndex !== null} onOpenChange={(open) => { if (!open) setPreviewImageIndex(null); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content aria-describedby={undefined} onClick={() => setPreviewImageIndex(null)} className="fixed inset-0 z-50 flex items-center justify-center outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0">
            <DialogPrimitive.Title className="sr-only">{copy.requestCardStatus.previewImage}</DialogPrimitive.Title>
            {previewImage ? <img src={previewImage.src} alt={copy.requestCardStatus.previewImage} className="block max-h-[85vh] w-auto max-w-[calc(100vw-7rem)] object-contain" onClick={(event) => event.stopPropagation()} /> : null}
            {displayImageCount > 1 ? (
              <>
                <Button type="button" variant="secondary" size="icon" className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/85 shadow-sm backdrop-blur" aria-label={copy.requestCardStatus.previewPreviousImage} onClick={(event) => { event.stopPropagation(); setPreviewImageIndex((current) => current === null ? current : (current - 1 + displayImageCount) % displayImageCount); }}>
                  <ChevronLeftIcon />
                </Button>
                <Button type="button" variant="secondary" size="icon" className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/85 shadow-sm backdrop-blur" aria-label={copy.requestCardStatus.previewNextImage} onClick={(event) => { event.stopPropagation(); setPreviewImageIndex((current) => current === null ? current : (current + 1) % displayImageCount); }}>
                  <ChevronRightIcon />
                </Button>
              </>
            ) : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

export function ResultPanel({
  selectedRequest,
  selectedRequestDetailLoadingId,
  statusMessage,
  selectedRequestJson,
  setJsonDialogOpen,
  reusePrompt,
  onEditImage,
  onAnnotateImage,
}: {
  selectedRequest: ImageRequestRecord | null;
  selectedRequestDetailLoadingId: string | null;
  statusMessage: StatusMessage;
  selectedRequestJson: string;
  setJsonDialogOpen: (open: boolean) => void;
  reusePrompt: (request: ImageRequestRecord) => void;
  onEditImage: (value: string) => void;
  onAnnotateImage: (value: string) => void;
}) {
  const { copy, language } = useI18n();
  const canDownload = selectedRequest?.status === "done";
  const canReuse = Boolean(selectedRequest && reusablePromptForRequest(selectedRequest));
  const canShowResponseJson = Boolean(selectedRequest && selectedRequest.status !== "queued" && selectedRequest.status !== "running");
  const responseJsonDisabled = !selectedRequestJson;
  const selectedRequestDetailLoading = selectedRequestDetailLoadingId === selectedRequest?.id;
  const selectedRequestResolution = selectedRequestImageResolution(selectedRequest);
  const selectedRequestSize = selectedRequestImageSize(selectedRequest);
  const selectedRequestStatusText = selectedRequest
    ? `${requestStatusDisplayLabel(copy.requestStatusLabels, selectedRequest.status)}${selectedRequestResolution ? ` · ${selectedRequestResolution}` : ""}${selectedRequestSize ? ` · ${selectedRequestSize}` : ""}`
    : copy.requestCardStatus.unselectedSubtitle;
  const inputPromptTooltip = selectedRequest?.sourcePrompt?.trim() || (language === "en" ? "No input prompt" : "暂无输入提示词");
  const revisedPromptTooltip = revisedPromptForResponse(selectedRequest?.response) || (language === "en" ? "No revised_prompt found" : "未找到 revised_prompt");

  return (
    <section
      className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-none"
      aria-live="polite"
      aria-label={copy.resultSectionLabel}
    >
      <h2 className="sr-only">{copy.resultSectionLabel}</h2>
      <div className="flex min-h-12 items-center gap-3 px-4">
        <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
          {statusMessage.state} · {statusMessage.detail}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2">
          <div className="min-w-0 flex-1">
            <strong className="block min-w-0 truncate text-sm font-semibold">
              {selectedRequest?.title || copy.requestCardStatus.unselectedTitle}
            </strong>
            <span className="truncate text-xs font-medium text-muted-foreground">{selectedRequestStatusText}</span>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2 self-center">
            <ActionSlot visible={Boolean(canDownload)} label={copy.requestCardStatus.download}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedRequest?.images?.length}
                onClick={() => {
                  if (!selectedRequest?.images?.length) return;
                  downloadRequestImages(selectedRequest);
                }}
              >
                <DownloadIcon data-icon="inline-start" />
                {copy.requestCardStatus.download}
              </Button>
            </ActionSlot>
            <ActionSlot visible={canShowResponseJson} label={copy.requestCardStatus.responseJson}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={responseJsonDisabled}
                    onClick={() => setJsonDialogOpen(true)}
                  >
                    <FileJsonIcon data-icon="inline-start" />
                    {copy.requestCardStatus.responseJson}
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="whitespace-pre-wrap break-words text-left">
                  {revisedPromptTooltip}
                </TooltipContent>
              </Tooltip>
            </ActionSlot>
            <ActionSlot visible={Boolean(selectedRequest)} label={copy.requestCardStatus.reusePrompt}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canReuse}
                    onClick={() => {
                      if (!selectedRequest) return;
                      reusePrompt(selectedRequest);
                    }}
                  >
                    <CopyIcon data-icon="inline-start" />
                    {copy.requestCardStatus.reusePrompt}
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="whitespace-pre-wrap break-words text-left">
                  {inputPromptTooltip}
                </TooltipContent>
              </Tooltip>
            </ActionSlot>
          </div>
        </div>

        <div className="min-h-0 min-w-0 w-full max-w-full flex-1 overflow-hidden p-3">
          <Gallery
            request={selectedRequest}
            loading={selectedRequestDetailLoading}
            onEditImage={onEditImage}
            onAnnotateImage={onAnnotateImage}
          />
        </div>
      </div>
    </section>
  );
}
