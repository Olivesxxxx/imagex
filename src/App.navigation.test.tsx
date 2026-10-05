import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/lib/i18n";

describe("mode navigation", () => {
  test("shows all four modes and can open video generation from workflow", async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><LanguageProvider initialLanguage="zh"><App /></LanguageProvider></TooltipProvider>);

    const mainNavigation = (await screen.findAllByRole("tablist"))[0];
    expect(within(mainNavigation).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "文生图",
      "图生图",
      "生视频",
      "工作流",
    ]);

    await user.click(within(mainNavigation).getByRole("tab", { name: "工作流" }));
    const workflow = await screen.findByRole("region", { name: "产品套图任务" });
    expect(within(workflow).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "文生图",
      "图生图",
      "生视频",
      "工作流",
    ]);

    await user.click(within(workflow).getByRole("tab", { name: "生视频" }));
    expect(screen.getByLabelText("提示词")).toBeInTheDocument();
    expect(screen.getByText("时长")).toBeInTheDocument();
    expect(screen.getByText("画面尺寸")).toBeInTheDocument();
    expect(screen.queryByText("质量")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("tab", { name: "生视频" })).toHaveAttribute("aria-selected", "true"));
  });
});
