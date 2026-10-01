#!/usr/bin/env node
/**
 * dotsd — the dot's daemon.
 *
 * A dot is not a cron job. It runs a loop:
 *
 *   wake → work a project → reflect → decide whether it has anything left to do
 *        → if not, sleep for a duration IT chooses → wake
 *
 * The wake time is written by the dot's own reflection turn (see
 * src/lib/lifecycle.ts). Nothing here schedules it. This process only exists to
 * ask the question "is it time?" — the answer is always in SQLite.
 *
 * Usage:  npm run daemon
 */
import { runTurn } from "../src/lib/agent";
import { getState, interpretReflection, sleepFor, wake } from "../src/lib/lifecycle";
import { listProjects, updateProject } from "../src/lib/projects";
import { logEvent } from "../src/lib/db";

const TICK_MS = Number(process.env.DOTS_TICK_MS ?? 30_000);
const STALE_MS = Number(process.env.DOTS_STALE_MS ?? 900_000);

let busy = false;

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const state = getState();
    if (state.phase === "sleeping" && state.sleep_until && Date.now() < state.sleep_until) return;

    if (state.phase === "sleeping") wake("sleep elapsed");

    const projects = listProjects("active");
    if (projects.length === 0) {
      // Nothing to advance. Nap without burning a model call.
      sleepFor(60, "no active project; idle");
      return;
    }

    // Round-robin over active projects: one project gets this tick's attention,
    // then sleeps until the next. The dot's own reflection decides the pace.
    const project = projects[0];
    const stale = Date.now() - project.updated_at > STALE_MS;
    if (stale && !project.next_step) {
      updateProject(project.id, { next_step: "revisit: no progress recorded in a while" });
    }

    logEvent("dot.tick", `working on ${project.title}`, project.id);
    const result = await runTurn({ projectId: project.id, kind: "reflection" });
    const verdict = interpretReflection(result.text);

    if (verdict.silent) {
      sleepFor(90, `nothing more on "${project.title}" right now`);
    } else {
      // The dot spoke: it has something worth surfacing. Short nap so it stays
      // responsive to whatever the person says back.
      sleepFor(verdict.minutes ?? 20, verdict.note);
      logEvent("dot.spoke", result.text.slice(0, 240), project.id);
      maybeNotify(result.text);
    }
  } catch (error) {
    logEvent("dot.error", String(error).slice(0, 300));
    sleepFor(15, "error on last tick; retrying shortly");
  } finally {
    busy = false;
  }
}

/** Proactive delivery: the dot speaks first. Today that's the activity log; a
 *  channel adapter (Slack/Telegram/webhook) drops in here. */
function maybeNotify(text: string) {
  const hook = process.env.DOTS_WEBHOOK_URL;
  if (!hook) return;
  void fetch(hook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => {
    /* delivery is best-effort; the log already has it */
  });
}

process.stdout.write(`dotsd: polling every ${TICK_MS / 1000}s\n`);
setInterval(() => void tick(), TICK_MS);
void tick();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logEvent("dot.stopped", `received ${signal}`);
    process.exit(0);
  });
}