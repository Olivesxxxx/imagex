import { CheckCircle2Icon, Loader2Icon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldGroup, FieldLabel, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type ConnectionStatus } from "@/hooks/use-image-console";
import { DEFAULTS, DEFAULT_OPENAI_PROVIDERS, DEVELOPMENT_FIXTURES_ENABLED, IMAGE_RESPONSE_MODES, MULTI_IMAGE_FIELD_MODES, type AppSettings, type OpenAIProvider } from "@/lib/image-console";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";

export interface SettingsDialogProps {
  settings: AppSettings;
  settingsOpen: boolean;
  endpointPreview: string;
  testConnectionStatus: ConnectionStatus;
  setSettingsOpen: (open: boolean) => void;
  updateSettings: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  saveCurrentSettings: () => void;
  clearAllData: () => void;
  testConnection: () => void;
}

export function SettingsDialog({
  settings,
  settingsOpen,
  endpointPreview,
  testConnectionStatus,
  setSettingsOpen,
  updateSettings,
  saveCurrentSettings,
  clearAllData,
  testConnection,
}: SettingsDialogProps) {
  const { copy } = useI18n();
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [providerDeleteConfirmOpen, setProviderDeleteConfirmOpen] = useState(false);
  const activeProvider = settings.openaiProviders.find((provider) => provider.id === settings.activeOpenAIProviderId) || null;
  const testConfigurationReady = Boolean(
    activeProvider && (
      activeProvider.protocol === "openai"
        ? activeProvider.baseUrl.trim() && activeProvider.apiKey.trim() && activeProvider.generationsModel.trim() && activeProvider.editsModel.trim()
        : activeProvider.geminiBaseUrl.trim() && activeProvider.geminiApiKey.trim() && activeProvider.geminiModel.trim()
    ),
  );

  function updateProviderName(name: string) {
    if (!activeProvider) return;
    updateSettings("openaiProviders", settings.openaiProviders.map((provider) =>
      provider.id === activeProvider.id ? { ...provider, name } : provider,
    ));
  }

  function updateProviderConfig(patch: Partial<OpenAIProvider>) {
    if (!activeProvider) return;
    updateSettings("openaiProviders", settings.openaiProviders.map((provider) =>
      provider.id === activeProvider.id ? { ...provider, ...patch } : provider,
    ));
  }

  function addProvider() {
    const id = `provider-${Date.now()}`;
    const providers: OpenAIProvider[] = [...settings.openaiProviders, {
      id,
      name: copy.settings.provider,
      protocol: "openai",
      baseUrl: "",
      apiKey: "",
      generationsModel: DEFAULTS.generationsModel,
      editsModel: DEFAULTS.editsModel,
      responsesModel: DEFAULTS.responsesModel,
      completionsModel: DEFAULTS.completionsModel,
      privateBaseUrl: DEFAULTS.privateBaseUrl,
      privateApiKey: "",
      privateModel: DEFAULTS.privateModel,
      geminiBaseUrl: DEFAULTS.geminiBaseUrl,
      geminiApiKey: "",
      geminiModel: DEFAULTS.geminiModel,
      imageResponseMode: "auto",
      multiImageField: "auto",
      streamImages: false,
      streamPartialImages: 2,
    }];
    updateSettings("openaiProviders", providers);
    updateSettings("activeOpenAIProviderId", id);
  }

  function deleteProvider() {
    if (!activeProvider) return;
    updateSettings("openaiProviders", settings.openaiProviders.filter((provider) => provider.id !== activeProvider.id));
    setProviderDeleteConfirmOpen(false);
  }

  function selectProvider(provider: OpenAIProvider) {
    if (provider.id === settings.activeOpenAIProviderId) return;
    updateSettings("activeOpenAIProviderId", provider.id);
    toast.success(copy.settings.providerSwitched(provider.name || copy.settings.provider));
  }

  function restoreProviderDefaults() {
    if (!activeProvider) return;
    const builtIn = DEFAULT_OPENAI_PROVIDERS.find((provider) => provider.id === activeProvider.id);
    const fallback: OpenAIProvider = {
      ...activeProvider,
      protocol: "openai",
      baseUrl: "",
      apiKey: "",
      generationsModel: DEFAULTS.generationsModel,
      editsModel: DEFAULTS.editsModel,
      responsesModel: DEFAULTS.responsesModel,
      completionsModel: DEFAULTS.completionsModel,
      privateBaseUrl: DEFAULTS.privateBaseUrl,
      privateApiKey: "",
      privateModel: DEFAULTS.privateModel,
      geminiBaseUrl: DEFAULTS.geminiBaseUrl,
      geminiApiKey: "",
      geminiModel: DEFAULTS.geminiModel,
      imageResponseMode: "auto",
      multiImageField: "auto",
      streamImages: false,
      streamPartialImages: 2,
    };
    updateProviderConfig({ ...(builtIn || fallback), id: activeProvider.id, name: activeProvider.name });
    toast.success(copy.settings.providerDefaultsRestored);
  }

  function handleSettingsOpenChange(open: boolean) {
    setSettingsOpen(open);
  }

  return (
    <>
      <Dialog open={settingsOpen} onOpenChange={handleSettingsOpenChange}>
        <DialogContent className="grid max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{copy.settings.title}</DialogTitle>
            <DialogDescription>{copy.settings.description}</DialogDescription>
          </DialogHeader>
          <div className="standard-scrollbar min-h-0 overflow-y-auto p-6">
            <div className="grid gap-4">
              <div className="grid min-w-0 gap-4 md:grid-cols-[13rem_minmax(0,1fr)] md:items-start">
                <aside className="grid min-w-0 gap-2 rounded-md border bg-muted/20 p-2 md:sticky md:top-0">
                  <FieldTitle className="px-1">{copy.settings.provider}</FieldTitle>
                  <div className="standard-scrollbar grid max-h-44 min-w-0 gap-1 overflow-y-auto pr-1 md:max-h-[32rem]">
                    {settings.openaiProviders.map((provider) => {
                      const selected = provider.id === settings.activeOpenAIProviderId;
                      const protocolLabel = provider.protocol === "gemini" ? copy.settings.geminiProtocol : copy.settings.openAiProtocol;
                      const address = provider.protocol === "gemini" ? provider.geminiBaseUrl : provider.baseUrl;
                      const protocolAccent = provider.protocol === "gemini" ? "border-l-emerald-500" : "border-l-neutral-900";
                      return (
                        <Button key={provider.id} type="button" variant={selected ? "default" : "ghost"} size="sm" className={`h-auto min-w-0 justify-start border-l-4 px-2 py-2 text-left ${protocolAccent}`} aria-pressed={selected} onClick={() => selectProvider(provider)}>
                          <span className="grid min-w-0 gap-0.5">
                            <span className="truncate font-medium">{provider.name || copy.settings.provider}</span>
                            <span className={`truncate text-xs ${selected ? "text-background/70" : "text-muted-foreground"}`}>{protocolLabel} · {address || copy.settings.apiUrl}</span>
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="w-full justify-center" onClick={addProvider}><PlusIcon data-icon="inline-start" />{copy.settings.addProvider}</Button>
                </aside>

                {activeProvider ? (
                  <FieldGroup className="min-w-0 rounded-md border p-4">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-sm font-medium">{activeProvider.name || copy.settings.provider}</div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={restoreProviderDefaults}><RotateCcwIcon data-icon="inline-start" />{copy.settings.restoreProviderDefaults}</Button>
                        <Button type="button" variant="destructive" size="sm" onClick={() => setProviderDeleteConfirmOpen(true)}><Trash2Icon data-icon="inline-start" />{copy.settings.deleteProvider}</Button>
                      </div>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="providerProtocol">{copy.settings.providerProtocol}</FieldLabel>
                      <Select value={activeProvider.protocol} onValueChange={(value) => updateProviderConfig({ protocol: value as AppSettings["protocol"] })}>
                        <SelectTrigger id="providerProtocol" aria-label={copy.settings.providerProtocol}><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="openai">{copy.settings.openAiProtocol}</SelectItem><SelectItem value="gemini">{copy.settings.geminiProtocol}</SelectItem></SelectContent>
                      </Select>
                    </Field>
                    <Field><FieldLabel htmlFor="providerName">{copy.settings.providerName}</FieldLabel><Input id="providerName" value={activeProvider.name} onChange={(event) => updateProviderName(event.target.value)} /></Field>

                    {activeProvider.protocol === "openai" ? (
                      <>
                        <Field><FieldLabel htmlFor="baseUrl">{copy.settings.apiUrl}</FieldLabel><Input id="baseUrl" type="url" spellCheck={false} autoComplete="url" placeholder={DEFAULTS.baseUrl} value={activeProvider.baseUrl} onChange={(event) => updateProviderConfig({ baseUrl: event.target.value })} /></Field>
                        <Field><FieldLabel htmlFor="apiKey">{copy.settings.apiKey}</FieldLabel><Input id="apiKey" type="password" spellCheck={false} autoComplete="off" placeholder="api-key" value={activeProvider.apiKey} onChange={(event) => updateProviderConfig({ apiKey: event.target.value })} /></Field>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Field><FieldLabel htmlFor="generationsModel">{copy.settings.generationsModel}</FieldLabel><Input id="generationsModel" value={activeProvider.generationsModel} onChange={(event) => updateProviderConfig({ generationsModel: event.target.value })} /></Field>
                          <Field><FieldLabel htmlFor="editsModel">{copy.settings.editsModel}</FieldLabel><Input id="editsModel" value={activeProvider.editsModel} onChange={(event) => updateProviderConfig({ editsModel: event.target.value })} /></Field>
                        </div>
                        <Field orientation="horizontal" className="!items-center"><Checkbox id="streamImages" checked={activeProvider.streamImages} onCheckedChange={(checked) => updateProviderConfig({ streamImages: checked === true })} /><FieldContent><FieldLabel htmlFor="streamImages">流式生成中间图</FieldLabel><p className="text-xs text-muted-foreground">供应商支持时保持连接并接收 partial_images。</p></FieldContent></Field>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Field>
                            <FieldLabel htmlFor="imageResponseMode">{copy.settings.imageResponseMode}</FieldLabel>
                            <Select value={activeProvider.imageResponseMode} onValueChange={(value) => updateProviderConfig({ imageResponseMode: value as OpenAIProvider["imageResponseMode"] })}><SelectTrigger id="imageResponseMode" aria-label={copy.settings.imageResponseMode}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={IMAGE_RESPONSE_MODES[0]}>{copy.settings.imageResponseModeAuto}</SelectItem><SelectItem value={IMAGE_RESPONSE_MODES[1]}>{copy.settings.imageResponseModeBase64}</SelectItem><SelectItem value={IMAGE_RESPONSE_MODES[2]}>{copy.settings.imageResponseModeUrl}</SelectItem></SelectContent></Select>
                            <p className="text-xs leading-relaxed text-muted-foreground">{copy.settings.imageResponseModeDescription}</p>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="multiImageField">{copy.settings.multiImageField}</FieldLabel>
                            <Select value={activeProvider.multiImageField} onValueChange={(value) => updateProviderConfig({ multiImageField: value as OpenAIProvider["multiImageField"] })}><SelectTrigger id="multiImageField" aria-label={copy.settings.multiImageField}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={MULTI_IMAGE_FIELD_MODES[0]}>{copy.settings.multiImageFieldAuto}</SelectItem><SelectItem value={MULTI_IMAGE_FIELD_MODES[1]}>{copy.settings.multiImageFieldRepeated}</SelectItem><SelectItem value={MULTI_IMAGE_FIELD_MODES[2]}>{copy.settings.multiImageFieldArray}</SelectItem></SelectContent></Select>
                            <p className="text-xs leading-relaxed text-muted-foreground">{copy.settings.multiImageFieldDescription}</p>
                          </Field>
                        </div>
                      </>
                    ) : (
                      <>
                        <Field><FieldLabel htmlFor="geminiBaseUrl">{copy.settings.geminiBaseUrl}</FieldLabel><Input id="geminiBaseUrl" type="url" spellCheck={false} autoComplete="url" placeholder={DEFAULTS.geminiBaseUrl} value={activeProvider.geminiBaseUrl} onChange={(event) => updateProviderConfig({ geminiBaseUrl: event.target.value })} /></Field>
                        <Field><FieldLabel htmlFor="geminiApiKey">{copy.settings.geminiApiKey}</FieldLabel><Input id="geminiApiKey" type="password" spellCheck={false} autoComplete="off" placeholder="AIza..." value={activeProvider.geminiApiKey} onChange={(event) => updateProviderConfig({ geminiApiKey: event.target.value })} /></Field>
                        <Field><FieldLabel htmlFor="geminiModel">{copy.settings.geminiModel}</FieldLabel><Input id="geminiModel" value={activeProvider.geminiModel} onChange={(event) => updateProviderConfig({ geminiModel: event.target.value })} /></Field>
                      </>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="requestConcurrency">{copy.settings.concurrency}</FieldLabel><Input id="requestConcurrency" type="number" min={1} max={100} step={1} inputMode="numeric" value={settings.requestConcurrency} onChange={(event) => updateSettings("requestConcurrency", event.target.value)} /></Field><Field><FieldLabel htmlFor="requestIntervalSeconds">{copy.settings.interval}</FieldLabel><Input id="requestIntervalSeconds" type="number" min={0} max={3600} step={1} inputMode="numeric" value={settings.requestIntervalSeconds} onChange={(event) => updateSettings("requestIntervalSeconds", event.target.value)} /></Field></div>
                    <Field orientation="horizontal" className="!items-center"><Checkbox id="rememberKey" checked={settings.rememberKey} onCheckedChange={(checked) => updateSettings("rememberKey", checked === true)} /><FieldContent><FieldLabel htmlFor="rememberKey">{copy.settings.rememberKey}</FieldLabel></FieldContent></Field>
                    <FieldSet><FieldTitle>{copy.settings.endpointPreview}</FieldTitle><pre className="min-w-0 whitespace-pre-wrap break-all rounded-md border bg-muted p-3 text-xs leading-relaxed text-muted-foreground">{endpointPreview}</pre></FieldSet>
                  </FieldGroup>
                ) : (
                  <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-md border border-dashed p-6 text-center"><p className="text-sm text-muted-foreground">{copy.settings.noProviders}</p><Button type="button" variant="outline" size="sm" onClick={addProvider}><PlusIcon data-icon="inline-start" />{copy.settings.addProvider}</Button></div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t bg-background px-6 py-4 gap-2 sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="destructive" onClick={() => setClearAllConfirmOpen(true)}>
                <Trash2Icon data-icon="inline-start" />
                {copy.settings.clearAllData}
              </Button>
              {DEVELOPMENT_FIXTURES_ENABLED ? <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"><Checkbox id="developmentMode" checked={settings.developmentMode} onCheckedChange={(checked) => updateSettings("developmentMode", checked === true)} /><span>{copy.settings.developmentMode}</span></label> : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant={
                  testConnectionStatus.tone === "ok"
                    ? "secondary"
                    : testConnectionStatus.tone === "error"
                      ? "destructive"
                      : "outline"
                }
                className="w-28 justify-center"
                disabled={!testConfigurationReady || testConnectionStatus.tone === "busy"}
                onClick={() => void testConnection()}
              >
                {testConnectionStatus.tone === "busy" ? (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                ) : (
                  <CheckCircle2Icon data-icon="inline-start" />
                )}
                {testConnectionStatus.label}
              </Button>
              <Button type="button" onClick={() => { saveCurrentSettings(); if (testConfigurationReady) window.setTimeout(() => void testConnection(), 0); }}>
                {copy.settings.save}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={providerDeleteConfirmOpen} onOpenChange={setProviderDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.settings.deleteProviderTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.settings.deleteProviderDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.clearDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20"
              onClick={deleteProvider}
            >
              {copy.settings.confirmDeleteProvider}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={clearAllConfirmOpen} onOpenChange={setClearAllConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.settings.clearAllDataTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.settings.clearAllDataDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.clearDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20"
              onClick={() => {
                clearAllData();
                setClearAllConfirmOpen(false);
              }}
            >
              {copy.settings.clearAllDataConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
