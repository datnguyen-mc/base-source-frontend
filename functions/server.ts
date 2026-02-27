export const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// =============================================
// Mini Edge Runtime — Supabase-style
// Auto-discovers functions, spawns each as
// a subprocess, and reverse-proxies requests.
// =============================================

interface FunctionWorker {
    name: string;
    port: number;
    process: Deno.ChildProcess;
}

const PROXY_PORT = 5100;
const workers: FunctionWorker[] = [];

// Find a free port by binding to port 0 (OS assigns random available port)
function findFreePort(): number {
    const listener = Deno.listen({ port: 0 });
    const port = (listener.addr as Deno.NetAddr).port;
    listener.close();
    return port;
}

// 1. Discover all functions with index.ts
async function discoverFunctions(): Promise<string[]> {
    const functionsDir = new URL(".", import.meta.url).pathname;
    const functions: string[] = [];

    for await (const entry of Deno.readDir(functionsDir)) {
        if (
            !entry.isDirectory || entry.name.startsWith("_") ||
            entry.name.startsWith(".")
        ) {
            continue;
        }

        const indexPath = `${functionsDir}${entry.name}/index.ts`;
        try {
            await Deno.stat(indexPath);
            functions.push(entry.name);
        } catch {
            // No index.ts, skip (e.g. handler.ts-only folders)
        }
    }

    return functions.sort();
}

// 2. Spawn each function as a subprocess
function spawnFunction(name: string, port: number): Deno.ChildProcess {
    const functionsDir = new URL(".", import.meta.url).pathname;
    const indexPath = `${functionsDir}${name}/index.ts`;

    const command = new Deno.Command("deno", {
        args: ["run", "--allow-net", "--allow-read", "--allow-env", indexPath],
        env: { ...Deno.env.toObject(), PORT: String(port) },
        stdout: "piped",
        stderr: "piped",
    });

    const process = command.spawn();

    // Pipe stdout/stderr with function name prefix
    (async () => {
        const reader = process.stdout.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value).trim();
            if (text) console.log(`  [${name}] ${text}`);
        }
    })();

    (async () => {
        const reader = process.stderr.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value).trim();
            if (text) console.error(`  [${name}] ${text}`);
        }
    })();

    return process;
}

// 3. Reverse proxy — forward request to the right worker
async function proxyRequest(
    req: Request,
    targetPort: number,
): Promise<Response> {
    const url = new URL(req.url);
    const targetUrl =
        `http://localhost:${targetPort}${url.pathname}${url.search}`;

    const headers = new Headers(req.headers);

    const proxyReq: RequestInit = {
        method: req.method,
        headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
        proxyReq.body = req.body;
    }

    const res = await fetch(targetUrl, proxyReq);

    const responseHeaders = new Headers(res.headers);
    // Ensure CORS headers from proxy
    for (const [key, value] of Object.entries(corsHeaders)) {
        responseHeaders.set(key, value);
    }

    return new Response(res.body, {
        status: res.status,
        headers: responseHeaders,
    });
}

// 4. Graceful shutdown
function cleanup() {
    console.log("\n🛑 Shutting down workers...");
    for (const w of workers) {
        try {
            w.process.kill("SIGTERM");
            console.log(`  ✖ ${w.name} (port ${w.port})`);
        } catch { /* already dead */ }
    }
    Deno.exit(0);
}

Deno.addSignalListener("SIGINT", cleanup);
Deno.addSignalListener("SIGTERM", cleanup);

// =============================================
// Boot
// =============================================
console.log("🦕 Edge Runtime starting...\n");

const functions = await discoverFunctions();

if (functions.length === 0) {
    console.error("❌ No functions found! Create functions/<name>/index.ts");
    Deno.exit(1);
}

// Spawn all workers
console.log("📦 Spawning function workers:\n");
for (let i = 0; i < functions.length; i++) {
    const name = functions[i];
    const port = findFreePort();
    const process = spawnFunction(name, port);
    workers.push({ name, port, process });
    console.log(`  ✅ /${name} → localhost:${port}`);
}

// Wait for workers to be ready
await new Promise((r) => setTimeout(r, 1500));

// Build route map
const routeMap = new Map<string, number>();
for (const w of workers) {
    routeMap.set(`/${w.name}`, w.port);
}

// Start main proxy server
console.log(`\n🚀 Edge Runtime ready on http://localhost:${PROXY_PORT}/`);
console.log(`   ${workers.length} function(s) loaded\n`);

Deno.serve({ port: PROXY_PORT }, async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
        return new Response(
            JSON.stringify({
                status: "ok",
                functions: workers.map((w) => ({
                    name: w.name,
                    route: `/${w.name}`,
                    port: w.port,
                })),
                timestamp: new Date().toISOString(),
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            },
        );
    }

    // Match route
    for (const [prefix, port] of routeMap) {
        if (url.pathname === prefix || url.pathname.startsWith(prefix + "/")) {
            try {
                return await proxyRequest(req, port);
            } catch (err) {
                console.error(`  [proxy] Error forwarding to ${prefix}:`, err);
                return new Response(
                    JSON.stringify({
                        error: `Function ${prefix} is not responding`,
                    }),
                    {
                        headers: {
                            ...corsHeaders,
                            "Content-Type": "application/json",
                        },
                        status: 502,
                    },
                );
            }
        }
    }

    // 404
    return new Response(
        JSON.stringify({
            error: "Not Found",
            available_functions: functions.map((f) => `/${f}`),
        }),
        {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
        },
    );
});
