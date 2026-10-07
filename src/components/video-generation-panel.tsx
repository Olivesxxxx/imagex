import { DownloadIcon, ImagePlusIcon, Loader2Icon, PlayIcon, RefreshCwIcon, SquareIcon, Trash2Icon, VideoIcon, XIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { createVideoTask, deleteVideoBlob, deleteVideoReferenceFiles, delayVideoPoll, formatVideoTaskTiming, loadVideoBlob, loadVideoReferenceFiles, normalizeVideoTask, pollVideoTask, saveVideoBlob, saveVideoReferenceFiles, videoDownloadName, videoPollIntervalMs, videoTaskBatchPrefix, videoTaskTitle, VIDEO_DATA_CLEARED_EVENT, VIDEO_TASKS_STORAGE_KEY, type VideoAspectRatio, type VideoDuration, type VideoQuality, type VideoRequestOptions, type VideoTask } from "@/lib/video";
import { formatCompletionTime } from "@/lib/image-console";
import type { AppSettings } from "@/lib/image-console";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import type { ResultMediaFilter } from "@/components/request-list-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MAX_VIDEO_REFERENCE_IMAGES = 5;
type VideoReferenceImage = { file: File; src: string; name: string };

export interface VideoTaskActions {
  clearFailed: () => void;
  deleteTasks: (ids: readonly string[]) => void;
}

function readTasks(): VideoTask[] {
  try {
    const value = JSON.parse(localStorage.getItem(VIDEO_TASKS_STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    const normalized = value.map(normalizeVideoTask).filter((item): item is VideoTask => Boolean(item));
    return normalized.reduce<VideoTask[]>((result, task) => {
      result.push(task.title ? task : { ...task, title: nextVideoTaskTitle(task.createdAt, result) });
      return result;
    }, []);
  } catch {
    return [];
  }
}

function saveTasks(tasks: VideoTask[]) {
  try {
    localStorage.setItem(VIDEO_TASKS_STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    toast.error("Unable to save video task history in this browser.");
  }
}

function nextVideoTaskTitle(createdAt: number, tasks: VideoTask[]) {
  const prefix = videoTaskBatchPrefix(createdAt);
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const nextIndex = tasks.reduce((next, task) => {
    const match = pattern.exec(videoTaskTitle(task));
    return match ? Math.max(next, Number(match[1]) + 1) : next;
  }, 1);
  return `${prefix}-${nextIndex}`;
}

export function VideoGenerationPanel({ settings, duration, aspectRatio, quality, resultMediaFilter = "all", videoPromptPrefill, onActionStateChange, onResultChange, onTaskCountChange, onSubmitted, onTaskSelect, selectionMode = false, selectedTaskIds, onToggleTaskSelection, onTaskFailedCountChange, onRegisterActions }: { settings: AppSettings; duration: VideoDuration; aspectRatio: VideoAspectRatio; quality: VideoQuality; resultMediaFilter?: ResultMediaFilter; videoPromptPrefill?: { value: string; signal: number }; onActionStateChange?: (submit: () => void, canSubmit: boolean) => void; onResultChange?: (task: VideoTask | null, url?: string) => void; onTaskCountChange?: (count: number) => void; onSubmitted?: () => void; onTaskSelect?: (task: VideoTask) => void; selectionMode?: boolean; selectedTaskIds?: ReadonlySet<string>; onToggleTaskSelection?: (id: string) => void; onTaskFailedCountChange?: (count: number) => void; onRegisterActions?: (actions: VideoTaskActions) => void }) {
  const { copy, language } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<VideoReferenceImage[]>([]);
  const [tasks, setTasks] = useState<VideoTask[]>(readTasks);
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set());
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [taskListTarget, setTaskListTarget] = useState<HTMLElement | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const lastResultKeyRef = useRef("");
  const lastTaskCountRef = useRef<number | null>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const referenceImagesRef = useRef(referenceImages);
  const mediaUrlsRef = useRef(mediaUrls);
  const provider = settings.openaiProviders.find((item) => item.id === settings.activeOpenAIProviderId);
  const isOpenAI = settings.protocol === "openai";
  const baseUrl = settings.baseUrl;
  const apiKey = settings.apiKey;
  const model = provider?.videoModel.trim() || "";
  const canSubmit = Boolean(prompt.trim() && model && apiKey && baseUrl && isOpenAI);
  const orderedTasks = useMemo(() => [...tasks].sort((a, b) => b.createdAt - a.createdAt), [tasks]);
  const selectedTask = orderedTasks.find((task) => task.id === selectedTaskId) || orderedTasks[0] || null;

  useEffect(() => {
    if (videoPromptPrefill?.signal) setPrompt(videoPromptPrefill.value);
  }, [videoPromptPrefill?.signal, videoPromptPrefill?.value]);

  useEffect(() => {
    if (selectedTaskId && !tasks.some((task) => task.id === selectedTaskId)) setSelectedTaskId(null);
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    const url = selectedTask ? mediaUrls[selectedTask.id] || selectedTask.url : undefined;
    const resultKey = selectedTask ? `${selectedTask.id}:${selectedTask.status}:${url || ""}` : "";
    if (resultKey === lastResultKeyRef.current) return;
    lastResultKeyRef.current = resultKey;
    onResultChange?.(selectedTask, url);
  }, [mediaUrls, onResultChange, selectedTask]);

  useEffect(() => {
    if (lastTaskCountRef.current === tasks.length) return;
    lastTaskCountRef.current = tasks.length;
    onTaskCountChange?.(tasks.length);
  }, [onTaskCountChange, tasks.length]);

  const failedTasks = tasks.filter((task) => task.status === "failed" || task.status === "canceled");

  useEffect(() => {
    onTaskFailedCountChange?.(failedTasks.length);
  }, [failedTasks.length, onTaskFailedCountChange]);

  useEffect(() => {
    onActionStateChange?.(() => { void submit(); }, canSubmit);
  }, [canSubmit, onActionStateChange, prompt]);

  useEffect(() => {
    setTaskListTarget(document.getElementById("video-task-list"));
  }, []);

  function clearFailedTasks() {
    failedTasks.forEach((task) => {
      const url = mediaUrlsRef.current[task.id];
      if (url) URL.revokeObjectURL(url);
      void deleteVideoBlob(task.id).catch(() => undefined);
      void deleteVideoReferenceFiles(task.id).catch(() => undefined);
    });
    if (!failedTasks.length) return;
    const failedIds = new Set(failedTasks.map((task) => task.id));
    setTasks((items) => items.filter((task) => !failedIds.has(task.id)));
    setMediaUrls((current) => {
      const next = { ...current };
      failedIds.forEach((id) => delete next[id]);
      return next;
    });
  }

  function deleteTasks(ids: readonly string[]) {
    const selectedIds = new Set(ids);
    tasks.filter((task) => selectedIds.has(task.id)).forEach((task) => void remove(task));
  }

  useEffect(() => {
    onRegisterActions?.({ clearFailed: clearFailedTasks, deleteTasks });
  });

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    referenceImagesRef.current = referenceImages;
  }, [referenceImages]);

  useEffect(() => {
    function handleVideoDataCleared() {
      controllers.current.forEach((controller) => controller.abort());
      Object.values(mediaUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      referenceImagesRef.current.forEach((image) => URL.revokeObjectURL(image.src));
      setTasks([]);
      setMediaUrls({});
      setReferenceImages([]);
    }
    window.addEventListener(VIDEO_DATA_CLEARED_EVENT, handleVideoDataCleared);
    return () => window.removeEventListener(VIDEO_DATA_CLEARED_EVENT, handleVideoDataCleared);
  }, []);

  useEffect(() => { mediaUrlsRef.current = mediaUrls; }, [mediaUrls]);

  useEffect(() => () => {
    for (const controller of controllers.current.values()) controller.abort();
    Object.values(mediaUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    referenceImagesRef.current.forEach((image) => URL.revokeObjectURL(image.src));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next: Record<string, string> = {};
      for (const task of tasks) {
        if (task.status !== "completed") continue;
        try {
          const blob = await loadVideoBlob(task.id);
          if (blob && !cancelled) next[task.id] = URL.createObjectURL(blob);
        } catch {
          // A missing browser cache should not hide the task history.
        }
      }
      if (!cancelled && Object.keys(next).length) setMediaUrls((current) => ({ ...next, ...current }));
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  async function runPolling(task: VideoTask, options: VideoRequestOptions) {
    const controller = new AbortController();
    controllers.current.set(task.id, controller);
    setActiveIds((current) => new Set(current).add(task.id));
    const startedAt = task.startedAt || Date.now();
    let current = task.startedAt ? task : { ...task, startedAt };
    if (!task.startedAt) setTasks((items) => items.map((item) => item.id === task.id ? current : item));
    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const result = await pollVideoTask(current, { ...options, signal: controller.signal });
        const updatedAt = Date.now();
        if (result.status === "completed") {
          let url = result.url;
          if (result.blob) {
            await saveVideoBlob(task.id, result.blob);
            url = URL.createObjectURL(result.blob);
          }
          current = { ...current, status: "completed", updatedAt, url };
          setMediaUrls((value) => ({ ...value, ...(url ? { [task.id]: url } : {}) }));
          setTasks((items) => items.map((item) => item.id === task.id ? current : item));
          return;
        }
        if (result.status === "failed" || result.status === "canceled") {
          current = { ...current, status: result.status, updatedAt, error: result.error };
          setTasks((items) => items.map((item) => item.id === task.id ? current : item));
          return;
        }
        current = { ...current, status: result.status, updatedAt };
        setTasks((items) => items.map((item) => item.id === task.id ? current : item));
        await delayVideoPoll(videoPollIntervalMs(options.baseUrl), controller.signal);
      }
      throw new Error(language === "en" ? "Video task polling timed out." : "视频任务轮询超时。");
    } catch (error) {
      if (controller.signal.aborted) {
        current = { ...current, status: "canceled", updatedAt: Date.now() };
        setTasks((items) => items.map((item) => item.id === task.id ? current : item));
      } else {
        current = { ...current, status: "failed", updatedAt: Date.now(), error: (error as Error).message };
        setTasks((items) => items.map((item) => item.id === task.id ? current : item));
      }
    } finally {
      controllers.current.delete(task.id);
      setActiveIds((currentIds) => {
        const next = new Set(currentIds);
        next.delete(task.id);
        return next;
      });
    }
  }

  async function submit() {
    if (!prompt.trim()) return;
    if (!model) {
      toast.error(copy.generator.videoModelRequired);
      return;
    }
    if (!isOpenAI) {
      toast.error(language === "en" ? "Video generation currently requires an OpenAI-compatible provider." : "当前视频生成功能需要 OpenAI 兼容协议供应商。");
      return;
    }
    const config: VideoRequestOptions = {
      baseUrl,
      apiKey,
      model,
      prompt: prompt.trim(),
      duration,
        aspectRatio,
        quality,
      referenceImages: referenceImages.map((image) => image.file),
      authHeaderName: provider?.authHeaderName,
      authPrefix: provider?.authPrefix,
    };
    try {
      const createdTask = await createVideoTask(config, provider?.id);
      const task = { ...createdTask, title: nextVideoTaskTitle(createdTask.createdAt, tasks) };
      setTasks((items) => [task, ...items]);
      setSelectedTaskId(task.id);
      onSubmitted?.();
      try {
        await saveVideoReferenceFiles(task.id, config.referenceImages || []);
      } catch {
        toast.error(language === "en" ? "Video started, but the reference images could not be cached for retry." : "视频已提交，但参考图未能缓存，之后可能无法用原图重试。");
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  function addReferenceFiles(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length !== files.length) toast.error(language === "en" ? "Only image files can be used as video references." : "视频参考图只能选择图片文件。");
    const remaining = Math.max(0, MAX_VIDEO_REFERENCE_IMAGES - referenceImages.length);
    if (imageFiles.length > remaining) toast.error(language === "en" ? `Use up to ${MAX_VIDEO_REFERENCE_IMAGES} reference images.` : `视频最多使用 ${MAX_VIDEO_REFERENCE_IMAGES} 张参考图。`);
    const next = imageFiles.slice(0, remaining).map((file) => ({ file, src: URL.createObjectURL(file), name: file.name }));
    if (next.length) setReferenceImages((current) => [...current, ...next]);
  }

  function removeReferenceImage(index: number) {
    setReferenceImages((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.src);
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  function handleReferencePaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) return;
    event.preventDefault();
    addReferenceFiles(files);
  }

  useEffect(() => {
    for (const task of tasks) {
      if ((task.status !== "queued" && task.status !== "running") || activeIds.has(task.id)) continue;
      const taskProvider = settings.openaiProviders.find((item) => item.id === task.providerId);
      if (!taskProvider || taskProvider.protocol !== "openai" || !taskProvider.apiKey || !taskProvider.baseUrl) continue;
      const options: VideoRequestOptions = {
        baseUrl: taskProvider.baseUrl,
        apiKey: taskProvider.apiKey,
        model: task.model,
        prompt: task.prompt,
        duration: task.duration,
        aspectRatio: task.aspectRatio,
        quality: task.quality,
        authHeaderName: taskProvider.authHeaderName,
        authPrefix: taskProvider.authPrefix,
      };
      void runPolling(task, options);
    }
  }, [tasks, activeIds, settings.openaiProviders]);

  function stop(task: VideoTask) {
    controllers.current.get(task.id)?.abort();
  }

  async function remove(task: VideoTask) {
    controllers.current.get(task.id)?.abort();
    const url = mediaUrls[task.id];
    if (url) URL.revokeObjectURL(url);
    setMediaUrls((current) => {
      const next = { ...current };
      delete next[task.id];
      return next;
    });
    setTasks((items) => items.filter((item) => item.id !== task.id));
    try {
      await deleteVideoBlob(task.id);
      await deleteVideoReferenceFiles(task.id);
    } catch {
      // The task history is still removable when its cached media is unavailable.
    }
  }

  async function retry(task: VideoTask) {
    const taskProvider = settings.openaiProviders.find((item) => item.id === task.providerId);
    if (!taskProvider?.apiKey || !taskProvider.baseUrl || taskProvider.protocol !== "openai") {
      toast.error(language === "en" ? "The original provider is no longer configured." : "原供应商已不存在或配置不完整。");
      return;
    }
    try {
      const referenceFiles = task.referenceImageCount ? await loadVideoReferenceFiles(task.id).catch(() => []) : [];
      if ((task.referenceImageCount || 0) > 0 && referenceFiles.length === 0) {
        toast.error(language === "en" ? "The original reference images are no longer available." : "原任务的参考图已不可用，无法重新生成。");
        return;
      }
      const createdTask = await createVideoTask({
        baseUrl: taskProvider.baseUrl,
        apiKey: taskProvider.apiKey,
        model: task.model,
        prompt: task.prompt,
        duration: task.duration,
        aspectRatio: task.aspectRatio,
        quality: task.quality,
        referenceImages: referenceFiles,
        authHeaderName: taskProvider.authHeaderName,
        authPrefix: taskProvider.authPrefix,
      }, task.providerId);
      const nextTask = { ...createdTask, title: nextVideoTaskTitle(createdTask.createdAt, tasks) };
      setTasks((items) => [nextTask, ...items]);
      try {
        await saveVideoReferenceFiles(nextTask.id, referenceFiles);
      } catch {
        toast.error(language === "en" ? "Video started, but its reference images could not be cached." : "视频已提交，但参考图未能缓存。");
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  function download(task: VideoTask) {
    const url = mediaUrls[task.id] || task.url;
    if (!url) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = videoDownloadName(task);
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.click();
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section className="flex min-w-0 flex-col gap-3" aria-label={language === "en" ? "Video settings" : "视频设置"}>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="videoPrompt">
          {copy.generator.promptLabel}
          <Textarea id="videoPrompt" value={prompt} maxLength={16000} onChange={(event) => setPrompt(event.target.value)} placeholder={copy.generator.videoPromptPlaceholder} className="standard-scrollbar min-h-40 resize-y overflow-y-auto" />
        </label>
        <div
          className="flex min-h-20 shrink-0 flex-col gap-2 rounded-md border border-dashed border-border bg-muted/10 p-2"
          aria-label={language === "en" ? "Video reference images" : "视频参考图"}
          tabIndex={0}
          onPaste={handleReferencePaste}
          onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
          onDrop={(event) => { event.preventDefault(); addReferenceFiles(Array.from(event.dataTransfer.files)); }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">{language === "en" ? `Reference images (${referenceImages.length}/${MAX_VIDEO_REFERENCE_IMAGES})` : `视频参考图（${referenceImages.length}/${MAX_VIDEO_REFERENCE_IMAGES}）`}</span>
            <Button type="button" variant="outline" size="sm" className="!h-7 !min-h-7 !max-h-7 px-2 text-xs" disabled={referenceImages.length >= MAX_VIDEO_REFERENCE_IMAGES} onClick={() => referenceInputRef.current?.click()}><ImagePlusIcon data-icon="inline-start" />{language === "en" ? "Add" : "添加"}</Button>
            <input ref={referenceInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { addReferenceFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ""; }} />
          </div>
          {referenceImages.length ? <div className="grid grid-cols-5 gap-1.5">
            {referenceImages.map((image, index) => <div key={`${image.name}-${index}`} className="relative aspect-square overflow-hidden rounded border border-border bg-background">
              <img src={image.src} alt="" aria-hidden="true" className="h-full w-full object-cover" />
              <Button type="button" variant="secondary" size="icon-xs" className="absolute right-0.5 top-0.5 rounded-full bg-background/90" aria-label={`${language === "en" ? "Remove reference image" : "移除参考图"} ${index + 1}`} onClick={() => removeReferenceImage(index)}><XIcon /></Button>
            </div>)}
          </div> : <span className="text-xs text-muted-foreground">{language === "en" ? "Optional. Drop or paste images here; providers must support the image[] video field." : "可选。可将图片拖入或粘贴到这里；供应商需要支持视频请求的 image[] 字段。"}</span>}
        </div>
      </section>
      {taskListTarget && resultMediaFilter !== "images" ? createPortal(<div className="contents">
        {!orderedTasks.length ? <p className="px-1 py-1.5 text-xs text-muted-foreground">{copy.generator.videoNoTasks}</p> : null}
        {orderedTasks.map((task) => {
          const videoUrl = mediaUrls[task.id] || task.url;
          const active = activeIds.has(task.id);
          const canSelect = task.status !== "queued" && task.status !== "running";
          const selected = Boolean(selectedTaskIds?.has(task.id));
          const selectTask = () => {
            setSelectedTaskId(task.id);
            onTaskSelect?.(task);
          };
          return <article key={task.id} className={`relative grid min-h-22 w-full grid-cols-1 items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-2 text-card-foreground transition-[border-color,background-color,box-shadow] hover:border-foreground/15 hover:bg-muted/40 ${selected ? "border-foreground/20 bg-[oklch(0.985_0.006_255)]" : ""}`} onClick={selectTask}>
            <div className="grid w-full min-w-0 grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-3">
              <div className="relative size-24 shrink-0">
                <button type="button" className="flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border bg-black text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(event) => { event.stopPropagation(); selectTask(); }} aria-label={`${language === "en" ? "View video result" : "查看视频结果"} ${task.id}`}>
                {task.status === "completed" && videoUrl ? <video className="h-full w-full object-cover" src={videoUrl} muted playsInline preload="metadata" /> : active ? <Loader2Icon className="size-6 animate-spin text-muted-foreground" /> : <VideoIcon className="size-6 text-muted-foreground" />}
                </button>
                {selectionMode && canSelect ? <label className="absolute left-2 top-2 z-20 flex cursor-pointer items-center" onClick={(event) => event.stopPropagation()}>
                  <Checkbox checked={selected} className="bg-background data-[state=checked]:bg-primary" onCheckedChange={() => onToggleTaskSelection?.(task.id)} aria-label={`${language === "en" ? "Select video entry" : "选择视频条目"} ${task.id}`} />
                </label> : null}
              </div>
              <button type="button" className="flex min-w-0 flex-col gap-1 overflow-hidden py-0.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={selectTask} aria-label={`${language === "en" ? "View video result" : "查看视频结果"} ${task.id}`}>
                <span className="flex min-w-0 items-center gap-2"><Badge variant={task.status === "failed" || task.status === "canceled" ? "destructive" : "default"} className={task.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : task.status === "queued" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" : task.status === "running" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : ""}>{copy.generator.videoStatus[task.status]}</Badge><strong className="min-w-0 truncate text-sm font-semibold">{videoTaskTitle(task)}</strong>{active ? <Loader2Icon className="size-3.5 shrink-0 animate-spin" /> : null}</span>
                <span className="block min-w-0 truncate text-xs font-medium text-muted-foreground">{formatVideoTaskTiming(task, Date.now(), language === "en" ? "en" : "zh")}</span>
                <span className="block min-w-0 truncate text-xs text-muted-foreground" title={`${task.aspectRatio} · ${task.quality} · ${task.duration}s`}>{task.aspectRatio} · {task.quality} · {task.duration}s</span>
                <span className="block min-w-0 truncate text-xs text-muted-foreground" title={task.error || task.prompt}>{task.status === "completed" ? formatCompletionTime(task.updatedAt, language === "en" ? "en" : "zh") : task.error || task.prompt}</span>
              </button>
              <span className="flex h-full shrink-0 flex-col items-end justify-between gap-2 pt-0.5">
                <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={active ? copy.generator.videoCancel : (language === "en" ? "Delete video task" : "删除视频任务")} onClick={(event) => { event.stopPropagation(); active ? stop(task) : void remove(task); }}>{active ? <SquareIcon data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}</Button></TooltipTrigger><TooltipContent>{active ? copy.generator.videoCancel : (language === "en" ? "Delete video task" : "删除视频任务")}</TooltipContent></Tooltip>
                {!active && (task.status === "failed" || task.status === "canceled") ? <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={language === "en" ? "Retry video task" : "重新生成视频"} onClick={(event) => { event.stopPropagation(); void retry(task); }}><RefreshCwIcon data-icon="inline-start" /></Button></TooltipTrigger><TooltipContent>{language === "en" ? "Retry video task" : "重新生成视频"}</TooltipContent></Tooltip> : null}
                {!active && task.status === "completed" && videoUrl ? <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={copy.generator.videoDownload} onClick={(event) => { event.stopPropagation(); void download(task); }}><DownloadIcon data-icon="inline-start" /></Button></TooltipTrigger><TooltipContent>{copy.generator.videoDownload}</TooltipContent></Tooltip> : null}
              </span>
            </div>
          </article>;
        })}
      </div>, taskListTarget) : null}
    </div>
  );
}
