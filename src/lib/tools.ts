import { tool } from "ai";
import { z } from "zod";
import { all, id, insert, logEvent, now, one, update } from "./db";
import { remember } from "./memory";
import { createProject, updateProject } from "./projects";
import { judge } from "./rules";
import type { Approval } from "./types";

/**
 * Tools handed to the dot. Small on purpose: the interesting behaviour is the
 * project/ memory lifecycle and autonomy gating, not a big tool catalogue.
 * `execute` is the sandbox seam — swap the body for a real container and the
 * agent code above it does not change.
 */
export const dotTools = {
  open_project: tool({
    description:
      "Take ownership of new work. Opens a project so you can make progress on it across turns without being asked again.",
    inputSchema: z.object({
      title: z.string().describe("Short name, 3-8 words"),
      goal: z.string().describe("What 'done' looks like"),
    }),
    execute: async ({ title, goal }) => {
      const project = createProject({ title, goal });
      logEvent("tool.open_project", `${title} — ${goal}`, project.id);
      return `Project opened: ${project.id} "${title}". Work autonomously; report when there's something to show.`;
    },
  }),

  advance_project: tool({
    description:
      "Update a project's status, next step, or findings. Call this as you work so you can resume cleanly after sleeping.",
    inputSchema: z.object({
      project_id: z.string(),
      status: z.enum(["active", "paused", "done", "blocked"]).optional(),
      next_step: z.string().optional().describe("The single next concrete action"),
      findings: z.string().optional().describe("What you learned. Persisted in the project dossier."),
    }),
    execute: async ({ project_id, status, next_step, findings }) => {
      const project = updateProject(project_id, { status, next_step, findings });
      if (!project) return `No such project: ${project_id}`;
      return `Updated "${project.title}" (${project.status}).`;
    },
  }),

  remember: tool({
    description:
      "Store a durable fact about the person: their preferences, their standards for good work, or a correction they made. Use it when you learn something that should change how you work in future — not for transient task state.",
    inputSchema: z.object({
      kind: z.enum(["preference", "standard", "person", "project", "correction"]),
      content: z.string().describe("One sentence, specific and actionable"),
    }),
    execute: async ({ kind, content }) => {
      const memory = remember({ kind, content });
      return `Remembered (${kind}): ${memory.content}`;
    },
  }),

  request_approval: tool({
    description:
      "Ask the human to decide on a sensitive action. The autonomy rules decide whether you must call this — payments and irreversible destruction always do.",
    inputSchema: z.object({
      action: z.string().describe("What you want to do, concretely"),
      detail: z.string().optional().describe("What it affects, cost, and how to undo it if possible"),
      project_id: z.string().optional(),
    }),
    execute: async ({ action, detail, project_id }) => {
      const verdict = judge(action, detail ?? "");
      if (verdict.verdict === "block") {
        const approval: Approval = {
          id: id("apr"),
          project_id: project_id ?? null,
          action,
          detail: detail ?? "",
          status: "pending",
          created_at: now(),
          decided_at: null,
        };
        insert("approvals", approval);
        logEvent("approval.blocked", action, project_id ?? undefined);
        return `Blocked by policy "${verdict.rule?.pattern}" (${verdict.rule?.reason}). Queued for a human to decide. Do not proceed.`;
      }
      if (verdict.verdict === "auto") {
        logEvent("approval.auto", action, project_id ?? undefined);
        return `No rule blocks this — proceed autonomously.`;
      }
      const approval: Approval = {
        id: id("apr"),
        project_id: project_id ?? null,
        action,
        detail: detail ?? "",
        status: "pending",
        created_at: now(),
        decided_at: null,
      };
      insert("approvals", approval);
      logEvent("approval.requested", action, project_id ?? undefined);
      return `Approval requested (id ${approval.id}). Stop here and wait; do not retry this action.`;
    },
  }),

  log_activity: tool({
    description:
      "Note something worth keeping in the activity log — a milestone, a finding, a change of direction. Cheap, and it's how the person reviews your work later.",
    inputSchema: z.object({
      summary: z.string(),
      project_id: z.string().optional(),
    }),
    execute: async ({ summary, project_id }) => {
      logEvent("activity", summary, project_id ?? undefined);
      return "Logged.";
    },
  }),

  execute: tool({
    description:
      "Run a shell command in your own sandboxed workspace. This is your computer: use it to read code, run tests, build things.",
    inputSchema: z.object({
      command: z.string(),
      cwd: z.string().optional().describe("Absolute path inside your workspace"),
    }),
    execute: async ({ command, cwd }) => {
      const verdict = judge("execute", command);
      if (verdict.verdict === "block") {
        return `Refused: "${verdict.rule?.pattern}" (${verdict.rule?.reason})`;
      }
      // Sandbox seam: a real build shells out to the container runtime.
      return `Sandbox stub. Would run \`${command}\` in ${cwd ?? "/workspace"}.`;
    },
  }),
};

export function pendingApprovals(): Approval[] {
  return all<Approval>(
    "SELECT * FROM approvals WHERE status='pending' ORDER BY created_at DESC",
  );
}

export function decideApproval(approvalId: string, approved: boolean): Approval | undefined {
  const row = one<Approval>("SELECT * FROM approvals WHERE id=?", approvalId);
  if (!row) return undefined;
  const status = approved ? "approved" : "denied";
  update("approvals", approvalId, { status, decided_at: now() });
  logEvent(`approval.${status}`, row.action, row.project_id ?? undefined);
  return { ...row, status, decided_at: now() };
}