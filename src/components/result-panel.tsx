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
  RefreshCwIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  imageDownloadName,
  imageBlobFromDataUrl,
  payloadSize,
  requestStatusDisplayLabel,
  revisedPromptForResponse,
  reusablePromptForRequest,
  type AppSettings,
  type GeneratedImage,
  type ImageRequestRecord,
} from "@/lib/image-console";
import { getCopy, useI18n, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { createZipBlob, type ZipFileEntry } from "@/lib/zip";
import type { ConnectionStatus } from "@/hooks/use-image-console";

const REQUEST_ERROR_PREVIEW_LIMIT = 240;

function truncateDisplayText(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

async function generatedImageBlob(image: GeneratedImage) {
  if (image.blob instanceof Blob) return image.blob;
  if (String(image.src || "").startsWith("blob:")) {
    try {
      const response = await fetch(image.src);
      if (!response.ok) return null;
      const blob = await response.blob();
      return blob.size ? blob : null;
    } catch {
      return null;
    }
  }
  if (image.kind === "base64") {
    return imageBlobFromDataUrl(image.src, image.mimeType?.replace(/^image\//i, "") || "png");
  }

  try {
    const response = await fetch(image.src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size ? blob : null;
  } catch {
    return null;
  }
}

function archiveDownloadName(title: string) {
  const safeTitle = String(title || "images")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "images";
  return `ImageX-${safeTitle}.zip`;
}

function latencyToneClass(state: "idle" | "measuring" | "ready" | "unavailable", value: number | null) {
  if (state !== "ready" || value === null) return "text-muted-foreground";
  if (value <= 150) return "text-emerald-600 dark:text-emerald-400";
  if (value <= 500) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

const LATENCY_CHECK_INTERVAL_MS = 60_000;

async function downloadRequestImages(request: Pick<ImageRequestRecord, "images" | "payload" | "title" | "method">) {
  const images = request.images || [];

  if (images.length > 1) {
    const entries: ZipFileEntry[] = [];
    for (const [index, image] of images.entries()) {
      if (!image?.src) continue;
      const blob = await generatedImageBlob(image);
      if (!blob) continue;
      entries.push({ name: imageDownloadName(request, index), blob });
    }

    if (entries.length) {
      const zipBlob = await createZipBlob(entries);
      downloadBlob(zipBlob, archiveDownloadName(request.title));
    }
    return;
  }

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
  previewTarget,
}: {
  request: ImageRequestRecord | null;
  loading: boolean;
  onEditImage: (value: string) => void;
  onAnnotateImage: (value: string) => void;
  previewTarget: { requestId: string; imageIndex: number; signal: number } | null;
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
    if (!previewTarget || previewTarget.requestId !== requestId || !displayImageCount) return;
    setPreviewImageIndex(Math.min(Math.max(previewTarget.imageIndex, 0), displayImageCount - 1));
  }, [displayImageCount, previewTarget, requestId]);

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
                <div className="absolute top-3 right-3 z-10 flex items-center gap-2 opacity-95 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        aria-label={copy.requestCardStatus.annotateImage}
                        className="!size-9 border border-border/80 bg-background/95 shadow-md backdrop-blur transition-transform hover:scale-105 [&_svg]:!size-4.5"
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
                        size="icon-sm"
                        aria-label={copy.requestCardStatus.editImage}
                        className="!size-9 border border-border/80 bg-background/95 shadow-md backdrop-blur transition-transform hover:scale-105 [&_svg]:!size-4.5"
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
                        size="icon-sm"
                        aria-label={copy.requestCardStatus.rotateCounterclockwise}
                        className="!size-9 border border-border/80 bg-background/95 shadow-md backdrop-blur transition-transform hover:scale-105 [&_svg]:!size-4.5"
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
  settings,
  selectedRequestJson,
  setJsonDialogOpen,
  reusePrompt,
  onEditImage,
  onAnnotateImage,
  previewTarget,
  connectionStatus,
  testConnectionStatus,
  onTestConnection,
}: {
  selectedRequest: ImageRequestRecord | null;
  selectedRequestDetailLoadingId: string | null;
  settings: Pick<AppSettings, "protocol" | "baseUrl" | "privateBaseUrl" | "geminiBaseUrl" | "openaiProviders" | "activeOpenAIProviderId" | "requestConcurrency" | "requestIntervalSeconds">;
  connectionStatus: ConnectionStatus;
  testConnectionStatus: ConnectionStatus;
  onTestConnection: () => void | Promise<void>;
  selectedRequestJson: string;
  setJsonDialogOpen: (open: boolean) => void;
  reusePrompt: (request: ImageRequestRecord) => void;
  onEditImage: (value: string) => void;
  onAnnotateImage: (value: string) => void;
  previewTarget: { requestId: string; imageIndex: number; signal: number } | null;
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
  const selectedProductSuiteAssociation = selectedRequest?.productSuiteSlotKey && selectedRequest.productSuiteVersion
    ? `${selectedRequest.productSuiteBatchNumber ? `${copy.productSuite.batchShortLabel(selectedRequest.productSuiteBatchNumber)} · ` : ""}${copy.productSuite.slotLabels[selectedRequest.productSuiteSlotKey] || selectedRequest.productSuiteSlotKey} · v${selectedRequest.productSuiteVersion}`
    : "";
  const selectedRequestMetaText = selectedProductSuiteAssociation
    ? `${selectedProductSuiteAssociation} · ${selectedRequestStatusText}`
    : selectedRequestStatusText;
  const inputPromptTooltip = selectedRequest?.sourcePrompt?.trim() || (language === "en" ? "No input prompt" : "暂无输入提示词");
  const revisedPromptTooltip = revisedPromptForResponse(selectedRequest?.response) || (language === "en" ? "No revised_prompt found" : "未找到 revised_prompt");
  const activeProvider = settings.openaiProviders.find((provider) => provider.id === settings.activeOpenAIProviderId);
  const providerName = activeProvider?.name || (language === "en" ? "Provider" : "供应商");
  const protocolLabel = settings.protocol === "private" ? (language === "en" ? "Private" : "私有协议") : settings.protocol === "gemini" ? "Gemini" : "OpenAI";
  const appSettings = settings as AppSettings;
  const apiUrl = (settings.protocol === "private" ? appSettings.privateBaseUrl : settings.protocol === "gemini" ? appSettings.geminiBaseUrl : settings.baseUrl).trim();
  const apiKey = (settings.protocol === "private" ? appSettings.privateApiKey : settings.protocol === "gemini" ? appSettings.geminiApiKey : appSettings.apiKey).trim();
  const configurationIssue = settings.protocol === "openai" && !activeProvider
    ? (language === "en" ? "Provider" : "供应商")
    : !apiUrl
      ? copy.settings.apiUrl
      : !apiKey
        ? (settings.protocol === "private" ? copy.settings.privateApiKey : settings.protocol === "gemini" ? copy.settings.geminiApiKey : copy.settings.apiKey)
        : null;
  const [latency, setLatency] = useState<number | null>(null);
  const [latencyState, setLatencyState] = useState<"idle" | "measuring" | "ready" | "unavailable">("idle");
  const [latencyCooldownUntil, setLatencyCooldownUntil] = useState(0);
  const [latencyCooldownSeconds, setLatencyCooldownSeconds] = useState(0);
  const latencyAbortRef = useRef<AbortController | null>(null);
  const latencyRequestRef = useRef(0);
  const latencyLastCheckAtRef = useRef(0);

  const refreshLatency = useCallback(async () => {
    const now = Date.now();
    if (now - latencyLastCheckAtRef.current < LATENCY_CHECK_INTERVAL_MS) return false;
    const requestId = ++latencyRequestRef.current;
    latencyAbortRef.current?.abort();
    if (!apiUrl) {
      setLatency(null);
      setLatencyState("unavailable");
      return false;
    }
    latencyLastCheckAtRef.current = now;
    setLatencyCooldownUntil(now + LATENCY_CHECK_INTERVAL_MS);
    const controller = new AbortController();
    latencyAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);
    setLatency(null);
    setLatencyState("measuring");
    const startedAt = performance.now();
    try {
      const target = new URL(apiUrl, window.location.href).toString();
      await fetch(target, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: controller.signal });
      if (requestId !== latencyRequestRef.current) return false;
      setLatency(Math.max(1, Math.round(performance.now() - startedAt)));
      setLatencyState("ready");
      return true;
    } catch {
      if (requestId !== latencyRequestRef.current) return false;
      setLatencyState("unavailable");
      return false;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [apiUrl]);

  useEffect(() => () => {
    latencyRequestRef.current += 1;
    latencyAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    latencyRequestRef.current += 1;
    latencyAbortRef.current?.abort();
    latencyLastCheckAtRef.current = 0;
    setLatencyCooldownUntil(0);
    setLatency(null);
    setLatencyState("idle");
  }, [apiUrl]);

  useEffect(() => {
    if (testConnectionStatus.tone === "ok") void refreshLatency();
  }, [refreshLatency, testConnectionStatus.tone]);

  useEffect(() => {
    const updateCooldown = () => {
      setLatencyCooldownSeconds(Math.max(0, Math.ceil((latencyCooldownUntil - Date.now()) / 1000)));
    };
    updateCooldown();
    if (!latencyCooldownUntil) return;
    const timer = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(timer);
  }, [latencyCooldownUntil]);

  useEffect(() => {
    if (configurationIssue) return;
    const runAutomaticCheck = () => {
      if (document.visibilityState === "visible") void refreshLatency();
    };
    const timer = window.setInterval(runAutomaticCheck, LATENCY_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", runAutomaticCheck);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", runAutomaticCheck);
    };
  }, [configurationIssue, refreshLatency]);

  const latencyLabel = latencyState === "idle"
    ? "-"
    : latencyState === "measuring"
      ? copy.requestCardStatus.latencyMeasuring
    : latencyState === "ready" && latency !== null
      ? `${latency} ms`
      : copy.requestCardStatus.latencyUnavailable;
  const availability = configurationIssue
    ? { label: `${copy.requestCardStatus.availabilityUnconfigured} · ${configurationIssue}`, className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300" }
    : testConnectionStatus.tone === "error" || latencyState === "unavailable"
    ? { label: copy.requestCardStatus.latencyUnavailable, className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300" }
    : latencyState === "measuring" || testConnectionStatus.tone === "busy"
      ? { label: copy.requestCardStatus.latencyMeasuring, className: "border-border bg-muted text-muted-foreground" }
      : testConnectionStatus.tone !== "ok"
        ? { label: copy.requestCardStatus.availabilityUntested, className: "border-border bg-muted text-muted-foreground" }
      : latencyState === "ready" && latency !== null
        ? latency <= 150
          ? { label: copy.requestCardStatus.availabilityVeryFast, className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300" }
          : latency <= 300
            ? { label: copy.requestCardStatus.availabilityFast, className: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-300" }
            : latency <= 500
              ? { label: copy.requestCardStatus.availabilityNormal, className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300" }
              : latency <= 1000
                ? { label: copy.requestCardStatus.availabilitySlow, className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300" }
                : { label: copy.requestCardStatus.availabilityVerySlow, className: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300" }
        : { label: copy.requestCardStatus.availabilityChecking, className: "border-border bg-muted text-muted-foreground" };

  return (
    <section
      className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-none"
      aria-live="polite"
      aria-label={copy.resultSectionLabel}
    >
      <h2 className="sr-only">{copy.resultSectionLabel}</h2>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-16 flex-wrap items-start justify-between gap-3 px-4 pt-3 pb-1">
          <div className="flex min-w-0 flex-1 flex-col gap-2 self-start">
            <strong className="block min-w-0 truncate text-sm font-semibold leading-normal">
              {selectedRequest?.title || copy.requestCardStatus.unselectedTitle}
            </strong>
            <span className="block min-w-0 truncate text-xs font-medium leading-normal text-muted-foreground" title={selectedRequestMetaText}>{selectedRequestMetaText}</span>
          </div>
          <div className="flex min-w-0 flex-col items-end gap-2 self-start">
            <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-3 text-sm font-semibold leading-normal">
              <span className="max-w-full truncate" title={`${providerName} · ${protocolLabel}`}>{providerName} · {protocolLabel}</span>
              <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${availability.className}`}>{availability.label}</span>
            </div>
            <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs font-medium leading-normal text-muted-foreground tabular-nums">
              <span>{copy.settings.concurrency} {settings.requestConcurrency}</span>
              <span>{copy.requestCardStatus.interval} {settings.requestIntervalSeconds}s</span>
              <span className={latencyToneClass(latencyState, latency)}>
                {copy.requestCardStatus.latency} {latencyLabel}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-xs" className="size-5" disabled={Boolean(configurationIssue) || latencyState === "measuring" || testConnectionStatus.tone === "busy" || latencyCooldownSeconds > 0} onClick={() => void onTestConnection()} aria-label={latencyCooldownSeconds > 0 ? copy.requestCardStatus.latencyCooldown(latencyCooldownSeconds) : copy.requestCardStatus.testConnection}>
                    <RefreshCwIcon className={latencyState === "measuring" ? "animate-spin" : undefined} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{latencyCooldownSeconds > 0 ? copy.requestCardStatus.latencyCooldown(latencyCooldownSeconds) : copy.requestCardStatus.testConnection}</TooltipContent>
              </Tooltip>
            </div>
          </div>
          </div>

        <div className="min-h-0 min-w-0 w-full max-w-full flex-1 overflow-hidden px-3 pt-1 pb-3">
          <Gallery
            request={selectedRequest}
            loading={selectedRequestDetailLoading}
            onEditImage={onEditImage}
            onAnnotateImage={onAnnotateImage}
            previewTarget={previewTarget}
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-3 pb-3">
          <ActionSlot visible={Boolean(canDownload)} label={copy.requestCardStatus.download}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-md"
              disabled={!selectedRequest?.images?.length}
              onClick={() => {
                if (!selectedRequest?.images?.length) return;
                void downloadRequestImages(selectedRequest);
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
                  className="h-8 rounded-md"
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
                  className="h-8 rounded-md"
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
    </section>
  );
}
