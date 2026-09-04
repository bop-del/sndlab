# Degree labels on the keys

**Date:** 2026-09-04
**Status:** design agreed, not yet built
**Extends:** [the harmony tool design](2026-09-03-harmony-tool-design.md) — its
slice 2 "readout", redesigned

## What this is

**Every in-scale key carries its scale degree — `1`, `♭2`, `5` — so the scale is
readable before a note is played.** An out-of-scale key is blank until you press
it, and then names itself for as long as it sounds.

The app already demonstrates harmony. It does not explain it: you can hear that
Phrygian is darker than natural minor without ever learning that one flattened
note is doing all of the work. `CONTEXT.md` puts the lesson directly — *"what a
scale sounds like **is** the relationship of its degrees to the root"* — and that
relationship is currently the one thing the interface never shows.

This is the gap between an instrument and a teacher, which is the distinction
ADR 0005 chose the whole product on.

## What changed from the original plan

The harmony tool design specified a **readout**: a line showing the notes
currently sounding and their degrees, `E – G – B / 1 – ♭3 – 5`, with a
`Readout.js` to render it. That is a live monitor — it answers *what am I playing
right now*.

**This replaces it with a map.** The labels live on the keys, they are there
before anything sounds, and they answer *what is available and what is it called*.

The reasoning: a monitor tells you what you just did, which you already know,
because you did it. A map tells you what the scale is made of, which is the thing
being taught. Someone learning why Phrygian sounds tense needs to see that the
♭2 sits right next to the root — and needs to see it *before* pressing it, not
after.

Two consequences follow, and both are deliberate:

- **`Readout.js` is not built.** A component designed to interpret live state is
  the wrong machinery for a static map.
- **A readout line remains possible later** and is not ruled out. If it is ever
  wanted, it is additive and this design does not block it.

## The three decisions

### 1. On the keys, not in a separate line

Settled above. The map matters more than the moment.

### 2. The label replaces the in-scale dot

Today an in-scale key is marked by a dot (`.key--in-scale::after`). A degree
label carries strictly more information than that dot: a key showing `♭2` is in
the scale *by virtue of having a label at all*, and additionally says which
degree it is.

Keeping both would put two markers saying overlapping things on a key that is
15px wide at narrow window sizes. **The dot goes.**

**The accepted cost:** a dot has a lower legibility floor than text. The existing
CSS clamps the dot's size across window widths precisely because it had to read
at both 15px and 34px keys, and a glyph like `♭2` is harder. On a narrow window
the labels may be genuinely too small to read.

