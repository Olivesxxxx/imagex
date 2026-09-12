import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { fetchModels, postGeminiImageGeneration, postImageEdit, postImageGeneration } from "@/lib/api";
import {
  normalizeChatCompletionsEndpoint,
  normalizeImageEditsEndpoint,
  normalizeImageEndpoint,
  normalizeModelsEndpoint,
  normalizeGeminiImageEndpoint,
  normalizeResponsesEndpoint,
} from "@/lib/endpoints";
import {
  buildEditImagePayload,
  buildPrivateEditImagePayload,
  buildPrivateImagePayload,
  buildEditImageRequests,
  buildChatCompletionsImagePayload,
  buildChatCompletionsImageRequests,
  buildGenerationRequests,
  buildPayload,
  applyPromptPolicy,
  buildResponsesImagePayload,
  buildResponsesImageRequests,
  createRequestRecords,
  DEFAULTS,
  DEVELOPMENT_FIXTURES_ENABLED,
  extractImages,
  formatRequestTiming,
  formatBatchPrefix,
  imageCountFromValue,
  imageDownloadName,
  imageBlobFromDataUrl,
  missingImageOutputMessage,
  prepareImageForDetailCacheWithDimensions,
  type ConsoleMode,
  normalizeRequestConcurrency,
  normalizeRequestIntervalSeconds,
  payloadOutputFormat,
  payloadSize,
  prepareImageForDetailCache,
  prepareEditInputImage,
  prepareImageForRuntime,
  prepareImageForThumbnailCache,
  DEFAULT_STORED_SETTINGS,
  normalizeModeSettings,
  normalizeSharedSettings,
  normalizeStrictPromptText,
  MAX_EDIT_INPUT_IMAGES,
  requestFilterCounts,
  requestImageCount,
  requestMatchesFilter,
  reusablePromptForRequest,
  sanitizeResponseForDisplay,
  sortedRequestRecordsForFilter,
  type EditInputImage,
  type AppSettings,
  type GeneratedImage,
  type GenerationMethod,
  type ImageRequestRecord,
  type ModeSettings,
  type OpenAIProvider,
  type SharedSettings,
  type StoredConsoleSettings,
  type RequestFilter,
  mergeSettingsForMode,
  isDefaultStrictPromptText,
} from "@/lib/image-console";
import {
  addPromptToHistory,
  mergePromptHistoryForDisplay,
  pinPromptHistory,
  removePromptFromHistory,
  unpinPromptHistory,
} from "@/lib/prompt-history";
import { applyCompletedRequestResult, applyFailedRequestResult, imageSizeBytes } from "@/lib/request-result";
import { adjacentVisibleRequestId, isActiveRequest, nextQueueRunPlan } from "@/lib/request-queue";
import { createZipBlob, type ZipFileEntry } from "@/lib/zip";
import { clearProductSuiteTasks, renderProductSuitePrompt, type ProductSuiteSlotKey, type ProductSuiteTask } from "@/lib/product-suite";
import {
  clearCachedRequests,
  loadCachedRequests,
  loadLastPromptForMode,
  loadPromptHistoryForMode,
  loadPinnedPromptHistoryForMode,
  loadRequestDetails,
  loadSettings,
  resetSettings as resetStoredSettings,
  deleteRequestDetails,
  saveCachedRequests,
  saveLastPrompt,
  savePromptHistory,
  savePinnedPromptHistory,
  saveRequestDetails,
  saveSettings,
} from "@/lib/storage";
import { getCopy, useI18n } from "@/lib/i18n";

type DevelopmentRequestFixtures = typeof import("@/lib/development-request-fixtures");
let developmentRequestFixturesPromise: Promise<DevelopmentRequestFixtures> | null = null;

function loadDevelopmentRequestFixtures() {
  if (!import.meta.env.DEV) return Promise.resolve<DevelopmentRequestFixtures | null>(null);
  developmentRequestFixturesPromise ??= import("@/lib/development-request-fixtures");
  return developmentRequestFixturesPromise;
}

function isDevelopmentRequest(request: Pick<ImageRequestRecord, "endpoint">) {
  return request.endpoint.startsWith("development://");
}

export type ConnectionTone = "default" | "busy" | "ok" | "error";
export type ConnectionStatus = { label: string; tone: ConnectionTone };

export interface ExportZipProgress {
  current: number;
  total: number;
}

function normalizeSettings(values: AppSettings, defaultStrictPromptText: string): AppSettings {
  const shared = normalizeSharedSettings(values);
  const strictPromptText = normalizeStrictPromptText(values.strictPromptText);
  const normalizedStrictPromptText = isDefaultStrictPromptText(strictPromptText)
    ? defaultStrictPromptText
    : strictPromptText;

  return {
    ...DEFAULTS,
    ...values,
    baseUrl: shared.baseUrl,
    apiKey: shared.apiKey,
    openaiProviders: shared.openaiProviders,
    activeOpenAIProviderId: shared.activeOpenAIProviderId,
    protocol: shared.protocol,
    privateBaseUrl: shared.privateBaseUrl,
    privateApiKey: shared.privateApiKey,
    privateModel: shared.privateModel,
    geminiBaseUrl: shared.geminiBaseUrl,
    geminiApiKey: shared.geminiApiKey,
    geminiModel: shared.geminiModel,
    generationsModel: shared.generationsModel,
    editsModel: shared.editsModel,
    responsesModel: shared.responsesModel,
    completionsModel: shared.completionsModel,
    rememberKey: Boolean(values.rememberKey),
    developmentMode: DEVELOPMENT_FIXTURES_ENABLED && Boolean(values.developmentMode),
    strictPromptText: normalizedStrictPromptText,
    strictPrompt: values.strictPrompt ?? DEFAULTS.strictPrompt,
    requestConcurrency: normalizeRequestConcurrency(values.requestConcurrency),
    requestIntervalSeconds: normalizeRequestIntervalSeconds(values.requestIntervalSeconds),
    n: imageCountFromValue(values.n || DEFAULTS.n),
    background: DEFAULTS.background,
    outputFormat: DEFAULTS.outputFormat,
  };
}

function formatResponseJsonText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") {
    if (value.startsWith("data:image/") && value.length > 240) {
      return `[image data omitted, ${value.length} chars]`;
    }
    return value;
  }
  return JSON.stringify(sanitizeResponseForDisplay(value), null, 2);
}

function isExplicitCrossOriginFetchFailure(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string"
      ? String((error as { message: string }).message).trim().toLowerCase()
      : "";

  if (!message) return false;
  return [
    "cors",
    "cross-origin",
    "cross origin",
    "access-control-allow-origin",
    "access control allow origin",
  ].some((pattern) => message.includes(pattern));
}

function isCrossOriginFetchFailure(endpoint: string, error: unknown) {
  if (!isExplicitCrossOriginFetchFailure(error)) return false;

  try {
    const url = new URL(endpoint, window.location.href);
    if (url.origin === window.location.origin) return false;
    return true;
  } catch {
    return false;
  }
}

function missingConnectionMessage(settings: Pick<AppSettings, "protocol" | "baseUrl" | "apiKey" | "geminiBaseUrl" | "geminiApiKey">, copy: ReturnType<typeof getCopy>) {
  const baseUrl = String(settings.protocol === "gemini" ? settings.geminiBaseUrl : settings.baseUrl || "").trim();
  const apiKey = String(settings.protocol === "gemini" ? settings.geminiApiKey : settings.apiKey || "").trim();
  if (baseUrl && apiKey) return "";
  return copy.generator.connectionRequired;
}

function isBrowserNetworkFailure(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string"
      ? String((error as { message: string }).message).trim().toLowerCase()
      : "";

  return ["failed to fetch", "networkerror", "network error", "load failed"].some((pattern) => message.includes(pattern));
}

function openAIImageOptionsFromSettings(settings: AppSettings) {
  const provider = settings.openaiProviders.find((item) => item.id === settings.activeOpenAIProviderId);
  return {
    imageResponseMode: provider?.imageResponseMode || "auto",
    multiImageField: provider?.multiImageField || "auto",
    streamImages: provider?.streamImages || false,
    streamPartialImages: provider?.streamPartialImages || 2,
  } as const;
}

function sharedSettingsForProvider(shared: SharedSettings, provider?: OpenAIProvider): SharedSettings {
  if (!provider) {
    return { ...shared, protocol: "openai", baseUrl: "", apiKey: "", activeOpenAIProviderId: "" };
  }

  return {
    ...shared,
    protocol: provider.protocol,
    activeOpenAIProviderId: provider.id,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    generationsModel: provider.generationsModel,
    editsModel: provider.editsModel,
    responsesModel: provider.responsesModel,
    completionsModel: provider.completionsModel,
    privateBaseUrl: provider.privateBaseUrl,
    privateApiKey: provider.privateApiKey,
    privateModel: provider.privateModel,
    geminiBaseUrl: provider.geminiBaseUrl,
    geminiApiKey: provider.geminiApiKey,
    geminiModel: provider.geminiModel,
  };
}

