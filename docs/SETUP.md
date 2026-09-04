# One-time setup

Run this once, in a fresh `cc-sndlab` session. Tell Claude:
*"work through docs/SETUP.md"*.

Everything deterministic already lives in `bin/setup` — run that first to see
what is missing. This file covers only the steps that need judgement.

---

## Step 1 — Configure the repo for the engineering skills

Run the skill:

```
/setup-matt-pocock-skills
```

It asks three questions. The answers for this repo:

| Section | Answer | Why |
|---|---|---|
| **A — Issue tracker** | **GitHub** | The remote points at `bop-del/sndlab`; issues live there. |
| **B — Triage labels** | **Keep the defaults** | `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. No reason to rename them. |
| **C — Domain docs** | **Single context** | `CONTEXT.md` and `docs/adr/` already exist at the repo root. Not a monorepo. |

Produces `docs/agents/issue-tracker.md`. Commit it.

---

## Step 2 — Labels: do nothing

The setup skill only *records* the label names in `docs/agents/issue-tracker.md`.
The labels themselves get created automatically the first time `triage` applies
one — `gh issue edit --add-label` creates a missing label on the fly.

> *Optional, later:* auto-created labels get random colours and no description.
> Once it is clear which ones actually get used, run `gh label edit` to colour
> them — the state machine (`needs-triage` → `ready-for-agent` → …) reads far
> better with a colour gradient.

---

## Step 3 — First issues

Three things are already known to be open. Write them as proper issues — title,
context, and what "done" looks like. Do not paste the summaries below verbatim;
they are the raw material.

**Define the scope.** The project deliberately started without one. It is a web
synth, but the shape is undecided: a small groovebox (sequencer + one voice +
drums), a single instrument done well, or something less conventional. This is
the natural first use of `/grill-with-docs` — it interviews until the decision
is made. Blocks almost everything else.

**A playable instrument.** Right now a single button plays a fixed 220 Hz tone.
The smallest step to something actually playable is an on-screen keyboard plus
computer-keyboard mapping. Turns the scaffold into an instrument without
committing to the larger scope question.

**Keep `UI.js` small.** Not a task yet — a tripwire. Rule 5 in `CLAUDE.md` says
split at ~500 lines; the reference architecture let its `UI.js` reach 2,737.
Worth an issue so the moment gets noticed rather than discovered later.

---

## Step 4 — How work flows after this

```
idea
  ↓  /grill-with-docs  sharpen scope, settle decisions; writes ADRs as it goes
  ↓  /to-tickets       plan → issues, each with its blocking edges
  ↓  /triage           assess, label, write an agent brief
  ↓  /implement        build it; drives /tdd, closes with /code-review
  ↓  push to main      GitHub Pages deploys automatically
  ↓  /accept-ticket    Boris hears it and looks at it → Done
```

The last step is the one an agent cannot finish alone. Everything above it can
be done cold by a fresh session; `Done` cannot, because it means a human judged
the parts no assertion covers — whether it sounds good, whether the layout is
right, whether the feature was worth having. `/accept-ticket` runs that session
and does the mechanics around the answers, but the verdicts are Boris's.

For work too large for one session, `/wayfinder` creates a map issue labelled
`wayfinder:map` whose child issues are *decisions* rather than tasks, wired with
GitHub's native issue dependencies.

`gh issue list` is the backlog. There is no other one — not in the vault, not in
a file.

---

## Verification

- `bin/setup` shows no warnings
- `docs/agents/issue-tracker.md` exists and is committed
- `gh issue list` shows the first issues
- `/grill-with-docs` starts and asks its first question
