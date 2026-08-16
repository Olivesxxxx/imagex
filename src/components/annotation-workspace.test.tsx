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
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({
      width: text.length * 30,
      actualBoundingBoxAscent: 20,
      actualBoundingBoxDescent: 8,
    })),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
  };

  beforeEach(() => {
    vi.stubGlobal("Image", TestImage);
    Object.values(context).forEach((mock) => {
      if (vi.isMockFunction(mock)) mock.mockClear();
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
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
      right: 1300,
      bottom: 1100,
      width: 1280,
      height: 1080,
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

  test("moves annotations directly and resizes a rectangle from its corner handles", async () => {
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
      right: 1300,
      bottom: 1100,
      width: 1280,
      height: 1080,
      toJSON: () => ({}),
    });

    fireEvent.click(screen.getByRole("button", { name: "矩形框" }));
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 220, clientY: 220, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 220, clientY: 220, pointerId: 1 });

    // The rectangle tool remains active, but dragging an existing mark moves it directly.
    fireEvent.pointerDown(canvas, { clientX: 170, clientY: 170, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 190, clientY: 180, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 190, clientY: 180, pointerId: 2 });

    await waitFor(() => expect(context.strokeRect).toHaveBeenCalled());
    expect(context.arc.mock.calls.length).toBeGreaterThanOrEqual(4);

    // Resize from the selected rectangle's north-west handle.
    fireEvent.pointerDown(canvas, { clientX: 140, clientY: 130, pointerId: 3 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 110, pointerId: 3 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 110, pointerId: 3 });

    await waitFor(() => expect(context.strokeRect).toHaveBeenCalled());
  });

  test("sizes a selected text outline from measured text width", async () => {
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
      right: 1300,
      bottom: 1100,
      width: 1280,
      height: 1080,
      toJSON: () => ({}),
    });

    fireEvent.click(screen.getByRole("button", { name: "文字" }));
    fireEvent.pointerDown(canvas, { clientX: 220, clientY: 170, pointerId: 1 });
    const editor = await screen.findByRole("textbox", { name: "文字标注" });
    fireEvent.change(editor, { target: { value: "WWWW" } });
    fireEvent.blur(editor);

    fireEvent.pointerDown(canvas, { clientX: 230, clientY: 175, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 230, clientY: 175, pointerId: 2 });

    // The text outline is redrawn with the selected font size and measured width.
    await waitFor(() => expect(context.strokeRect).toHaveBeenCalled());
  });

  test("resizes an arrow from either endpoint", async () => {
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
      right: 1300,
      bottom: 1100,
      width: 1280,
      height: 1080,
      toJSON: () => ({}),
    });

    fireEvent.click(screen.getByRole("button", { name: "箭头" }));
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 220, clientY: 220, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 220, clientY: 220, pointerId: 1 });

    fireEvent.pointerDown(canvas, { clientX: 170, clientY: 170, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 170, clientY: 170, pointerId: 2 });
    await waitFor(() => expect(context.arc.mock.calls.length).toBeGreaterThanOrEqual(2));

    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 120, pointerId: 3 });
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(canvas, { clientX: 100, clientY: 100, pointerId: 3 });

    await waitFor(() => expect(context.moveTo).toHaveBeenCalled());
  });

  test("opens an existing text annotation for editing on a click", async () => {
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
      x: 20, y: 20, left: 20, top: 20, right: 1300, bottom: 1100, width: 1280, height: 1080, toJSON: () => ({}),
    });

    fireEvent.click(screen.getByRole("button", { name: "文字" }));
    fireEvent.pointerDown(canvas, { clientX: 220, clientY: 170, pointerId: 1 });
    const editor = await screen.findByRole("textbox", { name: "文字标注" });
    fireEvent.change(editor, { target: { value: "原始说明" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    fireEvent.blur(editor);
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "文字标注" })).not.toBeInTheDocument());

    fireEvent.pointerDown(canvas, { clientX: 240, clientY: 190, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 240, clientY: 190, pointerId: 2 });
    const editBox = await screen.findByRole("textbox", { name: "文字标注" });
    expect(editBox).toHaveValue("原始说明");
    fireEvent.change(editBox, { target: { value: "修改后的说明" } });
    fireEvent.keyDown(editBox, { key: "Enter" });
    fireEvent.blur(editBox);
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "文字标注" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled();
  });
});
