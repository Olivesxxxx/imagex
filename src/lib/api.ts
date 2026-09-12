import { normalizeModelsEndpoint } from "@/lib/endpoints";
import { responseBodyHasError, responseErrorMessage } from "@/lib/image-console";
import type { OpenAIImageRequestOptions } from "@/lib/image-console";

export function authHeaders(apiKey: string, contentType: string | null = "application/json") {
  const headers: Record<string, string> = {};

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

// Kept private for legacy persisted request compatibility; no UI path emits
// this protocol anymore.
function privateAuthHeaders(apiKey: string, contentType: string | null = "application/json") {
  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = contentType;
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}

export async function parseResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function validatedResponseBody(response: Response, language: "zh" | "en") {
  const body = await parseResponseBody(response);
  return validateParsedResponseBody(response, body, language);
}

function validateParsedResponseBody(response: Response, body: unknown, language: "zh" | "en") {
  if (!response.ok || responseBodyHasError(body)) {
    const error = new Error(responseErrorMessage(response.status, body, language)) as Error & {
      responseBody?: unknown;
      status?: number;
    };
    error.responseBody = body;
    error.status = response.status;
    throw error;
  }

  return body;
}

function withoutResponseFormat(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const { response_format: _responseFormat, ...rest } = payload as Record<string, unknown>;
  return rest;
}

function withResponseFormat(payload: unknown, responseFormat: "b64_json" | "url"): unknown {
  const normalized = withoutResponseFormat(payload);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return normalized;
  return { ...normalized, response_format: responseFormat };
}

function responseFormatErrorDetails(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { param: "", message: "" };
  const record = body as Record<string, unknown>;
  const error = record.error && typeof record.error === "object" && !Array.isArray(record.error)
    ? record.error as Record<string, unknown>
    : record;
  return {
    param: String(error.param || error.parameter || "").toLowerCase(),
    message: String(error.message || error.detail || "").toLowerCase(),
  };
}

function responseFormatIsUnsupported(response: Response, body: unknown) {
  if (response.status !== 400 && response.status !== 422) return false;
  const { param, message } = responseFormatErrorDetails(body);
  if (param === "response_format") return true;
  if (!message.includes("response_format")) return false;
  return [
    "unsupported",
    "not supported",
    "unknown",
    "unrecognized",
    "invalid",
    "not allowed",
    "not permitted",
    "不支持",
    "未知",
    "无效",
    "不允许",
    "不存在",
  ].some((keyword) => message.includes(keyword));
}

function imageFieldIsUnsupported(response: Response, body: unknown) {
  if (response.status !== 400 && response.status !== 422) return false;
  const { param, message } = responseFormatErrorDetails(body);
  if (message.includes("image[]") || message.includes("image array")) return true;
  if (param !== "image" && param !== "images") return false;
  return ["array", "multiple", "field", "parameter", "expected", "invalid", "unsupported"].some((keyword) => message.includes(keyword));
}

async function postJsonWithResponseFormatFallback(
  endpoint: string,
  apiKey: string,
  payload: unknown,
  signal: AbortSignal,
  language: "zh" | "en",
  options: OpenAIImageRequestOptions = { imageResponseMode: "auto", multiImageField: "auto" },
) {
  const request = (body: unknown) => fetch(endpoint, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
    signal,
  });

  const responseFormat = options.imageResponseMode === "url" ? "url" : "b64_json";
  const response = await request({ ...withResponseFormat(payload, responseFormat) as Record<string, unknown>, ...(options.streamImages ? { stream: true, partial_images: options.streamPartialImages } : {}) });
  if (options.streamImages && response.ok && response.body && response.headers.get("content-type")?.includes("text/event-stream")) {
    const streamed = await parseEventStreamBody(response, signal);
    return validateParsedResponseBody(new Response(JSON.stringify(streamed), { status: response.status }), streamed, language);
  }
  const body = await parseResponseBody(response);
  if (options.imageResponseMode !== "auto" || !responseFormatIsUnsupported(response, body)) {
    return validateParsedResponseBody(response, body, language);
  }

  return validatedResponseBody(await request(withoutResponseFormat(payload)), language);
}

async function parseEventStreamBody(response: Response, signal?: AbortSignal): Promise<unknown> {
  if (!response.body) return parseResponseBody(response);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let latest: unknown = null;
  const consumeLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const text = line.slice(5).trim();
    if (!text || text === "[DONE]") return;
    try {
      const event = JSON.parse(text) as Record<string, unknown>;
      const candidate = event.response ?? event.data ?? event;
      latest = candidate;
      if (event.type === "response.completed" && event.response && typeof event.response === "object") latest = event.response;
      if (event.type === "image_generation.completed" && event.data && typeof event.data === "object") latest = event.data;
    } catch {
      // Ignore keep-alive/non-JSON SSE frames.
    }
  };
  while (true) {
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) consumeLine(line);
    if (done) break;
  }
  if (buffer) consumeLine(buffer);
  return latest;
}

