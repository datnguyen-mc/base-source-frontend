// =============================================================
// vibexClient SDK
// ================== helpers ==================
function ensureBase(url) {
  return url.endsWith("/") ? url : url + "/";
}

function arrToCsv(v) {
  return !v ? undefined : Array.isArray(v) ? v.join(",") : v;
}

function clean(o) {
  const c = { ...o };
  Object.keys(c).forEach((k) => c[k] === undefined && delete c[k]);
  return c;
}

function isFileLike(v) {
  return (
    (typeof File !== "undefined" && v instanceof File) ||
    (typeof Blob !== "undefined" && v instanceof Blob)
  );
}
function isFormDataLike(v) {
  return typeof FormData !== "undefined" && v instanceof FormData;
}
function hasFileLikeDeep(v) {
  if (!v || typeof v !== "object") return false;
  if (isFormDataLike(v) || isFileLike(v)) return true;
  if (Array.isArray(v)) return v.some(hasFileLikeDeep);
  for (const val of Object.values(v)) if (hasFileLikeDeep(val)) return true;
  return false;
}

function objectToFormData(obj, form = new FormData(), ns) {
  if (obj == null) return form;

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

  form.append(ns || "value", String(obj));
  return form;
}

// ================== http layer ==================
function createHttp(cfg) {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const storageKey = "access_token";
  let token =
    cfg.token ??
    (typeof window !== "undefined"
      ? localStorage.getItem(storageKey) ?? undefined
      : undefined);

  const setToken = (t, save) => {
    token = t;
    if (typeof window !== "undefined" && save) {
      if (t) localStorage.setItem(storageKey, t);
      else localStorage.removeItem(storageKey);
    }
  };

  const buildUrl = (path, q) => {
    const u = new URL(path, ensureBase(cfg.serverUrl));
    if (q)
      Object.entries(q).forEach(
        ([k, v]) => v != null && u.searchParams.append(k, String(v))
      );
    return u.toString();
  };

  const getRequestLang = () => {
    if (typeof window === "undefined") return undefined;
    try {
      const lang =
        localStorage.getItem("i18nextLng") ||
        window.navigator?.languages?.[0] ||
        window.navigator?.language ||
        "ko";
      return lang.split("-")[0];
    } catch {
      return "ko";
    }
  };

  const request = async (path, init = {}) => {
    const url = buildUrl(path, init.query);
    const currentToken = typeof window !== "undefined" ? (localStorage.getItem(storageKey) ?? token) : token;
    let res;
    try {
      res = await fetchImpl(url, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.headers || {}),
          ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
          // Add language header
          ...(typeof window !== "undefined" ? { "Accept-Language": getRequestLang() } : {}),
          // Add timezone offset header
          ...(typeof window !== "undefined" ? { "x-timezone-offset": String(-(new Date().getTimezoneOffset())) } : {}),
        },
      });
    } catch {
      return undefined;
    }

    if (res.status === 204) return undefined;

    const ct = res.headers.get("content-type") || "";
    const text = await res.text();

    let data = text;
    const looksJson =
      ct.includes("application/json") || ct.includes("application/problem+json");

    if (looksJson) {
      try {
        data = text ? JSON.parse(text) : undefined;
      } catch { }
    }

    // unauthorized → auto redirect
    if (res.status === 401) {
      console.warn(`[vibexClient SDK] Unauthorized (${res.status})`);

      try {
        token = undefined;
        if (typeof window !== "undefined") {
          if (!path.includes("auth/login") && !path.includes("auth/register")) {
            window.location.href = "/";
          }
        }
      } catch (e) { }

      throw {
        name: "vibexClientError",
        message: "Unauthorized",
        status: res.status,
        data,
      };
    }

    if (!res.ok) {
      throw {
        name: "vibexClientError",
        message: data?.message || data?.title || "Request failed",
        status: data?.status ?? res.status,
        data,
      };
    }

    return looksJson ? data : text;
  };

  return { request, setToken, getConfig: () => ({ serverUrl: cfg.serverUrl }) };
}

