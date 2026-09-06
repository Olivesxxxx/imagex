import { DEVELOPMENT_PRODUCT_SUITE_TASK_ID } from "@/lib/product-suite";
import type { GeneratedImage, ImageRequestRecord } from "@/lib/image-console";

export const DEVELOPMENT_REQUEST_PREFIX = "imagex-development-placeholder-";

export function isDevelopmentRequest(request: Pick<ImageRequestRecord, "id">) {
  return request.id.startsWith(DEVELOPMENT_REQUEST_PREFIX);
}

function developmentSuiteImage(index: number): GeneratedImage {
  return {
    src: `/placeholders/dev-placeholder-${index}.png`,
    kind: "url",
    path: `development-product-suite-${index}.png`,
    mimeType: "image/png",
    width: 800,
    height: 600,
  };
}

export function createDevelopmentSuiteRequest(
  slotKey: string,
  version: number,
  status: "done" | "error",
  imageIndex: number,
  offset = 120000,
  batchId = "development-batch-1",
  batchNumber = 1,
): ImageRequestRecord {
  const createdAt = Date.now() - offset;
  const image = status === "done" ? developmentSuiteImage(imageIndex) : null;
  return {
    id: `${DEVELOPMENT_REQUEST_PREFIX}suite-${slotKey}-v${version}`,
    title: `DEV-SUITE-${slotKey}-v${version}`,
    index: version,
    total: 1,
    method: "edit",
    protocol: "openai",
    endpoint: "development://product-suite-placeholder",
    payload: {
      model: "development-product-suite",
      prompt: `ImageX product suite development fixture: ${slotKey}`,
      n: 1,
      size: "800x600",
    },
    sourcePrompt: `ImageX product suite development fixture: ${slotKey}`,
    imageCount: image ? 1 : 0,
    imageResolution: image ? "800x600" : "",
    hasCachedDetails: Boolean(image),
    detailsMissing: false,
    thumbnail: image,
    status,
    createdAt,
    startedAt: createdAt,
    endedAt: createdAt + 500,
    completedAt: status === "done" ? createdAt + 500 : null,
    images: image ? [image] : [],
    response: status === "done" ? { developmentMode: true, productSuite: true, imageCount: 1 } : null,
    error: status === "error" ? "开发示例：模拟生成失败，可点击重试生成新版本。" : "",
    controller: null,
    cancelRequested: false,
    editImages: [],
    productSuiteTaskId: DEVELOPMENT_PRODUCT_SUITE_TASK_ID,
    productSuiteBatchId: batchId,
    productSuiteBatchNumber: batchNumber,
    productSuiteSlotKey: slotKey,
    productSuiteVersion: version,
  };
}

export function developmentPlaceholderRequests(): ImageRequestRecord[] {
  const now = Date.now();
  const image = (index: number): GeneratedImage => ({
    src: `/placeholders/dev-placeholder-${index}.png`,
    kind: "url",
    path: `dev-placeholder-${index}.png`,
    mimeType: "image/png",
    width: 800,
    height: 600,
  });
  const groups = [
    [image(1), image(2)],
    [image(3), image(4)],
  ];

  const placeholders: ImageRequestRecord[] = groups.map((images, index) => ({
    id: `${DEVELOPMENT_REQUEST_PREFIX}${index + 1}`,
    title: `DEV-PLACEHOLDER-${index + 1}`,
    index: index + 1,
    total: groups.length,
    method: "gpt-image-2",
    endpoint: "development://placeholder",
    payload: {
      model: "development-placeholder",
      prompt: "ImageX development mode placeholder",
      n: images.length,
      size: "800x600",
    },
    sourcePrompt: "ImageX development mode placeholder",
    imageCount: images.length,
    imageResolution: "800x600",
    hasCachedDetails: false,
    detailsMissing: false,
    thumbnail: images[0],
    status: "done",
    createdAt: now - (groups.length - index) * 1000,
    startedAt: now - (groups.length - index) * 1000,
    endedAt: now - (groups.length - index) * 1000 + 500,
    completedAt: now - (groups.length - index) * 1000 + 500,
    images,
    response: { developmentMode: true, imageCount: images.length },
    error: "",
    controller: null,
    cancelRequested: false,
    editImages: [],
  }));

  return [
    ...placeholders,
    createDevelopmentSuiteRequest("hero", 1, "done", 1, 180000),
    createDevelopmentSuiteRequest("hero", 2, "done", 2, 150000),
    createDevelopmentSuiteRequest("hero", 3, "done", 3, 135000),
    createDevelopmentSuiteRequest("hero", 4, "done", 4, 120000),
    createDevelopmentSuiteRequest("hero", 5, "done", 1, 105000),
    createDevelopmentSuiteRequest("hero", 6, "done", 2, 90000),
    createDevelopmentSuiteRequest("hero", 7, "done", 3, 75000),
    createDevelopmentSuiteRequest("hero", 8, "done", 4, 60000),
    createDevelopmentSuiteRequest("hero", 9, "done", 1, 55000),
    createDevelopmentSuiteRequest("hero", 10, "done", 2, 50000),
    createDevelopmentSuiteRequest("hero", 11, "done", 3, 45000),
    createDevelopmentSuiteRequest("hero", 12, "done", 4, 40000),
    createDevelopmentSuiteRequest("hero", 13, "done", 1, 35000),
    createDevelopmentSuiteRequest("hero", 14, "done", 2, 30000),
    createDevelopmentSuiteRequest("hero", 15, "done", 3, 28000),
    createDevelopmentSuiteRequest("hero", 16, "done", 4, 26000),
    createDevelopmentSuiteRequest("hero", 17, "done", 1, 24000),
    createDevelopmentSuiteRequest("hero", 18, "done", 2, 22000),
    createDevelopmentSuiteRequest("hero", 19, "done", 3, 20000),
    createDevelopmentSuiteRequest("hero", 20, "done", 4, 18000),
    createDevelopmentSuiteRequest("hero", 21, "done", 1, 16000),
    createDevelopmentSuiteRequest("hero", 22, "done", 2, 14000),
    createDevelopmentSuiteRequest("hero", 23, "done", 3, 12000),
    createDevelopmentSuiteRequest("hero", 24, "done", 4, 10000),
    createDevelopmentSuiteRequest("hero", 25, "done", 1, 8000),
    createDevelopmentSuiteRequest("whiteBackground", 1, "done", 3, 165000),
    createDevelopmentSuiteRequest("detail", 1, "error", 1, 160000),
    createDevelopmentSuiteRequest("size", 1, "done", 4, 145000),
    createDevelopmentSuiteRequest("closeUp", 1, "error", 2, 140000),
    createDevelopmentSuiteRequest("closeUp", 2, "done", 3, 120000),
    createDevelopmentSuiteRequest("scene", 1, "done", 2, 105000),
  ];
}
