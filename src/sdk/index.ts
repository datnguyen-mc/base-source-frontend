// ================== types ==================
export interface ClientConfig {
  serverUrl: string;
  token?: string;
  storageKey?: string;
  fetchImpl?: typeof fetch;
}

export interface Entity {
  id: string;
  [key: string]: any;
}

export interface EntitiesModule {
  [entityName: string]: any;
}

export interface IntegrationsModule {
  [pkgName: string]: any;
}

export interface Dori77Client {
  [namespace: string]: any;
  entities: EntitiesModule;
  integrations: IntegrationsModule;
  auth: any;
  functions: any;
  agents: any;
  appLogs: any;
  asServiceRole: any;
  setToken(token: string): void;
  getConfig(): { serverUrl: string };
  cleanup(): void;
}

// ================== error ==================
export class Dori77Error extends Error {
  status?: number;
  code?: string;
  data?: any;
  originalError?: Error;
  constructor(
    message: string,
    status?: number,
    code?: string,
    data?: any,
    originalError?: Error
  ) {
    super(message);
    this.name = "Dori77Error";
    this.status = status;
    this.code = code;
    this.data = data;
    this.originalError = originalError;
  }
}

// ================== helpers ==================
function ensureBase(url: string) {
  return url.endsWith("/") ? url : url + "/";
}

function arrToCsv(v?: string[] | string) {
  return !v ? undefined : Array.isArray(v) ? v.join(",") : v;
}

function clean<T extends Record<string, any>>(o: T): T {
  const c = { ...o };
  Object.keys(c).forEach(
    (k) => (c as any)[k] === undefined && delete (c as any)[k]
  );
  return c;
}

/* ---------- multipart helpers ---------- */
function isFileLike(v: any): v is File | Blob {
  return (
    (typeof File !== "undefined" && v instanceof File) ||
    (typeof Blob !== "undefined" && v instanceof Blob)
  );
}
function isFormDataLike(v: any): v is FormData {
  return typeof FormData !== "undefined" && v instanceof FormData;
}
function hasFileLikeDeep(v: any): boolean {
  if (!v || typeof v !== "object") return false;
  if (isFormDataLike(v) || isFileLike(v)) return true;
  if (Array.isArray(v)) return v.some(hasFileLikeDeep);
  for (const val of Object.values(v)) if (hasFileLikeDeep(val)) return true;
  return false;
}
function objectToFormData(
  obj: any,
  form = new FormData(),
  ns?: string
): FormData {
  if (obj == null) return form;

  // File/Blob at root
  if (isFileLike(obj)) {
    form.append(ns || "file", obj);
    return form;
  }

  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      const key = ns ? `${ns}[${i}]` : String(i);
      if (isFileLike(v)) form.append(key, v);
      else if (typeof v === "object" && v !== null)
        objectToFormData(v, form, key);
      else form.append(key, v == null ? "" : String(v));
    });
    return form;
  }

  if (typeof obj === "object") {
    Object.entries(obj).forEach(([k, v]) => {
      const key = ns ? `${ns}[${k}]` : k;
      if (v == null) return;
      if (isFileLike(v)) form.append(key, v);
      else if (typeof v === "object") objectToFormData(v, form, key);
      else form.append(key, String(v));
    });
    return form;
  }

  // primitive root
  form.append(ns || "value", String(obj));
  return form;
}

