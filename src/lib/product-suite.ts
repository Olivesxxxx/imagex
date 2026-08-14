export const PRODUCT_SUITE_DB_NAME = "ImageXProductSuites";
export const PRODUCT_SUITE_DB_VERSION = 1;
export const PRODUCT_SUITE_STORE_NAME = "tasks";
export const DEVELOPMENT_PRODUCT_SUITE_TASK_ID = "imagex-development-product-suite";

export const PRODUCT_SUITE_SLOT_KEYS = [
  "hero",
  "whiteBackground",
  "detail",
  "size",
  "closeUp",
  "scene",
] as const;

export type ProductSuiteSlotKey = (typeof PRODUCT_SUITE_SLOT_KEYS)[number];
export type ProductSuiteTemplateLanguage = "zh" | "en";

export interface ProductSuiteAsset {
  blob: Blob;
  name: string;
  mimeType: string;
}

export interface ProductSuiteInfo {
  materialAndColor: string;
  sellingPoints: string;
  dimensions: string;
  forbiddenElements: string;
  consistencyRequirement: string;
  brandTone: string;
  targetPlatform: string;
}

export interface ProductSuiteSlot {
  key: ProductSuiteSlotKey;
  enabled: boolean;
  promptTemplate: string;
  selectedVersion: number | null;
}

