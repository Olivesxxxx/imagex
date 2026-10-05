import { DownloadIcon, Loader2Icon, PlayIcon, SquareIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createVideoTask, delayVideoPoll, loadVideoBlob, pollVideoTask, saveVideoBlob, type VideoDuration, type VideoRequestOptions, type VideoSize, type VideoTask } from "@/lib/video";
import type { AppSettings } from "@/lib/image-console";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

const VIDEO_TASKS_KEY = "ImageX-video-tasks";
const POLL_INTERVAL_MS = 2500;

function readTasks(): VideoTask[] {
  try {
    const value = JSON.parse(localStorage.getItem(VIDEO_TASKS_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string") : [];
  } catch {
    return [];
  }
}

function saveTasks(tasks: VideoTask[]) {
  try {
    localStorage.setItem(VIDEO_TASKS_KEY, JSON.stringify(tasks));
  } catch {
    toast.error("Unable to save video task history in this browser.");
  }
}

export function VideoGenerationPanel({ settings, duration, size }: { settings: AppSettings; duration: VideoDuration; size: VideoSize }) {
  const { copy, language } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [tasks, setTasks] = useState<VideoTask[]>(readTasks);
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set());
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [taskListTarget, setTaskListTarget] = useState<HTMLElement | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const mediaUrlsRef = useRef(mediaUrls);
  const provider = settings.openaiProviders.find((item) => item.id === settings.activeOpenAIProviderId);
  const isOpenAI = settings.protocol === "openai";
  const baseUrl = settings.baseUrl;
  const apiKey = settings.apiKey;
  const model = provider?.videoModel.trim() || "";
  const canSubmit = Boolean(prompt.trim() && model && apiKey && baseUrl && isOpenAI);
  const modelMissing = !model;
  const orderedTasks = useMemo(() => [...tasks].sort((a, b) => b.createdAt - a.createdAt), [tasks]);

  useEffect(() => {
    setTaskListTarget(document.getElementById("video-task-list"));
  }, []);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  useEffect(() => { mediaUrlsRef.current = mediaUrls; }, [mediaUrls]);

  useEffect(() => () => {
    for (const controller of controllers.current.values()) controller.abort();
    Object.values(mediaUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
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
    let current = task;
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
        await delayVideoPoll(POLL_INTERVAL_MS, controller.signal);
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
      size,
      authHeaderName: provider?.authHeaderName,
      authPrefix: provider?.authPrefix,
    };
    try {
      const task = await createVideoTask(config, provider?.id);
      setTasks((items) => [task, ...items]);
      setPrompt("");
    } catch (error) {
      toast.error((error as Error).message);
    }
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
        size: task.size,
        authHeaderName: taskProvider.authHeaderName,
        authPrefix: taskProvider.authPrefix,
      };
      void runPolling(task, options);
    }
  }, [tasks, activeIds, settings.openaiProviders]);

  function stop(task: VideoTask) {
    controllers.current.get(task.id)?.abort();
  }

  function download(task: VideoTask) {
    const url = mediaUrls[task.id] || task.url;
    if (!url) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `imagex-video-${task.id}.mp4`;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.click();
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <label className="flex min-h-32 min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="videoPrompt">
        {copy.generator.promptLabel}
        <Textarea id="videoPrompt" value={prompt} maxLength={16000} onChange={(event) => setPrompt(event.target.value)} placeholder={copy.generator.videoPromptPlaceholder} className="standard-scrollbar min-h-24 flex-1 resize-none overflow-y-auto" />
      </label>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-1">
        <Button type="button" size="sm" className="!h-8 !min-h-8 !max-h-8 rounded-md px-3 text-xs" onClick={() => void submit()} disabled={!canSubmit}><PlayIcon data-icon="inline-start" />{modelMissing ? copy.generator.videoModelRequired : copy.generator.videoSubmit}</Button>
      </div>
      {taskListTarget ? createPortal(<div className="flex min-w-0 flex-col gap-1">
        {!orderedTasks.length ? <p className="px-1 py-1.5 text-xs text-muted-foreground">{copy.generator.videoNoTasks}</p> : null}
        {orderedTasks.map((task) => {
          const videoUrl = mediaUrls[task.id] || task.url;
          const active = activeIds.has(task.id);
          return <article key={task.id} className="flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-background px-2.5 py-2 text-left">
            <div className="flex min-w-0 items-center gap-2">
              <strong className="min-w-0 truncate text-sm">{copy.generator.videoStatus[task.status]}</strong>
              {active ? <Loader2Icon className="size-3.5 shrink-0 animate-spin" /> : null}
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{task.duration}s · {task.size}</span>
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">{task.prompt}</p>
            <span className="truncate text-xs text-muted-foreground">{task.model}</span>
            {task.error ? <p className="break-words text-xs text-destructive">{task.error}</p> : null}
            {task.status === "completed" && videoUrl ? <video className="mt-1 max-h-64 w-full rounded-md bg-black" src={videoUrl} controls playsInline preload="metadata" /> : null}
            {active || task.status === "completed" && videoUrl ? <div className="flex justify-end gap-1">
              {active ? <Button type="button" variant="outline" size="sm" className="!h-8 !min-h-8 !max-h-8 rounded-md px-3 text-xs" onClick={() => stop(task)}><SquareIcon data-icon="inline-start" />{copy.generator.videoCancel}</Button> : null}
              {task.status === "completed" && videoUrl ? <Button type="button" variant="outline" size="sm" className="!h-8 !min-h-8 !max-h-8 rounded-md px-3 text-xs" onClick={() => download(task)}><DownloadIcon data-icon="inline-start" />{copy.generator.videoDownload}</Button> : null}
            </div> : null}
          </article>;
        })}
      </div>, taskListTarget) : null}
    </div>
  );
}