// ================== http ==================
function createHttp(cfg: ClientConfig) {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const storageKey = cfg.storageKey ?? "access_token";
  let token =
    cfg.token ??
    (typeof window !== "undefined"
      ? localStorage.getItem(storageKey) ?? undefined
      : undefined);

  const setToken = (t?: string, save?: boolean) => {
    token = t;
    if (typeof window !== "undefined" && save) {
      if (t) localStorage.setItem(storageKey, t);
      else localStorage.removeItem(storageKey);
    }
  };

  const buildUrl = (path: string, q?: Record<string, any>) => {
    const u = new URL(path, ensureBase(cfg.serverUrl));
    if (q)
      Object.entries(q).forEach(
        ([k, v]) => v != null && u.searchParams.append(k, String(v))
      );
    return u.toString();
  };

  const request = async (
    path: string,
    init?: RequestInit & { query?: Record<string, any> }
  ) => {
    const url = buildUrl(path, init?.query);
    const res = await fetchImpl(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  
    if (res.status === 204) return undefined;
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    const looksJson =
      ct.includes("application/json") || ct.includes("application/problem+json");
    let data: any = text;
    if (looksJson) {
      try {
        data = text ? JSON.parse(text) : undefined;
      } catch {}
    }
  
    if (res.status === 401 || res.status === 403) {
      console.warn(`[Dori77 SDK] Unauthorized (${res.status}) → redirect to /signin`);
      try {
        token = undefined;
        if (typeof window !== "undefined") {
          localStorage.removeItem(storageKey);
          localStorage.removeItem("refresh_token");
          const current = window.location.pathname.toLowerCase();
          if (!["/signin", "/login", "/sign-in"].some((p) => current.includes(p))) {
            window.location.href = "/signin";
          }
        }
      } catch (e) {
        console.error("⚠️ Failed to handle unauthorized redirect:", e);
      }
      throw new Dori77Error("Unauthorized", res.status, "unauthorized", data);
    }
  
    if (!res.ok) {
      if (ct.includes("application/problem+json") && data) {
        throw new Dori77Error(
          data.title || "Request failed",
          data.status ?? res.status,
          data.type,
          data
        );
      }
      if (ct.includes("application/json") && data) {
        throw new Dori77Error(
          data.message || "Request failed",
          data.statusCode ?? res.status,
          data.type,
          data
        );
      }
      throw new Dori77Error(
        `HTTP ${res.status} ${res.statusText || ""}`.trim(),
        res.status,
        undefined,
        data
      );
    }
  
    return looksJson ? data ?? data : text;
  };

  const getConfig = () => ({ serverUrl: cfg.serverUrl });
  return { request, setToken, getConfig };
}

/* ================== dynamic module (1-level) ================== */
function createDynamicModule(
  basePath: string,
  http: ReturnType<typeof createHttp>
) {
  return new Proxy(
    {},
    {
      get(_target, methodName: string) {
        const rawName = String(methodName);

        const name = rawName
          .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
          .toLowerCase();

        return async (...args: any[]) => {
          const hasBody =
            args.length > 0 &&
            (typeof args[args.length - 1] === "object" ||
              isFormDataLike(args[args.length - 1]));
          const bodyArg = hasBody ? args[args.length - 1] : undefined;

          const pathParams = hasBody ? args.slice(0, -1) : args;

          let path = basePath;
          if (pathParams.length)
            path += "/" + pathParams.map(encodeURIComponent).join("/");
          path += "/" + encodeURIComponent(name);

          // multipart cases
          if (isFormDataLike(bodyArg)) {
            return http.request(path, { method: "POST", body: bodyArg });
          }
          if (isFileLike(bodyArg)) {
            const fd = new FormData();
            fd.append("file", bodyArg);
            return http.request(path, { method: "POST", body: fd });
          }
          if (hasFileLikeDeep(bodyArg)) {
            const fd = objectToFormData(bodyArg);
            return http.request(path, { method: "POST", body: fd });
          }

          const isPost =
            bodyArg && typeof bodyArg === "object" && !Array.isArray(bodyArg);

          const opts: RequestInit & { query?: Record<string, any> } = isPost
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyArg),
              }
            : { method: "GET", query: bodyArg };

          return http.request(path, opts);
        };
      },
    }
  );
}

