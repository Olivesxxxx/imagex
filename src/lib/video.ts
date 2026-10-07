import { authHeaders } from "@/lib/api";

export type VideoDuration = "4" | "8" | "12";
export type VideoAspectRatio = "16:9" | "9:16" | "1:1";
export type VideoQuality = "480p" | "720p" | "1080p";
/** @deprecated Kept for consumers that still import the old video size type. */
export type VideoSize = "1280x720" | "720x1280" | "1024x1024";
export type VideoTaskStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export interface VideoRequestOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  duration: VideoDuration;
  aspectRatio: VideoAspectRatio;
  quality: VideoQuality;
  authHeaderName?: string;
  authPrefix?: string;
  referenceImages?: File[];
  signal?: AbortSignal;
}

export interface VideoTask {
  id: string;
  providerId: string;
  model: string;
  prompt: string;
  duration: VideoDuration;
  aspectRatio: VideoAspectRatio;
  quality: VideoQuality;
  status: VideoTaskStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
  url?: string;
  referenceImageCount?: number;
}

export interface VideoTaskResult {
  status: VideoTaskStatus;
  url?: string;
  blob?: Blob;
  error?: string;
}

export function normalizeVideoTask(value: unknown): VideoTask | null {
  const record = readRecord(value);
  const id = String(record.id || "").trim();
  if (!id) return null;
  const legacySize = String(record.size || "");
  const aspectRatio = record.aspectRatio === "16:9" || record.aspectRatio === "9:16" || record.aspectRatio === "1:1"
    ? record.aspectRatio
    : legacySize === "720x1280" ? "9:16" : legacySize === "1024x1024" ? "1:1" : "16:9";
  const quality = record.quality === "480p" || record.quality === "720p" || record.quality === "1080p" ? record.quality : "720p";
  const duration = record.duration === "4" || record.duration === "8" || record.duration === "12" ? record.duration : "8";
  const status = record.status === "queued" || record.status === "running" || record.status === "completed" || record.status === "failed" || record.status === "canceled"
    ? record.status
    : "queued";
  return {
    id,
    providerId: String(record.providerId || ""),
    model: String(record.model || ""),
    prompt: String(record.prompt || ""),
    duration,
    aspectRatio,
    quality,
    status,
    createdAt: Number(record.createdAt) || Date.now(),
    updatedAt: Number(record.updatedAt) || Date.now(),
    ...(typeof record.error === "string" ? { error: record.error } : {}),
    ...(typeof record.url === "string" ? { url: record.url } : {}),
    ...(Number.isFinite(Number(record.referenceImageCount)) ? { referenceImageCount: Number(record.referenceImageCount) } : {}),
  };
}

export function isAuttytVideoProvider(baseUrl: string) {
  try {
    const hostname = new URL(String(baseUrl || "").trim()).hostname.toLowerCase();
    return hostname === "auttyt.top" || hostname.endsWith(".auttyt.top");
  } catch {
    return false;
  }
}

export function videoPollIntervalMs(baseUrl: string) {
  return isAuttytVideoProvider(baseUrl) ? 15000 : 2500;
}

const VIDEO_DB_NAME = "ImageX-videos";
const VIDEO_DB_VERSION = 2;
const VIDEO_STORE_NAME = "video-blobs";
const VIDEO_REFERENCE_STORE_NAME = "video-references";
export const VIDEO_TASKS_STORAGE_KEY = "ImageX-video-tasks";
export const VIDEO_DATA_CLEARED_EVENT = "imagex:video-data-cleared";

function openVideoDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(VIDEO_DB_NAME, VIDEO_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(VIDEO_STORE_NAME)) request.result.createObjectStore(VIDEO_STORE_NAME);
      if (!request.result.objectStoreNames.contains(VIDEO_REFERENCE_STORE_NAME)) request.result.createObjectStore(VIDEO_REFERENCE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open video storage."));
  });
}

export async function saveVideoBlob(id: string, blob: Blob) {
  const db = await openVideoDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(VIDEO_STORE_NAME, "readwrite");
      transaction.objectStore(VIDEO_STORE_NAME).put(blob, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to save video."));
      transaction.onabort = () => reject(transaction.error || new Error("Video save was canceled."));
    });
  } finally {
    db.close();
  }
}

export async function loadVideoBlob(id: string) {
  const db = await openVideoDb();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const request = db.transaction(VIDEO_STORE_NAME, "readonly").objectStore(VIDEO_STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error || new Error("Unable to load video."));
    });
  } finally {
    db.close();
  }
}

export async function deleteVideoBlob(id: string) {
  const db = await openVideoDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(VIDEO_STORE_NAME, "readwrite");
      transaction.objectStore(VIDEO_STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to delete video."));
      transaction.onabort = () => reject(transaction.error || new Error("Video deletion was canceled."));
    });
  } finally {
    db.close();
  }
}

