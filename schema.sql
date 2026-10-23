-- D1 database: deltronix-leads (binding DB)
-- Apply with: npx wrangler d1 execute deltronix-leads --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  country TEXT,
  role TEXT,
  facility TEXT,
  line TEXT,
  complexity TEXT,
  timeline TEXT,
  quantity TEXT,
  message TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,
  ip_country TEXT,
  user_agent TEXT
);
