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

// ---------- CRM admin ----------

const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];
const EDITABLE = ["stage", "owner", "deal_value", "next_action_at"];

// No login while ADMIN_PASSWORD is unset; once set, the browser asks for user "admin" + that password.
function adminAuthorized(request, env) {
  if (!env.ADMIN_PASSWORD) return true;
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const [, pass] = atob(header.slice(6)).split(/:(.*)/s);
    return pass === env.ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

const unauthorized = () =>
  new Response("Authentication required", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Deltronix CRM"' },
  });

async function listLeads(env) {
  const protectedByPassword = Boolean(env.ADMIN_PASSWORD);
  const { results } = await env.DB.prepare(
    `SELECT l.*, (SELECT COUNT(*) FROM lead_notes n WHERE n.lead_id = l.id) AS notes_count,
            (SELECT MAX(created_at) FROM lead_notes n WHERE n.lead_id = l.id) AS last_activity_at
     FROM leads l ORDER BY l.id DESC`
  ).all();
  return json({ ok: true, leads: results, stages: STAGES, protected: protectedByPassword });
}

async function getLead(env, id) {
  const lead = await env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first();
  if (!lead) return json({ ok: false, error: "Lead not found." }, 404);
  const { results } = await env.DB.prepare(
    "SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY id DESC"
  ).bind(id).all();
  return json({ ok: true, lead, notes: results });
}

async function updateLead(request, env, id) {
  const body = await request.json();
  const before = await env.DB.prepare("SELECT stage FROM leads WHERE id = ?").bind(id).first();
  if (!before) return json({ ok: false, error: "Lead not found." }, 404);

  const sets = [];
  const values = [];
  for (const key of EDITABLE) {
    if (!(key in body)) continue;
    let v = body[key];
    if (key === "stage" && !STAGES.includes(v)) return json({ ok: false, error: "Invalid stage." }, 422);
    if (key === "deal_value") v = v === "" || v == null ? null : Number(v);
    else v = v === "" || v == null ? null : String(v).slice(0, 200);
    sets.push(`${key} = ?`);
    values.push(v);
  }
  if (!sets.length) return json({ ok: false, error: "Nothing to update." }, 422);

  const statements = [
    env.DB.prepare(`UPDATE leads SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`)
      .bind(...values, id),
  ];
  if (body.stage && body.stage !== before.stage) {
    statements.push(
      env.DB.prepare("INSERT INTO lead_notes (lead_id, kind, body) VALUES (?, 'stage', ?)")
        .bind(id, `${before.stage} → ${body.stage}`)
    );
  }
  await env.DB.batch(statements);
  return getLead(env, id);
}

async function addNote(request, env, id) {
  const { body, kind } = await request.json();
  const text = String(body || "").trim().slice(0, 3000);
  if (!text) return json({ ok: false, error: "Note is empty." }, 422);
  const type = ["note", "call", "email", "whatsapp", "meeting"].includes(kind) ? kind : "note";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO lead_notes (lead_id, kind, body) VALUES (?, ?, ?)").bind(id, type, text),
    env.DB.prepare("UPDATE leads SET updated_at = datetime('now') WHERE id = ?").bind(id),
  ]);
  return getLead(env, id);
}

async function adminCsv(env) {
  const { results } = await env.DB.prepare("SELECT * FROM leads ORDER BY id DESC").all();
  return new Response("﻿" + toCsv(results), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="deltronix-leads.csv"',
      "cache-control": "no-store",
    },
  });
}

async function handleAdminApi(request, env, pathname) {
  const parts = pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);
  const method = request.method;

  if (parts[0] === "leads.csv" && method === "GET") return adminCsv(env);
  if (parts[0] !== "leads") return json({ ok: false, error: "Not found." }, 404);
  if (parts.length === 1 && method === "GET") return listLeads(env);

  const id = Number(parts[1]);
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: "Invalid id." }, 400);
  if (parts.length === 2 && method === "GET") return getLead(env, id);
  if (parts.length === 2 && method === "PATCH") return updateLead(request, env, id);
  if (parts.length === 3 && parts[2] === "notes" && method === "POST") return addNote(request, env, id);
  return json({ ok: false, error: "Not found." }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/")) {
      if (!adminAuthorized(request, env)) return unauthorized();
      if (pathname.startsWith("/api/admin/")) {
        try {
          return await handleAdminApi(request, env, pathname);
        } catch (err) {
          console.error("admin error", err);
          return json({ ok: false, error: "Server error." }, 500);
        }
      }
      const res = await env.ASSETS.fetch(request);
      const headers = new Headers(res.headers);
      headers.set("x-robots-tag", "noindex, nofollow");
      headers.set("cache-control", "no-store");
      return new Response(res.body, { status: res.status, headers });
    }

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
