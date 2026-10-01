import { NextResponse } from "next/server";
import { getState, interpretReflection, shouldWake, sleepFor, wake } from "@/lib/lifecycle";
import { runTurn } from "@/lib/agent";
import { logEvent } from "@/lib/db";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** POST /api/reflect — one reflection tick.
 *  GET  /api/reflect — poll the dot's phase and sleep state. */
export async function GET() {
  const state = getState();
  const gate = shouldWake();
  return NextResponse.json({
    ...state,
    sleep_at: state.sleep_until ? new Date(state.sleep_until).toISOString() : null,
    due: gate.wake,
  });
}

export async function POST() {
  const result = await runTurn({ kind: "reflection" });
  const verdict = interpretReflection(result.text);

  if (verdict.silent) {
    // Nothing to say and nothing to do: nap. The length is its own call.
    const state = sleepFor(verdict.note.includes("urgent") ? 30 : 90, verdict.note);
    return NextResponse.json({ silent: true, phase: state.phase, reasoning: verdict.note });
  }

  const state = sleepFor(verdict.minutes ?? 60, verdict.note);
  logEvent("dot.spoke", result.text.slice(0, 200));
  return NextResponse.json({
    silent: false,
    message: result.text,
    sleep_minutes: verdict.minutes ?? 60,
    phase: state.phase,
  });
}

export async function PUT() {
  const state = wake("woken externally");
  return NextResponse.json(state);
}