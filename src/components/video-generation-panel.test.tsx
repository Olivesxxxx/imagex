import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { VideoGenerationPanel } from "@/components/video-generation-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/lib/i18n";
import { DEFAULT_MODE_SETTINGS, DEFAULT_OPENAI_PROVIDERS, DEFAULT_SHARED_SETTINGS, mergeSettingsForMode } from "@/lib/image-console";

afterEach(() => {
  localStorage.clear();
  document.getElementById("video-task-list")?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VideoGenerationPanel", () => {
  test("shows the video prompt and does not submit without an explicit video model", () => {
    const provider = { ...DEFAULT_OPENAI_PROVIDERS[0], apiKey: "test-key", videoModel: "" };
    const settings = mergeSettingsForMode({ ...DEFAULT_SHARED_SETTINGS, openaiProviders: [provider], activeOpenAIProviderId: provider.id }, DEFAULT_MODE_SETTINGS);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    let canSubmit = true;
    render(<TooltipProvider><LanguageProvider initialLanguage="zh"><VideoGenerationPanel settings={settings} duration="8" aspectRatio="16:9" quality="720p" onActionStateChange={(_, nextCanSubmit) => { canSubmit = nextCanSubmit; }} /></LanguageProvider></TooltipProvider>);

    fireEvent.change(screen.getByLabelText("提示词"), { target: { value: "A mountain lake at sunrise" } });
    expect(canSubmit).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("can remove a failed local video task", async () => {
    const provider = { ...DEFAULT_OPENAI_PROVIDERS[0], apiKey: "test-key", videoModel: "video-model" };
    const settings = mergeSettingsForMode({ ...DEFAULT_SHARED_SETTINGS, openaiProviders: [provider], activeOpenAIProviderId: provider.id }, DEFAULT_MODE_SETTINGS);
    localStorage.setItem("ImageX-video-tasks", JSON.stringify([{
      id: "video-failed",
      providerId: provider.id,
      model: "video-model",
      prompt: "A failed task",
      duration: "8",
      aspectRatio: "16:9",
      quality: "720p",
      status: "failed",
      createdAt: 1,
      updatedAt: 2,
      error: "provider failed",
    }]));
    const taskList = document.createElement("div");
    taskList.id = "video-task-list";
    document.body.appendChild(taskList);

    render(<TooltipProvider><LanguageProvider initialLanguage="zh"><VideoGenerationPanel settings={settings} duration="8" aspectRatio="16:9" quality="720p" /></LanguageProvider></TooltipProvider>);

    const deleteButton = await screen.findByRole("button", { name: "删除视频任务" });
    fireEvent.click(deleteButton);
    expect(screen.queryByText("A failed task")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("ImageX-video-tasks") || "[]")).toEqual([]);
  });
});
