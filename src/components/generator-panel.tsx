import {
  CheckIcon,
  CircleHelpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  ImagePlusIcon,
  LanguagesIcon,
  Loader2Icon,
  MessageSquareIcon,
  PencilIcon,
  PinIcon,
  PlayIcon,
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
  SettingsIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedTabsList, SegmentedTabsTrigger } from "@/components/ui/segmented-tabs";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ConnectionStatus } from "@/hooks/use-image-console";
import { useTimedConfirmation } from "@/hooks/use-timed-confirmation";
import {
  MAX_EDIT_INPUT_IMAGES,
  MAX_IMAGE_COUNT,
  QUALITY_OPTIONS,
  SIZE_OPTION_GROUPS,
  sizeOptionDisplayLabel,
  type AppSettings,
  type ConsoleMode,
  type EditInputImage,
} from "@/lib/image-console";
import { useI18n } from "@/lib/i18n";
import { MAX_PROMPT_HISTORY, type PromptHistoryEntry } from "@/lib/prompt-history";
import { cn } from "@/lib/utils";

const DELETE_CONFIRMATION_TIMEOUT_MS = 3000;
const panelControlClassName = "!h-8 !min-h-8 !max-h-8 !py-1 w-full min-w-0 justify-center rounded-md border border-border px-3 text-xs font-medium";
const panelLabelClassName = "flex h-4 min-h-4 items-center text-xs font-medium leading-none text-muted-foreground";
const panelIconButtonClassName = "!h-8 !min-h-8 !max-h-8 !w-8 !min-w-8 !px-0 rounded-md";
const SIZE_GROUPS = [
  { key: "square", icon: SquareIcon, options: SIZE_OPTION_GROUPS.square },
  { key: "landscape", icon: RectangleHorizontalIcon, options: SIZE_OPTION_GROUPS.landscape },
  { key: "portrait", icon: RectangleVerticalIcon, options: SIZE_OPTION_GROUPS.portrait },
] as const;

interface HistoricalEditImageOption {
  value: string;
  label: string;
  thumbnail: { src: string } | null;
}

export interface GeneratorPanelProps {
  mode: ConsoleMode;
  editImages: EditInputImage[];
  historicalEditImageValue: string;
  historicalEditImageOptions: HistoricalEditImageOption[];
  settings: AppSettings;
  prompt: string;
  connectionStatus: ConnectionStatus;
  promptFocusSignal: number;
  setPrompt: (value: string) => void;
  setEditImages: Dispatch<SetStateAction<EditInputImage[]>>;
  updateSettings: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  setSettingsOpen: (open: boolean) => void;
  enqueueGeneration: (generationMode: "images" | "responses" | "completions") => boolean;
  enqueueEditGeneration: () => boolean;
  isGenerating: boolean;
  onCancelGeneration: () => void;
  addHistoricalEditImage: (value: string) => Promise<void>;
  onModeChange: (mode: ConsoleMode) => void;
  onOpenStrictPromptEditor: () => void;
}

function clampRequestCountInput(value: unknown) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) return 1;
  return Math.min(MAX_IMAGE_COUNT, Math.max(1, parsed));
}

