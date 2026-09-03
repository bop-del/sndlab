# ADR 0005 — sndlab is a tool for learning harmony, not an instrument

**Status:** accepted
**Date:** 2026-09-03

## Context

The project started deliberately without a scope. ADRs 0001–0003 settled *how* it
is built — no framework, no build step, no backend, state in the URL — but not
*what* it is.

`CONTEXT.md` recorded the ambiguity rather than resolving it. Its glossary
carried **Voice**, **Patch**, **Envelope** and **Filter** alongside **Step**,
**Pattern**, **Clock** and **Tempo** — the vocabulary of two different products
held open at once: an instrument, and a sequencer.

That was cheap while the app was one button. It stopped being cheap as soon as
anything had to be decided: whether the clock is the first real piece of
engineering, whether polyphony or pattern encoding is the hard problem, whether
the ~2,000-character URL budget in ADR 0003 needs a compact binary format or
comfortably fits Base64'd JSON. Every one of those hangs off the answer.

## Decision

**sndlab is a tool for learning harmony by ear, that sounds good enough to enjoy
playing.**

The activity, in one sentence: *pick a scale, press a chord, play a melody over
it, and hear why that scale sounds the way it does.*

It is not a synth and not a groovebox. Harmony is the point; the synth exists to
serve it, and stays as simple as it can while still sounding good.

The full design is in
`docs/superpowers/specs/2026-09-03-harmony-tool-design.md`.

## Rationale

**The product was chosen for what it teaches, not for what it stresses.** An
earlier framing had this project as a testbed for the static / no-deployment-state
/ agent-legible pattern, with the audio application as a realistic workload. That
was rejected on reflection: a testbed has no failure condition, so nothing is ever
finished and no feature can be wrong. Wanting to *use* the thing supplies a real
quality bar, and the pattern still gets exercised either way.

**Harmony first, because the gap is knowledge, not capability.** The app could
already play notes. What it could not do was say anything about which notes go
together — and that is the thing worth learning. A synth with a filter would have
been a better instrument and taught nothing.

**Sound quality is a prerequisite, not a feature.** A scale played through a
buzzy sawtooth teaches nothing, because the character being taught is not
audible. This is why presets and a filter are in the first slice at all, despite
the deliberate decision not to build a synth panel.

**The scale list is curated and researched, not complete.** A full set of modes
would make this a theory reference. The frame is electronic music, so the list is
short, ranked, and each entry carries one sentence saying why it is there.
See `docs/research/electronic-music-scales.md`.

**Two harmonic mechanisms, not one.** Research into the two genres this is
actually aimed at found they work in opposite ways. Melodic techno is genuinely
progression-driven — `i–VI–III–VII` and its relatives. Goa trance is the reverse:
a sustained tonal centre with modal melody over it, where introducing Western
chord changes can work against the character. So the tool offers **chord pads and
a root drone as peers**, with equal visual weight, rather than a chord tool with a
drone helper bolted on. A single harmonic model would misrepresent one genre or
the other.

The drone is also what makes any scale's character audible at all: the ♭2 that
defines Phrygian sits in a *major* II chord that sounds bright in isolation. The
darkness lives in the relationship to the root, so something must hold the root.

## Consequences

**The domain model loses half its vocabulary.** **Step**, **Pattern**, **Clock**
and **Tempo** come out of `CONTEXT.md`. **Scale**, **Degree**, **Chord** and
**Drone** go in. This is the point of the decision: a glossary that describes two
possible products describes neither.

**The sequencer is deferred, not rejected.** Generative melodies and basslines
are wanted, and they need a clock — so that vocabulary returns when that work
starts, with its own ADR if the shape has changed by then.

**The URL budget question is settled for now.** A patch plus a scale selection is
small. ADR 0003's worry about needing a compact binary format was a
pattern-encoding problem, and there are no patterns.

**No full synth panel.** Presets plus cutoff and resonance. "One instrument done
well" remains a coherent alternative project that this decision rules out.

**A known mismatch is accepted.** The pads play triads because a triad is the
clearest shape for learning major, minor and diminished. The research found the
target genres favour sparser two- and three-note voicings, and extended m7/m9
chords in house. The tool therefore teaches a voicing its genres do not much use.
Accepted for legibility; the sevenths toggle narrows it later.

## Alternatives considered

**A groovebox** — sequencer, drums, pattern sharing. It is the shape that would
have grown big enough to genuinely test whether "no build step, no dependencies,
the agent holds the whole codebase" survives contact with a real project.
Rejected because it is a large build before anything is enjoyable, and because
the stated preference is to stay lean and iterate. The clock returns with the
generative work rather than up front.

**One instrument done well** — a monosynth with a filter, a proper ADSR, and
knobs worth turning. Rejected because it is a better *instrument* and a worse
*teacher*: it would sound good and still say nothing about which notes belong
together.

**Structured lessons** — content plus exercises, taught sequentially. Rejected
because it is a textbook rather than an instrument: the work is prose, it does
not benefit from the codebase at all, and it goes stale. The one sentence per
scale is the deliberate minimum.
