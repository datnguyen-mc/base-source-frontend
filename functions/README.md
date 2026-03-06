# Edge Functions (Deno)

Each edge function is a standalone Deno HTTP server stored at
`functions/<function-name>/index.ts`. Folder name = function slug. Entry file
**must** be named `index.ts`. All logic in a single file.

## Template

```typescript
const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const port = parseInt(Deno.env.get("PORT")!);

Deno.serve({ port }, async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Example: parse body and call external API with secret
        const { city } = await req.json();
        const apiKey = Deno.env.get("OPENWEATHER_API_KEY");

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: "API key not configured" }),
                {
                    status: 500,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        const url = `https://api.openweathermap.org/data/2.5/weather?q=${
            encodeURIComponent(city)
        }&appid=${apiKey}&units=metric`;
        const res = await fetch(url);
        const data = await res.json();

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
```

## Rules

### MUST:

- Use `Deno.env.get("PORT")` — never hardcode a port
- Use `Deno.serve({ port }, handler)` — only supported pattern
- Include `corsHeaders` on every response (including errors)
- Handle `OPTIONS` for CORS preflight
- Always return JSON with `Content-Type: application/json`
- Wrap logic in try/catch with JSON error response

### Environment Variables (Secrets):

- Access via `Deno.env.get("KEY_NAME")` (e.g.
  `Deno.env.get("OPENWEATHER_API_KEY")`)
- Secrets are injected by the backend from project settings
- System auto-scans `Deno.env.get(...)` patterns and saves detected keys

### Allowed:

- `fetch()` for external API calls
- `Deno.env.get()` for environment variables
- Web APIs: `URL`, `URLSearchParams`, `Headers`, `Request`, `Response`
- Built-in: `crypto`, `TextEncoder`, `TextDecoder`
- URL imports: `import { ... } from "https://deno.land/..."`

### NOT allowed:

- File system access (`Deno.readFile`, `Deno.writeFile`)
- Subprocess spawning (`Deno.Command`)
- `npm:` imports
- Multi-file functions or cross-folder imports