// =============================================================
// FIX: GET vs POST logic for DynamicModule
// =============================================================
function createDynamicModule(basePath, http) {
  return new Proxy(
    {},
    {
      get(_target, rawMethod) {
        const method = String(rawMethod);

        return async (...args) => {
          let path = basePath;
          let last = args[args.length - 1];
          if (last?.filter) last.filter = JSON.stringify(last.filter);
          if (last?.sort) last.sort = JSON.stringify(last.sort);
          // pure GET methods
          const GET_METHODS = ["list", "filter", "search", "count", "paging"];

          // Determine GET vs POST properly
          if (GET_METHODS.includes(method)) {
            return http.request(`${path}/${method}`, {
              method: "GET",
              query: clean(last),
            });
          }

          // default dynamic behavior
          const hasBody =
            last &&
            typeof last === "object" &&
            !Array.isArray(last) &&
            !isFileLike(last) &&
            !isFormDataLike(last) &&
            !hasFileLikeDeep(last);

          const body = hasBody ? last : undefined;
          const pathParams = hasBody ? args.slice(0, -1) : args;

          if (pathParams.length)
            path += "/" + pathParams.map(encodeURIComponent).join("/");

          path += "/" + encodeURIComponent(method);

          // multipart cases
          if (isFormDataLike(body)) {
            return http.request(path, {
              method: "POST",
              body,
            });
          }
          if (isFileLike(body) || hasFileLikeDeep(body)) {
            const fd = objectToFormData(body);
            return http.request(path, {
              method: "POST",
              body: fd,
            });
          }

          if (body) {
            return http.request(path, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
          }

          return http.request(path, { method: "GET" });
        };
      },
    }
  );
}

// =============================================================
// Entities Module — FIXED GET/POST RULES
// =============================================================
function createEntities(http) {
  return new Proxy(
    {},
    {
      get(_t, entityName) {
        const entity = String(entityName);
        return new Proxy(
          {},
          {
            get(_t2, rawMethod) {
              const method = String(rawMethod);
              return async (...args) => {
                switch (method) {
                  case "list":
                    return http.request(`${entity}`, {
                      method: "GET",
                      query: clean({
                        query: clean({
                          filter: 1,
                          sort: 1,
                          limit: args[0]?.limit,
                          skip: args[0]?.skip,
                          fields: arrToCsv(args[0]?.fields),
                        }),
                      }),
                    });

                  case "paging":
                    return http.request(`${entity}/paging`, {
                      method: "GET",
                      query: clean({
                        page: args[0]?.page,
                        pageSize: args[0]?.pageSize,
                        filter: args[0]?.filter ? JSON.stringify(args[0].filter) : undefined,
                        sort: args[0]?.sort ? JSON.stringify(args[0].sort) : undefined,
                        fields: arrToCsv(args[0]?.fields),
                      }),
                    });

                  case "get":
                    return http.request(
                      `${entity}/${encodeURIComponent(args[0])}/get`,
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
                      const fd = objectToFormData(data);
                      return http.request(`${entity}/create`, {
                        method: "POST",
                        body: fd,
                      });
                    }
                    return http.request(`${entity}/create`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(data),
                    });
                  }

                  case "update": {
                    const id = args[0];
                    const data = args[1];
                    if (isFormDataLike(data)) {
                      return http.request(`${entity}/${id}`, {
                        method: "POST",
                        body: data,
                      });
                    }
                    if (isFileLike(data) || hasFileLikeDeep(data)) {
                      const fd = objectToFormData(data);
                      return http.request(`${entity}/${id}/update`, {
                        method: "POST",
                        body: fd,
                      });
                    }
                    return http.request(`${entity}/${id}/update`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(data),
                    });
                  }

                  case "delete":
                    return http.request(`${entity}/${args[0]}/delete`, {
                      method: "GET",
                    });

                  // Atomic server-side counter bump (like/comment/view counts).
                  // Usage: entities.Post.increment(id, "likeCount", 1)
                  //        entities.Post.increment(id, "likeCount", -1)  // unlike
                  // The field must be declared `counter: true` in the entity
                  // policy; non-admin callers are clamped to a ±1 step. Never
                  // write counter fields through create/update — they're stripped.
                  case "increment": {
                    const id = args[0];
                    const field = args[1];
                    const by = args[2] === undefined ? 1 : args[2];
                    return http.request(`${entity}/${id}/increment`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ field, by }),
                    });
                  }

                  default:
                    return http.request(`${entity}`, {
                      method: "GET",
                      query: clean(args[0]),
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

// =============================================================
// Integrations Module
// =============================================================
function createIntegrations(http) {
  return new Proxy(
    {},
    {
      get(_t, pkgName) {
        const pkg = String(pkgName);
        return new Proxy(
          {},
          {
            get(_t2, actionName) {
              const action = String(actionName);

              return async (data) => {
                if (isFormDataLike(data)) {
                  return http.request(`integrations/${pkg}/${action}`, {
                    method: "POST",
                    body: data,
                  });
                }

                if (isFileLike(data) || hasFileLikeDeep(data)) {
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

// =============================================================
// Auth Module
// =============================================================
function createAuth(http, cfg) {
  return new Proxy(
    {},
    {
      get(_t, methodName) {
        const name = String(methodName);

        return async (...args) => {
          switch (name) {
            case "register": {
              const res = await http.request("auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args[0] ?? {}),
              });
              if (res?.data.data.token) localStorage.setItem("access_token", res.data.data.token);
              if (res?.data.data.user) localStorage.setItem("user", JSON.stringify(res.data.data.user));
              return res;
            }

            case "login": {
              const payload =
                typeof args[0] === "string"
                  ? { email: args[0], password: args[1] }
                  : args[0];

              const res = await http.request("auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              if (res?.data?.data?.token) localStorage.setItem("access_token", res.data.data.token);
              if (res?.data?.data?.user) localStorage.setItem("user", JSON.stringify(res.data.data.user));
              return res;
            }

            case "me":
              return http.request("auth/me", { method: "GET" });

            case "refresh": {
              const res = await http.request("auth/refresh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args[0] ?? {}),
              });
              if (res?.data.refresh_token) http.setToken(res.data.refresh_token, true);
              return res;
            }

            case "changePassword":
              return http.request("auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args[0] ?? {}),
              });

            case "updateProfile":
              return http.request("auth/update-profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args[0] ?? {}),
              });

            case "verify":
              return http.request("auth/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args[0] ?? {}),
              });

            case "updateMe":
              return http.request("auth/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args[0]),
              });

            case "logout":
              http.setToken(undefined, true);
              if (typeof window !== "undefined") {
                localStorage.removeItem("access_token");
                localStorage.removeItem("user");
                window.location.href = "/";
              }
              return;

            case "setToken":
              return http.setToken(args[0], args[1]);

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

// =============================================================
// Functions Module — Edge Function Invocation
// =============================================================
function createFunctions(http) {
  /**
   * Invoke an edge function by name.
   * @param {string} functionName - The function slug (e.g. "weather", "stripe-webhook")
   * @param {object} [options] - Request options
   * @param {string} [options.method="POST"] - HTTP method (GET, POST, PUT, DELETE)
   * @param {object} [options.body] - Request body (for POST/PUT)
   * @param {object} [options.query] - Query parameters (for GET)
   * @param {object} [options.headers] - Additional headers
   * @returns {Promise<any>} Response data
   */
  const invoke = async (functionName, options = {}) => {
    const method = (options.method || "POST").toUpperCase();
    const init = { method };

    if (options.query) {
      init.query = options.query;
    }

    if (options.headers) {
      init.headers = { ...options.headers };
    }

    if (options.body && method !== "GET" && method !== "HEAD") {
      init.headers = {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      };
      init.body = JSON.stringify(options.body);
    }

    return http.request(`functions/${encodeURIComponent(functionName)}`, init);
  };

  // Allow both client.functions.invoke("name", opts)
  // and client.functions.name(data) shorthand
  return new Proxy(
    { invoke },
    {
      get(target, prop) {
        if (prop in target) return target[prop];

        const fnName = String(prop);
        return async (data, options = {}) => {
          return invoke(fnName, {
            ...options,
            body: data,
          });
        };
      },
    }
  );
}

// =============================================================
// RBAC Module — roles / permissions / menus / me / check
// =============================================================
// Dedicated surface for role/permission management, backed by the platform
// `/:projectKey/rbac/*` endpoints (DynamicRbacService) — which add idempotent
// create-by-name/key, diff-based setRolePermissions (no lock-out window),
// cascade deletes, and authoritative permission resolution. Prefer this over
// raw `vibex.entities.Role/Permission/RolePermission` for management. Reuses the
// `/entities`-stripped base (same parent as `functions`) so paths resolve to
// `.../v1/<projectKey>/rbac/*`; the Bearer (end-user vibex.auth token) is
// attached automatically. Management mutations require an admin caller.
function createRbac(http) {
  const unwrap = (res) => {
    if (res && typeof res === "object" && res.code && res.code !== 200) {
      throw new Error(res.message || "RBAC request failed");
    }
    return res && typeof res === "object" && "data" in res ? res.data : res;
  };

  const req = (path, method = "GET", body, query) => {
    const init = { method };
    if (query) init.query = query;
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    return http.request(`rbac/${path}`, init).then(unwrap);
  };

  const enc = (v) => encodeURIComponent(String(v));

  // Wildcard permission match, mirroring the backend (`*`, `resource:*`, exact).
  const matches = (granted, required) => {
    if (!granted) return false;
    if (granted === "*") return true;
    if (granted === required) return true;
    if (granted.endsWith(":*")) {
      return String(required).startsWith(granted.slice(0, -1));
    }
    return false;
  };

  // Cache the caller's own grants so hasPermission() doesn't round-trip per gate.
  let mePromise = null;
  const me = (opts = {}) => {
    if (opts.refresh) mePromise = null;
    if (!mePromise) {
      mePromise = req("me").catch((e) => {
        mePromise = null;
        throw e;
      });
    }
    return mePromise;
  };

  return {
    // roles
    listRoles: () => req("roles"),
    createRole: (body) => req("roles", "POST", body),
    updateRole: (id, body) => req(`roles/${enc(id)}`, "PUT", body),
    deleteRole: (id) => req(`roles/${enc(id)}`, "DELETE"),
    getRolePermissions: (roleId) => req(`roles/${enc(roleId)}/permissions`),
    setRolePermissions: (roleId, permissionKeys) =>
      req(`roles/${enc(roleId)}/permissions`, "PUT", {
        permissionKeys: permissionKeys || [],
      }),
    // permissions
    listPermissions: () => req("permissions"),
    createPermission: (body) => req("permissions", "POST", body),
    updatePermission: (id, body) => req(`permissions/${enc(id)}`, "PUT", body),
    deletePermission: (id) => req(`permissions/${enc(id)}`, "DELETE"),
    // users — a user may hold MANY roles (many-to-many via UserRole)
    assignRoles: (userId, roleNames) =>
      req(`users/${enc(userId)}/roles`, "PUT", { roles: roleNames || [] }),
    // back-compat single-role assign (replaces the user's roles with [roleName])
    assignRole: (userId, roleName) =>
      req(`users/${enc(userId)}/role`, "POST", { role: roleName }),
    // menus
    menus: () => req("menus"),
    menusFlat: () => req("menus/flat"),
    createMenu: (body) => req("menus", "POST", body),
    updateMenu: (id, body) => req(`menus/${enc(id)}`, "PUT", body),
    deleteMenu: (id) => req(`menus/${enc(id)}`, "DELETE"),
    // current user
    me,
    myMenus: () => req("me/menus"),
    check: (permission, mode = "any") =>
      req(
        "check",
        "POST",
        Array.isArray(permission)
          ? { permissions: permission, mode }
          : { permission }
      ),
    // idempotent bootstrap (admin)
    seed: (body) => req("seed", "POST", body || {}),
    // client-side convenience: cached me() + local wildcard eval (UX gating only;
    // enforce real access in edge functions via check()).
    hasPermission: async (key, opts = {}) => {
      const info = await me(opts);
      if (info && info.isAdmin) return true;
      const perms = (info && info.permissions) || [];
      return perms.some((g) => matches(g, key));
    },
    refresh: () => {
      mePromise = null;
    },
  };
}

// =============================================================
// Root createClient
// =============================================================
export function createClient(config) {
  if (!config?.serverUrl) throw new Error("serverUrl is required");

  const http = createHttp(config);
  const httpFunctions = createHttp({
    ...config,
    serverUrl: config.serverUrl.replace(/\/entities\/?$/, ""),
  });

  const client = {
    entities: createEntities(http),
    integrations: createIntegrations(http),
    functions: createFunctions(httpFunctions),
    rbac: createRbac(httpFunctions),
    auth: createAuth(http, config),
    setToken: (t) => http.setToken(t, true),
    getConfig: () => ({ serverUrl: config.serverUrl }),
  };

  // dynamic modules
  return new Proxy(client, {
    get(target, prop) {
      if (prop in target) return target[prop];

      const dyn = createDynamicModule(prop, http);
      target[prop] = dyn;
      return dyn;
    },
  });
}