// ================== entities ==================
function createEntities(http: ReturnType<typeof createHttp>): EntitiesModule {
  return new Proxy(
    {},
    {
      get(_target, entityName: string) {
        const entity = String(entityName);
        return new Proxy(
          {},
          {
            get(_t2, methodName: string) {
              const method = String(methodName);
              return async (...args: any[]) => {
                switch (method) {
                  case "list":
                    return http.request(`${entity}`, {
                      method: "GET",
                      query: clean({
                        sort: args[0]?.sort ?? args[0],
                        limit: args[0]?.limit ?? args[1],
                        skip: args[0]?.skip ?? args[2],
                        fields: arrToCsv(args[0]?.fields ?? args[3]),
                      }),
                    });
                  case "filter": {
                    const p = args[0] ?? {};
                    return http.request(`${entity}`, {
                      method: "GET",
                      query: clean({
                        q: JSON.stringify(p.q ?? p ?? {}),
                        sort: p.sort,
                        limit: p.limit,
                        skip: p.skip,
                        fields: arrToCsv(p.fields),
                      }),
                    });
                  }
                  case "get":
                    return http.request(
                      `${entity}/${encodeURIComponent(args[0])}`,
                      { method: "GET" }
                    );
                  case "create": {
                    const data = args[0];
                    if (isFormDataLike(data)) {
                      return http.request(`${entity}`, {
                        method: "POST",
                        body: data,
                      });
                    }
                    if (isFileLike(data) || hasFileLikeDeep(data)) {
                      const fd = isFileLike(data)
                        ? (() => {
                            const f = new FormData();
                            f.append("file", data);
                            return f;
                          })()
                        : objectToFormData(data);
                      return http.request(`${entity}`, {
                        method: "POST",
                        body: fd,
                      });
                    }
                    return http.request(`${entity}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(data),
                    });
                  }
                  case "update": {
                    const id = args[0];
                    const data = args[1];
                    if (isFormDataLike(data)) {
                      return http.request(
                        `${entity}/${encodeURIComponent(id)}`,
                        { method: "PUT", body: data }
                      );
                    }
                    if (isFileLike(data) || hasFileLikeDeep(data)) {
                      const fd = isFileLike(data)
                        ? (() => {
                            const f = new FormData();
                            f.append("file", data);
                            return f;
                          })()
                        : objectToFormData(data);
                      return http.request(
                        `${entity}/${encodeURIComponent(id)}`,
                        { method: "PUT", body: fd }
                      );
                    }
                    return http.request(`${entity}/${encodeURIComponent(id)}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(data),
                    });
                  }
                  case "delete":
                    return http.request(
                      `${entity}/${encodeURIComponent(args[0])}`,
                      { method: "DELETE" }
                    );
                  case "deleteMany":
                    return http.request(`${entity}/deleteMany`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ query: args[0] }),
                    });
                  case "bulkCreate": {
                    const data = args[0];
                    if (isFormDataLike(data)) {
                      return http.request(`${entity}/bulk`, {
                        method: "POST",
                        body: data,
                      });
                    }
                    if (hasFileLikeDeep(data)) {
                      const fd = objectToFormData({ data });
                      return http.request(`${entity}/bulk`, {
                        method: "POST",
                        body: fd,
                      });
                    }
                    return http.request(`${entity}/bulk`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ data }),
                    });
                  }
                  case "importEntities": {
                    const form = new FormData();
                    form.append("file", args[0]);
                    return http.request(`${entity}/import`, {
                      method: "POST",
                      body: form,
                    });
                  }
                  default:
                    return http.request(`${entity}`, {
                      method: "GET",
                      query: args[0],
                    });
                }
              };
            },
          }
        );
      },
    }
  );
}

