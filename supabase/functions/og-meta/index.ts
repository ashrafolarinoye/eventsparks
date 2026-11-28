import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const eventId = url.searchParams.get("id");

    if (!eventId) {
      return new Response(JSON.stringify({ error: "Missing event id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The events table is publicly readable via RLS, so the anon key (which
    // the Supabase edge runtime provides automatically) is enough.
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data: event, error } = await supabase
      .from("events")
      .select("id, title, description, image, date, location, category, city, country")
      .eq("id", eventId)
      .maybeSingle();

    if (error || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? "https://eventsparks.com";
    const eventUrl = `${siteUrl}/event/${event.id}`;
    const title = escapeHtml(String(event.title ?? "EventSparks"));
    const image = escapeHtml(event.image ?? `${siteUrl}/favicon.png`);
    const location = [event.city, event.country].filter(Boolean).join(", ") || event.location;
    const description = escapeHtml(
      event.description
        ? String(event.description).slice(0, 160)
        : `${event.category} event on ${event.date} — ${location}`
    );

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${title} — EventSparks</title>
    <meta name="description" content="${description}" />

    <!-- Open Graph -->
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="EventSparks" />
    <meta property="og:url" content="${escapeHtml(eventUrl)}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@EventSparks" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />

    <!-- Redirect real users to the SPA -->
    <meta http-equiv="refresh" content="0; url=${escapeHtml(eventUrl)}" />
    <link rel="canonical" href="${escapeHtml(eventUrl)}" />
  </head>
  <body>
    <p>Redirecting to <a href="${escapeHtml(eventUrl)}">${title}</a>…</p>
  </body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        // Cache for 10 minutes so crawlers don't hammer the function
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch (e) {
    console.error("og-meta error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