function isGeneratedImage(value: ReturnType<typeof prepareImageForDetailCache>): value is GeneratedImage {
  return Boolean(value);
}

function collectObjectUrls(records: ImageRequestRecord[]) {
  const urls = new Set<string>();

  for (const request of records) {
    for (const image of request.images || []) {
      if (image.objectUrl) urls.add(image.objectUrl);
    }
    for (const image of request.editImages || []) {
      if (image.src.startsWith("blob:")) urls.add(image.src);
    }
    if (request.editMask?.src.startsWith("blob:")) urls.add(request.editMask.src);
  }

  return urls;
}

function revokeObjectUrls(urls: Iterable<string>) {
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;

  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
}

function revokeRemovedObjectUrls(
  previousRecords: ImageRequestRecord[],
  nextRecords: ImageRequestRecord[],
  protectedUrls: Iterable<string> = [],
) {
  const nextUrls = collectObjectUrls(nextRecords);
  const protectedSet = new Set(protectedUrls);
  const removedUrls = [...collectObjectUrls(previousRecords)].filter((url) => !nextUrls.has(url) && !protectedSet.has(url));
  revokeObjectUrls(removedUrls);
}

function stripRequestRuntimeDetails(request: ImageRequestRecord): ImageRequestRecord {
  // Development fixtures keep their local images in memory so switching between
  // fixture tasks does not make the test data disappear.
  if (isDevelopmentRequest(request)) {
    return request;
  }

  if (request.status === "queued" || request.status === "running") {
    return request;
  }

  if (!request.images.length && request.response == null && request.rawResponse == null && !request.editImages?.length && !request.editMask) {
    return request;
  }

  return {
    ...request,
    images: [],
    response: null,
    rawResponse: null,
    editImages: [],
    editMask: undefined,
  };
}

const REQUEST_DETAIL_RETENTION_LIMIT = 8;

function keepOnlySelectedRequestDetails(
  records: ImageRequestRecord[],
  selectedRequestId: string | null,
  retainedRequestDetailIds: string[] = [],
) {
  const retainedIds = new Set(retainedRequestDetailIds);

  return records.map((request) => {
    if (request.id === selectedRequestId || retainedIds.has(request.id)) return request;
    return stripRequestRuntimeDetails(request);
  });
}

async function prepareThumbnailFromImage(image: GeneratedImage): Promise<GeneratedImage | null> {
  try {
    return await prepareImageForThumbnailCache(image);
  } catch {
    return image.kind === "url"
      ? ({
          src: image.src,
          kind: "url",
          path: image.path,
          mimeType: image.mimeType,
        } as GeneratedImage)
      : null;
  }
}

async function fetchImageBlobFromUrl(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) return null;

  const blob = await response.blob();
  return blob.size ? blob : null;
}

async function hydrateUrlImageBlob(
  image: GeneratedImage,
  signal: AbortSignal,
): Promise<GeneratedImage> {
  if (image.kind !== "url" || !/^https?:\/\//i.test(image.src)) return image;

  try {
    const blob = await fetchImageBlobFromUrl(image.src, signal);
    if (!blob) return image;

    return {
      ...image,
      mimeType: blob.type || image.mimeType,
      blob,
    };
  } catch {
    return image;
  }
}

function extensionFromMimeType(mimeType: unknown) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  return "png";
}

async function blobFromGeneratedImage(image: GeneratedImage) {
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
  if (image.kind === "base64") return imageBlobFromDataUrl(image.src, extensionFromMimeType(image.mimeType));

  try {
    const response = await fetch(image.src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size ? blob : null;
  } catch {
    return null;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Ignore object URL cleanup failures.
    }
  }, 0);
}

function uniqueZipEntryName(name: string, usedNames: Set<string>) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }

  const dotIndex = name.lastIndexOf(".");
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex) : "";
  let index = 2;

  while (usedNames.has(`${base}-${index}${extension}`)) {
    index += 1;
  }

  const nextName = `${base}-${index}${extension}`;
  usedNames.add(nextName);
  return nextName;
}

function safeExportSegment(value: string) {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").slice(0, 80) || "ImageX";
}

function productSuiteSlotLabel(slotKey: string, language: "zh" | "en") {
  const labels = language === "en"
    ? { hero: "Hero", whiteBackground: "White background", detail: "Detail", size: "Size", closeUp: "Close-up", scene: "Scene" }
    : { hero: "主图", whiteBackground: "白底图", detail: "详情图", size: "尺寸图", closeUp: "细节图", scene: "场景图" };
  return labels[slotKey as keyof typeof labels] || slotKey;
}

function initialStoredSettings(): StoredConsoleSettings {
  try {
    return loadSettings();
  } catch {
    return { ...DEFAULT_STORED_SETTINGS };
  }
}

function updateStoredSettingsForCurrentMode(
  current: StoredConsoleSettings,
  currentMode: ConsoleMode,
  values: AppSettings,
): StoredConsoleSettings {
  return {
    shared: normalizeSharedSettings(values),
    modeSettingsByMode: {
      ...current.modeSettingsByMode,
      [currentMode]: normalizeModeSettings(values),
    },
  };
}

function initialPrompt(mode: ConsoleMode) {
  try {
    return loadLastPromptForMode(mode);
  } catch {
    return "";
  }
}

function initialPromptHistory(mode: ConsoleMode) {
  try {
    return loadPromptHistoryForMode(mode);
  } catch {
    return [];
  }
}

function initialPinnedPromptHistory(mode: ConsoleMode) {
  try {
    return loadPinnedPromptHistoryForMode(mode);
  } catch {
    return [];
  }
}

function syncStrictPromptDefaults(settings: StoredConsoleSettings, defaultStrictPromptText: string) {
  if (!isDefaultStrictPromptText(settings.shared.strictPromptText)) return settings;
  if (settings.shared.strictPromptText === defaultStrictPromptText) return settings;

  return {
    ...settings,
    shared: {
      ...settings.shared,
      strictPromptText: defaultStrictPromptText,
    },
  };
}

