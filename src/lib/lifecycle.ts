import { db, id, logEvent, now, one } from "./db";
import type { DotPhase, DotState } from "./types";

/**
 * The lifecycle that makes a dot a dot rather than a cron job.
 *
 *   active    → it has work and is moving on it
 *   reflecting → no human prompt: did I finish everything they'd want done?
 *   sleeping  → it decided it has nothing left to do, and chose its own wake time
 *
 * Nothing external sets the schedule. `sleep_until` is the dot's own answer to
 * "when should I look again", written by its reflection turn.
 */
export function getState(): DotState {
  const row = one<DotState>("SELECT * FROM dot_state WHERE id=1");
  if (row) return row;
  const initial: DotState = {
    id: 1,
    phase: "active",
    sleep_until: null,
    last_reasoning: "",
    consecutive_idles: 0,
    updated_at: now(),
  };
  // INSERT OR IGNORE so a concurrent process can't trip the primary key.
  db()
    .prepare(
      "INSERT OR IGNORE INTO dot_state (id, phase, sleep_until, last_reasoning, consecutive_idles, updated_at) VALUES (1,'active',NULL,'',0,?)",
    )
    .run(now());
  return { ...initial, phase: "active" };
}

export function setPhase(phase: DotPhase, patch: Partial<DotState> = {}) {
  const current = getState();
  const next: Partial<DotState> = { phase, updated_at: now(), ...patch };
  const cols = Object.keys(next);
  if (cols.length === 0) return;
  // WHERE id=1 is a literal, so only the SET columns may appear as bindings.
  const sql = `UPDATE dot_state SET ${cols.map((c) => `${c}=@${c}`).join(",")} WHERE id=1`;
  db()
    .prepare(sql)
    .run(next as never);
  logEvent("dot.phase", phase);
  return { ...current, ...next } as DotState;
}

/** The dot picks its own nap length. `minutes` is its decision, not a schedule
 *  anyone configured — minimum 1, and it may go long when nothing is pressing. */
export function sleepFor(minutes: number, reason: string): DotState {
  const clamped = Math.max(1, Math.min(minutes, 60 * 24));
  return setPhase("sleeping", {
    sleep_until: now() + clamped * 60_000,
    last_reasoning: reason,
  })!;
}

export function wake(reason: string): DotState {
  return setPhase("active", {
    sleep_until: null,
    last_reasoning: reason,
    consecutive_idles: 0,
  })!;
}

/** Should the daemon run a reflection turn right now? */
export function shouldWake(): { wake: boolean; reason: string } {
  const state = getState();
  if (state.phase === "active") return { wake: true, reason: "active" };
  if (state.sleep_until && Date.now() >= state.sleep_until) {
    return { wake: true, reason: "slept long enough" };
  }
  return { wake: false, reason: state.last_reasoning };
}

/** Parse the reflection reply into a sleep decision. `[SILENT]` means the dot
 *  decided it has nothing to say and nothing to do — not a failure. */
export function interpretReflection(
  text: string,
): { silent: boolean; minutes?: number; note: string } {
  const trimmed = text.trim();
  if (trimmed.includes("[SILENT]") || trimmed.length === 0) {
    return { silent: true, note: "nothing to say, nothing to do" };
  }
  // A duration the dot named for itself, in minutes. Default: 60.
  const explicit = trimmed.match(/sleep\s*(?:for)?\s*(\d+)\s*(m|min|minutes?|h|hours?)/i);
  let minutes = 60;
  if (explicit) {
    const value = Number(explicit[1]);
    minutes = explicit[2].toLowerCase().startsWith("h") ? value * 60 : value;
  } else {
    const casual = /nothing urgent|quiete|calm|no urgency|rien d'urgent/i.test(trimmed);
    minutes = casual ? 180 : 45;
  }
  return { silent: false, minutes, note: trimmed.slice(0, 300) };
}

export function newApprovalId() {
  return id("apr");
}