// ================== integrations (2-level, multipart-aware) ==================
function createIntegrations(
  http: ReturnType<typeof createHttp>
): IntegrationsModule {
  return new Proxy(
    {},
    {
      get(_target, pkgName: string) {
        const pkg = String(pkgName);
        return new Proxy(
          {},
          {
            get(_t2, actionName: string) {
              const action = String(actionName);
              return async (data?: any) => {
                if (isFormDataLike(data)) {
                  return http.request(`integrations/${pkg}/${action}`, {
                    method: "POST",
                    body: data,
                  });
                }
                if (isFileLike(data)) {
                  const fd = new FormData();
                  fd.append("file", data);
                  return http.request(`integrations/${pkg}/${action}`, {
                    method: "POST",
                    body: fd,
                  });
                }
                if (hasFileLikeDeep(data)) {
                  const fd = objectToFormData(data);
                  return http.request(`integrations/${pkg}/${action}`, {
                    method: "POST",
                    body: fd,
                  });
                }
                return http.request(`integrations/${pkg}/${action}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data ?? {}),
                });
              };
            },
          }
        );
      },
    }
  );
}

// ================== auth ==================
function createAuth(http: ReturnType<typeof createHttp>, cfg: ClientConfig) {
  const getEnv = (key: string, fallback?: string): string => {
    if (typeof window !== "undefined" && (window as any).__APP_CONFIG__?.[key]) {
      return (window as any).__APP_CONFIG__[key];
    }
    if (typeof process !== "undefined" && process.env?.[key]) {
      return process.env[key] as string;
    }
    return fallback ?? "";
  };

  const LOGIN_URL =
    (cfg as any).loginUrl || getEnv("VITE_LOGIN_URL", "/signin");
  const HOME_PATH =
    (cfg as any).homePath || getEnv("VITE_HOME_PATH", "/");

  return new Proxy(
    {},
    {
      get(_target, methodName: string) {
        const name = String(methodName);

        return async (...args: any[]) => {
          switch (name) {
            // ======== AUTH APIS ========
            case "me":
              return http.request("auth/me", { method: "GET" });

            case "updateMe":
              return http.request("auth/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args[0]),
              });

            // ======== LOGIN ========
            case "login": {
              const payload =
                typeof args[0] === "string" && typeof args[1] === "string"
                  ? { email: args[0], password: args[1], turnstile_token: args[2] }
                  : args[0];

              const res = await http.request("auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

              const token =
                res?.data?.meta?.access_token?.token ||
                res?.token ||
                res?.data?.token;
              if (token) http.setToken(token, true);

              return res;
            }

            // ======== LOGOUT ========
            case "logout": {
              try {
                await http.request("auth/logout", { method: "POST" });
              } catch (err) {
                console.warn("Logout request failed:", err);
              }

              http.setToken(undefined, true);
              localStorage.removeItem(cfg.storageKey ?? "access_token");
              localStorage.removeItem("refresh_token");

              const currentPath = window.location.pathname.toLowerCase();
              const normalizedHome = HOME_PATH.toLowerCase();

              const isAtHome =
                currentPath === normalizedHome ||
                currentPath === "/" ||
                currentPath === "";
              if (isAtHome) window.location.reload();
              else window.location.href = LOGIN_URL;

              return;
            }

            case "setToken":
              return http.setToken(args[0], args[1]);

            case "isAuthenticated":
              try {
                await http.request("auth/me", { method: "GET" });
                return true;
              } catch {
                return false;
              }

            case "redirectToLogin":
            case "navigateToLogin": {
              const currentPath = window.location.pathname;
              const encodedRedirect = encodeURIComponent(currentPath);

              const lowerLogin = LOGIN_URL.toLowerCase();
              if (currentPath.toLowerCase().includes(lowerLogin)) return;

              const redirectUrl = `${LOGIN_URL}?redirect=${encodedRedirect}`;
              window.location.href = redirectUrl;
              return;
            }

            default:
              return http.request(`auth/${name}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args[0] ?? {}),
              });
          }
        };
      },
    }
  );
}

// ================== asServiceRole ==================
function createAsServiceRole(
  http: ReturnType<typeof createHttp>,
  token?: string
) {
  const serviceHttp = { ...http };
  if (token) serviceHttp.setToken(token, false);
  return {
    entities: createEntities(serviceHttp),
    integrations: createIntegrations(serviceHttp),
    sso: createDynamicModule("sso", serviceHttp),
    functions: createDynamicModule("functions", serviceHttp),
    agents: createDynamicModule("agents", serviceHttp),
    appLogs: createDynamicModule("appLogs", serviceHttp),
    cleanup: () => {},
  };
}

// ================== cleanup ==================
function createCleanup() {
  return () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("__b44_token__");
    }
  };
}

// ================== createClient ==================
export function createClient(config: ClientConfig): Dori77Client {
  if (!config?.serverUrl) throw new Error("serverUrl is required");

  const http = createHttp(config);
  const cleanup = createCleanup();

  const fixedModules: Record<string, any> = {
    entities: createEntities(http),
    integrations: createIntegrations(http),
    auth: createAuth(http, config),
    asServiceRole: createAsServiceRole(http, config.token),
    setToken: (t: string) => http.setToken(t, true),
    getConfig: () => ({ serverUrl: config.serverUrl }),
    cleanup,
  };

  const client = new Proxy(fixedModules, {
    get(target, prop: string, receiver) {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);

      const dynamicModule = createDynamicModule(prop, http);
      Reflect.set(target, prop, dynamicModule);
      return dynamicModule;
    },
  });

  return client as Dori77Client;
}
