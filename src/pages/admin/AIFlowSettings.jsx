import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Sparkles,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Music,
  AudioLines,
  Languages,
  Loader2,
  Check,
  AlertCircle,
  ShieldAlert,
  Info,
} from "lucide-react";
import { cn } from "@/lib/coreUtils";

/**
 * AIFlow Settings (admin)
 * -----------------------
 * Lets the app's ADMIN edit each AIFlow module's system prompt and per-feature
 * default model at runtime via the AIFlow SDK admin API (@devvibex/aiflow).
 *
 * The AIFlow client(s) live in the generated `src/lib/aiflow.js`, which is NOT
 * present in this base scaffold — it is emitted per app by the generation
 * template. To keep the base build green we import it lazily/defensively; when
 * it is unavailable we render the "not enabled" empty state instead of crashing.
 *
 * SDK admin contract (v1.6.0):
 *   client.setAdminToken(token: string | null)
 *   client.admin.listModules() -> { modules: [{ appId, moduleId, feature,
 *       useCase, useCaseName, title, systemPrompt,
 *       defaults: { [feature]: modelId }, models: string[] }] }
 *   client.admin.updateConfig({ moduleId?, systemPrompt?, defaults? })
 *       -> { module: { ...same shape... } }
 */

// The generated app stores its auth token here and sends it as `Bearer`.
const TOKEN_KEY = "access_token";

// The base registers the standalone admin login route at this path (App.jsx).
const ADMIN_LOGIN_PATH = "/admin/login";

// Per-feature icon + accent so each module tab/panel is visually distinct.
const FEATURE_META = {
  chat: { icon: MessageSquare, label: "Chat", tint: "text-blue-600 dark:text-blue-400", soft: "bg-blue-500/10" },
  image: { icon: ImageIcon, label: "Image", tint: "text-violet-600 dark:text-violet-400", soft: "bg-violet-500/10" },
  video: { icon: Video, label: "Video", tint: "text-rose-600 dark:text-rose-400", soft: "bg-rose-500/10" },
  audio: { icon: Music, label: "Audio", tint: "text-amber-600 dark:text-amber-400", soft: "bg-amber-500/10" },
  sfx: { icon: AudioLines, label: "SFX", tint: "text-emerald-600 dark:text-emerald-400", soft: "bg-emerald-500/10" },
  translate: { icon: Languages, label: "Translate", tint: "text-cyan-600 dark:text-cyan-400", soft: "bg-cyan-500/10" },
};

function featureMeta(feature) {
  return (
    FEATURE_META[feature] || {
      icon: Sparkles,
      label: feature || "AIFlow",
      tint: "text-muted-foreground",
      soft: "bg-muted",
    }
  );
}

function moduleLabel(module) {
  return module?.useCaseName || module?.title || module?.feature || "AIFlow module";
}

// Tooltip shown on hovering a module's tab — auto-derived from the module
// (full name + feature/use-case), useful when the tab label is truncated.
function moduleTooltip(module) {
  const parts = [moduleLabel(module)];
  if (module?.feature) {
    parts.push(
      module.useCase && module.useCase !== "default"
        ? `${module.feature} · ${module.useCase}`
        : module.feature
    );
  }
  return parts.join(" — ");
}

function errorStatus(err) {
  // SDK throws a plain object with a numeric `status`; be defensive about shape.
  return err?.status ?? err?.data?.status ?? err?.response?.status;
}

/**
 * Derive a clean "{label} ({provider})" display from a raw model id — mirrors the
 * platform builder's Integrations tab so the admin sees the same friendly form
 * (e.g. "Claude Opus 4.8" · Anthropic) instead of the raw id ("claude-opus-4-8").
 *
 * The model IDs themselves are HYPHENATED (claude-opus-4-8) — the version has no
 * decimal in the ID. For DISPLAY we render the version number with a decimal
 * point: a hyphen between two digits (`4-8`, `3-5`) becomes `4.8` / `3.5`, while
 * word-separating hyphens become spaces.
 */
function parseModelId(id) {
  const lower = (id || "").toLowerCase();
  let provider = "AI";
  if (lower.startsWith("claude") || lower.startsWith("anthropic"))
    provider = "Anthropic";
  else if (
    lower.startsWith("gpt") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4")
  )
    provider = "OpenAI";
  else if (
    lower.startsWith("gemini") ||
    lower.startsWith("google") ||
    lower.startsWith("veo")
  )
    provider = "Google";

  const label = (id || "")
    // Version hyphen between two digits → decimal point (4-8 → 4.8, 3-5 → 3.5).
    .replace(/(\d)-(\d)/g, "$1.$2")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Gpt/g, "GPT")
    .replace(/\bO3\b/gi, "O3")
    .replace(/\bO4\b/gi, "O4")
    .replace(/\bpreview\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { value: id, label: label || id, provider };
}