export function useImageConsole() {
  const { copy, language } = useI18n();
  const strictPromptDefaultText = copy.promptEditor.defaultText;
  const [storedSettings, setStoredSettings] = useState<StoredConsoleSettings>(() =>
    syncStrictPromptDefaults(initialStoredSettings(), strictPromptDefaultText),
  );
  const [mode, setMode] = useState<ConsoleMode>("generate");
  const [promptByMode, setPromptByMode] = useState<Record<ConsoleMode, string>>(() => ({
    generate: initialPrompt("generate"),
    edit: initialPrompt("edit"),
  }));
  const [promptHistoryByMode, setPromptHistoryByMode] = useState<Record<ConsoleMode, string[]>>(() => ({
    generate: initialPromptHistory("generate"),
    edit: initialPromptHistory("edit"),
  }));
  const [pinnedPromptHistoryByMode, setPinnedPromptHistoryByMode] = useState<Record<ConsoleMode, string[]>>(() => ({
    generate: initialPinnedPromptHistory("generate"),
    edit: initialPinnedPromptHistory("edit"),
  }));
  const [editImages, setEditImages] = useState<EditInputImage[]>([]);
  const [editMask, setEditMask] = useState<EditInputImage | undefined>(undefined);
  const [historicalEditImageValue, setHistoricalEditImageValue] = useState("");
  const [requestRecords, setRequestRecords] = useState<ImageRequestRecord[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedRequestFilter, setSelectedRequestFilter] = useState<RequestFilter>("all");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    label: copy.tests.connectionReset,
    tone: "default",
  });
  const [testConnectionStatus, setTestConnectionStatus] = useState<ConnectionStatus>(() => ({
    label: copy.tests.test,
    tone: "default",
  }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const [selectedRequestDetailLoadingId, setSelectedRequestDetailLoadingId] = useState<string | null>(null);

  const settings = useMemo(
    () => mergeSettingsForMode(storedSettings.shared, storedSettings.modeSettingsByMode[mode]),
    [mode, storedSettings],
  );
  const settingsRef = useRef(settings);
  const storedSettingsRef = useRef(storedSettings);
  const requestRecordsRef = useRef(requestRecords);
  const selectedRequestIdRef = useRef<string | null>(selectedRequestId);
  const retainedRequestDetailIdsRef = useRef<string[]>([]);
  const modeRef = useRef<ConsoleMode>("generate");
  const editImagesRef = useRef<EditInputImage[]>(editImages);
  const thumbnailBackfillRef = useRef(new Set<string>());
  const queueTimerRef = useRef<number | null>(null);
  const lastRequestStartedAtRef = useRef(0);
  const controllersRef = useRef(new Map<string, AbortController>());
  const cancelRequestedRef = useRef(new Set<string>());
  const scheduleQueueRef = useRef<() => void>(() => undefined);
  const runRequestRef = useRef<(requestId: string) => void>(() => undefined);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    storedSettingsRef.current = storedSettings;
  }, [storedSettings]);

  useEffect(() => {
    const nextStoredSettings = syncStrictPromptDefaults(storedSettingsRef.current, strictPromptDefaultText);
    if (nextStoredSettings === storedSettingsRef.current) return;

    setStoredSettings(nextStoredSettings);
    storedSettingsRef.current = nextStoredSettings;
    settingsRef.current = mergeSettingsForMode(
      nextStoredSettings.shared,
      nextStoredSettings.modeSettingsByMode[modeRef.current],
    );
    saveSettings(nextStoredSettings);
  }, [strictPromptDefaultText]);

  useEffect(() => {
    requestRecordsRef.current = requestRecords;
  }, [requestRecords]);

  useEffect(() => {
    selectedRequestIdRef.current = selectedRequestId;
  }, [selectedRequestId]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    setConnectionStatus((current) => ({
      label: current.tone === "ok" ? copy.tests.connectionSaved : copy.tests.connectionReset,
      tone: current.tone,
    }));
    setTestConnectionStatus((current) => {
      if (current.tone === "busy") {
        return { label: copy.tests.connectionTesting, tone: "busy" };
      }
      if (current.tone === "ok") {
        return { label: copy.tests.connectionNormal, tone: "ok" };
      }
      if (current.tone === "error") {
        return { label: copy.tests.connectionFailed, tone: "error" };
      }
      return { label: copy.tests.test, tone: "default" };
    });
  }, []);

  useEffect(() => {
    const previousImages = editImagesRef.current;
    const previousUrls = new Set(previousImages.map((image) => image.src).filter((src) => src.startsWith("blob:")));
    const nextUrls = new Set(editImages.map((image) => image.src).filter((src) => src.startsWith("blob:")));
    const removedUrls = [...previousUrls].filter((url) => !nextUrls.has(url));

    if (removedUrls.length) {
      const requestUrls = collectObjectUrls(requestRecordsRef.current);
      revokeObjectUrls(removedUrls.filter((url) => !requestUrls.has(url)));
    }

    editImagesRef.current = editImages;
  }, [editImages]);

  useEffect(() => {
    if (!editMask) return;
    if (!editImages.some((image) => image.sourceKey === editMask.sourceKey)) setEditMask(undefined);
  }, [editImages, editMask]);

  useEffect(() => () => {
    if (editMask?.src.startsWith("blob:")) URL.revokeObjectURL(editMask.src);
  }, [editMask]);

  useEffect(() => {
    return () => {
      revokeObjectUrls(editImagesRef.current.map((image) => image.src).filter((src) => src.startsWith("blob:")));
    };
  }, []);

  const clearQueueTimer = useCallback(() => {
    if (queueTimerRef.current == null) return;
    window.clearTimeout(queueTimerRef.current);
    queueTimerRef.current = null;
  }, []);

  const commitRecords = useCallback((updater: (records: ImageRequestRecord[]) => ImageRequestRecord[]) => {
    const previous = requestRecordsRef.current;
    const next = updater(previous);
    revokeRemovedObjectUrls(
      previous,
      next,
      editImagesRef.current.map((image) => image.src).filter((src) => src.startsWith("blob:")),
    );
    requestRecordsRef.current = next;
    void saveCachedRequests(next.filter((request) => !isDevelopmentRequest(request)), language);
    setRequestRecords(next);
  }, [language]);

  const retainRequestDetail = useCallback((requestId: string | null | undefined) => {
    if (!requestId) return;

    const current = retainedRequestDetailIdsRef.current;
    retainedRequestDetailIdsRef.current = [requestId, ...current.filter((id) => id !== requestId)].slice(
      0,
      REQUEST_DETAIL_RETENTION_LIMIT,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadCachedRequests(language).then(async (records) => {
      if (cancelled) return;
      const realRecords = records.filter((request) => !isDevelopmentRequest(request));
      const fixtures = settingsRef.current.developmentMode ? await loadDevelopmentRequestFixtures() : null;
      if (cancelled) return;
      const nextRecords = fixtures
        ? [...fixtures.developmentPlaceholderRequests(), ...realRecords]
        : realRecords;
      requestRecordsRef.current = nextRecords;
      setRequestRecords(nextRecords);
      setSelectedRequestId(null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const previousRecords = requestRecordsRef.current;
      const realRecords = previousRecords.filter((request) => !isDevelopmentRequest(request));
      const fixtures = settings.developmentMode ? await loadDevelopmentRequestFixtures() : null;
      if (cancelled) return;
      const nextRecords = fixtures
        ? [...fixtures.developmentPlaceholderRequests(), ...realRecords]
        : realRecords;

      revokeRemovedObjectUrls(requestRecordsRef.current, nextRecords);
      requestRecordsRef.current = nextRecords;
      setRequestRecords(nextRecords);

      if (!settings.developmentMode) {
        setSelectedRequestId((current) => {
          if (!current) return current;
          return previousRecords.some((request) => request.id === current && isDevelopmentRequest(request)) ? null : current;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [settings.developmentMode]);

  const selectedRequestDetailLoadKey = (() => {
    if (!selectedRequestId) return "none";
    const request = requestRecords.find((item) => item.id === selectedRequestId);
    if (!request) return "missing";
    return [
      request.status,
      request.hasCachedDetails ? "cached" : "uncached",
      request.detailsMissing ? "missing-details" : "details-available",
      request.images.length,
      request.response == null && request.rawResponse == null ? "no-response" : "has-response",
    ].join(":");
  })();

  useEffect(() => {
    let cancelled = false;

    if (!selectedRequestId) {
      setSelectedRequestDetailLoadingId(null);
      if (requestRecordsRef.current.some((request) => request.images.length || request.response != null)) {
        commitRecords((records) =>
          keepOnlySelectedRequestDetails(records, null, retainedRequestDetailIdsRef.current),
        );
      }
      return () => {
        cancelled = true;
      };
    }

    const selectedRequest = requestRecordsRef.current.find((request) => request.id === selectedRequestId);
    if (!selectedRequest) {
      setSelectedRequestDetailLoadingId(null);
      return () => {
        cancelled = true;
      };
    }

    const currentSelected = requestRecordsRef.current.find((request) => request.id === selectedRequestId);
    if (currentSelected && (currentSelected.images.length || currentSelected.response != null || currentSelected.rawResponse != null)) {
      retainRequestDetail(selectedRequestId);
    }

    commitRecords((records) =>
      keepOnlySelectedRequestDetails(records, selectedRequestId, retainedRequestDetailIdsRef.current),
    );

    const latestSelected = requestRecordsRef.current.find((request) => request.id === selectedRequestId);
    const latestSelectedNeedsImages = Boolean(
      latestSelected &&
        latestSelected.status === "done" &&
        requestImageCount(latestSelected) > 0 &&
        !latestSelected.images.length,
    );
    const latestSelectedNeedsResponse = Boolean(
      latestSelected &&
        latestSelected.response == null &&
        latestSelected.rawResponse == null,
    );
    if (
      !latestSelected ||
      latestSelected.status === "queued" ||
      latestSelected.status === "running" ||
      !latestSelected.hasCachedDetails ||
      latestSelected.detailsMissing ||
      (!latestSelectedNeedsImages && !latestSelectedNeedsResponse)
    ) {
      setSelectedRequestDetailLoadingId(null);
      return () => {
        cancelled = true;
      };
    }

    setSelectedRequestDetailLoadingId(selectedRequestId);

    const detailLoader = isDevelopmentRequest(selectedRequest)
      ? Promise.resolve(selectedRequest)
      : loadRequestDetails(selectedRequestId);

    detailLoader
      .then(async (detail) => {
        if (cancelled) return;

        const detailImages = await Promise.all(
          (detail?.images || []).map((image) => prepareImageForDetailCacheWithDimensions(image)),
        );
        const normalizedDetailImages = detailImages.filter(isGeneratedImage);
        const thumbnail =
          detail?.thumbnail ||
          (normalizedDetailImages[0] ? await prepareImageForThumbnailCache(normalizedDetailImages[0]) : selectedRequest.thumbnail || null);
        const detailImageSizeBytes = imageSizeBytes(normalizedDetailImages);

        if (detail && !cancelled) {
          const responseSource = detail.rawResponse ?? detail.response ?? null;
          if (!isDevelopmentRequest(selectedRequest)) {
            void saveRequestDetails(
              [
                {
                  ...selectedRequest,
                  images: normalizedDetailImages,
                  response: responseSource == null ? null : sanitizeResponseForDisplay(responseSource),
                  rawResponse: responseSource,
                  thumbnail,
                },
              ],
              { prune: false },
            );
          }
        }

        retainRequestDetail(selectedRequestId);

        commitRecords((records) =>
          records.map((request) =>
            request.id === selectedRequestId
                ? {
                  ...request,
                  images: normalizedDetailImages.map(prepareImageForRuntime),
                  response:
                    detail == null
                      ? null
                      : sanitizeResponseForDisplay(detail.rawResponse ?? detail.response ?? null),
                  rawResponse: detail?.rawResponse ?? detail?.response ?? null,
                  thumbnail: request.thumbnail || thumbnail || null,
                  imageCount: detailImages.length || request.imageCount || normalizedDetailImages.length || 0,
                  imageSizeBytes: request.imageSizeBytes || detailImageSizeBytes,
                  imageResolution:
                    request.imageResolution ||
                    (normalizedDetailImages[0]?.width && normalizedDetailImages[0]?.height
                      ? `${normalizedDetailImages[0].width}x${normalizedDetailImages[0].height}`
                      : ""),
                  hasCachedDetails: Boolean(detail || request.hasCachedDetails),
                  detailsMissing: !detail,
                }
              : request,
          ),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setSelectedRequestDetailLoadingId((current) => (current === selectedRequestId ? null : current));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [commitRecords, retainRequestDetail, selectedRequestDetailLoadKey, selectedRequestId]);

  useEffect(() => {
    let cancelled = false;

    const pendingRecords = requestRecordsRef.current.filter(
      (request) =>
        request.status === "done" &&
        !request.thumbnail &&
        request.hasCachedDetails &&
        !request.detailsMissing &&
        request.id !== selectedRequestId &&
        !thumbnailBackfillRef.current.has(request.id),
    );

    if (!pendingRecords.length) return () => {
      cancelled = true;
    };

    void (async () => {
      for (const request of pendingRecords) {
        if (cancelled) return;
        thumbnailBackfillRef.current.add(request.id);

        const detail = await loadRequestDetails(request.id);
        if (cancelled || !detail) continue;

        const thumbnail = detail.thumbnail || (detail.images[0] ? await prepareImageForThumbnailCache(detail.images[0]) : null);
        if (cancelled || !thumbnail) continue;

        commitRecords((records) =>
          records.map((item) =>
            item.id === request.id
              ? {
                  ...item,
                  thumbnail,
                  hasCachedDetails: true,
                }
              : item,
          ),
        );
        retainRequestDetail(request.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [commitRecords, retainRequestDetail, requestRecords, selectedRequestId]);

  useEffect(() => {
    return () => {
      clearQueueTimer();
      for (const controller of controllersRef.current.values()) {
        controller.abort();
      }
      revokeObjectUrls(collectObjectUrls(requestRecordsRef.current));
    };
  }, [clearQueueTimer]);

  const runRequest = useCallback(
    async (requestId: string) => {
      const current = requestRecordsRef.current.find((request) => request.id === requestId);
      if (!current || current.status !== "queued") return;

      const controller = new AbortController();
      controllersRef.current.set(requestId, controller);

      commitRecords((records) =>
        records.map((request) =>
          request.id === requestId
            ? {
                ...request,
                status: "running",
                startedAt: performance.now(),
                endedAt: null,
                error: "",
                cancelRequested: false,
              }
            : request,
        ),
      );

      try {
        const request = requestRecordsRef.current.find((item) => item.id === requestId);
        if (!request) return;

        if (request.method === "edit" && !request.editImages?.length) {
          throw new Error(copy.runtime.editRequestMissingImages);
        }

        const body = request.protocol === "gemini"
          ? request.method === "edit"
            ? (() => { throw new Error(language === "en" ? "Gemini image editing is not supported yet. Use an OpenAI-compatible provider for image-to-image." : "Gemini 协议暂不支持图生图，请切换到 OpenAI 兼容协议。") })()
            : await postGeminiImageGeneration(
                request.endpoint,
                request.apiKey || "",
                String(request.payload.prompt || request.payload.input || ""),
                controller.signal,
                language,
              )
          : request.method === "edit"
            ? await postImageEdit(
                request.endpoint,
                request.apiKey || "",
                request.payload,
                request.editImages || [],
                controller.signal,
                language,
                request.openAIImageOptions,
                request.editMask,
              )
            : await postImageGeneration(
                request.endpoint,
                request.apiKey || "",
                request.payload,
                controller.signal,
                language,
                request.openAIImageOptions,
              );

        if (cancelRequestedRef.current.has(requestId)) {
          commitRecords((records) =>
            records.map((item) =>
              item.id === requestId
                ? {
                    ...item,
                    status: "canceled",
                    error: copy.runtime.requestCanceled,
                    endedAt: item.endedAt ?? performance.now(),
                    cancelRequested: true,
                  }
                : item,
            ),
          );
          return;
        }

        const extractedImages = extractImages(body, payloadOutputFormat(request.payload)).map((image) => ({
          ...image,
          path: `${request.title} · ${image.path}`,
        }));
        const localImages = await Promise.all(
          extractedImages.map((image) => hydrateUrlImageBlob(image, controller.signal)),
        );
        if (localImages.some((image) => image.kind === "url" && !(image.blob instanceof Blob))) {
          toast.warning(copy.runtime.remoteImageLimited);
        }
        const detailImages = (
          await Promise.all(localImages.map((image) => prepareImageForDetailCacheWithDimensions(image)))
        ).filter(isGeneratedImage);
        const shouldKeepRuntimeDetails = selectedRequestIdRef.current === requestId;
        const thumbnail = localImages[0] ? await prepareThumbnailFromImage(localImages[0]) : null;
        const displayResponse = sanitizeResponseForDisplay(body);
        const missingImageMessage = extractedImages.length ? "" : missingImageOutputMessage(body, language);

        void saveRequestDetails(
          [
            {
              ...request,
              images: detailImages,
              response: displayResponse,
              rawResponse: body,
              thumbnail,
            },
          ],
          { prune: false },
        );

        commitRecords((records) =>
          records.map((item) =>
            item.id === requestId
              ? applyCompletedRequestResult(item, {
                  rawResponse: body,
                  displayResponse,
                  extractedImageCount: extractedImages.length,
                  localImages,
                  detailImages,
                  thumbnail,
                  missingImageMessage,
                  keepRuntimeDetails: shouldKeepRuntimeDetails,
                  endedAt: performance.now(),
                  completedAt: Date.now(),
                })
              : item,
          ),
        );
        retainRequestDetail(requestId);
      } catch (error) {
        const typedError = error as Error & { responseBody?: unknown };
        const failedRequest = requestRecordsRef.current.find((item) => item.id === requestId);
        if (failedRequest && await isCrossOriginFetchFailure(failedRequest.endpoint, typedError)) {
          toast.error(copy.runtime.crossOriginRequestFailed);
        } else if (failedRequest && isBrowserNetworkFailure(typedError)) {
          toast.error(copy.runtime.browserRequestFailed);
        }
        const shouldKeepRuntimeDetails = selectedRequestIdRef.current === requestId;
        if (failedRequest && typedError.responseBody != null) {
          void saveRequestDetails(
            [
              {
                ...failedRequest,
                response: sanitizeResponseForDisplay(typedError.responseBody),
                rawResponse: typedError.responseBody,
              },
            ],
            { prune: false },
          );
        }
        commitRecords((records) =>
          records.map((item) =>
            item.id === requestId
              ? applyFailedRequestResult(item, {
                  error: typedError,
                  requestCanceledMessage: copy.runtime.requestCanceled,
                  endedAt: performance.now(),
                  keepRuntimeDetails: shouldKeepRuntimeDetails,
                })
              : item,
          ),
        );
      } finally {
        controllersRef.current.delete(requestId);
        cancelRequestedRef.current.delete(requestId);
        scheduleQueueRef.current();
      }
    },
    [commitRecords, copy, language, retainRequestDetail],
  );

  useEffect(() => {
    runRequestRef.current = (requestId: string) => {
      void runRequest(requestId);
    };
  }, [runRequest]);

  const scheduleQueue = useCallback(() => {
    if (queueTimerRef.current != null) return;

    const plan = nextQueueRunPlan({
      records: requestRecordsRef.current,
      settings: settingsRef.current,
      lastStartedAt: lastRequestStartedAtRef.current,
      now: performance.now(),
    });

    if (plan.type === "idle") return;

    if (plan.type === "delay") {
      queueTimerRef.current = window.setTimeout(() => {
        queueTimerRef.current = null;
        scheduleQueueRef.current();
      }, plan.delayMs);
      return;
    }

    lastRequestStartedAtRef.current = plan.startedAt;
    runRequestRef.current(plan.requestId);

    window.setTimeout(() => {
      scheduleQueueRef.current();
    }, 0);
  }, [copy]);

  useEffect(() => {
    scheduleQueueRef.current = scheduleQueue;
  }, [scheduleQueue]);

  const activeCount = requestRecords.filter(isActiveRequest).length;

  useEffect(() => {
    if (!activeCount) return;
    const timer = window.setInterval(() => {
      setNow(performance.now());
    }, 300);

    return () => window.clearInterval(timer);
  }, [activeCount]);

  useEffect(() => {
    if (!activeCount || typeof window === "undefined") return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeCount]);

  const filteredRequests = useMemo(
    () => sortedRequestRecordsForFilter(requestRecords, selectedRequestFilter),
    [requestRecords, selectedRequestFilter],
  );

  useEffect(() => {
    setSelectedRequestId((currentId) => {
      if (!filteredRequests.length) return null;
      if (currentId && filteredRequests.some((request) => request.id === currentId)) return currentId;
      return filteredRequests[0].id;
    });
  }, [filteredRequests]);

  const selectedRequest = useMemo(
    () => requestRecords.find((request) => request.id === selectedRequestId) || null,
    [requestRecords, selectedRequestId],
  );

  const requestCounts = useMemo(() => requestFilterCounts(requestRecords), [requestRecords]);
  const historicalEditImageOptions = useMemo(() => {
    return sortedRequestRecordsForFilter(requestRecords, "done")
      .filter((request) => !request.detailsMissing && requestImageCount(request) > 0)
      .flatMap((request) => {
        const count = requestImageCount(request);
        return Array.from({ length: count }, (_, imageIndex) => ({
          value: `${request.id}:${imageIndex}`,
          label: count > 1 ? `${request.title}-${imageIndex + 1}` : request.title,
          thumbnail: request.images[imageIndex] || request.thumbnail || null,
          requestId: request.id,
          requestTitle: request.title,
          imageIndex,
        }));
      });
  }, [copy, requestRecords]);

  const endpointPreview = useMemo(() => {
    if (settings.protocol === "gemini") {
      const baseUrl = String(settings.geminiBaseUrl || DEFAULTS.geminiBaseUrl).replace(/\/+$/, "");
      const model = String(settings.geminiModel || DEFAULTS.geminiModel).trim() || DEFAULTS.geminiModel;
      return `generateContent (${model})\n${baseUrl}/models/${model}:generateContent?key=••••`;
    }
    const baseUrl = settings.baseUrl || DEFAULTS.baseUrl;
    const generationsModel = String(settings.generationsModel || DEFAULTS.generationsModel).trim();
    const editsModel = String(settings.editsModel || DEFAULTS.editsModel).trim();
    return [
      `generations (${generationsModel})\n${normalizeImageEndpoint(baseUrl)}`,
      `edits (${editsModel})\n${normalizeImageEditsEndpoint(baseUrl)}`,
    ].join("\n\n");
  }, [
    settings.protocol,
    settings.geminiBaseUrl,
    settings.geminiModel,
    settings.baseUrl,
    settings.editsModel,
    settings.generationsModel,
  ]);

  const selectedRequestJson = useMemo(() => {
    if (!selectedRequest) return "";

    const responseForDisplay =
      selectedRequest.rawResponse != null
        ? selectedRequest.rawResponse
        : selectedRequest.response != null
          ? selectedRequest.response
          : selectedRequest.status === "error"
            ? {
                error: selectedRequest.error || copy.runtime.requestFailed,
                status: selectedRequest.status,
              }
            : null;

    if (responseForDisplay == null) return "";
    return formatResponseJsonText(responseForDisplay);
  }, [selectedRequest]);
  const prompt = promptByMode[mode];

  const setConsoleMode = useCallback((nextMode: ConsoleMode) => {
    modeRef.current = nextMode;
    settingsRef.current = mergeSettingsForMode(
      storedSettingsRef.current.shared,
      storedSettingsRef.current.modeSettingsByMode[nextMode],
    );
    setMode(nextMode);
  }, []);

  const setPrompt = useCallback((value: string) => {
    const currentMode = modeRef.current;
    setPromptByMode((current) => ({
      ...current,
      [currentMode]: value,
    }));
    saveLastPrompt(value, currentMode);
  }, []);

  const updatePromptHistory = useCallback((updater: (history: string[]) => string[], targetMode = modeRef.current) => {
    setPromptHistoryByMode((current) => {
      const nextHistory = updater(current[targetMode]);
      savePromptHistory(nextHistory, targetMode);
      return {
        ...current,
        [targetMode]: nextHistory,
      };
    });
  }, []);

  const updatePinnedPromptHistory = useCallback((updater: (history: string[]) => string[]) => {
    const currentMode = modeRef.current;
    setPinnedPromptHistoryByMode((current) => {
      const nextHistory = updater(current[currentMode]);
      savePinnedPromptHistory(nextHistory, currentMode);
      return {
        ...current,
        [currentMode]: nextHistory,
      };
    });
  }, []);

  const selectPromptHistory = useCallback(
    (value: string) => {
      setPrompt(value);
    },
    [setPrompt],
  );

  const togglePromptHistoryPin = useCallback(
    (value: string) => {
      updatePinnedPromptHistory((history) => {
        const target = String(value || "").trim();
        if (!target) return history;
        const normalized = history.map((item) => item.trim()).filter(Boolean);
        return normalized.includes(target) ? unpinPromptHistory(normalized, target) : pinPromptHistory(normalized, target);
      });
    },
    [updatePinnedPromptHistory],
  );

  const deletePromptHistory = useCallback(
    (value: string) => {
      updatePromptHistory((history) => removePromptFromHistory(history, value));
      updatePinnedPromptHistory((history) => unpinPromptHistory(history, value));
    },
    [updatePinnedPromptHistory, updatePromptHistory],
  );

  const addHistoricalEditImage = useCallback(
    async (value: string) => {
      const [requestId, imageIndexText] = String(value || "").split(":");
      const imageIndex = Number.parseInt(imageIndexText, 10);
      if (!requestId || !Number.isInteger(imageIndex) || imageIndex < 0) return;

      setHistoricalEditImageValue("");
      const sourceKey = `${requestId}:${imageIndex}`;
      const request = requestRecordsRef.current.find((item) => item.id === requestId);

      if (!request) {
        toast.error(copy.runtime.missingHistoricalRequest);
        return;
      }

      if (editImagesRef.current.some((item) => item.sourceKey === sourceKey)) {
        return;
      }

      if (editImagesRef.current.length >= MAX_EDIT_INPUT_IMAGES) {
        const message = copy.generator.maxEditImages(MAX_EDIT_INPUT_IMAGES);
        toast.error(message);
        return;
      }

      if (request.status !== "done" || request.detailsMissing) {
        toast.error(copy.runtime.historicalRequestHasNoImage);
        return;
      }

      try {
        const detail = isDevelopmentRequest(request) ? request : await loadRequestDetails(requestId);
        const sourceImage = detail?.images?.[imageIndex];
        if (!sourceImage) {
          toast.error(copy.runtime.historicalImageNotFound);
          return;
        }

        let editableSourceImage = sourceImage;
        if (isDevelopmentRequest(request) && sourceImage.kind === "url" && !sourceImage.blob) {
          const response = await fetch(sourceImage.src);
          if (!response.ok) throw new Error(copy.runtime.historicalImageNotEditable);
          const blob = await response.blob();
          editableSourceImage = { ...sourceImage, blob, mimeType: blob.type || sourceImage.mimeType };
        }

        const mimeType = editableSourceImage.mimeType || "image/png";
        const extension = mimeType.replace(/^image\//, "") || "png";
        const image = prepareEditInputImage(editableSourceImage, `${request.title}-image-${imageIndex + 1}.${extension}`);

        if (!image) {
          toast.error(copy.runtime.historicalImageNotEditable);
          return;
        }

        setEditImages((current) => {
          if (current.some((item) => item.sourceKey === sourceKey)) return current;
          return [...current, { ...image, sourceKey }];
        });
      } catch (error) {
        const message = (error as Error).message || copy.runtime.historicalImageLoadFailed;
        toast.error(message);
      }
    },
    [copy],
  );

  const updateSettings = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (key === "developmentMode" && !DEVELOPMENT_FIXTURES_ENABLED) return;
    setStoredSettings((current) => {
      if (
        key === "protocol" ||
        key === "baseUrl" ||
        key === "apiKey" ||
        key === "openaiProviders" ||
        key === "activeOpenAIProviderId" ||
        key === "privateBaseUrl" ||
         key === "privateApiKey" ||
         key === "privateModel" ||
         key === "geminiBaseUrl" ||
         key === "geminiApiKey" ||
         key === "geminiModel" ||
        key === "rememberKey" ||
        key === "developmentMode" ||
        key === "generationsModel" ||
        key === "editsModel" ||
        key === "responsesModel" ||
        key === "completionsModel" ||
        key === "strictPromptText" ||
        key === "requestConcurrency" ||
        key === "requestIntervalSeconds"
      ) {
        let nextShared = {
          ...current.shared,
          [key]: value,
        } as SharedSettings;

        if (key === "openaiProviders") {
          const providers = Array.isArray(value) ? value : [];
          const active = providers.find((provider) => provider.id === current.shared.activeOpenAIProviderId)
            || providers[0];
          nextShared = sharedSettingsForProvider(nextShared, active);
        } else if (key === "activeOpenAIProviderId") {
          const active = current.shared.openaiProviders.find((provider) => provider.id === value);
          nextShared = sharedSettingsForProvider(nextShared, active);
        } else if ((key === "baseUrl" || key === "apiKey" || key === "geminiBaseUrl" || key === "geminiApiKey" || key === "geminiModel") && current.shared.activeOpenAIProviderId) {
          nextShared.openaiProviders = current.shared.openaiProviders.map((provider) =>
            provider.id === current.shared.activeOpenAIProviderId
              ? {
                  ...provider,
                  ...(key === "baseUrl" ? { baseUrl: String(value) } : key === "apiKey" ? { apiKey: String(value) } : { [key]: String(value) }),
                }
              : provider,
          );
        }

        return {
          ...current,
          shared: nextShared,
        };
      }

      const currentMode = modeRef.current;
      return {
        ...current,
        modeSettingsByMode: {
          ...current.modeSettingsByMode,
          [currentMode]: {
            ...current.modeSettingsByMode[currentMode],
            [key]: value,
          } as ModeSettings,
        },
      };
    });
    if (key === "protocol" || key === "baseUrl" || key === "apiKey" || key === "openaiProviders" || key === "activeOpenAIProviderId" || key === "privateBaseUrl" || key === "privateApiKey" || key === "geminiBaseUrl" || key === "geminiApiKey" || key === "geminiModel" || key === "generationsModel" || key === "editsModel") {
      setTestConnectionStatus({ label: copy.tests.test, tone: "default" });
    }
  }, [copy]);

  const saveCurrentSettings = useCallback(() => {
    const normalized = normalizeSettings(settingsRef.current, strictPromptDefaultText);
    const nextStoredSettings = updateStoredSettingsForCurrentMode(storedSettingsRef.current, modeRef.current, normalized);
    setStoredSettings(nextStoredSettings);
    storedSettingsRef.current = nextStoredSettings;
    settingsRef.current = normalized;
    saveSettings(nextStoredSettings);
    setConnectionStatus({ label: copy.tests.connectionSaved, tone: "ok" });
    clearQueueTimer();
    setSettingsOpen(false);
    scheduleQueueRef.current();
  }, [clearQueueTimer, copy, strictPromptDefaultText]);

  const resetSettings = useCallback(() => {
    resetStoredSettings();
    const defaults = { ...DEFAULT_STORED_SETTINGS };
    setStoredSettings(defaults);
    storedSettingsRef.current = defaults;
    settingsRef.current = mergeSettingsForMode(defaults.shared, defaults.modeSettingsByMode[modeRef.current]);
    setConnectionStatus({ label: copy.tests.connectionReset, tone: "default" });
    setTestConnectionStatus({ label: copy.tests.test, tone: "default" });
  }, [copy]);

  const testConnection = useCallback(async () => {
    const currentSettings = settingsRef.current;
    const activeProvider = currentSettings.openaiProviders.find((provider) => provider.id === currentSettings.activeOpenAIProviderId);
    const testUrl = currentSettings.protocol === "gemini" ? currentSettings.geminiBaseUrl.trim() : currentSettings.baseUrl.trim();
    const testKey = currentSettings.protocol === "gemini" ? currentSettings.geminiApiKey.trim() : currentSettings.apiKey.trim();
    const testModel = currentSettings.protocol === "gemini"
        ? currentSettings.geminiModel.trim()
        : activeProvider?.generationsModel.trim() || currentSettings.generationsModel.trim();
    if ((currentSettings.protocol === "openai" && !activeProvider) || !testUrl || !testKey || !testModel) {
      setTestConnectionStatus({ label: copy.tests.connectionNotConfigured, tone: "error" });
      toast.error(copy.tests.connectionNotConfigured);
      return;
    }
    const endpoint = normalizeModelsEndpoint(testUrl);
    setTestConnectionStatus({ label: copy.tests.connectionTesting, tone: "busy" });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);

    try {
      await fetchModels(
        testUrl,
        testKey,
        language,
        controller.signal,
      );
      toast.success(copy.tests.connectionNormal);
      setTestConnectionStatus({ label: copy.tests.connectionNormal, tone: "ok" });
    } catch (error) {
      if (await isCrossOriginFetchFailure(endpoint, error)) {
        toast.error(copy.runtime.crossOriginRequestFailed);
      } else if (isBrowserNetworkFailure(error)) {
        toast.error(copy.runtime.browserRequestFailed);
      }
      setTestConnectionStatus({ label: copy.tests.connectionFailed, tone: "error" });
    } finally {
      window.clearTimeout(timeout);
    }
  }, [copy, language]);

  const enqueueGeneration = useCallback(
    () => {
      if (!String(prompt || "").trim()) {
        toast.error(copy.generator.promptRequired);
        return false;
      }

      const requestConfigMessage = missingConnectionMessage(settingsRef.current, copy);
      if (requestConfigMessage) {
        toast.error(requestConfigMessage);
        return false;
      }

      const currentSettings = normalizeSettings(settingsRef.current, strictPromptDefaultText);
      const values = { ...currentSettings, prompt };
      saveLastPrompt(prompt, modeRef.current);

      let requestPayloads;
      let endpoint: string;
      let method: GenerationMethod;
      try {
        if (currentSettings.protocol === "gemini") {
          const payload = { model: currentSettings.geminiModel, prompt: applyPromptPolicy(prompt, currentSettings.strictPrompt, currentSettings.strictPromptText) };
          requestPayloads = buildGenerationRequests(payload);
          endpoint = normalizeGeminiImageEndpoint(currentSettings.geminiBaseUrl, currentSettings.geminiModel);
          method = "gpt-image-2";
        } else {
          const payload = buildPayload(values, language);
          requestPayloads = buildGenerationRequests(payload);
          endpoint = normalizeImageEndpoint(values.baseUrl);
          method = "gpt-image-2";
        }
      } catch (error) {
        const message = (error as Error).message;
        toast.error(message);
        return false;
      }

      const nextStoredSettings = updateStoredSettingsForCurrentMode(
        storedSettingsRef.current,
        modeRef.current,
        currentSettings,
      );
      setStoredSettings(nextStoredSettings);
      storedSettingsRef.current = nextStoredSettings;
      saveSettings(nextStoredSettings);
      updatePromptHistory((history) => addPromptToHistory(history, prompt));

      const now = performance.now();
      const date = new Date();
      const newRequests = createRequestRecords(
        requestPayloads,
        endpoint,
        now,
        date,
        requestRecordsRef.current,
        method,
        currentSettings.protocol === "openai" ? openAIImageOptionsFromSettings(currentSettings) : undefined,
      ).map((request) => ({
        ...request,
        protocol: currentSettings.protocol,
        apiKey: currentSettings.protocol === "gemini" ? currentSettings.geminiApiKey : currentSettings.apiKey,
      }));

      commitRecords((records) => [...records, ...newRequests]);
      setSelectedRequestId((currentId) => currentId || newRequests[0]?.id || null);
      toast.success(copy.generator.submissionSuccess(newRequests.length));
      scheduleQueueRef.current();
      return true;
    },
    [commitRecords, copy, prompt, strictPromptDefaultText, updatePromptHistory],
  );

  const enqueueEditGeneration = useCallback((overrides?: {
    prompt?: string;
    editImages?: EditInputImage[];
    mask?: EditInputImage;
    count?: number;
    silent?: boolean;
    productSuite?: { taskId: string; batchId?: string; batchNumber?: number; slotKey: string; slotLabel?: string; version?: number };
  }) => {
    const effectivePrompt = overrides?.prompt ?? prompt;
    const effectiveEditImages = overrides?.editImages ?? editImages;
    const effectiveEditMask = overrides?.mask ?? editMask;
    if (!String(effectivePrompt || "").trim()) {
      toast.error(copy.generator.promptRequired);
      return false;
    }

    const requestConfigMessage = missingConnectionMessage(settingsRef.current, copy);
    if (requestConfigMessage) {
      toast.error(requestConfigMessage);
      return false;
    }

    if (!effectiveEditImages.length) {
      const message = copy.generator.selectAtLeastOneImage;
      toast.error(message);
      return false;
    }

    if (DEVELOPMENT_FIXTURES_ENABLED && settingsRef.current.developmentMode && overrides?.productSuite) {
      const version = overrides.productSuite.version || 1;
      void loadDevelopmentRequestFixtures().then((fixtures) => {
        if (!fixtures) return;
        const fixture = fixtures.createDevelopmentSuiteRequest(
          overrides.productSuite!.slotKey,
          version,
          "done",
          (version % 4) + 1,
          30000,
          overrides.productSuite!.batchId || "development-batch-1",
          overrides.productSuite!.batchNumber || 1,
        );
        const simulatedRequest: ImageRequestRecord = {
          ...fixture,
          id: `${fixture.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        };
        commitRecords((records) => [...records, simulatedRequest]);
        setSelectedRequestId((currentId) => currentId || simulatedRequest.id);
        if (!overrides.silent) toast.success(copy.generator.submissionSuccess(1));
      });
      return true;
    }

    const editModeSettings = mergeSettingsForMode(
      storedSettingsRef.current.shared,
      storedSettingsRef.current.modeSettingsByMode.edit,
    );
    const currentSettings = normalizeSettings(editModeSettings, strictPromptDefaultText);
    const values = { ...currentSettings, n: overrides?.count ?? currentSettings.n, prompt: effectivePrompt };
    saveLastPrompt(effectivePrompt, "edit");

    let requestPayloads;
    let endpoint: string;
    let method: GenerationMethod;
    const runtimeImages = effectiveEditImages.map((image) => ({ ...image }));

    try {
      if (currentSettings.protocol === "gemini") {
        throw new Error(language === "en" ? "Gemini image editing is not supported yet. Use an OpenAI-compatible provider for image-to-image." : "Gemini 协议暂不支持图生图，请切换到 OpenAI 兼容协议。 ");
      }
      const payload = buildEditImagePayload(values, runtimeImages, language);
      requestPayloads = buildEditImageRequests(payload, values.n);
      endpoint = normalizeImageEditsEndpoint(values.baseUrl);
      method = "edit";
    } catch (error) {
      const message = (error as Error).message;
      toast.error(message);
      return false;
    }

    const nextStoredSettings = updateStoredSettingsForCurrentMode(
      storedSettingsRef.current,
      "edit",
      currentSettings,
    );
    setStoredSettings(nextStoredSettings);
    storedSettingsRef.current = nextStoredSettings;
    saveSettings(nextStoredSettings);
    updatePromptHistory((history) => addPromptToHistory(history, effectivePrompt), "edit");

    const now = performance.now();
    const date = new Date();
    const newRequests = createRequestRecords(
      requestPayloads,
      endpoint,
      now,
      date,
      requestRecordsRef.current,
      method,
      currentSettings.protocol === "openai" ? openAIImageOptionsFromSettings(currentSettings) : undefined,
    ).map((request) => ({
      ...request,
      title: overrides?.productSuite
        ? `${request.title} · ${overrides.productSuite.slotLabel || productSuiteSlotLabel(overrides.productSuite.slotKey, language === "en" ? "en" : "zh")} · v${overrides.productSuite.version || 1}`
        : request.title,
      protocol: currentSettings.protocol,
      apiKey: currentSettings.protocol === "gemini" ? currentSettings.geminiApiKey : currentSettings.apiKey,
      editImages: runtimeImages,
      editMask: effectiveEditMask,
      productSuiteTaskId: overrides?.productSuite?.taskId,
      productSuiteBatchId: overrides?.productSuite?.batchId,
      productSuiteBatchNumber: overrides?.productSuite?.batchNumber,
      productSuiteSlotKey: overrides?.productSuite?.slotKey,
      productSuiteSlotLabel: overrides?.productSuite?.slotLabel,
      productSuiteVersion: overrides?.productSuite?.version,
    }));

    commitRecords((records) => [...records, ...newRequests]);
    setEditMask(undefined);
    setSelectedRequestId((currentId) => currentId || newRequests[0]?.id || null);
    if (!overrides?.silent) {
      toast.success(copy.generator.submissionSuccess(newRequests.length));
    }
    scheduleQueueRef.current();
    return true;
  }, [commitRecords, copy, editImages, editMask, prompt, strictPromptDefaultText, updatePromptHistory]);

  const cancelRequest = useCallback(
    (requestId: string) => {
      const request = requestRecordsRef.current.find((item) => item.id === requestId);
      if (!request || (request.status !== "queued" && request.status !== "running")) return;

      const now = performance.now();
      const wasQueued = request.status === "queued";
      const nextSelectedRequestId = adjacentVisibleRequestId(requestRecordsRef.current, requestId, selectedRequestFilter);
      cancelRequestedRef.current.add(requestId);
      controllersRef.current.get(requestId)?.abort();

      commitRecords((records) =>
        records.map((item) =>
          item.id === requestId
            ? {
                ...item,
                status: "canceled",
                endedAt: now,
                error: wasQueued ? copy.runtime.requestCanceledBeforeSend : copy.runtime.requestCanceled,
                cancelRequested: true,
                editImages: [],
              }
            : item,
        ),
      );
      setSelectedRequestId(nextSelectedRequestId);
      scheduleQueueRef.current();
    },
    [commitRecords, copy, selectedRequestFilter],
  );

  const cancelAllRequests = useCallback(() => {
    const activeRequests = requestRecordsRef.current.filter(isActiveRequest);
    if (!activeRequests.length) return;

    const now = performance.now();
    const runningRequests = activeRequests.filter((request) => request.status === "running");

    for (const request of runningRequests) {
      cancelRequestedRef.current.add(request.id);
      controllersRef.current.get(request.id)?.abort();
    }

    clearQueueTimer();
    lastRequestStartedAtRef.current = 0;
    setSelectedRequestDetailLoadingId(null);

    commitRecords((records) =>
      records.map((item) =>
        isActiveRequest(item)
          ? {
              ...item,
              status: "canceled",
              endedAt: now,
              error: item.status === "queued" ? copy.runtime.requestCanceledBeforeSend : copy.runtime.requestCanceled,
              cancelRequested: true,
              editImages: [],
            }
          : item,
      ),
    );
  }, [clearQueueTimer, commitRecords, copy]);

  const clearAllRequests = useCallback(() => {
    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
    controllersRef.current.clear();
    cancelRequestedRef.current.clear();
    clearQueueTimer();
    lastRequestStartedAtRef.current = 0;
    setSelectedRequestDetailLoadingId(null);
    thumbnailBackfillRef.current.clear();
    retainedRequestDetailIdsRef.current = [];
    const removedIds = requestRecordsRef.current
      .filter((request) => !isDevelopmentRequest(request))
      .map((request) => request.id);
    revokeObjectUrls(collectObjectUrls(requestRecordsRef.current));
    requestRecordsRef.current = [];
    setRequestRecords([]);
    setSelectedRequestId(null);
    void deleteRequestDetails(removedIds, { retainTombstones: true });
    void clearCachedRequests();
  }, [clearQueueTimer, copy]);

  const clearAllData = useCallback(() => {
    clearAllRequests();
    resetSettings();

    const emptyPrompts = { generate: "", edit: "" } satisfies Record<ConsoleMode, string>;
    const emptyHistory = { generate: [], edit: [] } satisfies Record<ConsoleMode, string[]>;
    setPromptByMode(emptyPrompts);
    setPromptHistoryByMode(emptyHistory);
    setPinnedPromptHistoryByMode({ generate: [], edit: [] });
    for (const targetMode of ["generate", "edit"] as const) {
      saveLastPrompt("", targetMode);
      savePromptHistory([], targetMode);
      savePinnedPromptHistory([], targetMode);
    }

    revokeObjectUrls(editImagesRef.current.map((item) => item.src).filter((src) => src.startsWith("blob:")));
    editImagesRef.current = [];
    setEditImages([]);
    setEditMask(undefined);
    setHistoricalEditImageValue("");
    setSelectedRequestFilter("all");
    setJsonDialogOpen(false);
    modeRef.current = "generate";
    setMode("generate");
    void clearProductSuiteTasks();
  }, [clearAllRequests, resetSettings]);

  const clearCompletedRequests = useCallback(() => {
    const removedIds = requestRecordsRef.current
      .filter((request) => requestMatchesFilter(request, "done") && !isDevelopmentRequest(request))
      .map((request) => request.id);

    if (!removedIds.length) return;

    setSelectedRequestDetailLoadingId(null);
    commitRecords((records) => records.filter((request) => !requestMatchesFilter(request, "done")));
    void deleteRequestDetails(removedIds);
  }, [commitRecords, copy]);

  const clearFailedRequests = useCallback(() => {
    const removedIds = requestRecordsRef.current
      .filter((request) => requestMatchesFilter(request, "failed") && !isDevelopmentRequest(request))
      .map((request) => request.id);
    setSelectedRequestDetailLoadingId(null);
    commitRecords((records) => records.filter((request) => !requestMatchesFilter(request, "failed")));
    void deleteRequestDetails(removedIds);
  }, [commitRecords, copy]);

  const clearProductSuiteVersions = useCallback((taskId: string, slotKey?: ProductSuiteSlotKey, batchId?: string) => {
    const removedRequests = requestRecordsRef.current.filter((request) =>
      request.productSuiteTaskId === taskId &&
      (!batchId || request.productSuiteBatchId === batchId || (!request.productSuiteBatchId && batchId === "batch-1")) &&
      (!slotKey || request.productSuiteSlotKey === slotKey),
    );
    if (!removedRequests.length) return;

    const removedIds = new Set(removedRequests.map((request) => request.id));
    const persistedIds = removedRequests.filter((request) => !isDevelopmentRequest(request)).map((request) => request.id);

    // Clearing a workflow history must also stop matching queued/running requests;
    // otherwise a late response could recreate a record in the result list.
    for (const request of removedRequests) {
      if (!isActiveRequest(request)) continue;
      cancelRequestedRef.current.add(request.id);
      controllersRef.current.get(request.id)?.abort();
    }
    clearQueueTimer();
    setSelectedRequestDetailLoadingId(null);
    commitRecords((records) => records.filter((request) => !removedIds.has(request.id)));
    setSelectedRequestId((current) => current && removedIds.has(current) ? null : current);
    if (persistedIds.length) void deleteRequestDetails(persistedIds);
    scheduleQueueRef.current();
  }, [clearQueueTimer, commitRecords]);

  const deleteRequest = useCallback(
    (requestId: string) => {
      const request = requestRecordsRef.current.find((item) => item.id === requestId);
      if (!request || isActiveRequest(request)) return;

      const nextSelectedRequestId = adjacentVisibleRequestId(requestRecordsRef.current, requestId, selectedRequestFilter);

      retainedRequestDetailIdsRef.current = retainedRequestDetailIdsRef.current.filter((id) => id !== requestId);
      thumbnailBackfillRef.current.delete(requestId);
      setSelectedRequestDetailLoadingId((current) => (current === requestId ? null : current));

      commitRecords((records) => records.filter((item) => item.id !== requestId));
      if (!isDevelopmentRequest(request)) {
        void deleteRequestDetails([requestId]);
      }

      setSelectedRequestId((current) => (current === requestId ? nextSelectedRequestId : current));
    },
    [commitRecords, copy, selectedRequestFilter],
  );

  const reusePrompt = useCallback(
    (request: ImageRequestRecord) => {
      const reusablePrompt = reusablePromptForRequest(request);
      if (!reusablePrompt) return;
      setPrompt(reusablePrompt);
    },
    [setPrompt],
  );

  const exportCompletedImagesZip = useCallback(
    async (onProgress?: (progress: ExportZipProgress) => void, selectedImageKeys?: readonly string[]) => {
      const completedRequests = sortedRequestRecordsForFilter(requestRecordsRef.current, "done");
      const imageItems: Array<{ request: ImageRequestRecord; image: GeneratedImage; index: number }> = [];
      const selectedKeySet = selectedImageKeys?.length ? new Set(selectedImageKeys) : null;

      for (const request of completedRequests) {
        let images = request.images || [];

        if (request.hasCachedDetails && !request.detailsMissing) {
          const detail = await loadRequestDetails(request.id);
          if (detail?.images?.length) {
            images = detail.images;
          }
        }

        images.forEach((image, index) => {
          if (selectedKeySet && !selectedKeySet.has(`${request.id}-${index}`)) return;
          imageItems.push({ request, image, index });
        });
      }

      onProgress?.({ current: 0, total: imageItems.length });

      const entries: ZipFileEntry[] = [];
      const usedNames = new Set<string>();

      for (const [index, item] of imageItems.entries()) {
        const blob = await blobFromGeneratedImage(item.image);
        if (blob) {
          entries.push({
            name: uniqueZipEntryName(imageDownloadName(item.request, item.index), usedNames),
            blob,
          });
        }
        onProgress?.({ current: index + 1, total: imageItems.length });
      }

      if (!entries.length) {
        throw new Error(copy.exportZip.noImages);
      }

      if (selectedKeySet && entries.length === 1) {
        downloadBlob(entries[0].blob, entries[0].name);
        return { count: 1, filename: entries[0].name };
      }

      const filename = `ImageX-${formatBatchPrefix()}.zip`;
      const zipBlob = await createZipBlob(entries);
      downloadBlob(zipBlob, filename);
      return { count: entries.length, filename };
    },
    [copy],
  );

  const exportProductSuite = useCallback(
    async (task: ProductSuiteTask) => {
      const exportLanguage = language === "en" ? "en" : "zh";
      const entries: ZipFileEntry[] = [];
      const exportedSlots: Array<Record<string, unknown>> = [];
      const usedNames = new Set<string>();
      const productName = safeExportSegment(task.name || (exportLanguage === "en" ? "product-suite" : "产品套图"));

      for (const slot of task.slots) {
        const slotRequests = sortedRequestRecordsForFilter(requestRecordsRef.current, "done")
          .filter((request) =>
            request.productSuiteTaskId === task.id &&
            (request.productSuiteBatchId === task.productBatchId || (!request.productSuiteBatchId && task.productBatchId === "batch-1")) &&
            request.productSuiteSlotKey === slot.key,
          )
          .sort((left, right) =>
            (right.productSuiteVersion || 1) - (left.productSuiteVersion || 1) || right.createdAt - left.createdAt,
          );
        const requestedVersion = slot.selectedVersion || null;
        const selectedRequest = (requestedVersion
          ? slotRequests.find((request) => (request.productSuiteVersion || 1) === requestedVersion)
          : null) || slotRequests[0] || null;
        let images = selectedRequest?.images || [];

        if (selectedRequest?.hasCachedDetails && !selectedRequest.detailsMissing) {
          const detail = await loadRequestDetails(selectedRequest.id);
          if (detail?.images?.length) images = detail.images;
        }

        const image = images[0] || selectedRequest?.thumbnail || null;
        const blob = image ? await blobFromGeneratedImage(image) : null;
        const slotLabel = slot.label || productSuiteSlotLabel(slot.key, exportLanguage);
        const exportedVersion = selectedRequest ? selectedRequest.productSuiteVersion || 1 : null;
        const renderedPrompt = renderProductSuitePrompt(task, slot.key, exportLanguage);
        const slotManifest = {
          key: slot.key,
          label: slotLabel,
          enabled: slot.enabled,
          promptTemplate: slot.promptTemplate,
          renderedPrompt,
          selectedVersion: slot.selectedVersion,
          exportedVersion,
          requestId: selectedRequest?.id || null,
          imageIncluded: Boolean(blob),
        };
        exportedSlots.push(slotManifest);

        if (blob) {
          const extension = extensionFromMimeType(blob.type || image?.mimeType);
          entries.push({
            name: uniqueZipEntryName(`${productName}/${safeExportSegment(slotLabel)}.${extension}`, usedNames),
            blob,
          });
        }
      }

      const manifest = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        productSuiteTask: {
          id: task.id,
          name: task.name,
          info: task.info,
          hasProductImage: Boolean(task.productImages?.length || task.productImage),
          productImageCount: task.productImages?.length || (task.productImage ? 1 : 0),
          hasBrandAsset: Boolean(task.brandAssets?.length || task.brandAsset),
          brandAssetCount: task.brandAssets?.length || (task.brandAsset ? 1 : 0),
          productBatchId: task.productBatchId,
          productBatchNumber: task.productBatchNumber,
          slots: exportedSlots,
        },
        privacy: exportLanguage === "en"
          ? "This manifest excludes API keys, full API responses, and local filesystem paths."
          : "此参数清单不包含 API Key、完整 API 响应或本地文件路径。",
      };
      const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json;charset=utf-8" });
      entries.push({ name: uniqueZipEntryName(`${productName}/产品套图参数.json`, usedNames), blob: manifestBlob });

      if (!entries.length) throw new Error(exportLanguage === "en" ? "No product suite files are available to export." : "当前产品套图没有可导出的文件。");
      const filename = `ImageX-${productName}.zip`;
      const zipBlob = await createZipBlob(entries);
      downloadBlob(zipBlob, filename);
      return { count: entries.length - 1, filename };
    },
    [language],
  );

  const selectedRequestDownload = selectedRequest?.images?.[0]?.src
    ? {
        href: selectedRequest.images[0].src,
        download: imageDownloadName(selectedRequest, 0),
      }
    : null;

  const selectedRequestTiming = selectedRequest ? formatRequestTiming(selectedRequest, now, language === "en" ? "en" : "zh") : "-";
  const currentPromptHistory = promptHistoryByMode[mode];
  const currentPinnedPromptHistory = pinnedPromptHistoryByMode[mode];
  const promptHistoryEntries = useMemo(
    () => mergePromptHistoryForDisplay(currentPinnedPromptHistory, currentPromptHistory),
    [currentPinnedPromptHistory, currentPromptHistory],
  );

  return {
    settings,
    prompt,
    mode,
    editImages,
    editMask,
    promptHistory: promptHistoryEntries,
    promptHistoryCount: currentPromptHistory.length,
    promptHistoryPinnedCount: currentPinnedPromptHistory.length,
    requestRecords,
    filteredRequests,
    selectedRequest,
    selectedRequestId,
    selectedRequestFilter,
    requestCounts,
    connectionStatus,
    testConnectionStatus,
    selectedRequestDetailLoadingId,
    endpointPreview,
    settingsOpen,
    clearDialogOpen,
    jsonDialogOpen,
    selectedRequestJson,
    selectedRequestDownload,
    selectedRequestTiming,
    now,
    historicalEditImageValue,
    historicalEditImageOptions,
    setPrompt,
    setMode: setConsoleMode,
    setEditImages,
    setEditMask,
    setHistoricalEditImageValue,
    updateSettings,
    setSelectedRequestId,
    setSelectedRequestFilter,
    setSettingsOpen,
    setClearDialogOpen,
    setJsonDialogOpen,
    saveCurrentSettings,
    resetSettings,
    testConnection,
    enqueueGeneration,
    enqueueEditGeneration,
    cancelRequest,
    deleteRequest,
    cancelAllRequests,
    clearAllRequests,
    clearAllData,
    clearCompletedRequests,
    clearFailedRequests,
    clearProductSuiteVersions,
    exportCompletedImagesZip,
    exportProductSuite,
    reusePrompt,
    selectPromptHistory,
    deletePromptHistory,
    togglePromptHistoryPin,
    addHistoricalEditImage,
    payloadSize,
    requestImageCount,
    formatRequestTiming,
  };
}