function isImagesGenerationEndpoint(endpoint: string) {
  return /\/images\/generations\/?(?:[?#].*)?$/i.test(endpoint);
}

export async function postImageGeneration(
  endpoint: string,
  apiKey: string,
  payload: unknown,
  signal: AbortSignal,
  language: "zh" | "en" = "zh",
  options: OpenAIImageRequestOptions = { imageResponseMode: "auto", multiImageField: "auto" },
) {
  if (isImagesGenerationEndpoint(endpoint)) {
    return postJsonWithResponseFormatFallback(endpoint, apiKey, payload, signal, language, options);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(payload),
    signal,
  });
  return validatedResponseBody(response, language);
}

function buildImageEditFormData(
  payload: Record<string, unknown>,
  images: Array<{ file?: File; blob?: Blob; name: string; mimeType?: string }>,
  language: "zh" | "en",
  imageField: "image" | "image[]",
  responseFormat: "b64_json" | "url" | null,
  mask?: { file?: File; blob?: Blob; name: string; mimeType?: string },
) {
  const formData = new FormData();
  const normalizedPayload = withoutResponseFormat(payload) as Record<string, unknown>;

  for (const [key, value] of Object.entries(normalizedPayload)) {
    if (value == null) continue;
    if (key === "images") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item == null) continue;
        formData.append(key, typeof item === "string" ? item : JSON.stringify(item));
      }
      continue;
    }

    if (typeof value === "object") {
      formData.append(key, JSON.stringify(value));
      continue;
    }

    formData.append(key, String(value));
  }

  for (const image of images) {
    const file = image.file || image.blob;
    if (!file) {
      throw new Error(language === "en" ? "Edit request is missing an uploadable image." : "编辑请求缺少可上传的图片。");
    }

    formData.append(imageField, file, image.name);
  }

  if (mask) {
    const file = mask.file || mask.blob;
    if (!file) {
      throw new Error(language === "en" ? "Edit request mask is not uploadable." : "编辑请求的遮罩无法上传。" );
    }
    formData.append("mask", file, mask.name || "mask.png");
  }

  if (responseFormat) formData.append("response_format", responseFormat);
  return formData;
}

export async function postImageEdit(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>,
  images: Array<{ file?: File; blob?: Blob; name: string; mimeType?: string }>,
  signal: AbortSignal,
  language: "zh" | "en" = "zh",
  options: OpenAIImageRequestOptions = { imageResponseMode: "auto", multiImageField: "auto" },
  mask?: { file?: File; blob?: Blob; name: string; mimeType?: string },
) {
  const requestedResponseFormat: "b64_json" | "url" = options.imageResponseMode === "url" ? "url" : "b64_json";
  const initialImageField: "image" | "image[]" = images.length > 1 && options.multiImageField !== "image" ? "image[]" : "image";
  const alternateImageField: "image" | "image[]" = initialImageField === "image[]" ? "image" : "image[]";
  const request = (imageField: "image" | "image[]", responseFormat: "b64_json" | "url" | null) => fetch(endpoint, {
    method: "POST",
    headers: authHeaders(apiKey, null),
    body: buildImageEditFormData(payload, images, language, imageField, responseFormat, mask),
    signal,
  });

  let imageField = initialImageField;
  let responseFormat: "b64_json" | "url" | null = requestedResponseFormat;
  let responseFormatRetried = false;
  let imageFieldRetried = false;

  for (;;) {
    const response = await request(imageField, responseFormat);
    const body = await parseResponseBody(response);

    if (options.imageResponseMode === "auto" && !responseFormatRetried && responseFormat && responseFormatIsUnsupported(response, body)) {
      responseFormat = null;
      responseFormatRetried = true;
      continue;
    }

    if (images.length > 1 && options.multiImageField === "auto" && !imageFieldRetried && imageFieldIsUnsupported(response, body)) {
      imageField = alternateImageField;
      imageFieldRetried = true;
      continue;
    }

    return validateParsedResponseBody(response, body, language);
  }
}

export async function postPrivateImageGeneration(
  endpoint: string,
  apiKey: string,
  payload: unknown,
  signal: AbortSignal,
  language: "zh" | "en" = "zh",
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: privateAuthHeaders(apiKey),
    body: JSON.stringify(payload),
    signal,
  });
  return validatedResponseBody(response, language);
}

export async function postPrivateImageEdit(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>,
  images: Array<{ file?: File; blob?: Blob; name: string; mimeType?: string }>,
  signal: AbortSignal,
  language: "zh" | "en" = "zh",
) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value == null || key === "images") continue;
    formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  for (const image of images) {
    const file = image.file || image.blob;
    if (!file) throw new Error(language === "en" ? "Edit request is missing an uploadable image." : "编辑请求缺少可上传的图片。");
    formData.append(images.length === 1 ? "image" : "image[]", file, image.name);
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: privateAuthHeaders(apiKey, null),
    body: formData,
    signal,
  });
  return validatedResponseBody(response, language);
}

export async function postGeminiImageGeneration(
  endpoint: string,
  apiKey: string,
  prompt: string,
  signal: AbortSignal,
  language: "zh" | "en" = "zh",
) {
  const url = new URL(endpoint);
  if (apiKey) url.searchParams.set("key", apiKey);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
    signal,
  });
  return validatedResponseBody(response, language);
}

export async function fetchModels(
  baseUrl: string,
  apiKey: string,
  language: "zh" | "en" = "zh",
  signal?: AbortSignal,
) {
  const endpoint = normalizeModelsEndpoint(baseUrl);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: authHeaders(apiKey),
    signal,
  });
  return { endpoint, body: await validatedResponseBody(response, language) };
}
