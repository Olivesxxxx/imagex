import { createElement, createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  DEFAULTS,
  DEFAULT_STRICT_PROMPT_TEXT,
  DEFAULT_STRICT_PROMPT_TEXT_EN,
  type AppSettings,
  type KnownRequestStatus,
  type RequestFilter,
} from "@/lib/image-console";

export type Language = "zh" | "en";
export type LanguageLocale = "zh-CN" | "en-US";

const LANGUAGE_STORAGE_KEY = "ImageX-language";
const LANGUAGE_QUERY_KEY = "lang";
export const SITE_ORIGIN = "https://olivesxxxx.github.io/imagex";
export const LANGUAGE_LOCALES: Record<Language, LanguageLocale> = {
  zh: "zh-CN",
  en: "en-US",
};
const LANGUAGE_FROM_LOCALE: Record<string, Language> = {
  zh: "zh",
  "zh-cn": "zh",
  en: "en",
  "en-us": "en",
};

const SEO_COPY: Record<
  Language,
  {
    title: string;
    description: string;
    ogLocale: string;
    ogLocaleAlternate: string;
    imageAlt: string;
  }
> = {
  zh: {
    title: "ImageX",
    description: "把 OpenAI 兼容的图像生成与编辑搬进浏览器：四类出图端点同面板切换，2K/4K 高清直出，百张批量按你定的节奏跑，密钥与成片留在本机不上传第三方。",
    ogLocale: "zh_CN",
    ogLocaleAlternate: "en_US",
    imageAlt: "ImageX OpenAI 图像生成与编辑控制台",
  },
  en: {
    title: "ImageX",
    description: "An OpenAI-compatible image generation and editing console that lives in your browser: four output endpoints in one panel, 2K/4K HD direct output, batch up to a hundred at your own pace, with keys and artifacts kept local and never uploaded to third parties.",
    ogLocale: "en_US",
    ogLocaleAlternate: "zh_CN",
    imageAlt: "ImageX OpenAI image generation and editing console",
  },
};

export function getLanguageLocale(language: Language): LanguageLocale {
  return LANGUAGE_LOCALES[language];
}

export function getSeoMetadata(language: Language) {
  const locale = getLanguageLocale(language);
  const alternateLanguage = language === "zh" ? "en" : "zh";
  const alternateLocale = getLanguageLocale(alternateLanguage);
  const canonicalUrl = `${SITE_ORIGIN}/${locale}/`;

  return {
    locale,
    alternateLocale,
    title: SEO_COPY[language].title,
    description: SEO_COPY[language].description,
    imageAlt: SEO_COPY[language].imageAlt,
    canonicalUrl,
    alternateUrls: {
      zh: `${SITE_ORIGIN}/zh-CN/`,
      en: `${SITE_ORIGIN}/en-US/`,
      xDefault: `${SITE_ORIGIN}/`,
    },
    ogLocale: SEO_COPY[language].ogLocale,
    ogLocaleAlternate: SEO_COPY[language].ogLocaleAlternate,
  };
}

function languageFromValue(value: string | null | undefined): Language | null {
  const normalized = String(value || "").trim().toLowerCase();
  return LANGUAGE_FROM_LOCALE[normalized] || null;
}

function languageFromBrowser(): Language {
  if (typeof navigator === "undefined") return "zh";

  const candidates = [navigator.language, ...(Array.isArray(navigator.languages) ? navigator.languages : [])]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  if (candidates.some((value) => value.startsWith("zh"))) return "zh";
  if (candidates.some((value) => value.startsWith("en"))) return "en";
  return "en";
}

function languageFromLocation(search: string): Language | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  return languageFromValue(params.get(LANGUAGE_QUERY_KEY));
}

function languageFromPathname(pathname: string): Language | null {
  const firstSegment = String(pathname || "")
    .split("/")
    .filter(Boolean)[0];
  return languageFromValue(firstSegment);
}

function initialLanguage(): Language {
  if (typeof window === "undefined") return "zh";

  return (
    languageFromPathname(window.location.pathname) ||
    languageFromLocation(window.location.search) ||
    languageFromValue(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)) ||
    languageFromBrowser()
  );
}

function currentLanguageUrl(language: Language) {
  const url = new URL(`${SITE_ORIGIN}/${LANGUAGE_LOCALES[language]}/`);
  return url;
}

