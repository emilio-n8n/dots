import type { Rule, Verdict } from "./types";
import { all, db, id, insert, now } from "./db";

/**
 * Yolo by default. Anything not matched runs unattended; the exception list is
 * deliberately short and explicit. Patterns are lowercase substrings.
 *
 * Seeded with the two categories that are never worth automating: money moving
 * and things that cannot be undone.
 */
const SEED: Array<Pick<Rule, "pattern" | "verdict" | "reason">> = [
  {
    pattern: "payment",
    verdict: "block",
    reason: "Money movement always comes back to a human.",
  },
  {
    pattern: "purchase",
    verdict: "block",
    reason: "Money movement always comes back to a human.",
  },
  {
    pattern: "stripe",
    verdict: "block",
    reason: "Financial API — never autonomous.",
  },
  {
    pattern: "checkout",
    verdict: "block",
    reason: "Money movement always comes back to a human.",
  },
  {
    pattern: "rm -rf",
    verdict: "approve",
    reason: "Destructive and irreversible — ask once.",
  },
  {
    pattern: "drop table",
    verdict: "block",
    reason: "Irreversible data loss.",
  },
  {
    pattern: "drop database",
    verdict: "block",
    reason: "Irreversible data loss.",
  },
  {
    pattern: "git push --force",
    verdict: "approve",
    reason: "Can destroy shared history — ask once.",
  },
  {
    pattern: "secret",
    verdict: "approve",
    reason: "Touching credentials warrants a look.",
  },
];

export function ensureSeeded() {
  const count = all<Rule>("SELECT id FROM rules").length;
  if (count > 0) return;
  for (const rule of SEED) {
    insert("rules", { id: id("rule"), ...rule, created_at: now() });
  }
}

export function rules(): Rule[] {
  ensureSeeded();
  return all<Rule>("SELECT * FROM rules ORDER BY created_at ASC");
}

export function addRule(input: { pattern: string; verdict: Verdict; reason?: string }): Rule {
  const rule: Rule = {
    id: id("rule"),
    pattern: input.pattern.toLowerCase().trim(),
    verdict: input.verdict,
    reason: input.reason ?? "",
    created_at: now(),
  };
  insert("rules", rule);
  return rule;
}

export function removeRule(ruleId: string) {
  db().prepare("DELETE FROM rules WHERE id=?").run(ruleId);
}

/** Most specific match wins: longest pattern first, so `git push --force` beats
 *  a broad `git`. No match means autonomous. */
export function judge(action: string, detail = ""): { verdict: Verdict; rule?: Rule } {
  ensureSeeded();
  const haystack = `${action} ${detail}`.toLowerCase();
  const sorted = rules().sort((a, b) => b.pattern.length - a.pattern.length);
  for (const rule of sorted) {
    if (haystack.includes(rule.pattern)) return { verdict: rule.verdict, rule };
  }
  return { verdict: "auto" };
}

export function autonomyBrief(): string {
  return rules()
    .map((rule) => `- ${rule.verdict}: "${rule.pattern}"${rule.reason ? ` — ${rule.reason}` : ""}`)
    .join("\n");
}