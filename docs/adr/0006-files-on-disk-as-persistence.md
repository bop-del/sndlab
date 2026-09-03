# ADR 0006 — Files on disk, as the third and last persistence layer

**Status:** accepted
**Date:** 2026-09-03

## Context

ADR 0003 put shareable state in the URL hash and closed with one thing
deliberately open: whether `localStorage` should hold the most recent patch.
Answering that turns out to require answering a larger question, because the URL
alone does not cover the ways a person actually keeps work.

Three needs, and no single mechanism serves all of them:

| | URL hash | `localStorage` | File |
|---|---|---|---|
| Shareable — "listen to this" | yes | no | yes |
| Comes back with no link | no | yes | yes |
| Crosses devices and browsers | yes | **no** | yes |
| The user can see and keep it | — | invisible | **yes** |
| Practical size limit | ~2,000 chars | ~5 MB | none that matters |

`localStorage` is per-origin, per-browser, per-device. `bop-del.github.io` and
`localhost:8000` are separate stores; so are Safari and Brave on one phone. It is
private convenience memory, not portable state, and calling it "persistence"
overstates what it does.

The conventional answer to the remaining gap is a database and accounts. ADR 0003
already declined that, and `CONTEXT.md` records **no server state, no accounts**
as a standing boundary. A file keeps that promise: the browser can write one and
read one back with no server, no dependency and no build step.

## Decision

Three layers, each with one job, and no more than three:

1. **URL hash — sharing.** A link carries the complete state. Unchanged from
   ADR 0003.
2. **`localStorage` — coming back.** The most recent state, so a return visit with
   no link resumes where it left off. This closes ADR 0003's open question: yes,
   and only for this.
3. **Files on disk — keeping and moving.** Save to a file, load from a file. The
   user owns it: back it up, commit it, email it, open it on another device.

**Precedence on load, highest first:** an explicitly loaded file, then a URL
hash, then `localStorage`, then defaults. The rule is that the more deliberate
the act, the higher it ranks — loading a file is a choice, a link is a choice,
storage is a default.

**Every saved file carries a `version` from the first one written.**

```json
{
  "version": 1,
  "scale": { "root": "C", "name": "major" },
  "...": "the rest of the state"
}
```

A reader that meets a `version` it does not know says so plainly and refuses,
rather than guessing at the shape and half-loading it.

## Rationale

**A file is the only layer the user controls.** The URL is a link they might
lose; `localStorage` is invisible and evictable. A file has a name and a place
they chose. For work worth keeping — a progression they worked out by ear — that
difference is the whole point.

**It removes the last honest reason for a backend.** ADR 0003 pushed the boundary
out by making sharing serverless. Files push it out again by making *keeping*
serverless. What remains behind a server is a gallery and cross-device sync, both
already named as deliberate absences.

**Size stops being a design constraint.** The ~2,000-character URL budget shapes
how state is encoded — ADR 0003 anticipates possibly needing a binary format for
it. A file has no such ceiling, so anything too big to share by link is still
keepable, and the URL encoding can stay simple for longer.

**Version from day one, because the alternative is unrecoverable.** The moment a
file exists on someone's disk, the format is a contract. A file without a version
cannot be safely migrated later: there is no way to tell an old shape from a new
one except by guessing at its contents. Adding the field costs one line now; not
having it means either never changing the format or silently breaking saved work.
This is the one part of this ADR that must not be deferred, because it is the
only part that cannot be added retroactively.

**JSON, not a compact encoding.** The URL needs terseness; a file does not. JSON
is readable, diffable, and editable by hand — which matters for a learning tool,
where being able to look at what a scale or progression *is* has teaching value of
its own.

## Consequences

**Positive:** Work survives a cleared cache, a different browser, a new laptop.
Saved files are diffable and can live in git.

**Positive:** ADR 0003's open question is closed, and `localStorage` is scoped to
the one job it is actually good at.

**Negative:** Three sources of truth. The precedence rule above exists to stop
them disagreeing, and it has to be implemented deliberately rather than emerging.

**Negative:** The format is a contract from the first saved file. `version` makes
it a manageable one, but changing the shape now costs a migration path.

**Negative:** Saving on iOS is clunkier than on desktop — a download goes through
a save dialog into Files rather than straight to a folder. It works; it is not
pleasant.

**Open:** What the file actually contains is not decided here. Per ADR 0005 the
state worth keeping is a scale, chords and a melody — not a synth patch — but the
concrete shape belongs with the work that builds it. This ADR fixes the mechanism
and the versioning, not the schema.

**Open:** Whether loading a file should also update the URL, so a loaded file can
immediately be re-shared as a link. Probably yes; not decided here.