function syncMeta(nameOrProperty: "name" | "property", key: string, content: string) {
  if (typeof document === "undefined") return;
  const selector = `meta[${nameOrProperty}="${key}"]`;
  let element = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(nameOrProperty, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function syncLink(rel: string, href: string, hreflang?: string) {
  if (typeof document === "undefined") return;
  const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`;
  let element = document.head.querySelector(selector) as HTMLLinkElement | null;
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    if (hreflang) element.hreflang = hreflang;
    document.head.appendChild(element);
  }
  element.href = href;
}

function syncDocumentLanguage(language: Language) {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const seo = getSeoMetadata(language);
  const url = currentLanguageUrl(language);

  document.documentElement.lang = seo.locale;
  document.title = seo.title;
  syncMeta("name", "description", seo.description);
  syncMeta("property", "og:type", "website");
  syncMeta("property", "og:site_name", "ImageX");
  syncMeta("property", "og:locale", seo.ogLocale);
  syncMeta("property", "og:locale:alternate", seo.ogLocaleAlternate);
  syncMeta("property", "og:title", seo.title);
  syncMeta("property", "og:description", seo.description);
  syncMeta("property", "og:url", url.toString());
  syncMeta("property", "og:image", `${SITE_ORIGIN}/og-image.svg`);
  syncMeta("property", "og:image:alt", seo.imageAlt);
  syncMeta("name", "twitter:card", "summary_large_image");
  syncMeta("name", "twitter:title", seo.title);
  syncMeta("name", "twitter:description", seo.description);
  syncMeta("name", "twitter:image", `${SITE_ORIGIN}/og-image.svg`);
  syncMeta("name", "twitter:image:alt", seo.imageAlt);
  syncLink("canonical", seo.canonicalUrl);
  syncLink("alternate", seo.alternateUrls.zh, LANGUAGE_LOCALES.zh);
  syncLink("alternate", seo.alternateUrls.en, LANGUAGE_LOCALES.en);
  syncLink("alternate", seo.alternateUrls.xDefault, "x-default");

  const nextUrl = new URL(window.location.href);
  nextUrl.pathname = `/${seo.locale}/`;
  nextUrl.searchParams.delete(LANGUAGE_QUERY_KEY);
  if (window.location.pathname !== nextUrl.pathname || window.location.search !== nextUrl.search) {
    window.history.replaceState(window.history.state, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }
}

type Copy = {
  appName: string;
  languageName: string;
  switchLanguageTooltip: string;
  requestList: string;
  clearAll: string;
  clearImages: string;
  cancelRequests: string;
  clearCompleted: string;
  clearFailed: string;
  exportZip: {
    button: string;
    tooltip: string;
    title: string;
    selectionTitle: string;
    description: (count: number) => string;
    selectionDescription: (count: number) => string;
    confirm: string;
    progressTitle: string;
    progressDescription: string;
    progressStatus: (current: number, total: number) => string;
    success: (count: number) => string;
    failed: string;
    noImages: string;
    selectionTooltip: string;
  };
  imageSelection: {
    enter: string;
    exit: string;
    selected: (count: number) => string;
    imageLabel: (requestTitle: string, index: number) => string;
    deleteTitle: string;
    deleteDescription: (count: number) => string;
    deleteConfirm: string;
    deleteButton: string;
    exportButton: string;
  };
  requestListTooltips: {
    clearAll: string;
    cancelRequests: string;
    clearCompleted: string;
    clearFailed: string;
  };
  filterLabels: Record<RequestFilter, string>;
  filterEmptyText: Record<RequestFilter, string>;
  requestStatusLabels: Record<KnownRequestStatus, string>;
  requestCardEmpty: {
    noImage: string;
    queued: string;
    running: string;
    canceled: string;
    error: string;
    loading: string;
    restored: string;
    missing: string;
  };
  requestCardStatus: {
    unselectedTitle: string;
    unselectedSubtitle: string;
    cancel: string;
    delete: string;
    confirmDelete: string;
    deletedRequest: string;
    reusePrompt: string;
    responseJson: string;
    download: string;
    exportImage: string;
    annotateImage: string;
    editImage: string;
    rotateCounterclockwise: string;
    latency: string;
    interval: string;
    refreshLatency: string;
    testConnection: string;
    latencyCooldown: (seconds: number) => string;
    latencyMeasuring: string;
    latencyUnavailable: string;
    availabilityUnconfigured: string;
    availabilityUntested: string;
    availabilityChecking: string;
    availabilityVeryFast: string;
    availabilityFast: string;
    availabilityNormal: string;
    availabilityAvailable: string;
    availabilitySlow: string;
    availabilityVerySlow: string;
    previewImage: string;
    previewPreviousImage: string;
    previewNextImage: string;
    resolution: string;
  };
  promptHistory: {
    title: string;
    empty: string;
    pinned: string;
    pin: string;
    unpin: string;
    delete: string;
    confirmDelete: string;
    refilled: string;
  };
  promptEditor: {
    title: string;
    description: string;
    header: string;
    footer: string;
    defaultText: string;
    bodyLabel: string;
    cancel: string;
    restoreDefault: string;
    confirm: string;
  };
  generator: {
    mode: string;
    generate: string;
    edit: string;
    workflow: string;
    settings: string;
    settingsTooltip: string;
    promptLabel: string;
    promptPlaceholder: string;
    editPromptPlaceholder: string;
    selectLocalImage: string;
    selectHistoricalImage: string;
    choose: string;
    noHistoricalImages: string;
    selectAtLeastOneImage: string;
    maxEditImages: (count: number) => string;
    size: string;
    auto: string;
    sizeGroups: {
      square: string;
      landscape: string;
      portrait: string;
    };
    quality: string;
    qualityOptions: {
      auto: string;
      low: string;
      medium: string;
      high: string;
    };
    count: string;
    keepOriginalPrompt: string;
    keep: string;
    language: string;
    editOriginalPrompt: string;
    editOriginalPromptTooltip: string;
    promptRequired: string;
    requestNotCreated: string;
    connectionRequired: string;
    requestQueued: string;
    submissionSuccess: (count: number) => string;
    cancelGeneration: string;
    generations: string;
    responses: string;
    completions: string;
    edits: string;
    quickStart: {
      buttonLabel: string;
      title: string;
      description: string;
      tabs: {
        gettingStarted: string;
        errors: string;
      };
      steps: string[];
      errors: Array<{
        title: string;
        description: string;
      }>;
    };
    pasteImageHint: string;
    previewInputImage: string;
    previewPreviousImage: string;
    previewNextImage: string;
  };
  productSuite: {
    title: string;
    description: string;
    newTask: string;
    empty: string;
    untitled: string;
    productName: string;
    productNamePlaceholder: string;
    productReference: string;
    taskConfiguration: string;
    developmentTaskPlaceholder: (index: number) => string;
    chooseImage: string;
    dropImageHint: string;
    removeImage: string;
    brandAsset: string;
    materialAndColor: string;
    sellingPoints: string;
    dimensions: string;
    dimensionsPlaceholder: string;
    forbiddenElements: string;
    consistencyRequirement: string;
    consistencyRequirementPlaceholder: string;
    brandTone: string;
    targetPlatform: string;
    targetPlatformPlaceholder: string;
    nextStepHint: string;
    deleteTask: string;
    saveTask: string;
    slotsTitle: string;
    slotsDescription: string;
    slotLabels: Record<string, string>;
    slotEnabled: string;
    slotPrompt: string;
    renderedPrompt: string;
    resetTemplate: string;
    generateSuite: string;
    missingProductImage: string;
    referenceLimit: (count: number) => string;
    noEnabledSlots: string;
    confirmTitle: string;
    confirmDescription: (name: string, count: number) => string;
    confirmReferenceRule: string;
    confirmSubmit: string;
    submitting: string;
    submitted: (count: number) => string;
    slotNotSubmitted: string;
    slotQueued: string;
    slotRunning: string;
    slotDone: string;
    slotFailed: string;
    slotCanceled: string;
    resultReady: string;
    resultUnavailable: string;
    viewResult: string;
    exportResult: string;
    useAsReference: string;
    annotateResult: string;
    regenerateSlot: string;
    retrySlot: string;
    slotResubmitted: string;
    retryFailedSlots: (count: number) => string;
    failedSlotsResubmitted: (count: number) => string;
    versionHistory: string;
    viewingVersion: (version: number) => string;
     finalVersionBadge: (version: number) => string;
     finalVersionUnselected: string;
     selectFinalVersion: string;
     finalVersion: string;
     finalVersionSelected: (version: number) => string;
     clearVersionHistory: string;
     clearAllVersionHistory: string;
     clearVersionsTitle: string;
     clearVersionsDescription: string;
     clearVersionsConfirm: string;
     versionsCleared: string;
     exportSuite: string;
    exportingSuite: string;
     exportSuiteSuccess: (count: number) => string;
     exportSuiteFailed: string;
     batchLabel: (number: number) => string;
     batchShortLabel: (number: number) => string;
     productImageChangedTitle: string;
     productImageChangedDescription: string;
     continueCurrentBatch: string;
     startNewBatch: string;
     cancelImageChange: string;
   };
  annotation: {
    title: string;
    description: string;
    loading: string;
    loadFailed: string;
    canvasLabel: string;
    strokeSize: string;
    strokeColor: string;
    fontSize: string;
    instructionLabel: string;
    instructionPlaceholder: string;
    originalPrompt: string;
    noPrompt: string;
    textInput: string;
    textPlaceholder: string;
    submit: string;
    cancel: string;
    undo: string;
    redo: string;
    deleteSelected: string;
    clear: string;
    exportFailed: string;
    submitted: string;
    tools: {
      select: string;
      brush: string;
      arrow: string;
      rectangle: string;
      ellipse: string;
      text: string;
    };
  };
  settings: {
    title: string;
    description: string;
    apiUrl: string;
    apiKey: string;
    provider: string;
    providerSwitched: (name: string) => string;
    providerDefaultsRestored: string;
    restoreProviderDefaults: string;
    addProvider: string;
    deleteProvider: string;
    deleteProviderTitle: string;
    deleteProviderDescription: string;
    confirmDeleteProvider: string;
    noProviders: string;
    providerName: string;
    providerProtocol: string;
    imageResponseMode: string;
    imageResponseModeDescription: string;
    imageResponseModeAuto: string;
    imageResponseModeBase64: string;
    imageResponseModeUrl: string;
    multiImageField: string;
    multiImageFieldDescription: string;
    multiImageFieldAuto: string;
    multiImageFieldRepeated: string;
    multiImageFieldArray: string;
    rememberKey: string;
    developmentMode: string;
    developmentModeDescription: string;
    generationsModel: string;
    editsModel: string;
    responsesModel: string;
    completionsModel: string;
    privateBaseUrl: string;
    privateApiKey: string;
    privateApiKeyPlaceholder: string;
    privateModel: string;
    geminiProtocol: string;
    geminiBaseUrl: string;
    geminiApiKey: string;
    geminiModel: string;
    concurrency: string;
    interval: string;
    endpointPreview: string;
    reset: string;
    clearAllData: string;
    clearAllDataTitle: string;
    clearAllDataDescription: string;
    clearAllDataConfirm: string;
    openAiProtocol: string;
    privateProtocol: string;
    save: string;
  };
  clearDialog: {
    cancel: string;
    clearAll: { title: string; description: string; confirm: string };
    cancelRequests: { title: string; description: string; confirm: string };
    clearFailed: { title: string; description: string; confirm: string };
    clearCompleted: { title: string; description: string; confirm: string };
  };
  responseJson: { title: string; description: string };
  historyImage: {
    selected: string;
    local: string;
    generated: string;
    buttonLabel: string;
    deleteButton: string;
    tooltip: string;
  };
  runtime: {
    editRequestMissingImages: string;
    missingHistoricalRequest: string;
    historicalImageExists: (requestTitle: string, imageIndex: number) => string;
    historicalImageFull: string;
    historicalRequestHasNoImage: string;
    historicalImageNotFound: string;
    historicalImageNotEditable: string;
    historicalImageAddedToEdit: (requestTitle: string, imageIndex: number) => string;
    historicalImageLoadFailed: string;
    requestCanceled: string;
    requestCanceledBeforeSend: string;
    requestsCanceled: (count: number) => string;
    allRequestsCleared: string;
    completedRequestsCleared: string;
    failedRequestsCleared: string;
    requestFailed: string;
    crossOriginRequestFailed: string;
    browserRequestFailed: string;
    remoteImageLimited: string;
    queuedRequestDetail: (method: string, count: number, summary: string, endpoint: string) => string;
  };
  tests: {
    test: string;
    connectionTesting: string;
    connectionNormal: string;
    connectionNormalDetail: string;
    connectionFailed: string;
    connectionNotConfigured: string;
    connectionSaved: string;
    connectionReset: string;
    connectionResetDetail: string;
  };
  seoContent: {
    h1: string;
    productSectionLabel: string;
    productHeading: string;
    productProse: string;
    footerCopyright: string;
    licenseUrl: string;
    githubUrl: string;
    footerPrivacy: string;
    noscriptProse: string;
  };
  generatedImageAlt: (index: number, ctx: { size?: string; mode?: string }) => string;
  resultSectionLabel: string;
  skipToContent: string;
};

const COPY: Record<Language, Copy> = {
  zh: {
    appName: "ImageX",
    languageName: "中文",
    switchLanguageTooltip: "切换到 English",
    requestList: "生成结果列表",
    clearAll: "清空全部",
    clearImages: "清空图片",
    cancelRequests: "取消请求",
    clearCompleted: "清空完成",
    clearFailed: "清空失败",
    exportZip: {
      button: "导出 ZIP",
      tooltip: "批量导出全部已完成图片",
      title: "导出全部已完成图片？",
      selectionTitle: "导出选中的图片？",
      description: (count) => `将把当前 ${count} 个已完成请求中的可用图片打包为 ZIP 下载。`,
      selectionDescription: (count) => `将把当前选中的 ${count} 张图片打包为 ZIP 下载。`,
      confirm: "确认导出",
      progressTitle: "正在导出 ZIP",
      progressDescription: "正在读取本地图片详情并打包，请不要关闭页面。",
      progressStatus: (current, total) => (total > 0 ? `已处理 ${current}/${total} 张图片` : "正在准备图片"),
      success: (count) => `已成功导出 ${count} 张图片。`,
      failed: "导出 ZIP 失败。",
      noImages: "没有可导出的已完成图片。",
      selectionTooltip: "导出已勾选的图片",
    },
    imageSelection: {
      enter: "选择图片",
      exit: "退出多选",
      selected: (count) => `已选 ${count} 张`,
      imageLabel: (requestTitle, index) => `${requestTitle}：第 ${index} 张图片`,
      deleteTitle: "删除选中的任务？",
      deleteDescription: (count) => `将删除包含所选图片的 ${count} 个任务及其本地图片详情。此操作不可撤销。`,
      deleteConfirm: "确认删除任务",
      deleteButton: "删除任务",
      exportButton: "导出图片",
    },
    requestListTooltips: {
      clearAll: "删除所有请求记录和本地图片详情",
      cancelRequests: "取消所有进行中和排队请求",
      clearCompleted: "删除已完成请求和本地图片详情",
      clearFailed: "删除失败和已取消请求",
    },
    filterLabels: {
      all: "全部",
      active: "进行中",
      done: "已完成",
      failed: "已失败",
    },
    filterEmptyText: {
      all: "暂无请求",
      active: "暂无进行中请求",
      done: "暂无已完成请求",
      failed: "暂无失败或取消请求",
    },
    requestStatusLabels: {
      queued: "排队中",
      running: "生成中",
      done: "完成",
      error: "失败",
      canceled: "取消",
    },
    requestCardEmpty: {
      noImage: "暂无图片",
      queued: "该请求正在排队",
      running: "该请求正在等待响应",
      canceled: "该请求已取消",
      error: "该请求失败",
      loading: "历史详情加载中",
      restored: "历史已恢复，图片详情未能从本地缓存读取。",
      missing: "响应中没有找到图片",
    },
    requestCardStatus: {
      unselectedTitle: "未选择请求",
      unselectedSubtitle: "生成后点击请求查看结果。",
      cancel: "取消请求",
      delete: "删除",
      confirmDelete: "再次点击确认删除",
      deletedRequest: "已删除请求",
      reusePrompt: "复用提示词",
      responseJson: "响应 JSON",
      download: "下载",
      exportImage: "导出图片",
      annotateImage: "做标记来重新生图",
      editImage: "作为参考图",
      rotateCounterclockwise: "逆时针旋转图片",
      latency: "延迟",
      interval: "间隔",
      refreshLatency: "刷新 API 延迟",
      testConnection: "测试供应商连接",
      latencyCooldown: (seconds) => `请等待 ${seconds}s 后再检测`,
      latencyMeasuring: "检测中...",
      latencyUnavailable: "不可用",
      availabilityUnconfigured: "未配置",
      availabilityUntested: "未测试",
      availabilityChecking: "待检测",
      availabilityVeryFast: "极快",
      availabilityFast: "较快",
      availabilityNormal: "正常",
      availabilityAvailable: "可用",
      availabilitySlow: "较慢",
      availabilityVerySlow: "很慢",
      previewImage: "查看大图",
      previewPreviousImage: "上一张大图",
      previewNextImage: "下一张大图",
      resolution: "响应分辨率",
    },
    promptHistory: {
      title: "历史提示词",
      empty: "暂无历史提示词",
      pinned: "已置顶",
      pin: "置顶",
      unpin: "取消置顶",
      delete: "删除",
      confirmDelete: "再次点击确认删除",
      refilled: "历史提示词已回填",
    },
    promptEditor: {
      title: "编辑原始提示词",
      description: "首尾两行固定不可修改，只编辑中间正文。开启此功能也不能保证完全保持原始提示词。",
      header: "请把下面的原始提示词当作最终图像指令执行。",
      footer: "原始提示词:",
      defaultText: DEFAULT_STRICT_PROMPT_TEXT,
      bodyLabel: "原始提示词正文",
      cancel: "取消",
      restoreDefault: "恢复默认",
      confirm: "确定",
    },
    generator: {
      mode: "模式",
      generate: "文生图",
      edit: "图生图",
      workflow: "工作流",
      settings: "配置",
      settingsTooltip: "打开连接配置",
      promptLabel: "提示词",
      promptPlaceholder: "一只半透明玻璃质感的机械水母，漂浮在清晨的城市天台上，产品摄影，细节清晰",
      editPromptPlaceholder: "例如：保留原图主体，只调整光影和风格",
      selectLocalImage: "选择本地图片",
      selectHistoricalImage: "选择已生成图片",
      choose: "请选择",
      noHistoricalImages: "暂无可选图片",
      selectAtLeastOneImage: "请选择一张或多张图片。",
      maxEditImages: (count) => `图生图模式最多选择 ${count} 张图片。`,
      size: "尺寸",
      sizeGroups: {
        square: "方形",
        landscape: "横屏",
        portrait: "竖屏",
      },
      quality: "质量",
      qualityOptions: { auto: "自动", low: "低", medium: "中", high: "高" },
      count: "生图数量",
      keepOriginalPrompt: "保持原始提示词",
      keep: "保持",
      language: "语言",
      editOriginalPrompt: "编辑原始提示词文案",
      editOriginalPromptTooltip: "编辑原始提示词文案",
      promptRequired: "请先输入提示词。",
      requestNotCreated: "请求未创建",
      connectionRequired: "请先配置 API URL 和 API Key。",
      requestQueued: "请求已加入队列",
      submissionSuccess: (count) => `成功提交 ${count} 个请求。`,
      cancelGeneration: "中断生图",
      auto: "自动",
      generations: "图片生成",
      responses: "响应生成",
      completions: "对话补全",
      edits: "图片编辑",
      quickStart: {
        buttonLabel: "说明",
        title: "说明",
      description: "这里用大白话介绍 ImageX 的基本用法和常见报错。所有内容都保存在当前浏览器里。",
        tabs: {
          gettingStarted: "快速上手",
          errors: "常见报错",
        },
        steps: [
          "先点右侧的配置，填写 API 地址、API Key 和模型；不知道填什么，就使用服务商提供的兼容 OpenAI 的地址。",
          "选择文生图，输入提示词，再选择尺寸、质量和生图数量，点击图片生成。",
          "想修改一张已有图片时，切换到图生图，把图片拖入图片区域，再输入修改要求，点击图片编辑。",
          "生成结果会出现在上方主面板和右侧列表；图片可以查看大图、下载、作为参考图或进入标注重生。",
          "要批量制作一款商品的六张电商图，切换到工作流，新建任务后填写商品信息并上传产品实拍图。",
        ],
        errors: [
          { title: "Failed to fetch / 请求失败", description: "浏览器没有拿到接口的回复。通常是 API 地址写错、网络不通，或者服务商没有允许网页跨域访问。先检查地址，再让服务商确认支持浏览器直连。" },
          { title: "401 / API Key 无效", description: "服务商不认这个密钥。请重新复制 API Key，注意不要多复制空格，也要确认密钥还没有过期。" },
          { title: "403 / 没有权限", description: "密钥能识别，但没有使用这个模型或接口的权限。换一个有权限的模型，或联系服务商开通权限。" },
          { title: "404 / 找不到接口", description: "API URL 的路径不对。一般只填写服务商给的兼容 OpenAI 的根地址，不要重复加 /v1 或 /images/generations。" },
          { title: "400 / 参数不对", description: "请求送到了服务商，但里面有一项不符合要求。常见原因是模型名称、尺寸、图片格式或提示词不被支持。看报错里的字段名，按服务商文档修改。" },
          { title: "405 / 请求方法不支持", description: "这个地址能访问，但它不接受当前请求方式。通常是把模型列表地址填成了生图地址，或服务商的接口路径与协议不匹配。" },
          { title: "408 / 请求超时", description: "服务商迟迟没有返回结果。可能是网络慢、图片太大或服务商排队很久；先降低图片尺寸和数量，再重试。" },
          { title: "413 / 请求或图片太大", description: "上传的参考图或请求内容超过服务商限制。压缩图片、减少参考图数量，或换小一点的图片尺寸。" },
          { title: "415 / 图片格式不支持", description: "服务商不接受当前图片格式。把图片转换成 PNG 或 JPEG 后再上传，并检查文件扩展名是否和实际格式一致。" },
          { title: "422 / 参数无法处理", description: "地址和密钥可能没问题，但某个字段的值不符合服务商规则。重点检查模型、尺寸、质量、图片字段名和生图数量。" },
          { title: "429 / 请求太频繁", description: "服务商让你慢一点，可能是额度用完或同时请求太多。降低生图数量、增加间隔，或等一会儿再试。" },
          { title: "500/502/503/504 / 服务商暂时不可用", description: "对方服务器暂时没有正常工作，或者正在重启、过载。不一定是你的设置有问题，稍后重试或换一个供应商。" },
          { title: "CORS / 跨域被浏览器拦截", description: "接口可能本身正常，但服务商没有允许网页直接调用。ImageX 不会把请求转发到自己的服务器，只能让服务商开启 CORS，或换支持浏览器直连的地址。" },
          { title: "SSL / 证书或混合内容错误", description: "网页是 HTTPS 时，不能直接请求 HTTP 接口；证书过期或域名配置错误也会失败。请使用 HTTPS 地址，并检查证书。" },
          { title: "响应中没有图片", description: "接口返回成功，但内容里没有 ImageX 能识别的图片数据。通常是模型不支持生图、返回格式不同，或供应商需要专用模型。" },
          { title: "图片能预览但下载失败", description: "供应商返回的是临时图片 URL，浏览器可以显示但不能跨域下载，或链接已经过期。让供应商返回 Base64 或开启图片 CORS。" },
          { title: "本地存储空间不足", description: "浏览器保存任务和图片的空间不够了。清理旧任务或使用“完全清除”，再重新生成；这不会影响供应商账户里的数据。" },
        ],
      },
      pasteImageHint: "将图片拖入或粘贴到此区域，可直接添加图片",
      previewInputImage: "预览输入图片",
      previewPreviousImage: "上一张",
      previewNextImage: "下一张",
    },
    productSuite: {
      title: "产品套图任务",
      description: "建立本地产品任务，上传一次产品实拍图，也可继续添加多张角度图，并配置六个用途槽位；确认后会通过现有图生图队列分别生成。",
      newTask: "新建任务",
      empty: "暂无产品套图任务",
      untitled: "未命名产品",
      productName: "商品名称",
      productNamePlaceholder: "例如：磁吸无线充电宝",
      productReference: "产品实拍参考图",
      taskConfiguration: "当前任务配置",
      developmentTaskPlaceholder: (index) => `滚动测试任务 ${String(index).padStart(2, "0")}`,
      chooseImage: "添加图片",
      dropImageHint: "可拖入、粘贴或批量选择图片；支持添加多张角度图或商业素材。",
      removeImage: "移除图片",
      brandAsset: "可选商业标识/星星素材",
      materialAndColor: "材质/颜色",
      sellingPoints: "核心卖点",
      dimensions: "尺寸数据",
      dimensionsPlaceholder: "例如：长 12cm，宽 6cm，厚 1.8cm",
      forbiddenElements: "禁用元素/不要出现",
      consistencyRequirement: "产品一致性要求（可选）",
      consistencyRequirementPlaceholder: "例如：保持产品外观、颜色、结构和比例与参考图一致；不要修改 Logo 或关键细节。",
      brandTone: "品牌语气/画面风格",
      targetPlatform: "目标平台",
      targetPlatformPlaceholder: "例如：淘宝、京东、独立站",
      nextStepHint: "点击“生成整套”后，只提交已启用槽位，每个槽位固定生成 1 张；产品图支持多角度参考，主图可额外使用商业标识素材。",
      deleteTask: "删除任务",
      saveTask: "保存任务",
      slotsTitle: "六图槽位",
      slotsDescription: "每个槽位都有独立提示词模板，提交前可以单独修改；关闭槽位后不会参与后续整套生成。",
      slotLabels: { hero: "主图", whiteBackground: "白底图", detail: "详情图", size: "尺寸图", closeUp: "细节图", scene: "场景图" },
      slotEnabled: "启用此槽位",
      slotPrompt: "提示词模板",
      renderedPrompt: "最终提示词预览",
      resetTemplate: "恢复模板",
      generateSuite: "生成整套",
      missingProductImage: "请先上传产品实拍参考图。",
      referenceLimit: (count) => `一次请求最多支持 ${count} 张参考图，请减少产品实拍图或商业素材后再生成。`,
      noEnabledSlots: "请至少启用一个套图槽位。",
      confirmTitle: "确认生成整套？",
      confirmDescription: (name, count) => "将为“" + name + "”提交 " + count + " 个图生图任务，每个启用槽位生成 1 张图片。",
      confirmReferenceRule: "六个槽位都会使用已上传的产品实拍图；主图会额外使用商业标识素材。单次请求最多传 5 张参考图。",
      confirmSubmit: "确认提交",
      submitting: "正在提交",
      submitted: (count) => "已提交 " + count + " 个套图任务。",
      slotNotSubmitted: "未提交",
      slotQueued: "排队中",
      slotRunning: "生成中",
      slotDone: "已完成",
      slotFailed: "失败",
      slotCanceled: "已取消",
      resultReady: "已生成，可在主面板查看大图。",
      resultUnavailable: "图片详情暂不可用",
      viewResult: "查看结果",
      exportResult: "导出图片",
      useAsReference: "作为参考图",
      annotateResult: "做标记来重新生图",
      regenerateSlot: "重新生成此槽位",
      retrySlot: "重试此失败槽位",
      slotResubmitted: "槽位已重新加入生成队列。",
      retryFailedSlots: (count) => `仅重试失败槽位${count ? ` (${count})` : ""}`,
      failedSlotsResubmitted: (count) => `已重新提交 ${count} 个失败槽位。`,
      versionHistory: "版本记录",
      viewingVersion: (version) => `当前查看 v${version}，可打开大图、导出或选为最终版本。`,
      finalVersionBadge: (version) => `最终 v${version}`,
      finalVersionUnselected: "尚未选定最终版本",
      selectFinalVersion: "选为最终版本",
      finalVersion: "最终版本",
      finalVersionSelected: (version) => `已将 v${version} 设为最终版本。`,
      clearVersionHistory: "清空版本记录",
      clearAllVersionHistory: "清空所有槽位版本记录",
      clearVersionsTitle: "清空版本记录？",
      clearVersionsDescription: "将删除当前选择范围内的版本记录，同时从右侧生成结果列表移除对应任务和本地图片详情；工作流任务本身会保留。此操作不可撤销。",
      clearVersionsConfirm: "确认清空",
      versionsCleared: "版本记录已清空。",
      exportSuite: "导出整套",
      exportingSuite: "正在导出",
       exportSuiteSuccess: (count) => `已导出 ${count} 张套图和参数清单。`,
       exportSuiteFailed: "产品套图导出失败。",
       batchLabel: (number) => `当前产品批次：批次 ${number}`,
       batchShortLabel: (number) => `批次 ${number}`,
       productImageChangedTitle: "检测到产品实拍图已更换",
       productImageChangedDescription: "这张图片与当前产品批次不同。你可以继续当前批次，或为新产品建立新的批次。",
       continueCurrentBatch: "继续当前批次",
       startNewBatch: "开始新产品批次",
       cancelImageChange: "取消更换",
    },
    annotation: {
      title: "做标记来重新生图",
       description: "原图周围会留出白色标注区：在原图上圈出位置，用箭头指向图外文字说明，标注图会作为新的图生图参考图。",
      loading: "正在加载原图…",
      loadFailed: "原图读取失败。请确认图片地址允许浏览器跨域访问后重试。",
      canvasLabel: "图片标注画布",
      strokeSize: "笔刷大小",
      strokeColor: "标记颜色",
      fontSize: "文字大小",
      instructionLabel: "补充说明",
      instructionPlaceholder: "例如：把圈出的区域改成更明亮的窗户，并补充一盏落地灯。",
      originalPrompt: "原始提示词（只读）",
      noPrompt: "暂无原始提示词",
      textInput: "文字标注",
      textPlaceholder: "输入标注文字",
      submit: "提交到图生图",
      cancel: "取消",
      undo: "撤销",
      redo: "重做",
      deleteSelected: "删除选中标注",
      clear: "清空标注",
      exportFailed: "标注图导出失败，请检查图片是否允许浏览器读取。",
      submitted: "标注图已加入图生图输入区域。",
      tools: {
        select: "选择/移动",
        brush: "画笔",
        arrow: "箭头",
        rectangle: "矩形框",
        ellipse: "圆形框",
        text: "文字",
      },
    },
    settings: {
      title: "连接",
      description: "配置图片服务协议、接口地址和访问密钥。",
      apiUrl: "API URL",
      apiKey: "API Key",
      provider: "供应商",
      providerSwitched: (name) => `已切换到供应商：${name}`,
      providerDefaultsRestored: "已恢复当前供应商的默认参数",
      restoreProviderDefaults: "恢复默认参数",
      addProvider: "新增供应商",
      deleteProvider: "删除供应商",
      deleteProviderTitle: "删除供应商？",
      deleteProviderDescription: "删除后不会影响已有任务，只会移除这条本地供应商配置。",
      confirmDeleteProvider: "确认删除",
      noProviders: "还没有供应商，请先新增一个。",
      providerName: "供应商名称",
      providerProtocol: "协议类型",
      imageResponseMode: "图片返回方式",
      imageResponseModeDescription: "自动优先使用 Base64，遇到不支持的服务商会自动降级。",
      imageResponseModeAuto: "自动兼容（优先 Base64）",
      imageResponseModeBase64: "强制 Base64",
      imageResponseModeUrl: "强制图片 URL",
      multiImageField: "多图上传字段",
      multiImageFieldDescription: "只影响一次上传多张参考图时的字段写法。",
      multiImageFieldAuto: "自动兼容（优先 image[]）",
      multiImageFieldRepeated: "重复 image",
      multiImageFieldArray: "image[]",
      rememberKey: "在本浏览器记住 API Key",
      developmentMode: "开发模式",
      developmentModeDescription: "显示本地占位任务和图片，用于测试图片选择、删除与导出流程。",
      generationsModel: "generations 模型",
      editsModel: "edits 模型",
      responsesModel: "responses 模型",
      completionsModel: "completions 模型",
      privateBaseUrl: "私有服务地址",
      privateApiKey: "x-api-key",
      privateApiKeyPlaceholder: "请输入 x-api-key",
      privateModel: "生图模型",
      geminiProtocol: "Gemini 协议",
      geminiBaseUrl: "Gemini API 地址",
      geminiApiKey: "Gemini API Key",
      geminiModel: "Gemini 图像模型",
      concurrency: "并发",
      interval: "间隔（秒）",
      endpointPreview: "请求地址",
      reset: "重置参数",
      clearAllData: "完全清除",
      clearAllDataTitle: "完全清除本机数据？",
      clearAllDataDescription: "将清除配置、API Key、提示词草稿与历史、所有任务记录、生成图片缓存、当前输入图片、产品套图任务和产品参考图。此操作不可撤销。",
      clearAllDataConfirm: "确认完全清除",
      openAiProtocol: "OpenAI 协议",
      privateProtocol: "私有协议",
      save: "保存",
    },
    clearDialog: {
      cancel: "取消",
      clearAll: {
        title: "清空全部",
        description: "所有请求记录和图片详情缓存将被删除，进行中的请求会被取消。",
        confirm: "确认清空全部",
      },
      cancelRequests: {
        title: "取消请求",
        description: "所有进行中和排队请求将被取消。",
        confirm: "确认取消请求",
      },
      clearFailed: {
        title: "清空失败",
        description: "失败和已取消的请求记录将被删除，进行中的请求会保留。",
        confirm: "确认清空失败",
      },
      clearCompleted: {
        title: "清空完成",
        description: "已完成的请求记录和图片详情将被删除，进行中的请求会保留。",
        confirm: "确认清空完成",
      },
    },
    responseJson: { title: "响应 JSON", description: "当前选中请求的 JSON 响应。" },
    historyImage: {
      selected: "选择已生成图片",
      local: "选择本地图片",
      generated: "选择已生成图片",
      buttonLabel: "请选择",
      deleteButton: "删除输入图片",
      tooltip: "切换到历史图片输入",
    },
    runtime: {
      editRequestMissingImages: "编辑请求缺少输入图片。",
      missingHistoricalRequest: "未找到对应的历史请求。",
      historicalImageExists: (requestTitle, imageIndex) => `${requestTitle} · 图片 ${imageIndex + 1}`,
      historicalImageFull: "历史图片已满",
      historicalRequestHasNoImage: "该历史请求没有可用图片。",
      historicalImageNotFound: "未找到该历史图片。",
      historicalImageNotEditable: "该历史图片暂不支持加入编辑。",
      historicalImageAddedToEdit: (requestTitle, imageIndex) => `${requestTitle} · 图片 ${imageIndex + 1}`,
      historicalImageLoadFailed: "历史图片加载失败。",
      requestCanceled: "已取消请求",
      requestCanceledBeforeSend: "请求已取消，未发送。",
      requestsCanceled: (count) => `${count} 个请求已取消。`,
      allRequestsCleared: "所有请求缓存已清空。",
      completedRequestsCleared: "已完成请求已删除。",
      failedRequestsCleared: "失败和已取消请求已删除。",
      requestFailed: "请求失败",
      crossOriginRequestFailed: "浏览器阻止了跨域请求，请检查 API 服务的 CORS 配置。",
      browserRequestFailed: "浏览器没有收到接口回复。请检查 API 地址、网络连接，以及供应商是否允许网页跨域访问。",
      remoteImageLimited: "接口返回了远程图片地址，但浏览器无法读取它；预览可能正常，导出或再次编辑可能受限。",
      queuedRequestDetail: (method, count, summary, endpoint) => `${method} · ${count} 个新请求 · ${summary} · ${endpoint}`,
    },
    tests: {
      test: "测试",
      connectionTesting: "测试中",
      connectionNormal: "连接正常",
      connectionNormalDetail: "模型列表接口已返回。",
      connectionFailed: "连接失败",
      connectionNotConfigured: "请先填写 URL 和 API Key",
      connectionSaved: "已保存",
      connectionReset: "配置",
      connectionResetDetail: "默认 URL 已恢复。",
    },
    seoContent: {
      h1: "ImageX 图像生成与编辑控制台",
      productSectionLabel: "产品说明",
      productHeading: "关于 ImageX",
      productProse:
        "ImageX 为不想把图像工作流交给第三方 SaaS 的人而生。它是一个本地优先的 OpenAI 兼容图像控制台——请求与缓存全在浏览器内，API key、提示词与成片从不离开你的设备，关闭浏览器即清。\n\n一个面板覆盖 OpenAI 兼容生态的全部出图路径：/v1/images/generations 文生图、/v1/images/edits 图生图、/v1/responses 与 /v1/chat/completions 工具调用出图，按需切换不动客户端。尺寸按横纵分组以像素精确指定，auto 至 1024x1024、2048x2048、最长边 3840x2160 等档位，UI 对接近 2048 / 3840 的档位标注 2K / 4K 便于辨识，由端点原生直出、无需后处理放大；质量分 auto / low / medium / high 可选。\n\n批量与节流由你定义：一次最多跑 100 张拆为独立任务，并发数与请求间隔自定节流，单张失败不影响整批，按时间批次自动编号，状态机覆盖 queued、running、done、error、canceled。strictPrompt 外层锁定语义防模型自改关键词，锁定模板可自定义、可一键开关；历史成片可一键回填做图生图基底，跨请求链式迭代无需重新下载上传；失败请求的错误类型（401、503、上游 error）会被识别区分。",
      footerCopyright: "© 2026 ImageX contributors",
      licenseUrl: "https://github.com/Olivesxxxx/imagex/blob/main/LICENSE",
      githubUrl: "https://github.com/Olivesxxxx/imagex",
      footerPrivacy: "本地数据不上传第三方：API Key 与本地缓存仅存于当前浏览器，关闭即清。",
      noscriptProse:
        "ImageX 是一个本地优先的 OpenAI 兼容图像生成与编辑控制台，四类出图端点同面板、2K/4K 高清直出、百张批量与可调并发。本控制台依赖 JavaScript 与浏览器本地存储运行，请在启用 JavaScript 的现代浏览器中访问。",
    },
    generatedImageAlt: (index, ctx) => {
      const base = `Generated image ${index + 1}`;
      const extras: string[] = [];
      const size = ctx?.size;
      const mode = ctx?.mode;
      if (size && size !== "auto") extras.push(size);
      if (mode) extras.push(mode);
      if (!extras.length) return base;
      return `${base}（${extras.join(" · ")}）`;
    },
    resultSectionLabel: "生成结果",
    skipToContent: "跳到主内容",
  },
  en: {
    appName: "ImageX",
    languageName: "English",
    switchLanguageTooltip: "Switch to 中文",
    requestList: "Generated Results",
    clearAll: "Clear all",
    clearImages: "Clear images",
    cancelRequests: "Cancel",
    clearCompleted: "Clear done",
    clearFailed: "Clear failed",
    exportZip: {
      button: "Export ZIP",
      tooltip: "Export all completed images as a ZIP",
      title: "Export all completed images?",
      selectionTitle: "Export selected images?",
      description: (count) => `Available images from ${count} completed request${count === 1 ? "" : "s"} will be packaged into a ZIP file.`,
      selectionDescription: (count) => `The ${count} selected image${count === 1 ? "" : "s"} will be packaged into a ZIP file.`,
      confirm: "Export",
      progressTitle: "Exporting ZIP",
      progressDescription: "Reading local image details and packaging the ZIP. Keep this page open.",
      progressStatus: (current, total) => (total > 0 ? `Processed ${current}/${total} images` : "Preparing images"),
      success: (count) => `Exported ${count} image${count === 1 ? "" : "s"}.`,
      failed: "Failed to export ZIP.",
      noImages: "No completed images are available to export.",
      selectionTooltip: "Export selected images",
    },
    imageSelection: {
      enter: "Select images",
      exit: "Exit multi-select",
      selected: (count) => `${count} selected`,
      imageLabel: (requestTitle, index) => `${requestTitle}, image ${index}`,
      deleteTitle: "Delete selected requests?",
      deleteDescription: (count) => `This will delete ${count} request${count === 1 ? "" : "s"} containing the selected images and their local image details. This cannot be undone.`,
      deleteConfirm: "Delete requests",
      deleteButton: "Delete requests",
      exportButton: "Export images",
    },
    requestListTooltips: {
      clearAll: "Delete all request records and local image details",
      cancelRequests: "Cancel all running and queued requests",
      clearCompleted: "Delete completed requests and local image details",
      clearFailed: "Delete failed and canceled requests",
    },
    filterLabels: {
      all: "All",
      active: "Active",
      done: "Done",
      failed: "Failed",
    },
    filterEmptyText: {
      all: "No requests",
      active: "No active requests",
      done: "No completed requests",
      failed: "No failed or canceled requests",
    },
    requestStatusLabels: {
      queued: "Queued",
      running: "Generating",
      done: "Done",
      error: "Failed",
      canceled: "Canceled",
    },
    requestCardEmpty: {
      noImage: "No image",
      queued: "This request is queued",
      running: "This request is waiting for a response",
      canceled: "This request was canceled",
      error: "This request failed",
      loading: "Loading history details",
      restored: "History restored, image details were not available in local cache.",
      missing: "No image found in the response",
    },
    requestCardStatus: {
      unselectedTitle: "No request selected",
      unselectedSubtitle: "Click a request after generation to view results.",
      cancel: "Cancel",
      delete: "Delete",
      confirmDelete: "Click again to delete",
      deletedRequest: "Deleted request",
      reusePrompt: "Reuse prompt",
      responseJson: "Response JSON",
      download: "Download",
      exportImage: "Export image",
      annotateImage: "Mark up and regenerate",
      editImage: "Use as reference",
      rotateCounterclockwise: "Rotate image counterclockwise",
      latency: "Latency",
      interval: "Interval",
      refreshLatency: "Refresh API latency",
      testConnection: "Test provider connection",
      latencyCooldown: (seconds) => `Check again in ${seconds}s`,
      latencyMeasuring: "Checking...",
      latencyUnavailable: "Unavailable",
      availabilityUnconfigured: "Not configured",
      availabilityUntested: "Not tested",
      availabilityChecking: "Not checked",
      availabilityVeryFast: "Very fast",
      availabilityFast: "Fast",
      availabilityNormal: "Normal",
      availabilityAvailable: "Available",
      availabilitySlow: "Slow",
      availabilityVerySlow: "Very slow",
      previewImage: "View full image",
      previewPreviousImage: "Previous full image",
      previewNextImage: "Next full image",
      resolution: "Resolution",
    },
    promptHistory: {
      title: "Prompt history",
      empty: "No prompt history",
      pinned: "Pinned",
      pin: "Pin",
      unpin: "Unpin",
      delete: "Delete",
      confirmDelete: "Click again to delete",
      refilled: "Prompt refilled",
    },
    promptEditor: {
      title: "Edit strict prompt",
      description: "The first and last lines are fixed. Only the middle body can be edited, and this feature cannot guarantee a fully preserved original prompt.",
      header: "Please treat the following original Prompt as the final image instruction.",
      footer: "Original Prompt:",
      defaultText: DEFAULT_STRICT_PROMPT_TEXT_EN,
      bodyLabel: "Strict prompt body",
      cancel: "Cancel",
      restoreDefault: "Restore default",
      confirm: "Confirm",
    },
    generator: {
      mode: "Mode",
      generate: "Generate",
      edit: "Edit",
      workflow: "Workflow",
      settings: "Settings",
      settingsTooltip: "Open connection settings",
      promptLabel: "Prompt",
      promptPlaceholder: "A translucent glass mechanical jellyfish floating on a city rooftop at dawn, product photography, crisp detail",
      editPromptPlaceholder: "For example: keep the original subject and only adjust lighting and style",
      selectLocalImage: "Choose local images",
      selectHistoricalImage: "Choose generated images",
      choose: "Choose",
      noHistoricalImages: "No selectable images",
      selectAtLeastOneImage: "Please choose one or more images.",
      maxEditImages: (count) => `Edit mode supports up to ${count} images.`,
      size: "Size",
      auto: "auto",
      sizeGroups: {
        square: "Square",
        landscape: "Landscape",
        portrait: "Portrait",
      },
      quality: "Quality",
      qualityOptions: { auto: "auto", low: "low", medium: "medium", high: "high" },
      count: "Image count",
      keepOriginalPrompt: "Keep original prompt",
      keep: "Keep",
      language: "Language",
      editOriginalPrompt: "Edit strict prompt text",
      editOriginalPromptTooltip: "Edit strict prompt text",
      promptRequired: "Enter a prompt first.",
      requestNotCreated: "Request not created",
      connectionRequired: "Configure the API URL and API key before generating.",
      requestQueued: "Request queued",
      submissionSuccess: (count) => `Successfully submitted ${count} request${count === 1 ? "" : "s"}.`,
      cancelGeneration: "Stop generation",
      generations: "generations",
      responses: "responses",
      completions: "completions",
      edits: "Image edit",
      quickStart: {
        buttonLabel: "Help",
        title: "Help",
        description: "Plain-language help for using ImageX and understanding common errors. Everything stays in this browser.",
        tabs: {
          gettingStarted: "Quick start",
          errors: "Common errors",
        },
        steps: [
          "Open Settings and enter the API URL, API key, and model. If you are unsure, use the OpenAI-compatible details from your provider.",
          "Choose Generate, enter a prompt, choose size, quality, and image count, then click Image generation.",
          "To change an existing image, choose Edit, drop an image into the image area, describe the change, and click Image edit.",
          "Results appear in the main panel and the request list. You can preview, download, reuse, or annotate them.",
          "To make six ecommerce images for one product, choose Workflow, create a task, fill in the product details, and upload the product photo.",
        ],
        errors: [
          { title: "Failed to fetch / Request failed", description: "The browser did not receive a reply from the API. The URL may be wrong, the network may be unavailable, or the provider may block browser cross-origin requests. Check the URL and ask the provider whether direct browser access is allowed." },
          { title: "401 / Invalid API key", description: "The provider does not accept this key. Copy it again without extra spaces and check that it has not expired." },
          { title: "403 / Permission denied", description: "The key is recognized, but it cannot use this model or endpoint. Choose an allowed model or ask the provider to enable access." },
          { title: "404 / Endpoint not found", description: "The API path is wrong. Usually enter the provider's OpenAI-compatible base URL only; do not add /v1 or /images/generations twice." },
          { title: "400 / Invalid parameter", description: "The request reached the provider, but one option is not accepted. Common causes are the model name, image size, image format, or prompt. Read the field named in the error and follow the provider's docs." },
          { title: "405 / Method not allowed", description: "The address responds, but it does not accept this request method. You may have entered a model-list URL instead of an image endpoint, or selected the wrong protocol." },
          { title: "408 / Request timeout", description: "The provider took too long to reply. The network may be slow, the image may be large, or the provider may be busy. Try a smaller size or fewer images." },
          { title: "413 / Request or image too large", description: "The reference image or request exceeds the provider limit. Compress the image, use fewer references, or choose a smaller output size." },
          { title: "415 / Unsupported image format", description: "The provider does not accept this image format. Convert it to PNG or JPEG and try again." },
          { title: "422 / Unprocessable parameters", description: "The URL and key may be valid, but a field value is not accepted. Check the model, size, quality, image field, and image count." },
          { title: "429 / Too many requests", description: "The provider is asking you to slow down, often because your quota is used up or too many requests are running. Lower the image count, increase the interval, or wait and retry." },
          { title: "500/502/503/504 / Provider unavailable", description: "The provider is unhealthy, restarting, overloaded, or timing out. It may not be your configuration. Retry later or switch providers." },
          { title: "CORS / Browser blocked cross-origin request", description: "The API may work normally, but the provider does not allow direct browser calls. ImageX does not proxy requests through its own server, so the provider must enable CORS or you must use another endpoint." },
          { title: "SSL / Certificate or mixed-content error", description: "An HTTPS page cannot call an HTTP endpoint. An expired or misconfigured certificate can also fail. Use HTTPS and check the domain certificate." },
          { title: "Successful response has no image", description: "The API returned success, but no recognizable image data. The model may not support image generation, may return another format, or may require a provider-specific model." },
          { title: "Preview works but download fails", description: "The provider returned a temporary image URL that the browser cannot download cross-origin, or the URL expired. Ask the provider for Base64 output or image CORS." },
          { title: "Browser storage is full", description: "This browser no longer has enough space for tasks and cached images. Delete old tasks or use Clear all data, then try again." },
        ],
      },
      pasteImageHint: "Drop or paste images here to add them directly",
      previewInputImage: "Preview input image",
      previewPreviousImage: "Previous image",
      previewNextImage: "Next image",
    },
    productSuite: {
      title: "Product suite task",
      description: "Create a local product task, upload one or more product reference photos, and configure six purpose-built slots. Confirm to submit them separately through the existing image-edit queue.",
      newTask: "New task",
      empty: "No product suite tasks yet",
      untitled: "Untitled product",
      productName: "Product name",
      productNamePlaceholder: "For example: magnetic wireless power bank",
      productReference: "Product reference photo",
      taskConfiguration: "Current task configuration",
      developmentTaskPlaceholder: (index) => `Scroll test task ${String(index).padStart(2, "0")}`,
      chooseImage: "Add images",
      dropImageHint: "Drop, paste, or choose multiple images; add extra angles or commercial assets as needed.",
      removeImage: "Remove image",
      brandAsset: "Optional commercial badge/star asset",
      materialAndColor: "Material/color",
      sellingPoints: "Key selling points",
      dimensions: "Dimensions",
      dimensionsPlaceholder: "For example: 12cm long, 6cm wide, 1.8cm thick",
      forbiddenElements: "Forbidden elements",
      consistencyRequirement: "Product consistency requirement (optional)",
      consistencyRequirementPlaceholder: "For example: preserve the product appearance, color, structure, and proportions from the reference image.",
      brandTone: "Brand tone / visual style",
      targetPlatform: "Target platform",
      targetPlatformPlaceholder: "For example: Amazon, Shopify, TikTok Shop",
      nextStepHint: "Generate suite submits only enabled slots, with exactly one image per slot. Add multiple product angles and optional commercial assets when needed.",
      deleteTask: "Delete task",
      saveTask: "Save task",
      slotsTitle: "Six image slots",
      slotsDescription: "Each slot has its own prompt template. Edit it before submission; disabled slots will be skipped by the future batch generation.",
      slotLabels: { hero: "Hero", whiteBackground: "White background", detail: "Detail", size: "Size", closeUp: "Close-up", scene: "Scene" },
      slotEnabled: "Enable this slot",
      slotPrompt: "Prompt template",
      renderedPrompt: "Rendered prompt preview",
      resetTemplate: "Restore template",
      generateSuite: "Generate suite",
      missingProductImage: "Upload a product reference photo first.",
      referenceLimit: (count) => `A request supports up to ${count} reference images. Remove some product or commercial assets before generating.`,
      noEnabledSlots: "Enable at least one product suite slot.",
      confirmTitle: "Generate this suite?",
      confirmDescription: (name, count) => "This will submit " + count + " image-edit task" + (count === 1 ? "" : "s") + " for “" + name + "”, with one image per enabled slot.",
      confirmReferenceRule: "Every slot uses the uploaded product reference photos. The hero slot also uses commercial assets. Each request supports up to 5 reference images.",
      confirmSubmit: "Submit suite",
      submitting: "Submitting",
      submitted: (count) => "Submitted " + count + " product suite task" + (count === 1 ? "" : "s") + ".",
      slotNotSubmitted: "Not submitted",
      slotQueued: "Queued",
      slotRunning: "Generating",
      slotDone: "Completed",
      slotFailed: "Failed",
      slotCanceled: "Canceled",
      resultReady: "Generated. Open the main panel to view the full image.",
      resultUnavailable: "Image details unavailable",
      viewResult: "View result",
      exportResult: "Export image",
      useAsReference: "Use as reference",
      annotateResult: "Mark up and regenerate",
      regenerateSlot: "Regenerate slot",
      retrySlot: "Retry failed slot",
      slotResubmitted: "The slot was added to the generation queue again.",
      retryFailedSlots: (count) => `Retry failed slots${count ? ` (${count})` : ""}`,
      failedSlotsResubmitted: (count) => `Resubmitted ${count} failed slot${count === 1 ? "" : "s"}.`,
      versionHistory: "Version history",
      viewingVersion: (version) => `Viewing v${version}. Open, export, or choose it as the final version.`,
      finalVersionBadge: (version) => `Final v${version}`,
      finalVersionUnselected: "No final version selected",
      selectFinalVersion: "Choose as final",
      finalVersion: "Final version",
      finalVersionSelected: (version) => `Selected v${version} as the final version.`,
      clearVersionHistory: "Clear version history",
      clearAllVersionHistory: "Clear all slot version history",
      clearVersionsTitle: "Clear version history?",
      clearVersionsDescription: "This deletes the selected version records, their matching tasks in the right-side result list, and local image details. The workflow task itself stays. This cannot be undone.",
      clearVersionsConfirm: "Confirm clear",
      versionsCleared: "Version history cleared.",
      exportSuite: "Export suite",
      exportingSuite: "Exporting",
       exportSuiteSuccess: (count) => `Exported ${count} suite image${count === 1 ? "" : "s"} and the manifest.`,
       exportSuiteFailed: "Could not export the product suite.",
       batchLabel: (number) => `Current product batch: Batch ${number}`,
       batchShortLabel: (number) => `Batch ${number}`,
       productImageChangedTitle: "A new product reference image was detected",
       productImageChangedDescription: "This image differs from the current product batch. Continue the current batch, or start a new batch for the new product.",
       continueCurrentBatch: "Continue current batch",
       startNewBatch: "Start new product batch",
       cancelImageChange: "Cancel change",
    },
    annotation: {
      title: "Mark up and regenerate",
       description: "A white margin surrounds the original image. Circle the target area, draw an arrow to an outside note, and submit the marked image as the new edit reference.",
      loading: "Loading the source image…",
      loadFailed: "Could not read the source image. Check that its URL allows browser cross-origin access.",
      canvasLabel: "Image annotation canvas",
      strokeSize: "Brush size",
      strokeColor: "Mark color",
      fontSize: "Text size",
      instructionLabel: "Additional instructions",
      instructionPlaceholder: "For example: make the circled window brighter and add a floor lamp.",
      originalPrompt: "Original prompt (read only)",
      noPrompt: "No original prompt",
      textInput: "Text annotation",
      textPlaceholder: "Enter annotation text",
      submit: "Send to image edit",
      cancel: "Cancel",
      undo: "Undo",
      redo: "Redo",
      deleteSelected: "Delete selected mark",
      clear: "Clear marks",
      exportFailed: "Could not export the marked image. Check whether the image allows browser access.",
      submitted: "The marked image was added to the image-edit input area.",
      tools: {
        select: "Select/move",
        brush: "Brush",
        arrow: "Arrow",
        rectangle: "Rectangle",
        ellipse: "Circle",
        text: "Text",
      },
    },
    settings: {
      title: "Connection",
      description: "Configure the image service protocol, endpoint, and access key.",
      apiUrl: "API URL",
      apiKey: "API key",
      provider: "Provider",
      providerSwitched: (name) => `Switched to provider: ${name}`,
      providerDefaultsRestored: "Current provider defaults restored",
      restoreProviderDefaults: "Restore defaults",
      addProvider: "Add provider",
      deleteProvider: "Delete provider",
      deleteProviderTitle: "Delete provider?",
      deleteProviderDescription: "Existing tasks are not affected. Only this local provider configuration will be removed.",
      confirmDeleteProvider: "Delete provider",
      noProviders: "No providers yet. Add one to get started.",
      providerName: "Provider name",
      providerProtocol: "Protocol type",
      imageResponseMode: "Image response mode",
      imageResponseModeDescription: "Auto prefers Base64 and falls back when a provider rejects it.",
      imageResponseModeAuto: "Auto-compatible (prefer Base64)",
      imageResponseModeBase64: "Force Base64",
      imageResponseModeUrl: "Force image URL",
      multiImageField: "Multi-image upload field",
      multiImageFieldDescription: "Only affects requests that upload multiple reference images.",
      multiImageFieldAuto: "Auto-compatible (prefer image[])",
      multiImageFieldRepeated: "Repeated image",
      multiImageFieldArray: "image[]",
      rememberKey: "Remember API key in this browser",
      developmentMode: "Development mode",
      developmentModeDescription: "Show local placeholder requests and images for testing selection, deletion, and export workflows.",
      generationsModel: "Generations model",
      editsModel: "Edits model",
      responsesModel: "Responses model",
      completionsModel: "Completions model",
      privateBaseUrl: "Private service URL",
      privateApiKey: "x-api-key",
      privateApiKeyPlaceholder: "Enter x-api-key",
      privateModel: "Image model",
      geminiProtocol: "Gemini protocol",
      geminiBaseUrl: "Gemini API URL",
      geminiApiKey: "Gemini API key",
      geminiModel: "Gemini image model",
      concurrency: "Concurrency",
      interval: "Interval (sec)",
      endpointPreview: "Request endpoint",
      reset: "Reset parameters",
      clearAllData: "Clear all data",
      clearAllDataTitle: "Clear all local data?",
      clearAllDataDescription: "This removes settings, API keys, prompt drafts and history, all request records, cached images, current input images, product suite tasks, and product reference photos. This cannot be undone.",
      clearAllDataConfirm: "Confirm clear all",
      openAiProtocol: "OpenAI protocol",
      privateProtocol: "Private protocol",
      save: "Save",
    },
    clearDialog: {
      cancel: "Cancel",
      clearAll: {
        title: "Clear all",
        description: "All request records and image detail cache will be deleted, and active requests will be canceled.",
        confirm: "Confirm clear all",
      },
      cancelRequests: {
        title: "Cancel requests",
        description: "All running and queued requests will be canceled.",
        confirm: "Confirm cancel requests",
      },
      clearFailed: {
        title: "Clear failed",
        description: "Failed and canceled requests will be deleted, while active requests are kept.",
        confirm: "Confirm clear failed",
      },
      clearCompleted: {
        title: "Clear done",
        description: "Completed requests and image details will be deleted, while active requests are kept.",
        confirm: "Confirm clear done",
      },
    },
    responseJson: { title: "Response JSON", description: "JSON response for the currently selected request." },
    historyImage: {
      selected: "Choose generated images",
      local: "Choose local images",
      generated: "Choose generated images",
      buttonLabel: "Choose",
      deleteButton: "Delete input image",
      tooltip: "Use historical images as input",
    },
    runtime: {
      editRequestMissingImages: "Edit request is missing input images.",
      missingHistoricalRequest: "No matching historical request was found.",
      historicalImageExists: (requestTitle, imageIndex) => `${requestTitle} · Image ${imageIndex + 1}`,
      historicalImageFull: "Historical image limit reached",
      historicalRequestHasNoImage: "This historical request has no available images.",
      historicalImageNotFound: "Could not find that historical image.",
      historicalImageNotEditable: "That historical image cannot be added to edit mode yet.",
      historicalImageAddedToEdit: (requestTitle, imageIndex) => `${requestTitle} · Image ${imageIndex + 1}`,
      historicalImageLoadFailed: "Failed to load the historical image.",
      requestCanceled: "Request canceled",
      requestCanceledBeforeSend: "Request canceled before sending.",
      requestsCanceled: (count) => `${count} requests canceled.`,
      allRequestsCleared: "All request cache cleared.",
      completedRequestsCleared: "Completed requests deleted.",
      failedRequestsCleared: "Failed and canceled requests deleted.",
      requestFailed: "Request failed",
      crossOriginRequestFailed: "The browser blocked a cross-origin request. Check the API service CORS settings.",
      browserRequestFailed: "The browser did not receive a reply. Check the API URL, network, and whether the provider allows browser cross-origin access.",
      remoteImageLimited: "The API returned a remote image URL, but the browser could not read it. Preview may work while export or editing is limited.",
      queuedRequestDetail: (method, count, summary, endpoint) => `${method} · ${count} new request${count === 1 ? "" : "s"} · ${summary} · ${endpoint}`,
    },
    tests: {
      test: "Test",
      connectionTesting: "Testing",
      connectionNormal: "Connected",
      connectionNormalDetail: "The models endpoint returned successfully.",
      connectionFailed: "Connection failed",
      connectionNotConfigured: "Enter the URL and API key first",
      connectionSaved: "Saved",
      connectionReset: "Settings",
      connectionResetDetail: "Default URL restored.",
    },
    seoContent: {
      h1: "ImageX – Image Generation and Editing Console",
      productSectionLabel: "Product overview",
      productHeading: "About ImageX",
      productProse:
        "ImageX is built for people who'd rather not hand their image workflow to a third-party SaaS. It's a local-first, OpenAI-compatible image console — requests and caches stay in the browser, and your API key, prompts, and artifacts never leave your device; closing the browser clears them.\n\nOne panel covers every output path in the OpenAI-compatible ecosystem: text-to-image via /v1/images/generations, local image edits via /v1/images/edits, and tool-call image output via /v1/responses and /v1/chat/completions — switch on demand without changing clients. Sizes are grouped by aspect ratio and pinned in exact pixels — auto, 1024x1024, 2048x2048, up to a 3840x2160 long edge — with the UI tagging the near-2048 / near-3840 tiers as 2K / 4K for legibility, all returned natively by the endpoint with no post-processing upscale; quality is selected from auto / low / medium / high.\n\nBatch and throttling are yours to define: run up to 100 at once split into independent tasks, with self-throttled concurrency and request intervals, where a single failure doesn't sink the batch and runs are auto-numbered by time. A state machine covers queued, running, done, error, and canceled. strictPrompt locks the outer semantics to keep the model from rewriting your keywords, with the lock template customizable and toggleable on a single switch; past artifacts can be pulled back as edit baselines for chained iteration across requests without re-downloading, and failed-request error types (401, 503, upstream error) are recognized and distinguished.",
      footerCopyright: "© 2026 ImageX contributors",
      licenseUrl: "https://github.com/Olivesxxxx/imagex/blob/main/LICENSE",
      githubUrl: "https://github.com/Olivesxxxx/imagex",
      footerPrivacy: "Local data is never uploaded to third parties: API key and cache live in this browser only.",
      noscriptProse:
        "ImageX is a local-first, OpenAI-compatible image generation and editing console with four output endpoints in one panel, 2K/4K HD direct output, and batch up to a hundred with adjustable concurrency. This console relies on JavaScript and browser local storage; please enable JavaScript in a modern browser to access it.",
    },
    generatedImageAlt: (index, ctx) => {
      const base = `Generated image ${index + 1}`;
      const extras: string[] = [];
      const size = ctx?.size;
      const mode = ctx?.mode;
      if (size && size !== "auto") extras.push(size);
      if (mode) extras.push(mode);
      if (!extras.length) return base;
      return `${base} · ${extras.join(" · ")}`;
    },
    resultSectionLabel: "Results",
    skipToContent: "Skip to main content",
  },
};

const I18N_CONTEXT = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  copy: Copy;
} | null>(null);

export function LanguageProvider({
  children,
  initialLanguage: initialLanguageProp,
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguage] = useState<Language>(() => initialLanguageProp || initialLanguage());

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
    syncDocumentLanguage(language);
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromLocation = () => {
      setLanguage(initialLanguage());
    };

    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage: () => setLanguage((current) => (current === "zh" ? "en" : "zh")),
      copy: COPY[language],
    }),
    [language],
  );

  return createElement(I18N_CONTEXT.Provider, { value }, children);
}

export function useI18n() {
  const context = useContext(I18N_CONTEXT);
  if (context) return context;
  return {
    language: "zh" as Language,
    setLanguage: () => undefined,
    toggleLanguage: () => undefined,
    copy: COPY.zh,
  };
}

export function getCopy(language: Language) {
  return COPY[language];
}