export interface ProductSuiteTask {
  id: string;
  name: string;
  productImage: ProductSuiteAsset | null;
  brandAsset: ProductSuiteAsset | null;
  info: ProductSuiteInfo;
  slots: ProductSuiteSlot[];
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_SLOT_TEMPLATES_ZH: Record<ProductSuiteSlotKey, string> = {
  hero: "生成一张电商主图。突出 {{商品名}} 的主体和第一眼卖点：{{核心卖点}}。画面干净、有商业吸引力，适合 {{目标平台}} 首图展示。可合理使用可选商业标识素材，但不要遮挡产品。",
  whiteBackground: "生成一张白底图。背景为干净纯白或接近纯白，产品居中，轮廓清晰，颜色和比例准确，不添加多余道具、文字或装饰。",
  detail: "生成一张详情图。围绕 {{商品名}} 的核心卖点 {{核心卖点}} 进行展示，可用局部构图表达材质、结构或功能，画面适合后续叠加简短说明文字。",
  size: "生成一张尺寸图。围绕尺寸数据 {{尺寸}} 做清晰展示，保留产品真实比例。尺寸数字必须以用户填写的数据为准，不要编造或篡改尺寸。",
  closeUp: "生成一张细节图。放大展示 {{商品名}} 的材质、接口、纹理、边缘、工艺或包装细节。材质/颜色参考：{{材质颜色}}。",
  scene: "生成一张场景图。把 {{商品名}} 放入符合 {{品牌语气}} 的真实使用场景中，光线自然，画面有生活感或使用感，但产品本体必须和参考图一致。",
};

const DEFAULT_SLOT_TEMPLATES_EN: Record<ProductSuiteSlotKey, string> = {
  hero: "Create an ecommerce hero image for {{商品名}}. Emphasize the product and the first-glance selling points: {{核心卖点}}. Keep the scene clean, commercial, and suitable for {{目标平台}}.",
  whiteBackground: "Create a white-background product image. Use a clean white background, center the product, preserve accurate color and proportions, and avoid extra props or text.",
  detail: "Create a detail image for {{商品名}} focused on these selling points: {{核心卖点}}. Use partial compositions to explain material, structure, or function.",
  size: "Create a size reference image using these dimensions: {{尺寸}}. Preserve real proportions and never invent or alter the provided numbers.",
  closeUp: "Create a close-up image showing material, ports, texture, edges, craftsmanship, or packaging details of {{商品名}}. Material/color: {{材质颜色}}.",
  scene: "Create a scene image placing {{商品名}} in a realistic use scenario matching this brand tone: {{品牌语气}}. Keep the product itself consistent with the reference photo.",
};

function defaultSlotTemplate(key: ProductSuiteSlotKey, language: ProductSuiteTemplateLanguage) {
  return (language === "en" ? DEFAULT_SLOT_TEMPLATES_EN : DEFAULT_SLOT_TEMPLATES_ZH)[key];
}

export function createDefaultProductSuiteSlots(language: ProductSuiteTemplateLanguage = "zh"): ProductSuiteSlot[] {
  return PRODUCT_SUITE_SLOT_KEYS.map((key) => ({ key, enabled: true, promptTemplate: defaultSlotTemplate(key, language), selectedVersion: null }));
}

function emptyProductSuiteInfo(): ProductSuiteInfo {
  return { materialAndColor: "", sellingPoints: "", dimensions: "", forbiddenElements: "", consistencyRequirement: "", brandTone: "", targetPlatform: "" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAsset(value: unknown): ProductSuiteAsset | null {
  if (!isRecord(value)) return null;
  const blob = value.blob;
  if (!blob || (typeof blob !== "object" && !(blob instanceof Blob))) return null;
  return { blob: blob as Blob, name: String(value.name || "image"), mimeType: String(value.mimeType || (blob as Blob).type || "image/png") };
}

function normalizeProductSuiteSlots(value: unknown): ProductSuiteSlot[] {
  const source = Array.isArray(value) ? value : [];
  return PRODUCT_SUITE_SLOT_KEYS.map((key) => {
    const match = source.find((item) => isRecord(item) && item.key === key);
    const record = isRecord(match) ? match : null;
    const selectedVersion = Number(record?.selectedVersion);
    return {
      key,
      enabled: typeof record?.enabled === "boolean" ? record.enabled : true,
      promptTemplate: String(record?.promptTemplate || defaultSlotTemplate(key, "zh")),
      selectedVersion: Number.isInteger(selectedVersion) && selectedVersion > 0 ? selectedVersion : null,
    };
  });
}

export function normalizeProductSuiteTask(value: unknown): ProductSuiteTask | null {
  if (!isRecord(value)) return null;
  const id = String(value.id || "").trim();
  if (!id) return null;
  const createdAt = Number(value.createdAt || Date.now());
  const updatedAt = Number(value.updatedAt || createdAt);
  const source = isRecord(value.info) ? value.info : {};
  return {
    id,
    name: String(value.name || "").trim(),
    productImage: normalizeAsset(value.productImage),
    brandAsset: normalizeAsset(value.brandAsset),
    info: {
      materialAndColor: String(source.materialAndColor || ""),
      sellingPoints: String(source.sellingPoints || ""),
      dimensions: String(source.dimensions || ""),
      forbiddenElements: String(source.forbiddenElements || ""),
      consistencyRequirement: String(source.consistencyRequirement || ""),
      brandTone: String(source.brandTone || ""),
      targetPlatform: String(source.targetPlatform || ""),
    },
    slots: normalizeProductSuiteSlots(value.slots),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  };
}

export function createProductSuiteTask(now = Date.now(), language: ProductSuiteTemplateLanguage = "zh"): ProductSuiteTask {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `product-suite-${now}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    name: "",
    productImage: null,
    brandAsset: null,
    info: emptyProductSuiteInfo(),
    slots: createDefaultProductSuiteSlots(language),
    createdAt: now,
    updatedAt: now,
  };
}

async function developmentAsset(path: string, name: string): Promise<ProductSuiteAsset> {
  try {
    const response = await fetch(path);
    if (response.ok) {
      const blob = await response.blob();
      if (blob.size) return { blob, name, mimeType: blob.type || "image/png" };
    }
  } catch {
    // The development fixture can still load in test environments without a public asset server.
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
    productImage: await developmentAsset("/placeholders/dev-placeholder-1.png", "development-product-reference.png"),
    brandAsset: await developmentAsset("/placeholders/dev-placeholder-2.png", "development-brand-asset.png"),
    info: {
      materialAndColor: language === "en" ? "Matte black aluminum" : "哑光黑铝合金",
      sellingPoints: language === "en" ? "Magnetic attachment, compact body, fast charging" : "磁吸稳固、机身小巧、快速充电",
      dimensions: "105 x 68 x 18 mm",
      forbiddenElements: language === "en" ? "No extra logos, hands, or invented specifications" : "不要出现多余品牌、手部或虚构参数",
      consistencyRequirement: language === "en" ? "Keep the product shape, black finish, and camera angle consistent across the suite." : "保持产品外形、黑色材质和主要视角在整套图片中一致。",
      brandTone: language === "en" ? "clean, modern, trustworthy" : "干净、现代、可信",
      targetPlatform: language === "en" ? "E-commerce storefront" : "电商首页",
    },
    slots: createDefaultProductSuiteSlots(language).map((slot) => ({
      ...slot,
      selectedVersion: slot.key === "hero" ? 1 : null,
    })),
    createdAt: now - 120000,
    updatedAt: now - 60000,
  };
  return task;
}

export function renderProductSuitePrompt(task: ProductSuiteTask, slotKey: ProductSuiteSlotKey, language: ProductSuiteTemplateLanguage = "zh") {
  const slot = task.slots.find((item) => item.key === slotKey);
  const template = slot?.promptTemplate || defaultSlotTemplate(slotKey, language);
  const values: Record<string, string> = {
    商品名: task.name || (language === "en" ? "the product" : "该商品"),
    材质颜色: task.info.materialAndColor || (language === "en" ? "not specified" : "未填写"),
    核心卖点: task.info.sellingPoints || (language === "en" ? "not specified" : "未填写"),
    尺寸: task.info.dimensions || (language === "en" ? "not specified" : "未填写"),
    品牌语气: task.info.brandTone || (language === "en" ? "clean ecommerce product photography" : "干净的电商产品摄影"),
    目标平台: task.info.targetPlatform || (language === "en" ? "ecommerce" : "电商平台"),
  };
  const rendered = Object.entries(values).reduce((current, [key, value]) => current.replaceAll("{{" + key + "}}", value), template);
  const forbidden = task.info.forbiddenElements.trim();
  const forbiddenLine = forbidden ? "\n" + (language === "en" ? "Avoid" : "不要出现") + ": " + forbidden : "";
  const consistency = task.info.consistencyRequirement.trim();
  return rendered + forbiddenLine + (consistency ? "\n\n" + consistency : "");
}

function openProductSuiteDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PRODUCT_SUITE_DB_NAME, PRODUCT_SUITE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PRODUCT_SUITE_STORE_NAME)) {
        database.createObjectStore(PRODUCT_SUITE_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the product suite database."));
  });
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Product suite storage failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Product suite storage was aborted."));
  });
}

export async function loadProductSuiteTasks(): Promise<ProductSuiteTask[]> {
  const database = await openProductSuiteDatabase();
  if (!database) return [];

  try {
    const transaction = database.transaction(PRODUCT_SUITE_STORE_NAME, "readonly");
    const request = transaction.objectStore(PRODUCT_SUITE_STORE_NAME).getAll();
    const tasks = await new Promise<ProductSuiteTask[]>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as unknown[]).map(normalizeProductSuiteTask).filter((item): item is ProductSuiteTask => Boolean(item)));
      request.onerror = () => reject(request.error || new Error("Could not load product suite tasks."));
    });
    return tasks.sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    database.close();
  }
}

export async function saveProductSuiteTask(task: ProductSuiteTask): Promise<ProductSuiteTask> {
  const normalized = normalizeProductSuiteTask({
    ...task,
    name: task.name.trim(),
    updatedAt: Date.now(),
  });
  if (!normalized) throw new Error("Invalid product suite task.");
  const database = await openProductSuiteDatabase();
  if (!database) return normalized;

  try {
    const transaction = database.transaction(PRODUCT_SUITE_STORE_NAME, "readwrite");
    transaction.objectStore(PRODUCT_SUITE_STORE_NAME).put(normalized);
    await waitForTransaction(transaction);
    return normalized;
  } finally {
    database.close();
  }
}

export async function deleteProductSuiteTask(id: string): Promise<void> {
  const database = await openProductSuiteDatabase();
  if (!database) return;

  try {
    const transaction = database.transaction(PRODUCT_SUITE_STORE_NAME, "readwrite");
    transaction.objectStore(PRODUCT_SUITE_STORE_NAME).delete(id);
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function clearProductSuiteTasks(): Promise<void> {
  const database = await openProductSuiteDatabase();
  if (!database) return;

  try {
    const transaction = database.transaction(PRODUCT_SUITE_STORE_NAME, "readwrite");
    transaction.objectStore(PRODUCT_SUITE_STORE_NAME).clear();
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
