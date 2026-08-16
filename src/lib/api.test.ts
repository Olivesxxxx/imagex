import { afterEach, describe, expect, test, vi } from "vitest";

import { postImageEdit, postImageGeneration } from "@/lib/api";

const endpoint = "https://images.example/v1/images/generations";
const successBody = { data: [{ b64_json: "aW1hZ2U=" }] };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OpenAI-compatible image requests", () => {
  test("prefers base64 generation responses without retrying a successful request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successBody));
    vi.stubGlobal("fetch", fetchMock);

    await expect(postImageGeneration(
      endpoint,
      "test-key",
      { model: "image-model", prompt: "a product" },
      new AbortController().signal,
    )).resolves.toEqual(successBody);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      model: "image-model",
      prompt: "a product",
      response_format: "b64_json",
    });
  });

  test("can request URL image responses for providers that expose URL mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ url: "https://cdn.example.com/image.png" }] }));
    vi.stubGlobal("fetch", fetchMock);

    await postImageGeneration(
      endpoint,
      "test-key",
      { model: "image-model", prompt: "a product" },
      new AbortController().signal,
      "zh",
      { imageResponseMode: "url", multiImageField: "auto" },
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toBe("url");
  });

  test("retries generation without response_format when the service explicitly rejects it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        error: { param: "response_format", message: "Unsupported parameter: response_format" },
      }, 400))
      .mockResolvedValueOnce(jsonResponse(successBody));
    vi.stubGlobal("fetch", fetchMock);

    await postImageGeneration(
      endpoint,
      "test-key",
      { model: "image-model", prompt: "a product" },
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toBe("b64_json");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toBeUndefined();
  });

  test("does not retry unrelated generation errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      error: { param: "model", message: "Unknown model" },
    }, 400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(postImageGeneration(
      endpoint,
      "test-key",
      { model: "missing-model", prompt: "a product" },
      new AbortController().signal,
    )).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("does not add image response options to Responses or Chat Completions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ output: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await postImageGeneration(
      "https://images.example/v1/responses",
      "test-key",
      { model: "chat-model", input: "a product" },
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      model: "chat-model",
      input: "a product",
    });
  });

  test("uses image[] for automatic multi-image edits and requests base64", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successBody));
    vi.stubGlobal("fetch", fetchMock);
    const images = [
      { file: new File(["one"], "one.png", { type: "image/png" }), name: "one.png" },
      { file: new File(["two"], "two.png", { type: "image/png" }), name: "two.png" },
    ];

    await postImageEdit(
      endpoint.replace("generations", "edits"),
      "test-key",
      { model: "image-model", prompt: "edit it" },
      images,
      new AbortController().signal,
    );

    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.getAll("image")).toHaveLength(0);
    expect(form.getAll("image[]")).toHaveLength(2);
    expect(form.get("response_format")).toBe("b64_json");
  });

  test("supports providers that require repeated image fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successBody));
    vi.stubGlobal("fetch", fetchMock);
    const images = [
      { file: new File(["one"], "one.png", { type: "image/png" }), name: "one.png" },
      { file: new File(["two"], "two.png", { type: "image/png" }), name: "two.png" },
    ];

    await postImageEdit(
      endpoint.replace("generations", "edits"),
      "test-key",
      { model: "image-model", prompt: "edit it" },
      images,
      new AbortController().signal,
      "zh",
      { imageResponseMode: "auto", multiImageField: "image" },
    );

    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.getAll("image")).toHaveLength(2);
    expect(form.getAll("image[]")).toHaveLength(0);
  });

  test("automatically retries multi-image edits with repeated image fields after a field error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { param: "image", message: "image[] is not supported" } }, 422))
      .mockResolvedValueOnce(jsonResponse(successBody));
    vi.stubGlobal("fetch", fetchMock);
    const images = [
      { file: new File(["one"], "one.png", { type: "image/png" }), name: "one.png" },
      { file: new File(["two"], "two.png", { type: "image/png" }), name: "two.png" },
    ];

    await postImageEdit(
      endpoint.replace("generations", "edits"),
      "test-key",
      { model: "image-model", prompt: "edit it" },
      images,
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][1].body as FormData).getAll("image[]")).toHaveLength(2);
    expect((fetchMock.mock.calls[1][1].body as FormData).getAll("image")).toHaveLength(2);
  });

  test("rebuilds edit form data when falling back without response_format", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        error: { message: "response_format is not allowed" },
      }, 400))
      .mockResolvedValueOnce(jsonResponse(successBody));
    vi.stubGlobal("fetch", fetchMock);
    const images = [{
      file: new File(["one"], "one.png", { type: "image/png" }),
      name: "one.png",
    }];

    await postImageEdit(
      endpoint.replace("generations", "edits"),
      "test-key",
      { model: "image-model", prompt: "edit it" },
      images,
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstForm = fetchMock.mock.calls[0][1].body as FormData;
    const retryForm = fetchMock.mock.calls[1][1].body as FormData;
    expect(firstForm).not.toBe(retryForm);
    expect(firstForm.get("response_format")).toBe("b64_json");
    expect(retryForm.get("response_format")).toBeNull();
    expect(retryForm.getAll("image")).toHaveLength(1);
  });
});
