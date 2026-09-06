import { createDefaultProductSuiteSlots, DEVELOPMENT_PRODUCT_SUITE_TASK_ID, type ProductSuiteAsset, type ProductSuiteTask, type ProductSuiteTemplateLanguage } from "@/lib/product-suite";

async function developmentAsset(path: string, name: string): Promise<ProductSuiteAsset> {
  try {
    const response = await fetch(path);
    if (response.ok) {
      const blob = await response.blob();
      if (blob.size) return { blob, name, mimeType: blob.type || "image/png" };
    }
  } catch {
    // Development fixtures can run without a public asset server.
  }

  const fallback = new Blob(
    [`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#e5e7eb"/><rect x="180" y="120" width="440" height="360" rx="32" fill="#9ca3af"/><circle cx="400" cy="270" r="94" fill="#f9fafb"/><path d="M300 420h200" stroke="#f9fafb" stroke-width="24" stroke-linecap="round"/></svg>`],
    { type: "image/svg+xml" },
  );
  return { blob: fallback, name: name.replace(/\.png$/i, ".svg"), mimeType: "image/svg+xml" };
}

export async function createDevelopmentProductSuiteTask(language: ProductSuiteTemplateLanguage = "zh"): Promise<ProductSuiteTask> {
  const now = Date.now();
  const task: ProductSuiteTask = {
    id: DEVELOPMENT_PRODUCT_SUITE_TASK_ID,
    name: language === "en" ? "Development product suite example" : "开发示例：磁吸无线充电宝套图",
    productBatchId: "development-batch-1",
    productBatchNumber: 1,
    productImageHash: "development-product-reference",
    productImage: await developmentAsset("/placeholders/dev-placeholder-1.png", "development-product-reference.png"),
    productImages: [],
    brandAsset: await developmentAsset("/placeholders/dev-placeholder-2.png", "development-brand-asset.png"),
    brandAssets: [],
    info: {
      materialAndColor: language === "en" ? "Matte black aluminum" : "哑光黑铝合金",
      sellingPoints: language === "en" ? "Magnetic attachment, compact body, fast charging" : "磁吸稳固、机身小巧、快速充电",
      sellingPointItems: language === "en" ? ["Magnetic attachment", "Compact body", "Fast charging"] : ["磁吸稳固", "机身小巧", "快速充电"],
      dimensions: "105 x 68 x 18 mm",
      forbiddenElements: language === "en" ? "No extra logos, hands, or invented specifications" : "不要出现多余品牌、手部或虚构参数",
      consistencyRequirement: language === "en" ? "Keep the product shape, black finish, and camera angle consistent across the suite." : "保持产品外形、黑色材质和主要视角在整套图片中一致。",
      brandTone: language === "en" ? "clean, modern, trustworthy" : "干净、现代、可信",
      targetPlatform: language === "en" ? "E-commerce storefront" : "电商首页",
    },
    slots: createDefaultProductSuiteSlots(language).map((slot) => ({ ...slot, selectedVersion: slot.key === "hero" ? 1 : null })),
    createdAt: now - 120000,
    updatedAt: now - 60000,
  };
  task.productImages = task.productImage ? [task.productImage] : [];
  task.brandAssets = task.brandAsset ? [task.brandAsset] : [];
  return task;
}
