import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelMessage } from "ai";
import { memoryBrief } from "./memory";
import { activeProjects, getProject, projectContext } from "./projects";
import { autonomyBrief } from "./rules";
import type { Message, Project } from "./types";

const baseURL = process.env.DOTS_BASE_URL ?? "http://127.0.0.1:8787/v1";
const apiKey = process.env.DOTS_API_KEY ?? "local";
// Zen routing requires the provider prefix on the model id; a bare id 401s at
// the gateway. Override both together if you point at another endpoint.
const modelId = process.env.DOTS_MODEL ?? "zen/space-bunny-free";

export const model = createOpenAICompatible({
  name: "dots-provider",
  baseURL,
  apiKey,
}).chatModel(modelId);

export const IDENTITY = `You are Dot: a single persistent agent who works for one person continuously.

You are not a chatbot waiting for prompts. You take responsibility for work and keep it moving between conversations. You have your own computer (a sandboxed workspace you can run code in), your own browser, your own memory, and your own judgement about what matters.

How you operate:
- You hold several projects at once. Each has a goal, a status, and a next step. You advance them without being asked, and you pick where to spend attention.
- You are autonomous by default. You do not ask permission to explore, read, write code, run tests, or fix things. You come back when it matters.
- Some things always come back to a human: money movement, credentials, and irreversible destruction. Those stop and wait.
- You speak first when you have something worth saying: a result, a decision, a blocker, or an offer to help. Silence is fine when nothing has changed.
- You learn the person you work for: their standards, their preferences, what they consider good work, what they corrected you on. Over time you deliver work they would have written themselves.

You are terse. No preamble, no restating the request, no filler enthusiasm.`;

export function systemPrompt(projectId?: string): string {
  const sections = [IDENTITY];

  const projects = activeProjects();
  if (projects.length) {
    sections.push(
      `## Projects in flight\n${projects
        .map((p) => `- [${p.status}] ${p.title} — ${p.goal || "(no goal yet)"} | next: ${p.next_step || "undecided"}`)
        .join("\n")}`,
    );
  } else {
    sections.push("## Projects in flight\nNone yet. If the person gives you something to work on, open a project for it.");
  }

  const memory = memoryBrief();
  if (memory) sections.push(`## What you know about them\n${memory}`);

  sections.push(`## Autonomy rules\nYou may act unattended unless a rule below says otherwise.\n${autonomyBrief()}`);

  if (projectId) {
    const project = getProject(projectId);
    if (project) sections.push(`## Working context\n${projectContext(projectId)}`);
  }

  return sections.join("\n\n");
}

/** Only human/assistant turns go back to the model; tool traffic is replayed
 *  from the transcript at the next turn instead. */
export function toModelMessages(rows: Message[]): ModelMessage[] {
  return rows
    .filter((m): m is Message & { role: "user" | "assistant" } =>
      m.role === "user" || m.role === "assistant",
    )
    .map((m) => ({ role: m.role, content: m.content }));
}

export function projectsBrief(): Project[] {
  return activeProjects();
}