export async function saveVideoReferenceFiles(id: string, files: File[]) {
  if (!files.length) return;
  const db = await openVideoDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(VIDEO_REFERENCE_STORE_NAME, "readwrite");
      transaction.objectStore(VIDEO_REFERENCE_STORE_NAME).put(files, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to save video references."));
      transaction.onabort = () => reject(transaction.error || new Error("Video reference save was canceled."));
    });
  } finally {
    db.close();
  }
}

export async function loadVideoReferenceFiles(id: string) {
  const db = await openVideoDb();
  try {
    return await new Promise<File[]>((resolve, reject) => {
      const request = db.transaction(VIDEO_REFERENCE_STORE_NAME, "readonly").objectStore(VIDEO_REFERENCE_STORE_NAME).get(id);
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result.filter((item): item is File => item instanceof File) : []);
      request.onerror = () => reject(request.error || new Error("Unable to load video references."));
    });
  } finally {
    db.close();
  }
}

export async function deleteVideoReferenceFiles(id: string) {
  const db = await openVideoDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(VIDEO_REFERENCE_STORE_NAME, "readwrite");
      transaction.objectStore(VIDEO_REFERENCE_STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to delete video references."));
      transaction.onabort = () => reject(transaction.error || new Error("Video reference deletion was canceled."));
    });
  } finally {
    db.close();
  }
}

export async function clearVideoData() {
  localStorage.removeItem(VIDEO_TASKS_STORAGE_KEY);
  if (typeof indexedDB !== "undefined") {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(VIDEO_DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Unable to clear video storage."));
      request.onblocked = () => resolve();
    });
  }
  window.dispatchEvent(new Event(VIDEO_DATA_CLEARED_EVENT));
}

function endpoint(baseUrl: string, path: string) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Video API URL is not configured.");
  return `${base}${base.endsWith("/v1") ? "" : "/v1"}${path}`;
}

