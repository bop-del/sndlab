# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

The repo is `bop-del/sndlab`; `gh` infers it from `git remote -v` when run inside the clone.

## The board

Progress lives on a GitHub Project board, not in the issue's open/closed state.
An issue only records *what* the work is; the board records *where it has got to*
— which is what a fresh agent session needs in order to pick something up without
duplicating work already in flight.

**Why a board rather than more labels.** Labels were the cheaper option and were
seriously considered. They lose on one point: a label cannot be *claimed*
atomically before work starts, and the claim is the whole reason this exists. A
second session must be able to see that the first is already building something.
The board's Status field is a single place that answers that; two labels written
by two sessions is a race.

**Status is the pipeline; labels are the assessment.** They do not overlap, so
they cannot disagree. See `triage-labels.md`.

| Status | Meaning | Next action |
|---|---|---|
| **Ideas** | A candidate, not a commitment. Nobody has judged whether it is worth doing. | Boris |
| **Needs decision** | Scope is not settled. No agent should build this. | `/grill-with-docs` |
| **Ready** | Spec written. An agent can take it cold. | `/implement` |
| **In progress** | Claimed by a session. Do not pick this up. | — |
| **Needs review** | Built and the checks pass. Waiting on the parts an agent cannot judge: the sound, and the screenshot. | `/accept-ticket` |
| **Done** | Verified and pushed. | — |

### Rules

- **Claim before starting.** Move to `In progress` as the session's *first write*,
  before touching any code. A claim recorded at the end prevents nothing.
- **Hand off honestly.** Move to `Needs review` when the verification run passes.
  That is the agent saying "the assertions hold; the rest is yours."
- **Only Boris moves anything to `Done`.** Done means a human heard it and looked
  at the screenshot. An agent closing out its own work is the failure the
  verification rule in `CLAUDE.md` exists to prevent.

  `/accept-ticket` is how that judgement gets made: it runs the checks, opens
  the app on a build it has proved is not stale, works out what the assertions
  could not have judged, and walks those one at a time. It always *asks* before
  moving a card — an agent may do the mechanics, never the deciding. A card
  moved because every test passed rather than because Boris said so is the same
  lie, with more steps.
- **Every card is a real issue.** No draft items — a draft is a second source of
  truth that `gh issue list` cannot see. This applies to `Ideas` too: the cost is
  that `gh issue list` returns candidates alongside real work, which is accepted
  for the sake of ideas being visible on the board where they are actually seen.
- **A stale claim can be taken.** If a card sits in `In progress` with a clean
  working tree and nothing pushed, the session that claimed it died. Take it.

### Operations

The board is project **2** under the `bop-del` **user** (not the repo) —
<https://github.com/users/bop-del/projects/2>. It needs the `project` token
scope; if a call 403s, run `gh auth refresh -h github.com -s project`.

```bash
# See the board — what is in flight, and what is free to take
gh project item-list 2 --owner bop-del --format json

# Add an issue
gh project item-add 2 --owner bop-del --url https://github.com/bop-del/sndlab/issues/<n>

# Move a card: find its item id in the list above, then
gh project item-edit --id <item id> \
  --project-id PVT_kwHODNi2i84BiUoh \
  --field-id PVTSSF_lAHODNi2i84BiUohzhhNHDk \
  --single-select-option-id <option id>
```

| Status | Option id |
|---|---|
| Ideas | `bbc9b844` |
| Needs decision | `44aac772` |
| Ready | `1f7975a3` |
| In progress | `ceee39b4` |
| Needs review | `742ad5c3` |
| Done | `3519a961` |

Use these directly rather than re-deriving them. If one is rejected, re-read the
field and fix this table:
`gh project field-list 2 --owner bop-del --format json`.

**Adding or renaming a column resets every id and clears every card.** `gh`
cannot change the *set* of options; that needs the GraphQL
`updateProjectV2Field` mutation, which replaces all options at once — and
replacing them mints **new ids for every option, including untouched ones**, so
every card loses its status and this table goes stale in the same move. Adding
`Ideas` did exactly that.

If you must change the set:

1. Snapshot first — `gh project item-list 2 --owner bop-del --format json` and
   keep the item id → status mapping.
2. Send the **full** option list, existing entries included, with their
   descriptions and colours.
3. Re-read the field, update the id table above.
4. Restore every card from the snapshot, then diff against it to prove nothing
   was lost.

**A new item takes a while to appear.** `gh project item-add` returns the item
id immediately, but the item can be missing from reads — CLI *and* GraphQL — for
a minute or more afterwards. Adding again is safe: the mutation is idempotent
and returns the same id. Wait and re-read rather than concluding the write
failed.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
