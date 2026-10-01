import type { Project } from "./types";
import { all, id, insert, logEvent, now, one, update } from "./db";

export function listProjects(status?: Project["status"]): Project[] {
  const rows = status
    ? all<Project>("SELECT * FROM projects WHERE status=? ORDER BY updated_at DESC", status)
    : all<Project>("SELECT * FROM projects ORDER BY updated_at DESC");
  return rows;
}

export function activeProjects(): Project[] {
  return all<Project>(
    "SELECT * FROM projects WHERE status IN ('active','blocked') ORDER BY updated_at ASC",
  );
}

export function getProject(projectId: string): Project | undefined {
  return one<Project>("SELECT * FROM projects WHERE id=?", projectId);
}

export function createProject(input: { title: string; goal: string }): Project {
  const stamp = now();
  const project: Project = {
    id: id("prj"),
    title: input.title.trim() || "Untitled project",
    goal: input.goal.trim(),
    status: "active",
    next_step: "",
    findings: "",
    created_at: stamp,
    updated_at: stamp,
  };
  insert("projects", project);
  logEvent("project.created", project.title, project.id);
  return project;
}

/** Record the dot's own working state on a project. This is how a dot resumes
 *  a project after sleeping without re-reading the whole transcript. */
export function updateProject(
  projectId: string,
  patch: Partial<Pick<Project, "title" | "goal" | "status" | "next_step" | "findings">>,
): Project | undefined {
  update("projects", projectId, { ...patch, updated_at: now() });
  const project = getProject(projectId);
  if (project && patch.status) logEvent(`project.${patch.status}`, project.title, project.id);
  return project;
}

/** Concatenated dossier for a project: goal + findings + recent messages.
 *  Injected into the dot's prompt so parallel projects stay context-isolated. */
export function projectContext(projectId: string, messageTurns = 12): string {
  const project = getProject(projectId);
  if (!project) return "";
  const lines = [
    `## Project: ${project.title}`,
    `Goal: ${project.goal || "(not stated)"}`,
    `Status: ${project.status}`,
    `Next step: ${project.next_step || "(undecided)"}`,
  ];
  if (project.findings) lines.push(`Findings so far:\n${project.findings}`);
  const messages = all<{ role: string; content: string }>(
    "SELECT role, content FROM messages WHERE project_id=? ORDER BY created_at DESC LIMIT ?",
    projectId,
    messageTurns,
  );
  if (messages.length) {
    lines.push("Recent conversation:");
    for (const message of messages.reverse()) {
      lines.push(`- ${message.role}: ${message.content.slice(0, 400)}`);
    }
  }
  return lines.join("\n");
}