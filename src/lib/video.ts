import { authHeaders } from "@/lib/api";

export type VideoDuration = "4" | "8" | "12";
export type VideoSize = "1280x720" | "720x1280" | "1024x1024";
export type VideoTaskStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export interface VideoRequestOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  duration: VideoDuration;
  size: VideoSize;
  authHeaderName?: string;
  authPrefix?: string;
  signal?: AbortSignal;
}

export interface VideoTask {
  id: string;
  providerId: string;
  model: string;
  prompt: string;
  duration: VideoDuration;
  size: VideoSize;
  status: VideoTaskStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
  url?: string;
}

export interface VideoTaskResult {
  status: VideoTaskStatus;
  url?: string;
  blob?: Blob;
  error?: string;
}

const VIDEO_DB_NAME = "ImageX-videos";
const VIDEO_DB_VERSION = 1;
const VIDEO_STORE_NAME = "video-blobs";

function openVideoDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(VIDEO_DB_NAME, VIDEO_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(VIDEO_STORE_NAME)) request.result.createObjectStore(VIDEO_STORE_NAME);
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

function endpoint(baseUrl: string, path: string) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Video API URL is not configured.");
  return `${base}${base.endsWith("/v1") ? "" : "/v1"}${path}`;
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

function taskFromBody(body: unknown, options: Pick<VideoRequestOptions, "model" | "prompt" | "duration" | "size">): VideoTask {
  const root = readRecord(body);
  const data = readRecord(root.data);
  const id = String(root.id || data.id || root.task_id || data.task_id || "").trim();
  if (!id) throw new Error(errorMessage(body, "Video API did not return a task ID."));
  const status = String(root.status || data.status || "queued").toLowerCase();
  const now = Date.now();
  return {
    id,
    providerId: "",
    model: options.model,
    prompt: options.prompt,
    duration: options.duration,
    size: options.size,
    status: status === "completed" || status === "failed" || status === "canceled" || status === "running" ? status : "queued",
    createdAt: now,
    updatedAt: now,
  };
}

export async function createVideoTask(options: VideoRequestOptions, providerId = ""): Promise<VideoTask> {
  const model = String(options.model || "").trim();
  const prompt = String(options.prompt || "").trim();
  if (!model) throw new Error("Video model is not configured for this provider.");
  if (!prompt) throw new Error("Video prompt is required.");
  const body = new FormData();
  body.append("model", model);
  body.append("prompt", prompt);
  body.append("seconds", options.duration);
  body.append("size", options.size);
  const response = await fetch(endpoint(options.baseUrl, "/videos"), {
    method: "POST",
    headers: authHeaders(options.apiKey, null, options),
    body,
    signal: options.signal,
  });
  const payload = await responseBody(response);
  if (!response.ok) throw new Error(`Video task creation failed (HTTP ${response.status}): ${errorMessage(payload, response.statusText || "request failed")}`);
  return { ...taskFromBody(payload, options), providerId };
}

function resultUrl(body: unknown) {
  const root = readRecord(body);
  const data = readRecord(root.data);
  const content = readRecord(root.content);
  return [root.url, root.video_url, root.result_url, data.url, data.video_url, data.result_url, content.url, content.video_url]
    .find((value) => typeof value === "string" && value.trim()) as string | undefined;
}

export async function pollVideoTask(task: VideoTask, options: Pick<VideoRequestOptions, "baseUrl" | "apiKey" | "authHeaderName" | "authPrefix" | "signal">): Promise<VideoTaskResult> {
  const response = await fetch(endpoint(options.baseUrl, `/videos/${encodeURIComponent(task.id)}`), {
    headers: authHeaders(options.apiKey, null, options),
    signal: options.signal,
  });
  const payload = await responseBody(response);
  if (!response.ok) throw new Error(`Video task query failed (HTTP ${response.status}): ${errorMessage(payload, response.statusText || "request failed")}`);
  const root = readRecord(payload);
  const data = readRecord(root.data);
  const statusValue = String(root.status || data.status || "queued").toLowerCase();
  const status: VideoTaskStatus = statusValue === "completed" || statusValue === "succeeded" || statusValue === "done"
    ? "completed"
    : statusValue === "failed" || statusValue === "error"
      ? "failed"
      : statusValue === "canceled" || statusValue === "cancelled"
        ? "canceled"
        : statusValue === "running" || statusValue === "processing"
          ? "running"
          : "queued";
  const url = resultUrl(payload);
  if (url) return { status: "completed", url };
  if (status === "failed" || status === "canceled") return { status, error: errorMessage(payload, `Video task ${status}.`) };
  if (status !== "completed") return { status };

  const content = await fetch(endpoint(options.baseUrl, `/videos/${encodeURIComponent(task.id)}/content`), {
    headers: authHeaders(options.apiKey, null, options),
    signal: options.signal,
  });
  if (!content.ok) throw new Error(`Video content download failed (HTTP ${content.status}).`);
  return { status: "completed", blob: await content.blob() };
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
