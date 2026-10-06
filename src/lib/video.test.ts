import { afterEach, describe, expect, test, vi } from "vitest";

import { createVideoTask, pollVideoTask, type VideoTask } from "@/lib/video";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const options = {
  baseUrl: "https://video.example/v1",
  apiKey: "test-key",
  model: "video-model",
  prompt: "A paper boat sailing across a quiet pond",
  duration: "8" as const,
  size: "1280x720" as const,
  authHeaderName: "x-api-key",
  authPrefix: "",
};

describe("video API", () => {
  test("creates an OpenAI-compatible task using the configured model and auth header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "video-1", status: "queued" }));
    vi.stubGlobal("fetch", fetchMock);

    const task = await createVideoTask(options, "provider-a");
    const [url, init] = fetchMock.mock.calls[0];
    const form = init.body as FormData;

    expect(url).toBe("https://video.example/v1/videos");
    expect(init.headers).toMatchObject({ "x-api-key": "test-key" });
    expect(form.get("model")).toBe("video-model");
    expect(form.get("prompt")).toBe(options.prompt);
    expect(form.get("seconds")).toBe("8");
    expect(task).toMatchObject({ id: "video-1", providerId: "provider-a", status: "queued" });
  });

  test("uploads video reference images as repeated image[] fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "video-ref", status: "queued" }));
    vi.stubGlobal("fetch", fetchMock);
    const reference = new File(["reference"], "reference.png", { type: "image/png" });

    await createVideoTask({ ...options, referenceImages: [reference, reference] }, "provider-a");
    const form = fetchMock.mock.calls[0][1].body as FormData;

    expect(form.getAll("image[]")).toHaveLength(2);
    expect((form.getAll("image[]")[0] as File).name).toBe("reference.png");
  });

  test("polls pending work and fetches content only after completion", async () => {
    const task: VideoTask = {
      id: "video-2", providerId: "provider-a", model: options.model, prompt: options.prompt,
      duration: options.duration, size: options.size, status: "running", createdAt: 1, updatedAt: 1,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: "processing" }))
      .mockResolvedValueOnce(jsonResponse({ status: "completed" }))
      .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pollVideoTask(task, options)).resolves.toEqual({ status: "running" });
    await expect(pollVideoTask(task, options)).resolves.toMatchObject({ status: "completed", blob: expect.any(Blob) });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://video.example/v1/videos/video-2",
      "https://video.example/v1/videos/video-2",
      "https://video.example/v1/videos/video-2/content",
    ]);
  });

  test("normalizes a provider result URL as a completed task", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: "completed", data: { video_url: "https://cdn.example/video.mp4" } })));
    const task: VideoTask = {
      id: "video-3", providerId: "provider-a", model: options.model, prompt: options.prompt,
      duration: options.duration, size: options.size, status: "running", createdAt: 1, updatedAt: 1,
    };

    await expect(pollVideoTask(task, options)).resolves.toEqual({ status: "completed", url: "https://cdn.example/video.mp4" });
  });
});
