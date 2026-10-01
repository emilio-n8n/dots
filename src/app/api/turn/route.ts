import type { NextRequest } from "next/server";
import { runTurn } from "@/lib/agent";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { prompt?: string; projectId?: string };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }
  const result = await runTurn({ prompt, projectId: body.projectId, kind: "human" });
  return Response.json(result);
}