export type ProjectStatus = "active" | "paused" | "done" | "blocked";

export interface Project {
  id: string;
  title: string;
  goal: string;
  status: ProjectStatus;
  next_step: string;
  findings: string;
  created_at: number;
  updated_at: number;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Message {
  id: string;
  project_id: string | null;
  role: MessageRole;
  content: string;
  created_at: number;
}

export interface Memory {
  id: string;
  project_id: string | null;
  kind: "preference" | "standard" | "person" | "project" | "correction";
  content: string;
  source: string;
  hits: number;
  created_at: number;
  updated_at: number;
}

export type Verdict = "auto" | "approve" | "block";

export interface Rule {
  id: string;
  pattern: string;
  verdict: Verdict;
  reason: string;
  created_at: number;
}

export interface Approval {
  id: string;
  project_id: string | null;
  action: string;
  detail: string;
  status: "pending" | "approved" | "denied";
  created_at: number;
  decided_at: number | null;
}

export type DotPhase = "active" | "reflecting" | "sleeping";

export interface DotState {
  id: number;
  phase: DotPhase;
  sleep_until: number | null;
  last_reasoning: string;
  consecutive_idles: number;
  updated_at: number;
}

export interface DotEvent {
  id: string;
  project_id: string | null;
  type: string;
  detail: string;
  created_at: number;
}