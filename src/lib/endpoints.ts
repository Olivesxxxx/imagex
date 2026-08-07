export const DEFAULT_BASE_URL = "http://localhost:8317/v1";

function trimTrailingSlash(value: unknown) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function routeFromBaseUrl(baseUrl: string, route: string) {
  const input = trimTrailingSlash(baseUrl || DEFAULT_BASE_URL);
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  const routeWithoutV1 = normalizedRoute.replace(/^\/v1\//, "/");

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
