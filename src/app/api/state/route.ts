import { NextResponse } from "next/server";
import { all } from "@/lib/db";
import { listProjects } from "@/lib/projects";
import { memories } from "@/lib/memory";
import { rules } from "@/lib/rules";
import { pendingApprovals } from "@/lib/tools";
import { getState } from "@/lib/lifecycle";
import type { DotEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

/** One call that fills the whole dashboard. The UI polls this; cheap enough
 *  at SQLite scale and avoids a waterfall of five requests. */
export async function GET() {
  const state = getState();
  return NextResponse.json({
    dot: {
      ...state,
      sleep_at: state.sleep_until ? new Date(state.sleep_until).toISOString() : null,
    },
    projects: listProjects(),
    memories: memories(undefined, 20),
    rules: rules(),
    approvals: pendingApprovals(),
    activity: all<DotEvent>("SELECT * FROM events ORDER BY created_at DESC LIMIT 60"),
  });
}