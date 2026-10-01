-- Dots schema. One file, no server. See src/lib/db.ts.

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, created_at);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  goal        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','paused','done','blocked')),
  next_step   TEXT NOT NULL DEFAULT '',
  findings    TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status, updated_at);

-- The dot's long-term memory of the human. Not conversation history:
-- durable preferences, standards, and what "good work" means to them.
CREATE TABLE IF NOT EXISTS memories (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'preference'
              CHECK (kind IN ('preference','standard','person','project','correction')),
  content     TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'inferred',
  hits        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind, updated_at DESC);

-- Autonomy rules. Yolo by default; this table is the short exception list.
CREATE TABLE IF NOT EXISTS rules (
  id          TEXT PRIMARY KEY,
  pattern     TEXT NOT NULL,
  verdict     TEXT NOT NULL CHECK (verdict IN ('auto','approve','block')),
  reason      TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rules_pattern ON rules(pattern);

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  type        TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);

-- Sleep bookkeeping. The dot picks its own wake time; nothing external decides.
CREATE TABLE IF NOT EXISTS dot_state (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  phase             TEXT NOT NULL DEFAULT 'idle'
                    CHECK (phase IN ('active','reflecting','sleeping')),
  sleep_until       INTEGER,
  last_reasoning    TEXT NOT NULL DEFAULT '',
  consecutive_idles INTEGER NOT NULL DEFAULT 0,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','approved','denied')),
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, created_at DESC);