import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AnnotationWorkspace } from "@/components/annotation-workspace";
import { TooltipProvider } from "@/components/ui/tooltip";

class TestImage {
  naturalWidth = 800;
  naturalHeight = 600;
  decoding = "async";
  crossOrigin = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    window.setTimeout(() => this.onload?.(), 0);
  }
}

describe("AnnotationWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", TestImage);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      closePath: vi.fn(),
      drawImage: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      setLineDash: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("opens and focuses an inline text editor after choosing text and clicking the canvas", async () => {
    render(
      <TooltipProvider>
        <AnnotationWorkspace
          open
          image={{ src: "data:image/png;base64,dGVzdA==", name: "source.png" }}
          originalPrompt="original prompt"
          onOpenChange={vi.fn()}
          onSubmit={vi.fn()}
        />
      </TooltipProvider>,
    );

    const canvas = await screen.findByLabelText("图片标注画布");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 20,
      left: 20,
      top: 20,
      right: 420,
      bottom: 320,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    });

    fireEvent.click(screen.getByRole("button", { name: "文字" }));
    fireEvent.pointerDown(canvas, { clientX: 220, clientY: 170, pointerId: 1 });

    const editor = await screen.findByRole("textbox", { name: "文字标注" });
    await waitFor(() => expect(editor).toHaveFocus());

    fireEvent.change(editor, { target: { value: "make this brighter" } });
    fireEvent.pointerDown(canvas, { clientX: 260, clientY: 190, pointerId: 2 });
    fireEvent.blur(editor, { relatedTarget: canvas });

    await waitFor(() => expect(screen.queryByRole("textbox", { name: "文字标注" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled();
  });
});
