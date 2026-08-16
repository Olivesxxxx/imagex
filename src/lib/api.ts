import { normalizeModelsEndpoint } from "@/lib/endpoints";
import { responseBodyHasError, responseErrorMessage } from "@/lib/image-console";

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

function withBase64ResponseFormat(payload: unknown): unknown {
  const normalized = withoutResponseFormat(payload);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return normalized;
  return { ...normalized, response_format: "b64_json" };
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
  if (response.status !== 400) return false;
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

async function postJsonWithResponseFormatFallback(
  endpoint: string,
  apiKey: string,
  payload: unknown,
  signal: AbortSignal,
  language: "zh" | "en",
) {
  const request = (body: unknown) => fetch(endpoint, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
    signal,
  });

  const response = await request(withBase64ResponseFormat(payload));
  const body = await parseResponseBody(response);
  if (!responseFormatIsUnsupported(response, body)) {
    return validateParsedResponseBody(response, body, language);
  }

  return validatedResponseBody(await request(withoutResponseFormat(payload)), language);
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
) {
  if (isImagesGenerationEndpoint(endpoint)) {
    return postJsonWithResponseFormatFallback(endpoint, apiKey, payload, signal, language);
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
  includeResponseFormat: boolean,
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

    formData.append("image", file, image.name);
  }

  if (includeResponseFormat) formData.append("response_format", "b64_json");
  return formData;
}

export async function postImageEdit(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>,
  images: Array<{ file?: File; blob?: Blob; name: string; mimeType?: string }>,
  signal: AbortSignal,
  language: "zh" | "en" = "zh",
) {
  const request = (includeResponseFormat: boolean) => fetch(endpoint, {
    method: "POST",
    headers: authHeaders(apiKey, null),
    body: buildImageEditFormData(payload, images, language, includeResponseFormat),
    signal,
  });

  const response = await request(true);
  const body = await parseResponseBody(response);
  if (!responseFormatIsUnsupported(response, body)) {
    return validateParsedResponseBody(response, body, language);
  }

  return validatedResponseBody(await request(false), language);
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

export async function fetchModels(
  baseUrl: string,
  apiKey: string,
  language: "zh" | "en" = "zh",
) {
  const endpoint = normalizeModelsEndpoint(baseUrl);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: authHeaders(apiKey),
  });
  return { endpoint, body: await validatedResponseBody(response, language) };
}
