const FIELDS = [
  "name", "email", "phone", "company", "country", "role", "facility",
  "line", "complexity", "timeline", "quantity", "message",
  "utm_source", "utm_medium", "utm_campaign", "referrer",
];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function readBody(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json();
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

async function createLead(request, env, ctx) {
  let body;
  try {
    body = await readBody(request);
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  // Honeypot: real visitors never fill this hidden field.
  if (body.website) return json({ ok: true });

  const lead = {};
  for (const key of FIELDS) {
    lead[key] = String(body[key] ?? "").trim().slice(0, key === "message" ? 3000 : 300);
  }

  if (!lead.name || !lead.email) {
    return json({ ok: false, error: "Name and e-mail are required." }, 422);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return json({ ok: false, error: "Please enter a valid e-mail address." }, 422);
  }

  const ipCountry = request.cf?.country || "";
  const userAgent = (request.headers.get("user-agent") || "").slice(0, 300);

  await env.DB.prepare(
    `INSERT INTO leads (${FIELDS.join(", ")}, ip_country, user_agent)
     VALUES (${FIELDS.map(() => "?").join(", ")}, ?, ?)`
  )
    .bind(...FIELDS.map((k) => lead[k] || null), ipCountry, userAgent)
    .run();

  if (env.LEAD_WEBHOOK_URL) {
    ctx.waitUntil(
      fetch(env.LEAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...lead, ip_country: ipCountry, source: "deltronix-landing" }),
      }).catch(() => {})
    );
  }

  return json({ ok: true });
}

function toCsv(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

async function exportLeads(request, env) {
  const token = new URL(request.url).searchParams.get("token");
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { results } = await env.DB.prepare("SELECT * FROM leads ORDER BY id DESC").all();
  return new Response("﻿" + toCsv(results), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="deltronix-leads.csv"',
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/lead") {
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
      try {
        return await createLead(request, env, ctx);
      } catch (err) {
        console.error("lead error", err);
        return json({ ok: false, error: "We could not save your request. Please try again." }, 500);
      }
    }

    if (pathname === "/api/leads.csv") return exportLeads(request, env);

    if (pathname.startsWith("/api/")) return json({ ok: false, error: "Not found." }, 404);

    return env.ASSETS.fetch(request);
  },
};
