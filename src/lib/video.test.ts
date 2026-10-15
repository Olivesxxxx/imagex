import { afterEach, describe, expect, test, vi } from "vitest";

import { createVideoTask, isAuttytVideoProvider, isLingsuVideoProvider, lingsuSupportsVideoReference, pollVideoTask, type VideoTask } from "@/lib/video";

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
  aspectRatio: "16:9" as const,
  quality: "720p" as const,
  authHeaderName: "x-api-key",
  authPrefix: "",
};

describe("video API", () => {
  test("recognizes Auttyt hosts", () => {
    expect(isAuttytVideoProvider("https://www.auttyt.top/v1")).toBe(true);
    expect(isAuttytVideoProvider("https://video.example/v1")).toBe(false);
  });

  test("recognizes Lingsu hosts", () => {
    expect(isLingsuVideoProvider("https://lingsu.xyz/v1")).toBe(true);
    expect(isLingsuVideoProvider("https://api.lingsu.xyz/v1")).toBe(true);
    expect(isLingsuVideoProvider("https://video.example/v1")).toBe(false);
  });

  test("identifies Lingsu models that support reference video", () => {
    expect(lingsuSupportsVideoReference("原生不卡人脸-全参2.5")).toBe(true);
    expect(lingsuSupportsVideoReference("全参 2.5")).toBe(true);
    expect(lingsuSupportsVideoReference("SD官方2.0")).toBe(true);
    expect(lingsuSupportsVideoReference("WAN3.0-可参考视频")).toBe(true);
    expect(lingsuSupportsVideoReference("H3-KS")).toBe(false);
  });

  test("uses Lingsu JSON video creation with an idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ object: "video", id: "lv-1", status: "queued", task_status: "submitting" }, 202));
    vi.stubGlobal("fetch", fetchMock);

    const task = await createVideoTask({ ...options, baseUrl: "https://lingsu.xyz/v1", model: "H3-KS" }, "lingsu");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://lingsu.xyz/v1/videos");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", Authorization: "Bearer test-key" });
    expect(init.headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9-]{8,200}$/);
    expect(JSON.parse(init.body as string)).toEqual({
      model: "H3-KS",
      prompt: options.prompt,
      seconds: 8,
      resolution: "720p",
      aspect_ratio: "16:9",
    });
    expect(task).toMatchObject({ id: "lv-1", providerId: "lingsu", status: "queued" });
  });

  test("keeps Lingsu review tasks running", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ object: "video", id: "lv-review", status: "in_progress", task_status: "review" }));
    vi.stubGlobal("fetch", fetchMock);
    const task: VideoTask = {
      id: "lv-review", providerId: "lingsu", model: options.model, prompt: options.prompt,
      duration: options.duration, aspectRatio: options.aspectRatio, quality: options.quality, status: "queued", createdAt: 1, updatedAt: 1,
    };

    await expect(pollVideoTask(task, { ...options, baseUrl: "https://lingsu.xyz/v1" })).resolves.toEqual({ status: "running" });
  });

  test("sends Lingsu reference video URLs through references", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ object: "video", id: "lv-ref", status: "queued" }, 202));
    vi.stubGlobal("fetch", fetchMock);

    await createVideoTask({
      ...options,
      baseUrl: "https://lingsu.xyz/v1",
      model: "原生不卡人脸-全参2.5",
      referenceUrls: [{ type: "video", source: "https://media.example/reference.mp4", durationSeconds: 6.5 }],
    }, "lingsu");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.references).toEqual([{ type: "video", source: "https://media.example/reference.mp4", role: "reference", duration_seconds: 6.5 }]);
  });

  test("rejects reference video URLs for Lingsu models without video support", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(createVideoTask({
      ...options,
      baseUrl: "https://lingsu.xyz/v1",
      model: "H3-KS",
      referenceUrls: [{ type: "video", source: "https://media.example/reference.mp4", durationSeconds: 6.5 }],
    }, "lingsu")).rejects.toThrow("不支持参考视频");
  });

  test("downloads a completed Lingsu task from its authenticated download URL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ object: "video", id: "lv-done", status: "completed", task_status: "completed", download_url: "/v1/videos/lv-done/download" }))
      .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const task: VideoTask = {
      id: "lv-done", providerId: "lingsu", model: options.model, prompt: options.prompt,
      duration: options.duration, aspectRatio: options.aspectRatio, quality: options.quality, status: "running", createdAt: 1, updatedAt: 1,
    };

    await expect(pollVideoTask(task, { ...options, baseUrl: "https://lingsu.xyz/v1" })).resolves.toMatchObject({ status: "completed", blob: expect.any(Blob) });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://lingsu.xyz/v1/videos/lv-done",
      "https://lingsu.xyz/v1/videos/lv-done/download",
    ]);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ headers: { Authorization: "Bearer test-key" } });
  });

  test("uses Auttyt JSON video generations with a data URI reference", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ task_id: "auttyt-1", status: "queued" }));
    vi.stubGlobal("fetch", fetchMock);
    const reference = new File(["reference"], "reference.png", { type: "image/png" });

    const task = await createVideoTask({ ...options, baseUrl: "https://www.auttyt.top/v1", model: "video-v1-5s", referenceImages: [reference] }, "auttyt");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.auttyt.top/v1/video/generations");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", "x-api-key": "test-key" });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: "video-v1-5s", ratio: "16:9", resolution: "720p" });
    expect(body.image).toMatch(/^data:image\/png;base64,/);
    expect(body.images).toBeUndefined();
    expect(task).toMatchObject({ id: "auttyt-1", providerId: "auttyt", status: "queued" });
  });

  test("uses Auttyt images array and normalizes uppercase statuses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: "IN_PROGRESS" }))
      .mockResolvedValueOnce(jsonResponse({ status: "SUCCESS" }))
      .mockResolvedValueOnce(new Response(new Blob(["video"], { type: "video/mp4" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const task: VideoTask = {
      id: "auttyt-2", providerId: "auttyt", model: "video-v1-5s", prompt: options.prompt,
      duration: options.duration, aspectRatio: options.aspectRatio, quality: options.quality, status: "queued", createdAt: 1, updatedAt: 1,
    };
    const auttytOptions = { ...options, baseUrl: "https://www.auttyt.top/v1" };
    await expect(pollVideoTask(task, auttytOptions)).resolves.toEqual({ status: "running" });
    await expect(pollVideoTask(task, auttytOptions)).resolves.toMatchObject({ status: "completed", blob: expect.any(Blob) });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://www.auttyt.top/v1/video/generations/auttyt-2",
      "https://www.auttyt.top/v1/video/generations/auttyt-2",
      "https://www.auttyt.top/v1/video/generations/auttyt-2/content",
    ]);
  });
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
      duration: options.duration, aspectRatio: options.aspectRatio, quality: options.quality, status: "running", createdAt: 1, updatedAt: 1,
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
      duration: options.duration, aspectRatio: options.aspectRatio, quality: options.quality, status: "running", createdAt: 1, updatedAt: 1,
    };

    await expect(pollVideoTask(task, options)).resolves.toEqual({ status: "completed", url: "https://cdn.example/video.mp4" });
  });

  test("resolves Auttyt relative result URLs and downloads the authenticated video blob", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        code: "success",
        data: {
          status: "SUCCESS",
          result_url: "/v1/videos/result-1/content",
          video: { duration: 8, url: "/v1/videos/result-1/content" },
        },
      }))
      .mockResolvedValueOnce(new Response(new Blob(["valid-video"], { type: "video/mp4" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const task: VideoTask = {
      id: "auttyt-result", providerId: "auttyt", model: options.model, prompt: options.prompt,
      duration: options.duration, aspectRatio: options.aspectRatio, quality: options.quality, status: "running", createdAt: 1, updatedAt: 1,
    };

    const result = await pollVideoTask(task, { ...options, baseUrl: "https://www.auttyt.top/v1" });
    expect(result.status).toBe("completed");
    expect(result.blob).toBeInstanceOf(Blob);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://www.auttyt.top/v1/video/generations/auttyt-result",
      "https://www.auttyt.top/v1/videos/result-1/content",
    ]);
  });

  test("falls back to the Auttyt task content endpoint when its result URL is unavailable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: "SUCCESS", result_url: "/v1/videos/result-2/content" }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "Task not found" } }, 404))
      .mockResolvedValueOnce(new Response(new Blob(["valid-video"], { type: "video/mp4" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const task: VideoTask = {
      id: "auttyt-task", providerId: "auttyt", model: options.model, prompt: options.prompt,
      duration: options.duration, aspectRatio: options.aspectRatio, quality: options.quality, status: "running", createdAt: 1, updatedAt: 1,
    };

    const result = await pollVideoTask(task, { ...options, baseUrl: "https://www.auttyt.top/v1" });
    expect(result).toMatchObject({ status: "completed", blob: expect.any(Blob) });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://www.auttyt.top/v1/video/generations/auttyt-task",
      "https://www.auttyt.top/v1/videos/result-2/content",
      "https://www.auttyt.top/v1/video/generations/auttyt-task/content",
    ]);
  });
});
