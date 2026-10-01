import type { Memory } from "./types";
import { all, id, insert, now, one, update } from "./db";

export function remember(input: {
  kind: Memory["kind"];
  content: string;
  projectId?: string;
  source?: string;
}): Memory {
  const content = input.content.trim();
  // Upsert on exact content so repeated inferences don't multiply.
  const existing = one<Memory>(
    "SELECT * FROM memories WHERE content=? AND kind=?",
    content,
    input.kind,
  );
  const stamp = now();
  if (existing) {
    update("memories", existing.id, { hits: existing.hits + 1, updated_at: stamp });
    return { ...existing, hits: existing.hits + 1 };
  }
  const memory: Memory = {
    id: id("mem"),
    project_id: input.projectId ?? null,
    kind: input.kind,
    content,
    source: input.source ?? "inferred",
    hits: 0,
    created_at: stamp,
    updated_at: stamp,
  };
  insert("memories", memory);
  return memory;
}

export function memories(kind?: Memory["kind"], limit = 40): Memory[] {
  return kind
    ? all<Memory>(
        "SELECT * FROM memories WHERE kind=? ORDER BY updated_at DESC LIMIT ?",
        kind,
        limit,
      )
    : all<Memory>("SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?", limit);
}

/** The durable layer injected into every turn. This is how the dot gets to know
 *  the human: their standards and corrections, not their chat history. */
export function memoryBrief(limit = 25): string {
  const rows = memories(undefined, limit);
  if (!rows.length) return "";
  const groups = new Map<Memory["kind"], string[]>();
  for (const row of rows) {
    const list = groups.get(row.kind) ?? [];
    list.push(`- ${row.content}`);
    groups.set(row.kind, list);
  }
  const labels: Record<Memory["kind"], string> = {
    preference: "Preferences",
    standard: "Standards for good work",
    person: "About them",
    project: "Project notes",
    correction: "Corrections they made",
  };
  const sections: string[] = [];
  for (const [kind, lines] of groups) sections.push(`${labels[kind]}:\n${lines.join("\n")}`);
  return sections.join("\n\n");
}