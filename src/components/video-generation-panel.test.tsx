import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { VideoGenerationPanel } from "@/components/video-generation-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/lib/i18n";
import { DEFAULT_MODE_SETTINGS, DEFAULT_OPENAI_PROVIDERS, DEFAULT_SHARED_SETTINGS, mergeSettingsForMode } from "@/lib/image-console";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VideoGenerationPanel", () => {
  test("shows the video prompt and does not submit without an explicit video model", () => {
    const provider = { ...DEFAULT_OPENAI_PROVIDERS[0], apiKey: "test-key", videoModel: "" };
    const settings = mergeSettingsForMode({ ...DEFAULT_SHARED_SETTINGS, openaiProviders: [provider], activeOpenAIProviderId: provider.id }, DEFAULT_MODE_SETTINGS);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<TooltipProvider><LanguageProvider initialLanguage="zh"><VideoGenerationPanel settings={settings} duration="8" size="1280x720" /></LanguageProvider></TooltipProvider>);

    fireEvent.change(screen.getByLabelText("提示词"), { target: { value: "A mountain lake at sunrise" } });
    const submitButton = screen.getByRole("button", { name: "请先为当前供应商填写视频模型" });
    expect(submitButton).toBeDisabled();
    fireEvent.click(submitButton);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
