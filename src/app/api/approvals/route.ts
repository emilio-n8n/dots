import { NextResponse } from "next/server";
import { decideApproval, pendingApprovals } from "@/lib/tools";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ approvals: pendingApprovals() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { id: string; approve: boolean };
  const decided = decideApproval(body.id, body.approve);
  if (!decided) return NextResponse.json({ error: "unknown approval" }, { status: 404 });
  return NextResponse.json({ approval: decided });
}