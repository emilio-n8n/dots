"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Approval, DotEvent, DotState, Memory, Project, Rule } from "@/lib/types";

interface Snapshot {
  dot: DotState & { sleep_at: string | null };
  projects: Project[];
  memories: Memory[];
  rules: Rule[];
  approvals: Approval[];
  activity: DotEvent[];
}

const EMPTY: Snapshot = {
  dot: {
    id: 1,
    phase: "active",
    sleep_until: null,
    sleep_at: null,
    last_reasoning: "",
    consecutive_idles: 0,
    updated_at: 0,
  },
  projects: [],
  memories: [],
  rules: [],
  approvals: [],
  activity: [],
};

export default function Dashboard() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [tab, setTab] = useState<"activity" | "memory" | "rules">("activity");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.ok) setSnap((await res.json()) as Snapshot);
    } catch {
      /* the daemon may be mid-write; the next tick will catch up */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden />
          <div>
            <strong>dot</strong>
            <span className="sub">always-on agent</span>
          </div>
        </div>
        <PhaseChip dot={snap.dot} />
        <div className="topActions">
          <button
            className="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await fetch("/api/reflect", { method: "POST" }).catch(() => {});
              await refresh();
              setBusy(false);
            }}
          >
            {busy ? "thinking…" : "Wake dot"}
          </button>
        </div>
      </header>

      <main className="grid">
        <Chat onDone={refresh} />

        <section className="side">
          <div className="card grow">
            <div className="cardHead">
              <h2>Projects</h2>
              <span className="count">{snap.projects.length}</span>
            </div>
            <ProjectList projects={snap.projects} onChange={refresh} />
          </div>

          <div className="card approvals">
            <div className="cardHead">
              <h2>Needs you</h2>
              {snap.approvals.length > 0 && <span className="count warn">{snap.approvals.length}</span>}
            </div>
            <ApprovalList approvals={snap.approvals} onChange={refresh} />
          </div>

          <div className="card panel">
            <nav className="tabs">
              {(["activity", "memory", "rules"] as const).map((key) => (
                <button
                  key={key}
                  className={tab === key ? "tab active" : "tab"}
                  onClick={() => setTab(key)}
                >
                  {key}
                </button>
              ))}
            </nav>
            <div className="panelBody">
              {tab === "activity" && <Activity events={snap.activity} />}
              {tab === "memory" && <Memories memories={snap.memories} />}
              {tab === "rules" && <Rules rules={snap.rules} />}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function PhaseChip({ dot }: { dot: Snapshot["dot"] }) {
  const label =
    dot.phase === "sleeping"
      ? `sleeping until ${dot.sleep_at ? new Date(dot.sleep_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}`
      : dot.phase;
  return (
    <span className={`phase ${dot.phase}`}>
      <span className="dotpulse" />
      {label}
    </span>
  );
}

function Chat({ onDone }: { onDone: () => void }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async () => {
    const prompt = draft.trim();
    if (!prompt || sending) return;
    setDraft("");
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setSending(true);
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.text ?? data.error ?? "(no reply)" },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Lost contact with the dot." }]);
    } finally {
      setSending(false);
      onDone();
    }
  };

  return (
    <section className="card chat">
      <div className="chatBody">
        {messages.length === 0 && (
          <div className="empty">
            <p>Give the dot something to work on.</p>
            <span>It will pick it up and keep going between conversations.</span>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {sending && <div className="bubble assistant typing">working…</div>}
        <div ref={endRef} />
      </div>
      <div className="composer">
        <textarea
          rows={2}
          value={draft}
          placeholder="Ask, or hand it a project…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="primary" onClick={send} disabled={sending || !draft.trim()}>
          Send
        </button>
      </div>
    </section>
  );
}

function ProjectList({ projects, onChange }: { projects: Project[]; onChange: () => void }) {
  if (!projects.length) return <p className="muted small">Nothing in flight.</p>;
  return (
    <ul className="list">
      {projects.map((p) => (
        <li key={p.id} className="row">
          <div className="rowMain">
            <span className={`badge ${p.status}`}>{p.status}</span>
            <div>
              <strong>{p.title}</strong>
              {p.goal && <p className="goal">{p.goal}</p>}
              {p.next_step && <p className="next">next: {p.next_step}</p>}
            </div>
          </div>
          {p.status !== "done" && (
            <button
              className="ghost small"
              onClick={async () => {
                await fetch("/api/approvals", {
                  method: "DELETE",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ id: p.id }),
                }).catch(() => {});
                onChange();
              }}
            >
              mark done
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function ApprovalList({ approvals, onChange }: { approvals: Approval[]; onChange: () => void }) {
  if (!approvals.length) return <p className="muted small">Nothing waiting on you.</p>;
  const decide = async (id: string, approve: boolean) => {
    await fetch("/api/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, approve }),
    }).catch(() => {});
    onChange();
  };
  return (
    <ul className="list">
      {approvals.map((a) => (
        <li key={a.id} className="row approval">
          <div className="rowMain">
            <strong>{a.action}</strong>
            {a.detail && <p className="goal">{a.detail}</p>}
          </div>
          <div className="rowActions">
            <button className="primary small" onClick={() => decide(a.id, true)}>
              allow
            </button>
            <button className="danger small" onClick={() => decide(a.id, false)}>
              deny
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Activity({ events }: { events: DotEvent[] }) {
  if (!events.length) return <p className="muted small">No activity yet.</p>;
  return (
    <ul className="list dense">
      {events.map((e) => (
        <li key={e.id} className="event">
          <span className="etype">{e.type}</span>
          <span className="edetail">{e.detail}</span>
          <span className="etime">{new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </li>
      ))}
    </ul>
  );
}

function Memories({ memories }: { memories: Memory[] }) {
  if (!memories.length) return <p className="muted small">It hasn't learned anything yet.</p>;
  return (
    <ul className="list dense">
      {memories.map((m) => (
        <li key={m.id} className="event">
          <span className="etype">{m.kind}</span>
          <span className="edetail">{m.content}</span>
        </li>
      ))}
    </ul>
  );
}

function Rules({ rules }: { rules: Rule[] }) {
  return (
    <>
      <p className="muted small">
        Autonomous by default. These are the exceptions — everything else runs unattended.
      </p>
      <ul className="list dense">
        {rules.map((r) => (
          <li key={r.id} className="event">
            <span className={`badge ${r.verdict}`}>{r.verdict}</span>
            <span className="edetail">{r.pattern}</span>
          </li>
        ))}
      </ul>
    </>
  );
}