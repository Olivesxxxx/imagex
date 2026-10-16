import { describe, expect, test } from "vitest";

import {
  createProductSuiteTask,
  productSuiteTaskFromTemplate,
  productSuiteTemplateJson,
  renderProductSuitePrompt,
} from "@/lib/product-suite";

describe("product suite templates", () => {
  test("round-trips editable fields without exporting local assets or results", () => {
    const task = createProductSuiteTask(1000);
    task.name = "Desk lamp";
    task.info.materialAndColor = "Aluminum";
    task.slots[0].promptTemplate = "Create {{商品名}}";
    task.productImages = [{ blob: new Blob(["private-image-bytes"]), name: "product.png", mimeType: "image/png" }];
    task.productImage = task.productImages[0];

    const json = productSuiteTemplateJson(task);
    const imported = productSuiteTaskFromTemplate(JSON.parse(json), 2000);

    expect(json).not.toContain("private-image-bytes");
    expect(json).not.toContain("product.png");
    expect(imported).toMatchObject({
      name: "Desk lamp",
      info: { materialAndColor: "Aluminum" },
      productImages: [],
      productImage: null,
      productBatchId: "batch-1",
    });
    expect(imported.slots[0]).toMatchObject({ key: "hero", promptTemplate: "Create {{商品名}}" });
    expect(imported.id).not.toBe(task.id);
  });

  test("rejects unsupported template payloads", () => {
    expect(() => productSuiteTaskFromTemplate(null)).toThrow();
  });

  test("renders workflow constraints in the final prompt", () => {
    const task = createProductSuiteTask(1000);
    task.info.forbiddenElements = "extra logos";
    task.info.consistencyRequirement = "Keep the shape unchanged.";
    task.slots[0].promptTemplate = "Create {{商品名}}\n\n{{禁用元素}}\n{{产品一致性要求}}";

    const prompt = renderProductSuitePrompt(task, "hero");
    expect(prompt).toContain("不要出现: extra logos");
    expect(prompt).toContain("Keep the shape unchanged.");
    expect(prompt).not.toContain("{{禁用元素}}");
    expect(prompt).not.toContain("{{产品一致性要求}}");
  });
});
