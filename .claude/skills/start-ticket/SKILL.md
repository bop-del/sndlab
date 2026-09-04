---
name: start-ticket
description: Open a ticket for work — check it is startable, claim the card, and put the work on its own branch or worktree before any code is written. Use when the user asks to start, take, pick up or begin a ticket.
disable-model-invocation: true
---

# Start a ticket

The first step of the flow, and the bookend to `/accept-ticket`:

```
/start-ticket   → claims it and isolates it
/implement      → builds it
/accept-ticket  → Boris judges it
```

`/implement` ends "commit your work to the current branch" — it creates no
branch and no worktree, so whatever is checked out is what it commits to. On
`main` that means uncommitted work sitting in front of a 1–3 minute auto-deploy
(ADR 0002). This skill is the part that has to happen first.

**Two writes, in this order: claim, then isolate.** The claim is the board rule
(`docs/agents/issue-tracker.md`) — *"move to `In progress` as the session's
first write, before touching any code. A claim recorded at the end prevents
nothing."*

## 1. Resolve the ticket

Take the issue number from the argument. **With no argument, ask** — do not
infer one. `/accept-ticket` can infer from the last commit because the work
exists by then; here there is nothing to infer from, and starting the wrong
ticket wastes a whole session.

Read it: `gh issue view <n> --comments`.

## 2. Check it is actually startable

Four gates. Report what you checked; stop on the first failure and say which.

**Is it blocked?** Read the `## Blocked by` section of the body — a list of
`- #30 — reason` lines. Check each blocker with `gh issue view <blocker>
--json state`. Any blocker still open means stop.

> GitHub's native dependency API is **not** populated on this repo — every
> ticket returns `blocked_by: 0` from `issue_dependencies_summary` even when
> its body names a blocker. Parse the body; do not trust the API.

**Is it claimed?** `gh project item-list 2 --owner bop-del --format json`. If
the card is already `In progress`, stop — unless it is a stale claim (clean
tree, nothing pushed, per the board rules), in which case say so and ask
before taking it.

**Is it ready?** A card in `Ideas` or `Needs decision` is not built by an
agent — that is what `/grill-with-docs` is for. Say so and stop.

**Is `main` clean and pushed?** `git status --short --branch`. Uncommitted
changes or unpushed commits mean the branch would start from the wrong place,
or would strand work. Report and let Boris resolve it.

## 3. Claim the card

Move it to `In progress` — option id `ceee39b4`, mechanics and field ids in
`docs/agents/issue-tracker.md`. This is the first write, before any git
command.

If the issue is not on the board at all, add it first (`gh project item-add`),
and note that a new item can take a minute to appear in reads.

## 4. Isolate the work

Default to a **branch in this clone**. Offer a worktree only when Boris has
said he wants to run this ticket alongside another.

Name it `<kind>/<n>-<slug>` — `kind` from the issue's label (`feat` for
`feature`, `fix` for `bug`), slug from the title, short. Off freshly fetched
`origin/main`, never off whatever happens to be checked out:

```bash
git fetch origin
git switch -c feat/29-url-state origin/main
```

### When it is a worktree

Only with a live reason — two tickets genuinely startable at once. #17 is the
open ticket on this, and it says worktrees buy throughput, which only pays off
when sessions actually run concurrently.

```bash
git worktree add ../sndlab-29 -b feat/29-url-state origin/main
ln -s ~/code/sndlab/node_modules ~/code/sndlab-29/node_modules
```

The symlink is not optional: `node_modules/` is gitignored and Playwright's
Chromium is not in git, so a fresh worktree cannot run `scripts/verify.mjs`
until it has one.

**Then say plainly that the session must continue in the new directory.** A
worktree created and not moved into is worse than none — the work lands in the
main clone on the wrong branch.

**Warn about `js/version.js`.** Every lane must bump it, every lane edits the
same line, so parallel lanes conflict on every merge. Tell Boris this is
coming rather than letting him meet it at merge time.

## 5. Hand off

Report, in one short block: the ticket, what the blockers were and that they
are closed, the card's new status, the branch (or worktree path), and what it
was cut from.

Then **offer the next step, and stop**: *"Claimed and branched. Run
`/implement <n>`?"* — one keystroke, but Boris's call.

Offer rather than chain, for two reasons. A card in `Ready` means an agent can
take the ticket **cold**; chaining hands `/implement` this session's whole
context — board mechanics, git plumbing, whatever else was discussed — when a
fresh window would serve it better. And this skill has just made three writes
that are awkward to unpick (a claim, a commit, a push), which are worth seeing
land before code starts.

**Never offer the chain after creating a worktree.** The session has to move to
the new directory first, and an `/implement` started here would build in the
old one — on the wrong branch, which is the failure step 4 already warns about.
Say the directory to move to, and stop.

Whatever Boris picks, **do not start implementing in this invocation.**

## What not to do

- Do not claim and then discover the ticket was blocked. Check first; a claim
  you have to undo is noise on the board.
- Do not create a worktree by default. Branch is the common case.
- Do not chain into `/implement` — offer it. Never even offer it after a
  worktree.
- Do not bump `js/version.js` here. Nothing has changed yet.
- Do not add trailers to commits in this repo (`CLAUDE.md`).
