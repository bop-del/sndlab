# Labels

Two axes, and they do not overlap. **Kind** says what an issue is. **Status**
says where it has got to, and lives on the board (`issue-tracker.md`), never in
a label.

## Kind

Every issue carries exactly one.

| Label | Meaning |
|---|---|
| `bug` | Behaviour is wrong |
| `feature` | New capability |
| `decision` | Resolving it produces a decision, not code — an ADR, a settled scope |
| `tripwire` | A standing condition to notice, not work to do |

`decision` and `tripwire` are not conventional, and both earn their place:
without them, an open decision looks like a feature nobody started, and a
tripwire looks like work ignored for weeks. Both would be permanently misread.

## Modifiers

Applied on top of a kind, as many as fit.

| Label | Meaning |
|---|---|
| `accessibility` | A barrier for people with disabilities |
| `unconfirmed` | Found by inference, not observation — nobody has reproduced it |
| `needs-info` | Waiting on the reporter |
| `ready-for-human` | Needs a human; an agent should not build it |
| `wontfix` | Will not be actioned |

### `unconfirmed`

An agent files through Boris's `gh` token, so the tracker cannot tell who wrote
an issue. That distinction matters less than the one it stands in for: **whether
the finding was observed or inferred.**

When Boris reports a bug, he saw it. When an agent files one, it may have
inferred it — and the inference is exactly what nobody has checked. An agent
applies `unconfirmed` to anything it files on its own initiative. Boris removes
it once he has seen the thing himself.

It is a property, not a provenance: an issue Boris files without reproducing
gets it too, and an agent finding that turns out to be right sheds it. It is not
a mark of second-class.

## What an agent may file

**File what you found. Propose what you think.**

An agent files, unprompted, a **defect it observed in code that already works** —
a regression, something the checks missed, a visual bug in a screenshot. Label
it `unconfirmed`, put it in `Needs decision`, and **say so in the response**, in
one line, with why. An issue filed silently is a surprise later.

An agent does **not** file improvements, refactors, or "we should eventually"
ideas. Those are opinions about the product, and they belong to Boris. Mention
them in the response; file only if asked. The `Ideas` column is where they go
**when asked** — it is not an invitation to fill it unprompted.

**A finding attached to existing work is a comment, not a card.** A contingency,
a piece of research, a "if this turns out badly, consider that" — put it on the
issue it concerns, where whoever hits that problem will actually be looking. As a
standalone card it is an orphan nobody reads.

A second filing in one session is a signal the agent is drifting from its task.
Mention it and let Boris decide.

## Triage

The `Needs decision` column **is** the triage queue.

An issue that did not come through `/to-spec` lands there — whoever filed it.
Getting it to `Ready` means someone judged it real and specified it enough to
build. Only `/to-spec` output goes straight to `Ready`; it is specified by
construction, and the router is explicit that already-specified tickets should
not be triaged.

## For the skills

The mattpocock skills speak in five canonical triage roles. Three map to labels
above (`needs-info`, `ready-for-human`, `wontfix`). The other two do not:

- `needs-triage` → **Status `Needs decision`**. The column is the queue.
- `ready-for-agent` → **Status `Ready`**.

Both name a position in the pipeline, and the board already has a column for
each. Two names for one state, written in two places, drift the first time only
one gets updated.