export default function AIFlowSettings() {
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // { type, message }

  // Per-module editable state, keyed by moduleId.
  const [drafts, setDrafts] = useState({}); // { [moduleId]: { systemPrompt, model } }
  const [saving, setSaving] = useState({}); // { [moduleId]: boolean }
  const [status, setStatus] = useState({}); // { [moduleId]: { type, message } }

  const redirectToLogin = () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (_) {
      // ignore storage errors
    }
    navigate(ADMIN_LOGIN_PATH, { replace: true });
  };

  // Seed editable drafts from the freshly loaded / updated module shape.
  const seedDraft = (module) => ({
    systemPrompt: module?.systemPrompt ?? "",
    model: module?.defaults?.[module?.feature] ?? "",
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      // Lazy/dynamic import with an explicit relative `.js` path so the base
      // still builds when `src/lib/aiflow.js` is absent (it is emitted per app by
      // the generation template, which exports `aiflowClients` from it).
      const mod = await import("../../lib/aiflow.js").catch(() => null);
      const aiflowClient = mod?.aiflowClients?.[0];

      if (!aiflowClient) {
        if (!cancelled) {
          setClient(null);
          setModules([]);
          setLoading(false);
        }
        return;
      }

      try {
        aiflowClient.setAdminToken(
          typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null
        );

        const res = await aiflowClient.admin.listModules();
        const list = Array.isArray(res?.modules) ? res.modules : [];

        if (cancelled) return;

        setClient(aiflowClient);
        setModules(list);
        setDrafts(
          list.reduce((acc, m) => {
            if (m?.moduleId != null) acc[m.moduleId] = seedDraft(m);
            return acc;
          }, {})
        );
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const st = errorStatus(err);
        if (st === 401) {
          redirectToLogin();
          return;
        }
        if (st === 403) {
          setLoadError({ type: "forbidden", message: "Admin permission required" });
        } else {
          setLoadError({
            type: "unknown",
            message: err?.message || "Failed to load AIFlow modules",
          });
        }
        setModules([]);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateDraft = (moduleId, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], ...patch },
    }));
    setStatus((prev) => (prev[moduleId] ? { ...prev, [moduleId]: null } : prev));
  };

  const handleSave = async (module) => {
    const moduleId = module?.moduleId;
    if (!client || moduleId == null) return;

    const draft = drafts[moduleId] ?? seedDraft(module);

    setSaving((prev) => ({ ...prev, [moduleId]: true }));
    setStatus((prev) => ({ ...prev, [moduleId]: null }));

    try {
      const payload = { moduleId, systemPrompt: draft.systemPrompt };
      if (module.feature) {
        payload.defaults = { [module.feature]: draft.model };
      }

      const res = await client.admin.updateConfig(payload);
      const updated = res?.module;

      if (updated) {
        setModules((prev) =>
          prev.map((m) => (m.moduleId === moduleId ? { ...m, ...updated } : m))
        );
        setDrafts((prev) => ({ ...prev, [moduleId]: seedDraft(updated) }));
      }

      setStatus((prev) => ({
        ...prev,
        [moduleId]: { type: "success", message: "Saved" },
      }));
    } catch (err) {
      const st = errorStatus(err);
      if (st === 401) {
        redirectToLogin();
        return;
      }
      const message =
        st === 403
          ? "Admin permission required"
          : err?.message || "Failed to save changes";
      setStatus((prev) => ({ ...prev, [moduleId]: { type: "error", message } }));
    } finally {
      setSaving((prev) => ({ ...prev, [moduleId]: false }));
    }
  };

  // ---- shared page shell ---------------------------------------------------

  const PageShell = ({ children }) => (
    <div className="min-h-full bg-gradient-to-b from-muted/40 to-transparent">
      <div className="w-full p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">AIFlow Settings</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage the system prompt and default model for each AI feature — changes apply instantly, no redeploy.
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );

  // ---- render states -------------------------------------------------------

  if (loading) {
    return (
      <PageShell>
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading AIFlow modules…</span>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (loadError) {
    const forbidden = loadError.type === "forbidden";
    return (
      <PageShell>
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 py-8">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <ShieldAlert className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="font-medium text-destructive">
                {forbidden ? "Admin permission required" : "Something went wrong"}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{loadError.message}</p>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (!modules.length) {
    return (
      <PageShell>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">AIFlow is not enabled for this app</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                There are no AI modules to configure yet. Enable AIFlow for this app to
                manage system prompts and default models here.
              </p>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // ---- module panel (rendered inside each tab) -----------------------------

  const renderPanel = (module) => {
    const moduleId = module.moduleId;
    const draft = drafts[moduleId] ?? seedDraft(module);
    const isSaving = !!saving[moduleId];
    const st = status[moduleId];
    const models = Array.isArray(module.models) ? module.models : [];
    const modelOptions = models.map(parseModelId);
    const selectedModelInfo = draft.model
      ? modelOptions.find((o) => o.value === draft.model) ||
        parseModelId(draft.model)
      : null;
    const meta = featureMeta(module.feature);
    const Icon = meta.icon;
    const singleModel = models.length <= 1;
    const currentOffList = draft.model && !models.includes(draft.model);
    const promptLen = (draft.systemPrompt || "").length;

    return (
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="gap-2">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", meta.soft)}>
              <Icon className={cn("h-5 w-5", meta.tint)} />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate" title={moduleTooltip(module)}>
                {moduleLabel(module)}
              </CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="gap-1 font-normal">
                  <Icon className={cn("h-3 w-3", meta.tint)} />
                  {meta.label}
                </Badge>
                {module.useCase && module.useCase !== "default" && (
                  <Badge variant="outline" className="font-normal">
                    {module.useCase}
                  </Badge>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`prompt-${moduleId}`} className="text-sm font-medium">
                System prompt
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {promptLen} chars
              </span>
            </div>
            <Textarea
              id={`prompt-${moduleId}`}
              className="min-h-[160px] resize-y font-mono text-sm leading-relaxed"
              value={draft.systemPrompt}
              placeholder="Describe how this AI feature should behave…"
              onChange={(e) => updateDraft(moduleId, { systemPrompt: e.target.value })}
              disabled={isSaving}
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Sets the instructions this feature follows on every request.
            </p>
          </div>

          {module.feature && (
            <div className="space-y-2">
              <Label htmlFor={`model-${moduleId}`} className="text-sm font-medium">
                Default model
              </Label>
              {models.length ? (
                <>
                  <Select
                    value={draft.model || undefined}
                    onValueChange={(v) => updateDraft(moduleId, { model: v })}
                    disabled={isSaving || singleModel}
                  >
                    <SelectTrigger id={`model-${moduleId}`} className="w-full">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentOffList && (
                        <SelectItem value={draft.model}>
                          {parseModelId(draft.model).label} (
                          {parseModelId(draft.model).provider}) — current
                        </SelectItem>
                      )}
                      {modelOptions.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label} ({m.provider})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedModelInfo && (
                    <div className="mt-2 flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-bold uppercase tracking-wider"
                      >
                        {selectedModelInfo.provider}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {selectedModelInfo.value}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  No models available for this feature.
                </p>
              )}
              {singleModel && models.length === 1 && (
                <p className="text-xs text-muted-foreground">
                  Only one model is available for this feature.
                </p>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex items-center gap-3 border-t bg-muted/30 py-4">
          <Button onClick={() => handleSave(module)} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
          {st && (
            <span
              className={cn(
                "flex items-center gap-1.5 text-sm",
                st.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              )}
            >
              {st.type === "success" ? (
                <Check className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {st.message}
            </span>
          )}
        </CardFooter>
      </Card>
    );
  };

  // ---- main (tabs) ---------------------------------------------------------

  return (
    <PageShell>
      <Tabs defaultValue={String(modules[0].moduleId)} className="w-full">
        {/* One tab per AIFlow module. Label auto from the module; hovering shows
            a title tooltip (feature/use-case). Wraps to multiple rows when many. */}
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          {modules.map((module) => {
            const meta = featureMeta(module.feature);
            const Icon = meta.icon;
            return (
              <TabsTrigger
                key={module.moduleId}
                value={String(module.moduleId)}
                title={moduleTooltip(module)}
                className="gap-1.5 data-[state=active]:shadow-sm"
              >
                <Icon className={cn("h-3.5 w-3.5", meta.tint)} />
                <span className="max-w-[160px] truncate">{moduleLabel(module)}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {modules.map((module) => (
          <TabsContent
            key={module.moduleId}
            value={String(module.moduleId)}
            className="mt-0 focus-visible:outline-none"
          >
            {renderPanel(module)}
          </TabsContent>
        ))}
      </Tabs>
    </PageShell>
  );
}
