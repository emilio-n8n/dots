# dots

An agent that keeps working when you stop talking.

Self-hosted, single-tenant, one dot. It holds several projects at once, decides
what to work on, sleeps when it has nothing to do, and comes back when it has
something to say.

## What makes this not a chatbot

Most agents are request/response: you prompt, it answers, it forgets. This one
runs a lifecycle:

```
wake → work a project → reflect → decide if anything is left to do
     → if not, sleep for a duration IT picks → wake
```

The sleep duration is written by the dot's own reflection turn. Nothing
external schedules it. A dot that finishes early sleeps for an hour; a dot with
a deadline sleeps for twenty minutes; a dot that says `[SILENT]` sleeps because
it genuinely has nothing to report.

## Autonomy

**Autonomous by default.** The dot explores, reads, writes code, runs tests, and
reports back without asking. The exception list is deliberately short and lives
in `rules`:

| Verdict | Meaning |
|---|---|
| `auto` | run unattended (the default when nothing matches) |
| `approve` | queue a card, wait for a human decision |
| `block` | refuse, queue for a human decision, do not proceed |

Seeded exceptions: payments and purchases are blocked; `rm -rf`, force-pushes,
and anything touching credentials need one approval. Longest matching pattern
wins, so `git push --force` beats a broad `git`.

## Architecture

```
src/lib/
  db.ts         one SQLite file (WAL); no server to run
  schema.sql    messages, projects, memories, rules, events, approvals, dot_state
  provider.ts   any OpenAI-compatible endpoint + the dot's system prompt
  agent.ts      one turn: history → model → tools → persisted reply
  tools.ts      open_project, advance_project, remember, request_approval,
                log_activity, execute
  projects.ts   parallel projects with isolated context dossiers
  memory.ts     durable preferences, standards, corrections
  rules.ts      autonomy verdicts
  lifecycle.ts  active → reflecting → sleeping, and the dot's own wake time
src/app/        dashboard + JSON API
daemon/dotsd.ts the loop that asks "is it time?" — never "when is it time?"
```

## Quick start

```bash
npm install
cp .env.example .env      # point at your model endpoint
npm run build && npm start
```

The web UI is on `:3000`. In a second shell, start the daemon:

```bash
npm run daemon
```

The daemon is what makes the dot *always on*. Without it, the dot only works
when someone opens the UI and clicks something.

## Deploy

```bash
cp .env.example .env      # set your endpoint + key
docker compose up -d
```

Two services: `web` (the UI and API) and `daemon` (the loop). One volume. One
SQLite file.

## API

| Route | Purpose |
|---|---|
| `POST /api/turn` | `{ prompt, projectId? }` — a human turn |
| `POST /api/reflect` | one reflection tick; the dot decides its own sleep |
| `GET /api/reflect` | current phase, sleep deadline, whether it's due |
| `PUT /api/reflect` | wake it now |
| `GET /api/state` | everything the dashboard needs in one call |
| `GET/POST /api/approvals` | list / decide pending actions |

## Status

Working: lifecycle, parallel projects, memory, rules, approvals, dashboard,
daemon, Docker deploy.

Stubbed: `execute` returns a message instead of running in a container — the
sandbox is the next seam, and it is deliberately isolated so wiring it in does
not touch the agent code above it.

## License

MIT