---
name: accept-ticket
description: Walk Boris through the manual acceptance of a finished ticket — the judgements the verification run cannot make — and move the card to Done once he has made them. Use when the user asks to accept, sign off, or manually test finished work.
disable-model-invocation: true
---

# Accept a ticket

The last step of the flow, and the only one an agent cannot do alone:

```
/to-tickets     → makes them
/implement      → builds one
/accept-ticket  → Boris judges it
```

`scripts/verify.mjs` proves the right oscillator started at the right
frequency. It cannot tell you whether the thing sounds good, whether the
layout is right, or whether the feature is worth having. `CLAUDE.md` is blunt
about this: *"Nothing is verified until that passes and the screenshot has
been looked at."* This skill is the second half — the part that needs ears and
eyes.

**You are running the session, not making the call.** Every verdict here is
Boris's. Your job is to work out what is worth testing, ask well, and do the
mechanics around his answers.

## The one rule

**Never move a card to `Done` without asking.** Not when every test passed,
not when it is obvious, not to save a round trip. The board rule exists
because `Done` means a human heard it — a card moved on inference is a lie
about that, and it is the exact failure the verification rule guards against.

Ask, and accept "no" as a complete answer.

## 1. Resolve the ticket

Take the issue number from the argument. With no argument, infer it: the most
recent commit's `Closes #n`, or the branch name. State which you resolved and
from where, so a wrong guess is visible before any testing happens.

Read it: `gh issue view <n> --comments`. The acceptance criteria are the
skeleton of the walk, but not the whole of it — see step 3.

## 2. Gate on the checks

Run `node scripts/verify.mjs`. **If anything fails, stop.** Report which check
and its output; do not start the manual walk.

Manual testing on top of a red suite wastes Boris's attention on bugs already
caught, and worse, it invites accepting work that a check says is broken.

Then confirm the tab will not be stale:

- Is a dev server up? `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/`
  — start one if not (`python3 -m http.server 8000`, backgrounded).
- Does it serve the current build? Compare `curl -s http://localhost:8000/js/version.js`
  against `js/version.js` in the repo. If they differ, say so and resolve it
  before testing — the whole point of the build number is answering "is this
  the change I just made?"

Then open it with the build number as a cache-buster —
`open "http://localhost:8000/?b36"` — and **ask Boris to confirm the number he
sees in the corner before testing anything.**

Serving the right build is not the same as showing it. A tab left open from an
earlier session keeps its cached modules, and #31's walk opened with no
transport row at all: the server was serving `b36` correctly, the check above
passed, and the page on screen was still the old one. The query string defeats
the cache; the confirmation catches the case where it does not.

If the number is wrong or missing, `Cmd+Shift+R`, or a private window.

## 3. Derive the tests

**This is the part that is judgement, not procedure.** Do not just replay the
acceptance criteria — most are already asserted by `verify.mjs`, and re-asking
them by hand is theatre.

Read the ticket and the diff (`git show`, or `git diff` against the base) and
work out what a machine could not have judged:

- **Sound.** Does it sound good? Right in the mix? This repo is a synth; it is
  usually the most important test and never an automatable one.
- **Layout and contrast.** What the screenshot shows that assertions do not.
- **Feel.** Latency, whether a control is reachable while playing.
- **Copy.** Does on-screen text still describe what the app now does? A
  behaviour change often strands the text that described the old behaviour.
- **The risk you knowingly took.** If the ticket records an accepted cost — a
  trade-off signed off during design — that is the highest-value test in the
  walk, because it is the one most likely to send the work back. Say so when
  you present it.

Aim for three to six tests. Fewer misses things; more turns into
rubber-stamping, which produces a `Done` that means nothing.

Present the whole list first, with the setup needed, so Boris knows the shape
of what he is agreeing to. Then walk them one at a time.

## 4. Walk them

One `AskUserQuestion` per test — never batch them. Batching invites a sweep of
accepts without doing the testing.

Each question:

- States what to do and what to listen or look for.
- Offers **accept as the first option**, since most tests pass and the default
  should be the common case.
- Offers rejection variants that carry *diagnosis*, not just "no" — "accept
  but too dominant", "reject, effectively silent". The shape of a rejection is
  what decides the next step.

After each answer, say what you recorded and move on. Do not re-argue an
accept, and do not talk Boris out of a rejection.

## 5. When a test is rejected

Offer both paths, and let Boris pick in the moment:

### File it

Draft the issue and **show it before filing**. `CLAUDE.md`: *file what you
found, propose what you think.* Wait for the word. One `kind` label, plus
`unconfirmed` if the finding is yours by inference rather than his by
observation, and put it in `Needs decision`.

### Fix and re-test

Only when the fix is **small and decision-free**:

| Allowed | Falls back to filing |
|---|---|
| Copy, a CSS value, a constant, a wrong label | Touches the audio graph |
| One file | Spans several files |
| Existing checks still describe the behaviour | Needs a design decision from Boris |

If it is over that line, say so and offer to file instead. Acceptance quietly
becoming an implementation session is how scope creeps without anyone
choosing it.

When it is under the line:

1. **Amend the ticket first.** Post the revised criterion to the issue as a
   comment. The rejection changed what the ticket asks for; a card moved to
   `Done` against criteria nobody updated is how #21 came to claim something
   untrue about the drone, which #24 then had to correct.
2. Apply the fix.
3. **Bump the build number and commit it separately** — its own commit, its
   own bump, message noting it came from acceptance of #n. The number on
   screen must always be the thing being tested.
4. Re-run `scripts/verify.mjs`. Green before continuing.
5. **Restart the walk from test 1.** Not from the failed test. A fix can
   degrade something already accepted, and `verify.mjs` cannot hear it — that
   is the entire reason this walk exists.

## 6. Close it out

When every test has passed, summarise the results as a table, then ask **once**
whether to move the card to `Done`.

On yes:

- Move the card (`docs/agents/issue-tracker.md` has the ids; `Done` is
  `3519a961`).
- Confirm the issue closed — a commit with `Closes #n` will have done it
  already. Check rather than assume.
- Comment the manual results on the issue: each test and its verdict, and
  explicitly call out any accepted trade-off that held up, so a later reader
  knows it was tested rather than forgotten.
- Note anything that supersedes an earlier ticket's criteria, pointing at both.

On no: leave the card in `Needs review` and say what is outstanding.

## What not to do

- Do not file issues for improvements you noticed along the way. Mention them
  in one line and let Boris ask. A second unprompted filing in a session means
  you are drifting.
- Do not add trailers to commits in this repo (`CLAUDE.md`).
- Do not treat a passing test as permission to skip the `Done` question.
