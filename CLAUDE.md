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

A **verification run** drives a real headless browser and checks the app against
every **check**:

```bash
npm install          # once — Playwright + Chromium
node scripts/verify.mjs
```

It serves the repo on port 8123 (the dev server keeps 8000, so both run at
once), then asserts: the page loads, every request resolves, the console is
clean, the DOM responds, and the audio graph is right — an oscillator started at
the expected frequency and waveform. It writes `.screenshots/app.png` on every
run, pass or fail.

**Nothing is verified until that passes and the screenshot has been looked at.**
A green run with an unexamined screenshot is not a verification — the checks
cannot see layout, contrast or alignment. Look at the image and say what is
wrong with it.

Two things the run deliberately does not do, so they stay yours:

- **It does not prove sound came out.** It proves the right oscillator started.
  Whether it sounds good is a human judgement — spot-check by ear before merging
  anything that changes the engine.
- **It does not compare against a baseline.** The screenshot is for assessment,
  not pixel regression. See `docs/adr/0004-dev-dependencies.md`.

`bin/setup` covers the deploy chain separately.

Adding a feature means adding its checks to `scripts/verify.mjs`. Dev tooling
lives under `scripts/`; shipped code stays dependency-free (ADR 0004).

## Deploy

Push to `main` → GitHub Pages (branch deploy from `/`). No manual step, no
Actions workflow. Expect 1–3 minutes of CDN latency between push and visible
change — iterate locally, don't deploy to test.

## How work flows

Issues are the backlog: `gh issue list`. The workflow runs on the Matt Pocock
engineering skills (loaded via `cc-sndlab`). The main flow, idea → shipped:

```
/grill-with-docs   interview until the decisions are settled; writes ADRs
                   and CONTEXT.md as it goes
/to-spec           synthesise the conversation into a spec on the tracker
/to-tickets        split it into tickets with blocking edges — skip it when
                   the work is one coherent change
/implement         build a ticket; drives /tdd, closes with /code-review
```

Keep grilling, spec and tickets in **one context window** — the spec is the
first thing that survives a compact. `/implement` then starts fresh per ticket.

On-ramps onto that flow, not steps in it:

```
/triage            raw incoming issues → agent-ready. Not for tickets
                   /to-tickets already produced.
/diagnosing-bugs   a bug that resists a first look
/wayfinder         an effort too big for one session, where the route is
                   not yet visible. Hands off at /to-spec.
/prototype         when a design question needs runnable code to answer
```

`/ask-matt` routes if you are unsure. See `docs/SETUP.md` for the one-time setup.

### The board

Issues say *what*; the board says *where it has got to*. Sessions do not share
memory, so the board is how one knows what another is already building.

```
Needs decision → Ready → In progress → Needs review → Done
```

Three rules, in order of how much damage breaking them does:

1. **Claim before starting.** Move the card to `In progress` as your first write,
   before any code. A claim made afterwards prevents nothing.
2. **Only Boris moves a card to `Done`.** Done means a human heard it and looked
   at the screenshot. Move finished work to `Needs review` and stop there.
3. **Every card is a real issue** — no draft items.

If a card sits in `In progress` with a clean tree and nothing pushed, that
session died; the card is yours. Mechanics and `gh` commands:
`docs/agents/issue-tracker.md`.

### Filing an issue

**File what you found. Propose what you think.**

Found a defect in code that already works — a regression, something the checks
missed, a bug visible in a screenshot? File it: one `kind` label, plus
`unconfirmed` because you inferred it rather than watched Boris hit it. Put it
in `Needs decision`, and **say so in your response**, in one line, with why. An
issue filed silently is a surprise later.

Improvements, refactors and "we should eventually" ideas are opinions about the
product. They belong to Boris — mention them, file only if asked. A second
filing in one session means you are drifting from the task; ask first.

Labels: `docs/agents/triage-labels.md`.

## Agent skills

### Issue tracker

GitHub Issues on `bop-del/sndlab`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical names, unchanged: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
