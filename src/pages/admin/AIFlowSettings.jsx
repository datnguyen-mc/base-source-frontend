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

function moduleLabel(module) {
  return module?.useCaseName || module?.title || module?.feature || "AIFlow module";
}

function errorStatus(err) {
  // SDK throws a plain object with a numeric `status`; be defensive about shape.
  return err?.status ?? err?.data?.status ?? err?.response?.status;
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
  const [status, setStatus] = useState({}); // { [moduleId]: { type: 'success'|'error', message } }

  const redirectToLogin = () => {
    // Match how the base handles an expired/invalid admin session.
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
    // Clear any prior status once the admin starts editing again.
    setStatus((prev) => (prev[moduleId] ? { ...prev, [moduleId]: null } : prev));
  };

  const handleSave = async (module) => {
    const moduleId = module?.moduleId;
    if (!client || moduleId == null) return;

    const draft = drafts[moduleId] ?? seedDraft(module);

    setSaving((prev) => ({ ...prev, [moduleId]: true }));
    setStatus((prev) => ({ ...prev, [moduleId]: null }));

    try {
      const payload = {
        moduleId,
        systemPrompt: draft.systemPrompt,
      };
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
      setStatus((prev) => ({
        ...prev,
        [moduleId]: { type: "error", message },
      }));
    } finally {
      setSaving((prev) => ({ ...prev, [moduleId]: false }));
    }
  };

  // ---- render states -------------------------------------------------------

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-muted border-t-foreground rounded-full animate-spin" />
          <span>Loading AIFlow modules…</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">AIFlow Settings</h1>
        <Card className="mt-4 border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">
              {loadError.type === "forbidden"
                ? "Admin permission required"
                : "Something went wrong"}
            </CardTitle>
            <CardDescription>{loadError.message}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!modules.length) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">AIFlow Settings</h1>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>AIFlow is not enabled for this app</CardTitle>
            <CardDescription>
              There are no AIFlow modules to configure. Enable AIFlow for this app to
              manage system prompts and default models here.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">AIFlow Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edit each AIFlow module's system prompt and default model.
        </p>
      </div>

      <div className="space-y-6">
        {modules.map((module) => {
          const moduleId = module.moduleId;
          const draft = drafts[moduleId] ?? seedDraft(module);
          const isSaving = !!saving[moduleId];
          const st = status[moduleId];
          const models = Array.isArray(module.models) ? module.models : [];

          return (
            <Card key={moduleId ?? moduleLabel(module)}>
              <CardHeader>
                <CardTitle>{moduleLabel(module)}</CardTitle>
                <CardDescription>
                  {module.feature ? (
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                      {module.feature}
                    </span>
                  ) : (
                    "Module"
                  )}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`prompt-${moduleId}`}>System prompt</Label>
                  <Textarea
                    id={`prompt-${moduleId}`}
                    className="min-h-[140px] font-mono text-sm"
                    value={draft.systemPrompt}
                    placeholder="Enter the system prompt for this module…"
                    onChange={(e) =>
                      updateDraft(moduleId, { systemPrompt: e.target.value })
                    }
                    disabled={isSaving}
                  />
                </div>

                {module.feature && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`model-${moduleId}`}>Default model</Label>
                    <select
                      id={`model-${moduleId}`}
                      className={cn(
                        "flex h-9 w-full items-center justify-between rounded-md border border-input",
                        "bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background",
                        "focus:outline-none focus:ring-1 focus:ring-ring",
                        "disabled:cursor-not-allowed disabled:opacity-50"
                      )}
                      value={draft.model}
                      onChange={(e) => updateDraft(moduleId, { model: e.target.value })}
                      disabled={isSaving || models.length <= 1}
                    >
                      {/* Keep the current value selectable even if not in models[]. */}
                      {draft.model && !models.includes(draft.model) && (
                        <option value={draft.model}>{draft.model}</option>
                      )}
                      {!models.length && <option value="">No models available</option>}
                      {models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    {models.length === 1 && (
                      <p className="text-xs text-muted-foreground">
                        Only one model is available for this feature.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex items-center gap-3">
                <Button onClick={() => handleSave(module)} disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save"}
                </Button>
                {st && (
                  <span
                    className={cn(
                      "text-sm",
                      st.type === "success" ? "text-green-600" : "text-destructive"
                    )}
                  >
                    {st.message}
                  </span>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
