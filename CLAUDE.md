# sndlab

A small web synth / audio application in the browser. Framework-free.

**Live:** https://bop-del.github.io/sndlab/

> **Language: English.** All code, comments, docs, commits, issues and PRs in
> this repo are written in English — it is public. Conversation with Boris may
> be in German; what gets written down is not.
>
> **Identity: private account only.** Commits use `Boris Diebold
> <boris.diebold+gh@gmail.com>` (set in this repo's `.git/config`). Never pass
> `-c user.email=...` to git here — the work account must not appear in this
> repo's history.
>
> **No commit trailers.** Do not add `Co-Authored-By:` or `Claude-Session:`
> lines to commits in this repo. They add third-party contributors to the
> public repo and link a private session from it.

## Quick Start

```bash
cc-sndlab                    # Claude Code in this repo, with engineering skills
python3 -m http.server 8000  # dev server (own tab) → http://localhost:8000
bin/setup                    # health check: prerequisites + deploy chain
```

No build step. Change a file, reload the browser. That is the whole loop.

## Hard rules

1. **No runtime dependencies.** No npm package in shipped code, no CDN links.
   All imports relative.
2. **No build step.** What is in the repo runs in the browser. No bundler,
   no transpiler, no Tailwind.
3. **Vanilla JS + native ES modules.** No React, Vue, Svelte.
4. **Encode state in the URL** where possible — sharing without a backend.
5. **Keep files small.** Split at ~500 lines.
6. **English everywhere** in the repo.

### Why

This project deliberately tests the "static, no deployment state" pattern.
An agent can hold the entire codebase in view, and there is no user state that
can break — which permits aggressive rewrites instead of cautious edits. Every
dependency and every build step erodes that.

Reference architecture: [AcidBros](https://github.com/acidsound/acidBros) — 10k
lines of Web Audio with zero dependencies. Its `UI.js` is 2,737 lines, though;
that is the warning behind rule 5, not the model to copy.

## Structure

```
index.html
css/base.css
js/
├── main.js          entry point (6 lines)
├── audio/           AudioEngine, synth voices, worklets
└── ui/              UI components
docs/
├── adr/             architecture decisions
└── SETUP.md         one-time repo setup
```

## Verification

There is no test suite. Verification means:

1. `python3 -m http.server 8000`, open the page, trigger the interaction
2. Listen for sound / check the console for errors (`Cmd+Opt+J`)
3. `bin/setup` for the deploy chain

**Never claim "it works" without having seen it in the browser.**
HTTP 200 proves delivery, not sound.

## Deploy

Push to `main` → GitHub Pages (branch deploy from `/`). No manual step, no
Actions workflow. Expect 1–3 minutes of CDN latency between push and visible
change — iterate locally, don't deploy to test.

## How work flows

Issues are the backlog: `gh issue list`. The workflow runs on the Matt Pocock
engineering skills (loaded via `cc-sndlab`):

```
/grill-me      sharpen scope, settle decisions
/to-tickets    plan → issues with blocking edges
/triage        assess, label, write an agent brief
/wayfinder     plan large efforts as a map issue
```

See `docs/SETUP.md` for the one-time setup.

## Agent skills

### Issue tracker

GitHub Issues on `bop-del/sndlab`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical names, unchanged: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
