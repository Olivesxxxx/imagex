import { CheckCircle2Icon, Loader2Icon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldGroup, FieldLabel, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedTabsList, SegmentedTabsTrigger } from "@/components/ui/segmented-tabs";
import { Tabs } from "@/components/ui/tabs";
import { type ConnectionStatus } from "@/hooks/use-image-console";
import { DEFAULTS, DEVELOPMENT_FIXTURES_ENABLED, type AppSettings } from "@/lib/image-console";
import { useI18n } from "@/lib/i18n";

export interface SettingsDialogProps {
  settings: AppSettings;
  settingsOpen: boolean;
  endpointPreview: string;
  testConnectionStatus: ConnectionStatus;
  setSettingsOpen: (open: boolean) => void;
  updateSettings: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  saveCurrentSettings: () => void;
  resetSettings: () => void;
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
  resetSettings,
  clearAllData,
  testConnection,
}: SettingsDialogProps) {
  const { copy } = useI18n();
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const protocolView = settings.protocol;

  function handleSettingsOpenChange(open: boolean) {
    setSettingsOpen(open);
  }

  return (
    <>
      <Dialog open={settingsOpen} onOpenChange={handleSettingsOpenChange}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{copy.settings.title}</DialogTitle>
            <DialogDescription>{copy.settings.description}</DialogDescription>
          </DialogHeader>

          <Tabs value={protocolView} onValueChange={(value) => updateSettings("protocol", value as AppSettings["protocol"])}>
            <SegmentedTabsList className="grid w-full grid-cols-2">
              <SegmentedTabsTrigger value="openai">{copy.settings.openAiProtocol}</SegmentedTabsTrigger>
              <SegmentedTabsTrigger value="private">{copy.settings.privateProtocol}</SegmentedTabsTrigger>
            </SegmentedTabsList>
          </Tabs>

          {protocolView === "openai" ? <FieldGroup>
            <Field>
              <FieldLabel htmlFor="baseUrl">{copy.settings.apiUrl}</FieldLabel>
              <Input
                id="baseUrl"
                type="url"
                spellCheck={false}
                autoComplete="url"
                placeholder={DEFAULTS.baseUrl}
                value={settings.baseUrl}
                onChange={(event) => updateSettings("baseUrl", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="apiKey">{copy.settings.apiKey}</FieldLabel>
              <Input
                id="apiKey"
                type="password"
                spellCheck={false}
                autoComplete="off"
                placeholder="api-key"
                value={settings.apiKey}
                onChange={(event) => updateSettings("apiKey", event.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="generationsModel">{copy.settings.generationsModel}</FieldLabel>
                <Input
                  id="generationsModel"
                  type="text"
                  spellCheck={false}
                  value={settings.generationsModel}
                  onChange={(event) => updateSettings("generationsModel", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="editsModel">{copy.settings.editsModel}</FieldLabel>
                <Input
                  id="editsModel"
                  type="text"
                  spellCheck={false}
                  value={settings.editsModel}
                  onChange={(event) => updateSettings("editsModel", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="responsesModel">{copy.settings.responsesModel}</FieldLabel>
                <Input
                  id="responsesModel"
                  type="text"
                  spellCheck={false}
                  value={settings.responsesModel}
                  onChange={(event) => updateSettings("responsesModel", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="completionsModel">{copy.settings.completionsModel}</FieldLabel>
                <Input
                  id="completionsModel"
                  type="text"
                  spellCheck={false}
                  value={settings.completionsModel}
                  onChange={(event) => updateSettings("completionsModel", event.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="requestConcurrency">{copy.settings.concurrency}</FieldLabel>
                <Input
                  id="requestConcurrency"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  value={settings.requestConcurrency}
                  onChange={(event) => updateSettings("requestConcurrency", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="requestIntervalSeconds">{copy.settings.interval}</FieldLabel>
                <Input
                  id="requestIntervalSeconds"
                  type="number"
                  min={0}
                  max={3600}
                  step={1}
                  inputMode="numeric"
                  value={settings.requestIntervalSeconds}
                  onChange={(event) => updateSettings("requestIntervalSeconds", event.target.value)}
                />
              </Field>
            </div>
            <Field orientation="horizontal" className="!items-center">
              <Checkbox
                id="rememberKey"
                checked={settings.rememberKey}
                onCheckedChange={(checked) => updateSettings("rememberKey", checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor="rememberKey">{copy.settings.rememberKey}</FieldLabel>
              </FieldContent>
            </Field>
            {DEVELOPMENT_FIXTURES_ENABLED ? (
              <Field orientation="horizontal" className="!items-start">
                <Checkbox
                  id="developmentMode"
                  checked={settings.developmentMode}
                  onCheckedChange={(checked) => updateSettings("developmentMode", checked === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="developmentMode">{copy.settings.developmentMode}</FieldLabel>
                  <p className="text-xs leading-relaxed text-muted-foreground">{copy.settings.developmentModeDescription}</p>
                </FieldContent>
              </Field>
            ) : null}
            <FieldSet>
              <FieldTitle>{copy.settings.endpointPreview}</FieldTitle>
              <pre className="min-w-0 whitespace-pre-wrap break-all rounded-md border bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                {endpointPreview}
              </pre>
            </FieldSet>
          </FieldGroup> : (
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="privateBaseUrl">{copy.settings.privateBaseUrl}</FieldLabel>
                  <Input id="privateBaseUrl" type="url" spellCheck={false} autoComplete="url" placeholder={DEFAULTS.privateBaseUrl} value={settings.privateBaseUrl} onChange={(event) => updateSettings("privateBaseUrl", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="privateApiKey">{copy.settings.privateApiKey}</FieldLabel>
                  <Input id="privateApiKey" type="password" spellCheck={false} autoComplete="off" placeholder={copy.settings.privateApiKeyPlaceholder} value={settings.privateApiKey} onChange={(event) => updateSettings("privateApiKey", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="privateModel">{copy.settings.privateModel}</FieldLabel>
                  <Input id="privateModel" type="text" spellCheck={false} value={settings.privateModel} onChange={(event) => updateSettings("privateModel", event.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="privateRequestConcurrency">{copy.settings.concurrency}</FieldLabel>
                  <Input id="privateRequestConcurrency" type="number" min={1} max={100} step={1} inputMode="numeric" value={settings.requestConcurrency} onChange={(event) => updateSettings("requestConcurrency", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="privateRequestIntervalSeconds">{copy.settings.interval}</FieldLabel>
                  <Input id="privateRequestIntervalSeconds" type="number" min={0} max={3600} step={1} inputMode="numeric" value={settings.requestIntervalSeconds} onChange={(event) => updateSettings("requestIntervalSeconds", event.target.value)} />
                </Field>
              </div>
              <Field orientation="horizontal" className="!items-center">
                <Checkbox id="privateRememberKey" checked={settings.rememberKey} onCheckedChange={(checked) => updateSettings("rememberKey", checked === true)} />
                <FieldContent><FieldLabel htmlFor="privateRememberKey">{copy.settings.rememberKey}</FieldLabel></FieldContent>
              </Field>
              {DEVELOPMENT_FIXTURES_ENABLED ? (
                <Field orientation="horizontal" className="!items-start">
                  <Checkbox id="privateDevelopmentMode" checked={settings.developmentMode} onCheckedChange={(checked) => updateSettings("developmentMode", checked === true)} />
                  <FieldContent><FieldLabel htmlFor="privateDevelopmentMode">{copy.settings.developmentMode}</FieldLabel><p className="text-xs leading-relaxed text-muted-foreground">{copy.settings.developmentModeDescription}</p></FieldContent>
                </Field>
              ) : null}
              <FieldSet>
                <FieldTitle>{copy.settings.endpointPreview}</FieldTitle>
                <pre className="min-w-0 whitespace-pre-wrap break-all rounded-md border bg-muted p-3 text-xs leading-relaxed text-muted-foreground">{endpointPreview}</pre>
              </FieldSet>
            </FieldGroup>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={resetSettings}>
                <RotateCcwIcon data-icon="inline-start" />
                {copy.settings.reset}
              </Button>
              <Button type="button" variant="destructive" onClick={() => setClearAllConfirmOpen(true)}>
                <Trash2Icon data-icon="inline-start" />
                {copy.settings.clearAllData}
              </Button>
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
                disabled={protocolView !== "openai"}
                onClick={testConnection}
              >
                {testConnectionStatus.tone === "busy" ? (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                ) : (
                  <CheckCircle2Icon data-icon="inline-start" />
                )}
                {testConnectionStatus.label}
              </Button>
              <Button type="button" onClick={saveCurrentSettings}>
                {copy.settings.save}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
