# Phase 2 Runtime Slice

Phase 2 introduces the first live product layer for Londi Agent OS.

## Goal

Prove this path:

```text
Dashboard -> Local API -> HostConnector -> agent status/usage + Obsidian Run Summary
```

## Project-based workspace

Londi can work by project. A project is represented by `ProjectWorkspace` and binds:

- project id/name/root path
- all four agents: Agent Zero, Codex, Claude Code, Hermes
- active Phase 2 skills: `obsidian-run-summary`, `local-agent-status`, `usage-status-refresh`

This keeps every run, status view, and Obsidian summary anchored to a project context.

## Four agents

| Agent | Phase 2 role | Runtime behavior |
|---|---|---|
| Agent Zero | Orchestrator / Host | Active, coordinates the run summary slice |
| Codex | Local execution agent | Status/usage only in Phase 2 |
| Claude Code | Local execution/review agent | Status/usage only in Phase 2 |
| Hermes | Planned knowledge layer | Display-only/planned |

## HostConnector

`HostConnector` is the boundary between Local API and local machine capabilities. Phase 2 exposes:

- `getAgentsStatus()`
- `getObsidianStatus()`
- `listProjects()`
- `upsertProject()`
- `writeRunSummary()`
- `runObsidianSummary()`

The UI does not call CLI tools or write Obsidian files directly.

## Refresh policy

No background polling. Refresh is on dashboard load or manual refresh.

| Data | TTL |
|---|---:|
| Agent availability | 30s |
| Usage/subscription | 5m |
| Obsidian vault status | 60s |
| Manual refresh guard | 10s |

## Local API contracts

Phase 2 adds these REST contracts:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/agents` | Four-agent cards with status/usage/skills |
| GET | `/api/v1/skills` | Static Phase 2 Skill Registry |
| GET | `/api/v1/projects` | Project workspaces |
| PUT | `/api/v1/projects/{projectId}` | Create/update project workspace |
| GET | `/api/v1/obsidian/status` | Obsidian target availability |
| POST | `/api/v1/runs/obsidian-summary` | Minimal run that writes Run Summary |

## Obsidian output

Run summaries are written under:

```text
Londi Agent OS/Runs/
```

Filename format:

```text
YYYY-MM-DD__run-{id}__{short-title}.md
```

## Verification

Targeted tests:

- `node tests/phase2-runtime-contracts.test.mjs`
- `node tests/host-connector.test.mjs`
- `node tests/phase2-dashboard.test.mjs`
- `node tests/rest-contracts.test.mjs`
