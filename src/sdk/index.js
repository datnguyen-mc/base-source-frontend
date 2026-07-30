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

  const setToken = (t, save = true) => {
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
          // Add X-App-Id header if configured
          ...(cfg.appId ? { "X-App-Id": cfg.appId } : {}),
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
          if (!path.includes("auth/login") && !path.includes("auth/register") && !path.includes("auth/me")) {
            // window.location.href = "/";
          }
        }
      } catch (e) { }

      throw {
        name: "vibexClientError",
        // Surface the SERVER's message (e.g. "Invalid email or password" on a
        // failed login) instead of a generic "Unauthorized", so the app can
        // show the real reason via `err.message`.
        message: data?.message || data?.title || "Unauthorized",
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
                    // GET /<entity>/list — returns an ARRAY. Pass
                    // { filter, sort, limit, page, fields }; filter/sort are
                    // JSON-encoded (server whitelists filter keys to real
                    // schema fields) and the entity read-policy is enforced.
                    return http.request(`${entity}/list`, {
                      method: "GET",
                      query: clean({
                        filter: args[0]?.filter
                          ? JSON.stringify(args[0].filter)
                          : undefined,
                        sort: args[0]?.sort
                          ? JSON.stringify(args[0].sort)
                          : undefined,
                        limit: args[0]?.limit,
                        page: args[0]?.page,
                        fields: arrToCsv(args[0]?.fields),
                        populate: args[0]?.populate === false ? undefined : 1,
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
                        populate: args[0]?.populate === false ? undefined : 1,
                      }),
                    });

                  case "get":
                    return http.request(
                      `${entity}/${encodeURIComponent(args[0])}/get`,
                      {
                        method: "GET",
                        query: clean({ populate: args[1]?.populate === false ? undefined : 1 }),
                      }
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

                  // NOTE: the client `increment` op was REMOVED. Counters
                  // (like/comment/view) are NOT bumped from the client — they are
                  // derived SERVER-SIDE by a TRIGGER from a policy-gated source
                  // row (e.g. a `Like`), so a `counter:true` field can never be
                  // written or spammed by the client.

                  // Fetch one record by id (alias of get()).
                  // Usage: entities.Post.findById(id) -> record | null
                  case "findById":
                    return http.request(
                      `${entity}/${encodeURIComponent(args[0])}/get`,
                      {
                        method: "GET",
                        query: clean({ populate: args[1]?.populate === false ? undefined : 1 }),
                      }
                    );

                  // Find records where <field> === <value>.
                  // Usage: entities.User.findByField("email", "a@b.com")
                  //        entities.Order.findByField("status", "paid", { sort: { created_at: -1 }, limit: 20 })
                  // Returns an ARRAY. The field must be a real schema field
                  // (server whitelists filter keys); the entity read-policy is
                  // enforced (owner-scope + read-mask), so you only get rows you
                  // may read.
                  case "findByField": {
                    const field = args[0];
                    const value = args[1];
                    const opts = args[2] || {};
                    return http.request(`${entity}/list`, {
                      method: "GET",
                      query: clean({
                        filter: JSON.stringify({ [field]: value }),
                        sort: opts.sort ? JSON.stringify(opts.sort) : undefined,
                        limit: opts.limit,
                        page: opts.page,
                        fields: arrToCsv(opts.fields),
                        populate: opts.populate === false ? undefined : 1,
                      }),
                    });
                  }

                  // Find the FIRST record where <field> === <value>, or null.
                  // Usage: const u = await entities.User.findOneByField("email", email)
                  case "findOneByField": {
                    const field = args[0];
                    const value = args[1];
                    const res = await http.request(`${entity}/list`, {
                      method: "GET",
                      query: clean({
                        filter: JSON.stringify({ [field]: value }),
                        limit: 1,
                        populate: 1,
                      }),
                    });
                    const arr = Array.isArray(res) ? res : (res?.data ?? []);
                    return arr.length ? arr[0] : null;
                  }

                  // Find records matching MULTIPLE conditions (ANDed).
                  // Usage: entities.Order.findByFields({ userId, status: "paid" })
                  //        entities.Order.findByFields({ status: "paid" }, { sort: { created_at: -1 }, limit: 50 })
                  // Returns an ARRAY. Filter keys must be real schema fields
                  // (server whitelists them) and the read-policy is enforced.
                  case "findByFields": {
                    const filter = args[0] || {};
                    const opts = args[1] || {};
                    return http.request(`${entity}/list`, {
                      method: "GET",
                      query: clean({
                        filter: JSON.stringify(filter),
                        sort: opts.sort ? JSON.stringify(opts.sort) : undefined,
                        limit: opts.limit,
                        page: opts.page,
                        fields: arrToCsv(opts.fields),
                        populate: opts.populate === false ? undefined : 1,
                      }),
                    });
                  }

                  // Find the FIRST record matching a general filter object, or null.
                  // Usage: const o = await entities.Order.findOne({ userId, status: "pending" })
                  case "findOne": {
                    const filter = args[0] || {};
                    const opts = args[1] || {};
                    const res = await http.request(`${entity}/list`, {
                      method: "GET",
                      query: clean({
                        filter: JSON.stringify(filter),
                        sort: opts.sort ? JSON.stringify(opts.sort) : undefined,
                        limit: 1,
                        populate: 1,
                      }),
                    });
                    const arr = Array.isArray(res) ? res : (res?.data ?? []);
                    return arr.length ? arr[0] : null;
                  }

                  // ---- Bulk ops (each row/id is policy-enforced server-side) ----
                  // entities.Product.createMany([{...}, {...}])
                  case "createMany":
                    return http.request(`${entity}/createMany`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ items: args[0] || [] }),
                    });

                  // Create-or-update by id: items WITH an existing id → update,
                  // else → create. entities.Product.upsertMany([{ id, ... }, {...}])
                  case "upsertMany":
                    return http.request(`${entity}/upsertMany`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ items: args[0] || [] }),
                    });

                  // Delete a list of ids (each ownership-checked; foreign ids are
                  // skipped). entities.Product.deleteMany([id1, id2, ...])
                  case "deleteMany":
                    return http.request(`${entity}/deleteMany`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ids: args[0] || [] }),
                    });

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
              const data = res?.data?.data || res?.data || res;
              if (data?.token) localStorage.setItem("access_token", data.token);
              if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));
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
              const data = res?.data?.data || res?.data || res;
              if (data?.token) localStorage.setItem("access_token", data.token);
              if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));
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
              // Server-side session invalidation FIRST: ask the backend to
              // revoke this token (Redis denylist) so it can no longer be used
              // even before it expires. The current token is still set, so
              // http.request() attaches it as the Bearer credential to revoke.
              // Best-effort: a network/API error must NOT trap the user in a
              // logged-in state, so we always clear locally afterwards.
              try {
                await http.request("auth/logout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                });
              } catch (_) {
                // ignore — proceed to clear local session regardless
              }
              http.setToken(undefined, true);
              if (typeof window !== "undefined") {
                localStorage.removeItem("access_token");
                localStorage.removeItem("user");
                window.location.href = "/";
              }
              return;

            case "setToken":
              return http.setToken(args[0], args[1]);

            case "loginWithSocial": {
              const provider = args[0];
              const options = args[1] ?? {};
              if (typeof window === "undefined") return;

              // 1. Nhận diện Platform Domain thông minh để redirect Google (Sử dụng window.location.origin để tự động hỗ trợ localhost, preview và custom domains)
              const platformDomain = window.location.origin;

              // 2. Xử lý Google OAuth
              if (provider === "google") {
                const googleClientId = cfg.appId;
                const redirectUri = `${platformDomain}/oauth/google`;
                const state = JSON.stringify({
                  domain: window.location.origin,
                  from_url: window.location.href,
                });
                const googleOAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${encodeURIComponent(
                  redirectUri
                )}&response_type=token&scope=openid+email+profile&prompt=select_account&include_granted_scopes=true&state=${encodeURIComponent(
                  state
                )}`;
                window.location.href = googleOAuthUrl;
                return;
              }

              // 3. Xử lý các provider khác qua Gateway
              const callbackUri = options.callbackUri || "/auth/callback";
              let gatewayBaseUrl = cfg.authServerUrl;
              if (gatewayBaseUrl) {
                gatewayBaseUrl = `${gatewayBaseUrl}/auth`;
              } else {
                gatewayBaseUrl = "https://stg.vibe-x.app/api/modules/auth";
              }
              window.location.href = `${gatewayBaseUrl}/login/${provider}?appId=${cfg.appId}&redirectUri=${encodeURIComponent(
                callbackUri
              )}`;
              return;
            }

            case "handleSocialCallback": {
              const provider = args[0];
              const options = args[1] ?? {};
              if (typeof window === "undefined") return { success: false, error: "Window is undefined" };

              let finalToken = null;
              let finalUser = null;

              if (provider === "google") {
                const hash = window.location.hash;
                if (!hash) {
                  throw new Error("Không tìm thấy thông tin xác thực từ Google trong URL.");
                }

                const params = new URLSearchParams(hash.substring(1));
                const accessToken = params.get("access_token");
                const errorMsg = params.get("error");

                if (errorMsg) {
                  throw new Error(`Lỗi từ Google: ${errorMsg}`);
                }

                if (!accessToken) {
                  throw new Error("Không thể lấy được Access Token của tài khoản Google.");
                }

                // Lấy thông tin user từ Google
                const googleUserRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                  },
                });

                if (!googleUserRes.ok) {
                  throw new Error("Xác thực tài khoản Google thất bại, không thể lấy thông tin profile.");
                }

                const googleUser = await googleUserRes.json();
                const { email, name, picture, sub } = googleUser;

                if (!email) {
                  throw new Error("Không thể lấy được địa chỉ email từ tài khoản Google.");
                }

                // Step 1: Register-First
                let registerData = null;
                let registerRes = null;
                try {
                  registerRes = await fetch(`${http.getConfig().serverUrl}/auth/register`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      email: email,
                      password: sub,
                      name: name || email.split("@")[0],
                      avatar: picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
                      metadata: {
                        googleSub: sub,
                        provider: "google",
                      },
                    }),
                  });
                  registerData = await registerRes.json();
                } catch (regErr) {
                  console.warn("[SDK Auth] Gọi API register gặp lỗi kết nối:", regErr);
                }

                const isRegisterSuccess =
                  registerRes &&
                  registerRes.ok &&
                  (registerData?.success === true || registerData?.data?.success === true);

                if (isRegisterSuccess) {
                  if (registerData?.data?.success === true) {
                    finalToken = registerData?.data?.data?.token || registerData?.data?.token;
                    finalUser = registerData?.data?.data?.user || registerData?.data?.user;
                  } else {
                    finalToken = registerData?.data?.token || registerData?.token;
                    finalUser = registerData?.data?.user || registerData?.user;
                  }
                } else {
                  // Step 2: Fallback to Login
                  const errorMessage = registerData?.data?.message || registerData?.message || "";
                  const isUserAlreadyExists =
                    registerRes?.status === 401 ||
                    errorMessage.toLowerCase().includes("already exists") ||
                    errorMessage.toLowerCase().includes("tồn tại");

                  if (isUserAlreadyExists) {
                    const loginRes = await fetch(`${http.getConfig().serverUrl}/auth/login`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        email: email,
                        password: sub,
                      }),
                    });

                    const loginResData = await loginRes.json();
                    const isLoginSuccess =
                      loginRes.ok &&
                      (loginResData?.success === true || loginResData?.data?.success === true);

                    if (isLoginSuccess) {
                      if (loginResData?.data?.success === true) {
                        finalToken = loginResData?.data?.data?.token || loginResData?.data?.token;
                        finalUser = loginResData?.data?.data?.user || loginResData?.data?.user;
                      } else {
                        finalToken = loginResData?.data?.token || loginResData?.token;
                        finalUser = loginResData?.data?.user || loginResData?.user;
                      }
                    } else {
                      throw new Error(loginResData?.data?.message || loginResData?.message || "Đăng nhập tài khoản thất bại.");
                    }
                  } else {
                    throw new Error(errorMessage || "Đăng ký tài khoản tự động thất bại.");
                  }
                }
              } else {
                // Các provider khác
                const searchParams = new URLSearchParams(window.location.search);
                const token = searchParams.get("token");
                const googleAccessToken = searchParams.get("google_access_token");
                const errorMsg = searchParams.get("error");

                if (errorMsg) {
                  throw new Error(errorMsg);
                }

                finalToken = token;

                if (googleAccessToken) {
                  const loginRes = await http.request("auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      provider_type: "google",
                      provider_token: googleAccessToken,
                    }),
                  });
                  const loginData = loginRes?.data?.data || loginRes?.data || loginRes;
                  if (loginData?.token) {
                    finalToken = loginData.token;
                  } else {
                    throw new Error("Xác thực tài khoản qua Gateway thất bại.");
                  }
                }

                if (!finalToken) {
                  throw new Error("Không nhận được phiên xác thực JWT từ hệ thống.");
                }

                http.setToken(finalToken, true);
                const meRes = await http.request("auth/me", { method: "GET" });
                finalUser = meRes?.data?.data || meRes?.data || meRes;
              }

              if (!finalToken) {
                throw new Error("Không lấy được phiên đăng nhập JWT.");
              }

              http.setToken(finalToken, true);
              localStorage.setItem("access_token", finalToken);
              if (finalUser) {
                localStorage.setItem("user", JSON.stringify(finalUser));
              }

              return { success: true, token: finalToken, user: finalUser };
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
    // Returns a flat ARRAY of the role's permission KEYS (string[]) — kept for
    // display + the legacy key-based editor. (Endpoint responds
    // `{ roleId, role, permissions, permissionIds }`; we unwrap to `permissions`.)
    getRolePermissions: (roleId) =>
      req(`roles/${enc(roleId)}/permissions`).then((r) =>
        Array.isArray(r) ? r : (r && r.permissions) || []
      ),
    // Returns a flat ARRAY of the role's permission IDS (string[]) — the
    // AUTHORITATIVE set. Use this to pre-check the role editor BY ID (like the
    // console FE): `ids.map(String).includes(String(permission.id))`.
    getRolePermissionIds: (roleId) =>
      req(`roles/${enc(roleId)}/permissions`).then((r) =>
        Array.isArray(r) ? [] : (r && r.permissionIds) || []
      ),
    // Save a role's permissions BY ID (console-style). Accepts permission IDS
    // (preferred, authoritative) or keys — the backend resolves each ref and
    // stores the map keyed by permissionId.
    setRolePermissions: (roleId, permissionIds) =>
      req(`roles/${enc(roleId)}/permissions`, "PUT", {
        permissionIds: permissionIds || [],
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

  let authServerUrl = config.serverUrl;
  if (authServerUrl.includes('/entities')) {
    authServerUrl = authServerUrl.replace(/\/entities\/?$/, ''); // remove /entities
    authServerUrl = authServerUrl.replace(/\/v1\/[^/]+$/, '/v1/api/modules'); // replace /v1/{projectKey} with /v1/api/modules
  } else {
    // fallback
    authServerUrl = authServerUrl.replace(/\/entities\/?$/, '') + '/api/modules';
  }

  const httpAuth = createHttp({
    ...config,
    serverUrl: authServerUrl,
  });

  const client = {
    entities: createEntities(http),
    integrations: createIntegrations(http),
    functions: createFunctions(httpFunctions),
    rbac: createRbac(httpFunctions),
    auth: createAuth(http, config),
    setToken: (t) => {
      http.setToken(t, true);
      httpAuth.setToken(t, true);
      httpFunctions.setToken(t, true);
    },
    getConfig: () => ({ serverUrl: config.serverUrl, appId: config.appId, authServerUrl }),
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
