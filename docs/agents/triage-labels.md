# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | In our tracker           | Meaning                                  |
| -------------------------- | ------------------------ | ---------------------------------------- |
| `needs-triage`             | `needs-triage`           | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`             | Waiting on reporter for more information |
| `ready-for-agent`          | **Status = Ready**       | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`        | Requires human implementation            |
| `wontfix`                  | `wontfix`                | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the
corresponding entry from this table.

## Why one role is a status, not a label

Four of the five are **assessment** — what kind of thing this issue is. They are
labels, and an issue can carry one at any point in its life: something can be
`needs-info` while its scope is still undecided.

`ready-for-agent` is different. It names a **position in the pipeline**, and the
board already has a column for exactly that. Keeping both would mean two names
for one state, written in two places, drifting apart the first time only one gets
updated. So: **a skill told to apply `ready-for-agent` sets the board's Status to
`Ready` instead.** See `issue-tracker.md`.

Labels are not created upfront — `gh issue edit --add-label` creates a missing one
the first time it is applied.