function OptionSelect({
  label,
  value,
  options,
  optionLabels,
  onValueChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  optionLabels?: Readonly<Record<string, string>>;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className={panelLabelClassName}>{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger size="sm" className={panelControlClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {optionLabels?.[option] ?? option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function SizeSelect({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const { copy } = useI18n();

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className={panelLabelClassName}>{copy.generator.size}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger size="sm" className={panelControlClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{copy.generator.auto}</SelectItem>
          <SelectSeparator />
          {SIZE_GROUPS.map((group) => (
            <SelectGroup key={group.key}>
              <SelectLabel className="flex items-center gap-1.5">
                <group.icon aria-hidden="true" className="size-3.5 shrink-0" />
                <span>{copy.generator.sizeGroups[group.key]}</span>
              </SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {sizeOptionDisplayLabel(option)}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function PromptHistoryPanel({
  promptHistory,
  promptHistoryCount,
  promptHistoryPinnedCount,
  onSelectPrompt,
  onDeletePrompt,
  onTogglePromptPin,
}: {
  promptHistory: PromptHistoryEntry[];
  promptHistoryCount: number;
  promptHistoryPinnedCount: number;
  onSelectPrompt: (value: string) => void;
  onDeletePrompt: (value: string) => void;
  onTogglePromptPin: (value: string) => void;
}) {
  const { copy } = useI18n();
  const { pendingKey: pendingDeletePrompt, requestConfirmation } = useTimedConfirmation(DELETE_CONFIRMATION_TIMEOUT_MS);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2" aria-label={copy.promptHistory.title}>
      <div className="flex items-center justify-between gap-2">
        <div className={panelLabelClassName}>{copy.promptHistory.title}</div>
        <span className={cn(panelLabelClassName, "shrink-0 tabular-nums") }>
          {promptHistoryCount}/{MAX_PROMPT_HISTORY}
          {promptHistoryPinnedCount ? ` · ${promptHistoryPinnedCount} ${copy.promptHistory.pinned}` : ""}
        </span>
      </div>

      {promptHistory.length ? (
        <ScrollArea className="min-h-0 flex-1 rounded-md border">
          <div className="flex w-full min-w-0 flex-col">
            {promptHistory.map((item) => (
              <div
                key={item.prompt}
                className="grid w-full max-w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 overflow-hidden border-b last:border-b-0"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full min-w-0 cursor-pointer items-center overflow-hidden px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
                      onClick={() => onSelectPrompt(item.prompt)}
                    >
                      <span className="block min-w-0 flex-1 truncate">{item.prompt}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" sideOffset={8} className="whitespace-pre-wrap break-words text-left">
                    {item.prompt}
                  </TooltipContent>
                </Tooltip>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={cn("shrink-0", item.pinned ? "text-primary" : "text-muted-foreground")}
                  aria-pressed={item.pinned}
                  aria-label={item.pinned ? `${copy.promptHistory.unpin}：${item.prompt}` : `${copy.promptHistory.pin} ${copy.promptHistory.title}：${item.prompt}`}
                  title={item.pinned ? copy.promptHistory.unpin : copy.promptHistory.pin}
                  onClick={() => onTogglePromptPin(item.prompt)}
                >
                  <PinIcon fill={item.pinned ? "currentColor" : "none"} data-icon="inline-start" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={cn(
                    "mr-1 shrink-0",
                    pendingDeletePrompt === item.prompt && "text-destructive hover:text-destructive",
                  )}
                  aria-label={
                    pendingDeletePrompt === item.prompt
                      ? `${copy.promptHistory.confirmDelete} ${copy.promptHistory.title}: ${item.prompt}`
                      : `${copy.promptHistory.delete} ${copy.promptHistory.title}: ${item.prompt}`
                  }
                  onClick={() => {
                    if (!requestConfirmation(item.prompt)) return;
                    onDeletePrompt(item.prompt);
                  }}
                >
                  {pendingDeletePrompt === item.prompt ? (
                    <CheckIcon data-icon="inline-start" />
                  ) : (
                    <Trash2Icon data-icon="inline-start" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="h-12 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {copy.promptHistory.empty}
        </div>
      )}
    </section>
  );
}

export function GeneratorPanel({
  mode,
  editImages,
  historicalEditImageValue,
  historicalEditImageOptions,
  settings,
  prompt,
  connectionStatus,
  promptFocusSignal,
  setPrompt,
  setEditImages,
  updateSettings,
  setSettingsOpen,
  enqueueGeneration,
  enqueueEditGeneration,
  isGenerating,
  onCancelGeneration,
  addHistoricalEditImage,
  onModeChange,
  onOpenStrictPromptEditor,
}: GeneratorPanelProps) {
  const { copy, toggleLanguage } = useI18n();
  const editImagesInputRef = useRef<HTMLInputElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [previewEditImageIndex, setPreviewEditImageIndex] = useState<number | null>(null);
  const [actionHelpOpen, setActionHelpOpen] = useState(false);
  const generationButtonFeedbackClassName = "transition-all duration-100 active:translate-y-px active:scale-[0.99] active:brightness-95";
  const editImageSelectionFull = editImages.length >= MAX_EDIT_INPUT_IMAGES;
  const previewEditImage = previewEditImageIndex !== null ? editImages[previewEditImageIndex] ?? null : null;

  useEffect(() => {
    if (previewEditImageIndex !== null && !editImages[previewEditImageIndex]) {
      setPreviewEditImageIndex(null);
    }
  }, [editImages, previewEditImageIndex]);

  useEffect(() => {
    if (previewEditImageIndex === null) return;
    function handlePreviewKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPreviewEditImageIndex((current) =>
          current === null ? current : (current - 1 + editImages.length) % editImages.length,
        );
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setPreviewEditImageIndex((current) =>
          current === null ? current : (current + 1) % editImages.length,
        );
      }
    }
    window.addEventListener("keydown", handlePreviewKeyDown);
    return () => window.removeEventListener("keydown", handlePreviewKeyDown);
  }, [editImages.length, previewEditImageIndex]);

  useEffect(() => {
    if (promptFocusSignal <= 0) return;

    const timeoutId = window.setTimeout(() => {
      promptTextareaRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [promptFocusSignal]);

  function submitGeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "edit") {
      enqueueEditGeneration();
      return;
    }

    enqueueGeneration("images");
  }

  function addEditImageFiles(files: File[]) {
    if (!files.length) return 0;

    const remainingSlots = Math.max(0, MAX_EDIT_INPUT_IMAGES - editImages.length);
    if (files.length > remainingSlots) {
      toast.error(copy.generator.maxEditImages(MAX_EDIT_INPUT_IMAGES));
    }

    const nextImages: EditInputImage[] = files.slice(0, remainingSlots).map((file) => ({
      src: URL.createObjectURL(file),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      file,
    }));

    if (nextImages.length) {
      setEditImages((current) => [...current, ...nextImages].slice(0, MAX_EDIT_INPUT_IMAGES));
    }
    return nextImages.length;
  }

  function handleEditImagesChange(event: ChangeEvent<HTMLInputElement>) {
    addEditImageFiles(Array.from(event.currentTarget.files || []));
    event.currentTarget.value = "";
  }

  function handlePromptPaste(event: ClipboardEvent<HTMLElement>) {
    if (mode !== "edit") return;
    const items = event.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (!imageFiles.length) return;
    event.preventDefault();
    addEditImageFiles(imageFiles);
  }

  function handleModeChange(value: string) {
    onModeChange(value as ConsoleMode);
  }

  return (
    <form noValidate onSubmit={submitGeneration} className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-none">
      <div className="grid shrink-0 gap-3 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-1">
          <span className={panelLabelClassName}>{copy.generator.mode}</span>
          <div className="flex items-center gap-2">
            <Tabs value={mode} onValueChange={handleModeChange}>
              <SegmentedTabsList>
                {([ ["generate", copy.generator.generate], ["edit", copy.generator.edit] ] as const).map(([value, label]) => (
                  <SegmentedTabsTrigger
                    key={value}
                    value={value}
                    className="min-w-20 flex-none"
                  >
                    {label}
                  </SegmentedTabsTrigger>
                ))}
              </SegmentedTabsList>
            </Tabs>
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="outline" size="icon-sm" className={panelIconButtonClassName} onClick={toggleLanguage} aria-label={copy.switchLanguageTooltip}>
                    <LanguagesIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copy.switchLanguageTooltip}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className={panelIconButtonClassName}
                    onClick={() => setActionHelpOpen(true)}
                    aria-label={copy.generator.actionHelp.buttonLabel}
                  >
                    <CircleHelpIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copy.generator.actionHelp.buttonLabel}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={connectionStatus.tone === "ok" ? "secondary" : connectionStatus.tone === "error" ? "destructive" : "outline"}
                    size="icon-sm"
                    className={panelIconButtonClassName}
                    onClick={() => setSettingsOpen(true)}
                    aria-label={copy.generator.settingsTooltip}
                    title={copy.generator.settingsTooltip}
                  >
                    {connectionStatus.tone === "busy" ? <Loader2Icon className="animate-spin" /> : <SettingsIcon />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copy.generator.settingsTooltip}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
          <SizeSelect value={String(settings.size)} onValueChange={(value) => updateSettings("size", value as AppSettings["size"])} />
          <OptionSelect
            label={copy.generator.quality}
            value={String(settings.quality)}
            options={QUALITY_OPTIONS}
            optionLabels={copy.generator.qualityOptions}
            onValueChange={(value) => updateSettings("quality", value as AppSettings["quality"])}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor="n" className={panelLabelClassName}>{copy.generator.count}</label>
            <Input id="n" name="n" type="number" min={1} max={100} step={1} inputMode="numeric" value={settings.n} onChange={(event) => updateSettings("n", event.target.value)} onBlur={(event) => updateSettings("n", clampRequestCountInput(event.target.value))} className={cn(panelControlClassName, "bg-transparent text-center")} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={panelLabelClassName}>{copy.generator.keepOriginalPrompt}</span>
            <label htmlFor="strictPrompt" className={cn(panelControlClassName, "flex cursor-pointer items-center gap-2 px-2.5")}>
              <Checkbox id="strictPrompt" checked={settings.strictPrompt} onCheckedChange={(checked) => updateSettings("strictPrompt", checked === true)} />
              <span className="min-w-0 truncate">{copy.generator.keep}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-xs" className="ml-auto shrink-0" aria-label={copy.generator.editOriginalPromptTooltip} onClick={onOpenStrictPromptEditor}>
                    <PencilIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copy.generator.editOriginalPromptTooltip}</TooltipContent>
              </Tooltip>
            </label>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "min-h-0 flex-1",
          mode === "edit"
            ? "grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.44fr)]"
            : "flex flex-col",
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="prompt" className={panelLabelClassName}>{copy.generator.promptLabel}</label>
          <Textarea id="prompt" name="prompt" ref={promptTextareaRef} rows={4} maxLength={32000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={mode === "edit" ? copy.generator.editPromptPlaceholder : copy.generator.promptPlaceholder} required className="min-h-32 flex-1 resize-none overflow-y-auto" />
        </div>

        {mode === "edit" ? (
          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <div className="grid shrink-0 grid-cols-2 gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor="editImages" className={panelLabelClassName}>{copy.generator.selectLocalImage}</label>
                <button type="button" className={cn(panelControlClassName, "flex cursor-pointer items-center justify-between gap-2 text-muted-foreground")} disabled={editImageSelectionFull} onClick={() => editImagesInputRef.current?.click()}>
                  <span className="min-w-0 truncate text-left">{copy.generator.choose}</span>
                  <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
                </button>
                <Input id="editImages" ref={editImagesInputRef} type="file" accept="image/*" multiple disabled={editImageSelectionFull} onChange={handleEditImagesChange} className="hidden" />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor="historicalEditImages" className={panelLabelClassName}>{copy.generator.selectHistoricalImage}</label>
                <Select value={historicalEditImageValue} onValueChange={(value) => { void addHistoricalEditImage(value); }}>
                  <SelectTrigger id="historicalEditImages" size="sm" className={cn(panelControlClassName, "text-muted-foreground")} disabled={!historicalEditImageOptions.length || editImageSelectionFull}>
                    <SelectValue placeholder={copy.generator.choose} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {historicalEditImageOptions.length ? historicalEditImageOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="min-h-14 items-center py-2 pr-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="flex size-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted/30">
                              {option.thumbnail?.src ? <img src={option.thumbnail.src} alt="" aria-hidden="true" className="h-full w-full object-cover object-center" /> : <span className="flex h-full w-full items-center justify-center text-muted-foreground"><ImageIcon className="size-4" /></span>}
                            </span>
                            <span className="min-w-0 truncate">{option.label}</span>
                          </span>
                        </SelectItem>
                      )) : <SelectItem value="__empty" disabled>{copy.generator.noHistoricalImages}</SelectItem>}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-md border border-dashed bg-muted/10 p-2" role="region" aria-label={copy.generator.pasteImageHint} tabIndex={0} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.focus(); }} onPaste={handlePromptPaste}>
              {editImages.length ? (
                <div className="grid min-h-0 grid-cols-5 gap-2 overflow-hidden" data-testid="edit-image-preview-strip">
                  {editImages.map((image, index) => (
                    <div key={`${image.sourceKey || image.name}-${index}`} className="relative aspect-square min-w-0 overflow-hidden rounded-md border border-border bg-muted/30">
                      <button type="button" className="block h-full w-full cursor-zoom-in" aria-label={`${copy.generator.previewInputImage} ${index + 1}`} onClick={() => setPreviewEditImageIndex(index)}>
                        <img src={image.src} alt="" aria-hidden="true" className="block h-full w-full object-cover object-center" />
                      </button>
                      <Button type="button" variant="secondary" size="icon-xs" className="absolute right-1 top-1 rounded-full bg-background/90 shadow-none" aria-label={`${copy.historyImage.deleteButton} ${index + 1}`} onClick={() => setEditImages((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
                        <XIcon />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-24 flex-1 items-center justify-center px-3 py-2 text-center text-xs text-muted-foreground">{copy.generator.pasteImageHint}</div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-1">
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {isGenerating ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className={cn(panelControlClassName, generationButtonFeedbackClassName, "!w-fit !min-w-20 px-3")}
              onClick={onCancelGeneration}
            >
              <SquareIcon data-icon="inline-start" />
              {copy.generator.cancelGeneration}
            </Button>
          ) : null}
          {mode === "edit" ? (
            <Button type="submit" size="sm" className={cn(panelControlClassName, generationButtonFeedbackClassName, "!w-fit !min-w-20 px-3")}>
              <ImagePlusIcon data-icon="inline-start" />
              {copy.generator.edits}
            </Button>
          ) : (
            <>
              <Button type="submit" size="sm" className={cn(panelControlClassName, generationButtonFeedbackClassName, "!w-fit !min-w-20 px-3")}>
                <PlayIcon data-icon="inline-start" />
                {copy.generator.generations}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn(panelControlClassName, generationButtonFeedbackClassName, "!w-fit !min-w-20 px-3")}
                onClick={() => enqueueGeneration("responses")}
              >
                <ImageIcon data-icon="inline-start" />
                {copy.generator.responses}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(panelControlClassName, generationButtonFeedbackClassName, "!w-fit !min-w-20 px-3")}
                onClick={() => enqueueGeneration("completions")}
              >
                <MessageSquareIcon data-icon="inline-start" />
                {copy.generator.completions}
              </Button>
            </>
          )}
        </div>
      </div>
      <Dialog open={actionHelpOpen} onOpenChange={setActionHelpOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy.generator.actionHelp.title}</DialogTitle>
            <DialogDescription>{copy.generator.actionHelp.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold">{copy.generator.actionHelp.generateMode}</h3>
              <div className="grid gap-3 text-sm">
                <div>
                  <p className="font-medium">{copy.generator.generations}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{copy.generator.actionHelp.generationsDescription}</p>
                </div>
                <div>
                  <p className="font-medium">{copy.generator.responses}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{copy.generator.actionHelp.responsesDescription}</p>
                </div>
                <div>
                  <p className="font-medium">{copy.generator.completions}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{copy.generator.actionHelp.completionsDescription}</p>
                </div>
              </div>
            </section>
            <section className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold">{copy.generator.actionHelp.editMode}</h3>
              <div className="text-sm">
                <p className="font-medium">{copy.generator.edits}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{copy.generator.actionHelp.editsDescription}</p>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
      <DialogPrimitive.Root open={previewEditImageIndex !== null} onOpenChange={(open) => { if (!open) setPreviewEditImageIndex(null); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onClick={() => setPreviewEditImageIndex(null)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.stopPropagation();
              }
            }}
            className="fixed inset-0 z-50 flex items-center justify-center outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-200"
          >
            <DialogPrimitive.Title className="sr-only">{copy.generator.previewInputImage}</DialogPrimitive.Title>
            {previewEditImage ? (
              <img
                src={previewEditImage.src}
                alt={copy.generator.previewInputImage}
                className="block max-h-[85vh] w-auto max-w-[calc(100vw-7rem)] object-contain"
                onClick={(event) => event.stopPropagation()}
              />
            ) : null}
            {editImages.length > 1 ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/85 shadow-sm backdrop-blur"
                  aria-label={copy.generator.previewPreviousImage}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreviewEditImageIndex((current) => (current === null ? current : (current - 1 + editImages.length) % editImages.length));
                  }}
                >
                  <ChevronLeftIcon data-icon="inline-start" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/85 shadow-sm backdrop-blur"
                  aria-label={copy.generator.previewNextImage}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPreviewEditImageIndex((current) => (current === null ? current : (current + 1) % editImages.length));
                  }}
                >
                  <ChevronRightIcon data-icon="inline-start" />
                </Button>
              </>
            ) : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </form>
  );
}
