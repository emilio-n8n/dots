import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA } from "./schema";

/**
 * One SQLite file is the whole datastore. WAL keeps the daemon's writes from
 * blocking the web UI's reads while the dot is mid-turn.
 */
const here = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DOTS_DB ?? join(here, "../../data/dots.db");

declare global {
  // eslint-disable-next-line no-var
  var __dots_db: DatabaseSync | undefined;
}

function open(): DatabaseSync {
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db.exec(SCHEMA);
  return db;
}

export function db(): DatabaseSync {
  if (!globalThis.__dots_db) globalThis.__dots_db = open();
  return globalThis.__dots_db;
}

export function now(): number {
  return Date.now();
}

export function id(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

/** Insert helper: `insert('projects', { id, title })`. */
export function insert(table: string, row: object) {
  const record = row as Row;
  const cols = Object.keys(record);
  const sql = `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols
    .map((c) => `@${c}`)
    .join(",")})`;
  db().prepare(sql).run(record as never);
}

/** Update helper: `update('projects', id, { status: 'done' })`. */
export function update(table: string, rowId: string, patch: object) {
  const record = patch as Row;
  const cols = Object.keys(record);
  if (cols.length === 0) return;
  const sql = `UPDATE ${table} SET ${cols.map((c) => `${c}=@${c}`).join(",")} WHERE id=@__id`;
  db()
    .prepare(sql)
    .run({ ...record, __id: rowId } as never);
}

export function all<T>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...(params as never[])) as T[];
}

/** Row shapes are plain interfaces without index signatures, so the SQL
 *  helpers accept `object` and cast internally. */
export type Row = Record<string, unknown>;

export function one<T>(sql: string, ...params: unknown[]): T | undefined {
  return db().prepare(sql).get(...(params as never[])) as T | undefined;
}

export function logEvent(type: string, detail = "", projectId?: string) {
  insert("events", { id: id("ev"), type, detail, project_id: projectId ?? null, created_at: now() });
}