import { generateText, type ModelMessage } from "ai";
import { all, id, insert, logEvent, now } from "./db";
import { model, systemPrompt, toModelMessages } from "./provider";
import { dotTools } from "./tools";
import type { Message } from "./types";

export interface TurnResult {
  text: string;
  projectId?: string;
}

export interface TurnInput {
  prompt?: string;
  projectId?: string;
  /** The reflection turn runs with no human prompt; it decides what to do next. */
  kind?: "human" | "reflection";
}

/** One agent turn. Persists the user message, runs the loop with tools, stores
 *  the reply. Deliberately synchronous — the daemon and the HTTP route both call
 *  this and neither wants a half-finished stream. */
export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const projectId = input.projectId ?? null;

  if (input.prompt) {
    insert("messages", {
      id: id("msg"),
      project_id: projectId,
      role: "user",
      content: input.prompt,
      created_at: now(),
    });
  }

  const history = input.projectId
    ? recentHistory(projectId, 14)
    : recentHistory(null, 14);

  const userTurn: ModelMessage = input.prompt
    ? { role: "user", content: input.prompt }
    : {
        role: "user",
        content:
          "Reflection turn. No one asked you anything. Decide what you should do next across your projects, or decide you have nothing worth doing right now. If you act, use your tools and leave the projects in a resumable state. Then say, in one or two sentences, whether you have anything worth telling them — if not, reply with exactly [SILENT].",
      };

  const result = await generateText({
    model,
    system: systemPrompt(input.projectId),
    messages: [...toModelMessages(history), userTurn],
    tools: dotTools,
    stopWhen: ({ steps }) => steps.length >= 8,
  });

  const text = result.text.trim();
  insert("messages", {
    id: id("msg"),
    project_id: projectId,
    role: "assistant",
    content: text,
    created_at: now(),
  });
  logEvent(input.kind === "reflection" ? "turn.reflection" : "turn.human", text.slice(0, 160), projectId ?? undefined);

  return { text, projectId: projectId ?? undefined };
}

function recentHistory(projectId: string | null, limit: number): Message[] {
  return projectId ? recentForProject(projectId, limit) : recentGlobal(limit);
}

function recentForProject(projectId: string, limit: number): Message[] {
  return all<Message>(
    "SELECT * FROM messages WHERE project_id=? ORDER BY created_at DESC LIMIT ?",
    projectId,
    limit,
  ).reverse();
}

function recentGlobal(limit: number): Message[] {
  return all<Message>(
    "SELECT * FROM messages WHERE project_id IS NULL ORDER BY created_at DESC LIMIT ?",
    limit,
  ).reverse();
}