function videoEndpoint(baseUrl: string, path: string) {
  return endpoint(baseUrl, isAuttytVideoProvider(baseUrl) ? `/video/generations${path}` : `/videos${path}`);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function responseBody(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string) {
  const record = readRecord(body);
  const error = readRecord(record.error);
  return String(error.message || record.message || record.msg || fallback).trim() || fallback;
}

function taskFromBody(body: unknown, options: Pick<VideoRequestOptions, "model" | "prompt" | "duration" | "aspectRatio" | "quality" | "referenceImages">): VideoTask {
  const root = readRecord(body);
  const data = readRecord(root.data);
  const id = String(root.id || data.id || root.task_id || data.task_id || "").trim();
  if (!id) throw new Error(errorMessage(body, "Video API did not return a task ID."));
  const status = String(root.status || data.status || "queued").toLowerCase();
  const normalizedStatus: VideoTaskStatus = status === "completed" || status === "success" || status === "succeeded" || status === "done"
    ? "completed"
    : status === "failed" || status === "failure" || status === "error"
      ? "failed"
      : status === "canceled" || status === "cancelled"
        ? "canceled"
        : status === "running" || status === "processing" || status === "in_progress" || status === "generating"
          ? "running"
          : "queued";
  const now = Date.now();
  return {
    id,
    providerId: "",
    model: options.model,
    prompt: options.prompt,
    duration: options.duration,
    aspectRatio: options.aspectRatio,
    quality: options.quality,
    referenceImageCount: options.referenceImages?.length || 0,
    status: normalizedStatus,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createVideoTask(options: VideoRequestOptions, providerId = ""): Promise<VideoTask> {
  const model = String(options.model || "").trim();
  const prompt = String(options.prompt || "").trim();
  if (!model) throw new Error("Video model is not configured for this provider.");
  if (!prompt) throw new Error("Video prompt is required.");
  const auttyt = isAuttytVideoProvider(options.baseUrl);
  const body = auttyt
    ? await auttytVideoBody(options)
    : (() => {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("seconds", options.duration);
      form.append("size", videoPixelSize(options.aspectRatio, options.quality));
      for (const image of options.referenceImages || []) form.append("image[]", image, image.name || "reference.png");
      return form;
    })();
  const response = await fetch(auttyt ? videoEndpoint(options.baseUrl, "") : endpoint(options.baseUrl, "/videos"), {
    method: "POST",
    headers: authHeaders(options.apiKey, auttyt ? "application/json" : null, options),
    body,
    signal: options.signal,
  });
  const payload = await responseBody(response);
  if (!response.ok) throw new Error(`Video task creation failed (HTTP ${response.status}): ${errorMessage(payload, response.statusText || "request failed")}`);
  return { ...taskFromBody(payload, options), providerId };
}

function videoPixelSize(aspectRatio: VideoAspectRatio, quality: VideoQuality) {
  const sizes: Record<VideoQuality, Record<VideoAspectRatio, string>> = {
    "480p": { "16:9": "854x480", "9:16": "480x854", "1:1": "480x480" },
    "720p": { "16:9": "1280x720", "9:16": "720x1280", "1:1": "1024x1024" },
    "1080p": { "16:9": "1920x1080", "9:16": "1080x1920", "1:1": "1080x1080" },
  };
  return sizes[quality][aspectRatio];
}

async function fileToDataUri(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

async function auttytVideoBody(options: VideoRequestOptions) {
  const references = await Promise.all((options.referenceImages || []).map(fileToDataUri));
  const model = options.model.trim();
  const body: Record<string, unknown> = {
    model,
    prompt: options.prompt.trim(),
    ratio: options.aspectRatio,
    resolution: options.quality,
  };
  if (references.length === 1) body.image = references[0];
  if (references.length > 1) body.images = references;
  if (/seedance/i.test(model)) body.duration = Number(options.duration);
  return JSON.stringify(body);
}

function resultUrl(body: unknown) {
  const root = readRecord(body);
  const data = readRecord(root.data);
  const nestedVideo = readRecord(data.video);
  const content = readRecord(root.content);
  return [root.url, root.video_url, root.result_url, data.url, data.video_url, data.result_url, nestedVideo.url, nestedVideo.video_url, content.url, content.video_url]
    .find((value) => typeof value === "string" && value.trim()) as string | undefined;
}

function resolveVideoUrl(baseUrl: string, value: string) {
  try {
    return new URL(value, `${String(baseUrl || "").trim().replace(/\/+$/, "")}/`).toString();
  } catch {
    return value;
  }
}

async function fetchVideoBlob(url: string, options: Pick<VideoRequestOptions, "apiKey" | "authHeaderName" | "authPrefix" | "signal">) {
  const response = await fetch(url, {
    headers: authHeaders(options.apiKey, null, options),
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`Video content download failed (HTTP ${response.status}).`);
  const blob = await response.blob();
  if (blob.type === "text/html" || blob.type === "application/json") {
    throw new Error("Video content download returned an invalid response.");
  }
  return blob;
}

export async function pollVideoTask(task: VideoTask, options: Pick<VideoRequestOptions, "baseUrl" | "apiKey" | "authHeaderName" | "authPrefix" | "signal">): Promise<VideoTaskResult> {
  const response = await fetch(videoEndpoint(options.baseUrl, `/${encodeURIComponent(task.id)}`), {
    headers: authHeaders(options.apiKey, null, options),
    signal: options.signal,
  });
  const payload = await responseBody(response);
  if (!response.ok) throw new Error(`Video task query failed (HTTP ${response.status}): ${errorMessage(payload, response.statusText || "request failed")}`);
  const root = readRecord(payload);
  const data = readRecord(root.data);
  const statusValue = String(root.status || data.status || "queued").toLowerCase();
  const status: VideoTaskStatus = statusValue === "completed" || statusValue === "succeeded" || statusValue === "success" || statusValue === "done"
    ? "completed"
    : statusValue === "failed" || statusValue === "error"
      ? "failed"
      : statusValue === "canceled" || statusValue === "cancelled"
        ? "canceled"
        : statusValue === "running" || statusValue === "processing" || statusValue === "in_progress" || statusValue === "generating"
          ? "running"
          : "queued";
  const url = resultUrl(payload);
  if (url) {
    const resolvedUrl = resolveVideoUrl(options.baseUrl, url);
    if (/^https?:\/\//i.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\//i.test(url)) return { status: "completed", url: resolvedUrl };
    try {
      return { status: "completed", blob: await fetchVideoBlob(resolvedUrl, options) };
    } catch (error) {
      // Auttyt sometimes returns a result_url under /v1/videos that responds
      // with 404 even though the generation task is complete. Its task content
      // endpoint is the reliable fallback for that response shape.
      if (options.signal?.aborted) throw error;
      if (!isAuttytVideoProvider(options.baseUrl)) throw error;
      const taskContentUrl = videoEndpoint(options.baseUrl, `/${encodeURIComponent(task.id)}/content`);
      if (taskContentUrl === resolvedUrl) throw error;
      return { status: "completed", blob: await fetchVideoBlob(taskContentUrl, options) };
    }
  }
  if (status === "failed" || status === "canceled") return { status, error: errorMessage(payload, `Video task ${status}.`) };
  if (status !== "completed") return { status };

  const contentUrl = videoEndpoint(options.baseUrl, `/${encodeURIComponent(task.id)}/content`);
  return { status: "completed", blob: await fetchVideoBlob(contentUrl, options) };
}

export function delayVideoPoll(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    if (!signal) return;
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}
