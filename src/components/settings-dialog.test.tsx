import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { SettingsDialog } from "@/components/settings-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/lib/i18n";
import { DEFAULT_MODE_SETTINGS, DEFAULT_OPENAI_PROVIDERS, DEFAULT_SHARED_SETTINGS, mergeSettingsForMode } from "@/lib/image-console";

describe("SettingsDialog", () => {
  test("does not allow deleting the last provider", () => {
    const provider = { ...DEFAULT_OPENAI_PROVIDERS[0], apiKey: "test-key" };
    const settings = mergeSettingsForMode(
      { ...DEFAULT_SHARED_SETTINGS, openaiProviders: [provider], activeOpenAIProviderId: provider.id },
      DEFAULT_MODE_SETTINGS,
    );

    render(
      <TooltipProvider>
        <LanguageProvider initialLanguage="en">
          <SettingsDialog
            settings={settings}
            settingsOpen
            endpointPreview="https://provider.example/v1/models"
            testConnectionStatus={{ label: "Test connection", tone: "default" }}
            setSettingsOpen={vi.fn()}
            updateSettings={vi.fn()}
            saveCurrentSettings={vi.fn()}
            discardSettingsChanges={vi.fn()}
            clearAllData={vi.fn()}
            testConnection={vi.fn()}
            cancelConnectionTest={vi.fn()}
          />
        </LanguageProvider>
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Delete provider" })).toBeDisabled();
  });

  test("does not allow deleting a built-in provider when custom providers exist", () => {
    const providers = [
      { ...DEFAULT_OPENAI_PROVIDERS[0], apiKey: "test-key" },
      { ...DEFAULT_OPENAI_PROVIDERS[0], id: "custom", name: "Custom", apiKey: "test-key" },
    ];
    const settings = mergeSettingsForMode(
      { ...DEFAULT_SHARED_SETTINGS, openaiProviders: providers, activeOpenAIProviderId: providers[0].id },
      DEFAULT_MODE_SETTINGS,
    );

    render(
      <TooltipProvider>
        <LanguageProvider initialLanguage="en">
          <SettingsDialog
            settings={settings}
            settingsOpen
            endpointPreview="https://provider.example/v1/models"
            testConnectionStatus={{ label: "Test connection", tone: "default" }}
            setSettingsOpen={vi.fn()}
            updateSettings={vi.fn()}
            saveCurrentSettings={vi.fn()}
            discardSettingsChanges={vi.fn()}
            clearAllData={vi.fn()}
            testConnection={vi.fn()}
            cancelConnectionTest={vi.fn()}
          />
        </LanguageProvider>
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Delete provider" })).toBeDisabled();
  });

  test("offers cancellation while a connection test is running", () => {
    const cancelConnectionTest = vi.fn();
    const providers = DEFAULT_OPENAI_PROVIDERS.map((provider) => ({ ...provider, apiKey: "test-key" }));
    const settings = mergeSettingsForMode(
      { ...DEFAULT_SHARED_SETTINGS, openaiProviders: providers },
      DEFAULT_MODE_SETTINGS,
    );

    render(
      <TooltipProvider>
        <LanguageProvider initialLanguage="zh">
          <SettingsDialog
            settings={settings}
            settingsOpen
            endpointPreview="https://provider.example/v1/models"
            testConnectionStatus={{ label: "测试中", tone: "busy" }}
            setSettingsOpen={vi.fn()}
            updateSettings={vi.fn()}
            saveCurrentSettings={vi.fn()}
            discardSettingsChanges={vi.fn()}
            clearAllData={vi.fn()}
            testConnection={vi.fn()}
            cancelConnectionTest={cancelConnectionTest}
          />
        </LanguageProvider>
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "取消测试" }));
    expect(cancelConnectionTest).toHaveBeenCalledOnce();
  });
});