This is accepted rather than solved, because it is the same problem
[#6](https://github.com/bop-del/sndlab/issues/6) already describes — the keyboard
is not usable on a phone at all, for reasons that predate this feature. The
honest fix there is probably fewer keys on a small screen, not smaller text, and
that belongs to #6 rather than here.

### 3. In-scale labelled always; out-of-scale labelled while pressed

Out-of-scale notes stay playable — the original design was explicit that muting
them *"would hide the very contrast the tool exists to teach"*.

Once keys carry names, though, a permanently blank key starts to assert
something: that the note has no name. The most important interval in this tool's
own teaching story is exactly such a note — in natural minor, the key between `1`
and `2` is the ♭2, the single note that turns natural minor into Phrygian. A map
that refuses to name it is silent about the thing the product is built to teach.

Labelling all 61 keys was rejected: it buries the scale in text and destroys the
at-a-glance "this is the scale" signal the dot did well.

So: **no note this app lets you play is a note it refuses to name**, and the map
still reads cleanly at rest.

## Design

### Rendering

Each key gets a child `<span class="key__degree">` at render time.

A child element rather than a pseudo-element, for two reasons. `::before` is the
typing-start hairline and `::after` was the dot, so a third marker has nowhere to
go. More decisively, the out-of-scale label's *content* changes at press time,
and pseudo-element content cannot be set from JavaScript without inline-style
hacks.

**Cost:** 61 additional DOM nodes. This is one-time, not per-interaction — the
keyboard renders once and never re-renders. It is a fixed window sized for every
transpose position, and `setTranspose()` only moves classes around.

### What writes the label, and when

Two writers. **Both hook loops that already exist**, which is the whole reason
this design needs no new module.

**`Keyboard.showScale(root, scale)`** already walks every key toggling
`key--in-scale`. In the same pass it writes `degreeName(midiNumber, root)` into
the span for in-scale keys and clears it for the others.

This is the map. It updates when the root or the scale changes, which is already
the only moment it can become stale.

`degreeName()` already exists in `js/theory/Scales.js`, is pure, and is currently
unused — written for the readout that was never built. No new theory logic.

**`Notes.onChange`** already toggles `key--pressed`. For an **out-of-scale** key
it additionally writes the degree on press and clears it on release.

**In-scale keys are deliberately left alone by this listener.** Their label is
already correct and permanent; rewriting it on every press would be churn that
can only introduce bugs. The visible consequence is that a pressed in-scale key
and a pressed out-of-scale key reach the same state by different paths — one was
already labelled, one becomes labelled. That is invisible to the player and is
the point.

### The label stays visible while the key is pressed

The dot does the opposite: `.key--pressed::after { display: none }`, on the
stated grounds that *"the dot is the marker, so a pressed key must not keep
showing one on top of its own colour."*

That rule does not carry over, and inverting it is deliberate. The dot's problem
was contrast — an accent-coloured dot on an accent-coloured pressed key is
invisible, so hiding it lost nothing. A label carries information the dot never
did, and hiding it would remove the answer at exactly the moment the question is
asked: you pressed the key to find out what it is.

So the label stays, and the pressed state has to give it contrast rather than
hide it. The pressed key is a light-to-accent gradient, so the label needs a dark
colour while pressed — the same inversion `.pad--on` already uses, where the
label goes to `var(--bg)` against the accent fill.

This is the one place where the labels are not simply the dot with more
information, and it is why the screenshot matters on this change.

### The transpose changes nothing here

Degrees are relative to the **root**, not to where the typing rows sit. Moving
the rows changes which notes the fingers reach; it does not change what those
notes are called.

Stated explicitly, and given its own check, because this is exactly the kind of
relationship that looks like it ought to be wired up and must not be.

### A known wrong label, accepted

`degreeName()` spells every interval as a flat: interval 1 is always `♭2`,
interval 6 is always `♭5`.

For natural minor and Phrygian — both shipped — and for Dorian, harmonic minor
and Phrygian dominant, every degree reads correctly as a flat.

**It is wrong for Lydian**, whose characteristic note is the `♯4` and which this
would label `♭5`. Lydian is the sixth and lowest-ranked entry on the scale
shortlist, marked "optional, cut first", and is not built.

**Shipping the flat spelling anyway**, rather than building an enharmonic system
now for a scale that does not exist. Lydian's own ticket picks this up. Recorded
here so it is a known compromise rather than a bug discovered later.

## Testing

Checks in `scripts/verify.mjs`:

- **The labels match the selected scale.** Natural minor and Phrygian differ at
  exactly one key — that difference *is* the tool's core lesson, so it is the
  assertion worth making rather than a spot-check of one label.
- **Out-of-scale keys are blank at rest, labelled while held, and blank again
  after release.**
- **The labels do not move with the transpose** — same labels before and after,
  since degrees are relative to the root.
- **Every in-scale key is marked**, so removing the dot cannot silently leave the
  scale unmarked.
- **A pressed key still shows its label** — the inversion of the dot's rule, and
  the assertion that stops someone reinstating `display: none` out of symmetry
  with the old marker.

Plus the build-number bump, and the screenshot. The screenshot does real work
here rather than confirming nothing broke: 61 dots become 61 labels, and whether
that reads or crowds is a judgement no assertion can make.

**And the part checks cannot do at all:** whether the labels teach. That is
`/accept-ticket`.

## Out of scope

Named and excluded so they do not creep in:

- **A readout line.** Replaced by this, not deferred by it — but not blocked
  either.
- **Degrees on the chord pads.** They already carry roman numerals, which is the
  same information in the form that suits them.
- **An enharmonic system.** See the Lydian note above.
- **Chord naming.** Rejected in the original design and still rejected: three
  notes are ambiguous without knowing the intended root, and *"a readout that is
  confidently wrong is worse than none for someone who cannot yet tell."*
- **Phone legibility.** Belongs to #6.
