export const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// PORT is always injected by server.ts — no hardcoded port needed
const port = parseInt(Deno.env.get("PORT")!);

Deno.serve({ port }, async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        if (req.method === "GET") {
            return new Response(
                JSON.stringify({
                    message: "Hello from Deno Edge Function! 🦕",
                    timestamp: new Date().toISOString(),
                }),
                {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                    status: 200,
                },
            );
        }

        const { name } = await req.json();

        return new Response(
            JSON.stringify({
                message: `Hello ${name || "World"}! 🦕`,
                timestamp: new Date().toISOString(),
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            },
        );
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return new Response(
            JSON.stringify({ error: message }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            },
        );
    }
});
