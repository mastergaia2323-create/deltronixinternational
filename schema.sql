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

-- CRM (migration 2): pipeline fields + notes/activity log
-- For an existing database run only the statements below.
ALTER TABLE leads ADD COLUMN stage TEXT NOT NULL DEFAULT 'new';
ALTER TABLE leads ADD COLUMN owner TEXT;
ALTER TABLE leads ADD COLUMN deal_value REAL;
ALTER TABLE leads ADD COLUMN next_action_at TEXT;
ALTER TABLE leads ADD COLUMN updated_at TEXT;

CREATE TABLE IF NOT EXISTS lead_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL DEFAULT 'note',
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_notes_lead ON lead_notes(lead_id);
