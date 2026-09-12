export const DEFAULT_BASE_URL = "https://lingsu.xyz/v1";

function trimTrailingSlash(value: unknown) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function routeFromBaseUrl(baseUrl: string, route: string) {
  const input = trimTrailingSlash(baseUrl || DEFAULT_BASE_URL);
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  const routeWithoutV1 = normalizedRoute.replace(/^\/v1\//, "/");

  // Relative same-origin proxy prefixes (for example `/api-proxy`) already
  // identify the API gateway. Do not inject an extra `/v1` segment; the
  // development proxy can forward the request to a target that includes its
  // own version prefix.
  if (input.startsWith("/")) {
    if (input.endsWith(normalizedRoute) || input.endsWith(routeWithoutV1)) return input;
    return `${input}${routeWithoutV1}`;
  }

  if (input.endsWith(normalizedRoute) || input.endsWith(routeWithoutV1)) {
    return input;
  }

  if (input.endsWith("/v1")) {
    return `${input}${routeWithoutV1}`;
  }

  return `${input}/v1${routeWithoutV1}`;
}

export function normalizeImageEndpoint(baseUrl: string) {
  return routeFromBaseUrl(baseUrl, "/v1/images/generations");
}

export function normalizeResponsesEndpoint(baseUrl: string) {
  return routeFromBaseUrl(baseUrl, "/v1/responses");
}

export function normalizeImageEditsEndpoint(baseUrl: string) {
  return routeFromBaseUrl(baseUrl, "/v1/images/edits");
}

export function normalizeChatCompletionsEndpoint(baseUrl: string) {
  return routeFromBaseUrl(baseUrl, "/v1/chat/completions");
}

export function normalizeModelsEndpoint(baseUrl: string) {
  return routeFromBaseUrl(baseUrl, "/v1/models");
}

function privateRouteFromBaseUrl(baseUrl: string, route: string) {
  const input = trimTrailingSlash(baseUrl).replace(/\/api\/images\/(?:generations|edits)$/i, "");
  if (!input) return "";
  if (input.endsWith("/api")) return `${input}${route.replace(/^\/api/, "")}`;
  return `${input}${route}`;
}

export function normalizePrivateImageEndpoint(baseUrl: string) {
  return privateRouteFromBaseUrl(baseUrl, "/api/images/generations");
}

export function normalizePrivateImageEditsEndpoint(baseUrl: string) {
  return privateRouteFromBaseUrl(baseUrl, "/api/images/edits");
}

export function normalizeGeminiImageEndpoint(baseUrl: string, model: string) {
  const input = trimTrailingSlash(baseUrl || "https://generativelanguage.googleapis.com/v1beta");
  const normalizedModel = String(model || "gemini-2.5-flash-image").trim();
  if (/\/models\/[^/]+:generateContent$/i.test(input)) return input;
  return `${input}/models/${encodeURIComponent(normalizedModel)}:generateContent`;
}
