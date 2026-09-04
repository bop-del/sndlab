# ADR 0007 — A muse with a clock: generated basslines and melodies

**Status:** accepted
**Date:** 2026-09-04

**Amends:** ADR 0005, which deferred the clock and rejected the groovebox.

## Context

ADR 0005 settled what sndlab is — *a tool for learning harmony by ear* — and
deferred one thing explicitly:

> **The sequencer is deferred, not rejected.** Generative melodies and basslines
> are wanted, and they need a clock — so that vocabulary returns when that work
> starts, with its own ADR if the shape has changed by then.

This is that ADR, and the shape has changed.

The request was a random generator for basslines and melodies fitting Goa trance
and techno. Asked what such a generator is *for*, three answers were on the
table: a teaching device that demonstrates a scale in motion, the first step of a
groovebox, or an idea generator — roll until something is good, then take it to a
DAW. The third was chosen, and it is not a variation on ADR 0005's framing. It is
a different product goal standing beside it.

That distinction is load-bearing. A teaching device has to be *legible*: it may
sound plain as long as the lesson is audible. A muse has to be *good*: nobody
keeps a line they do not want, and no amount of explainability substitutes. The
quality bar moves from "can you hear the ♭2" to "would you drop this in a
project", and that bar is what justifies the engineering below.

Research into the two target genres — recorded in
`docs/research/generative-basslines-and-melodies.md` — established that this is
achievable with a small, constrained generator rather than a large one, because
both genres are far more rule-bound than "random" suggests. It also established
that the rules differ between them in a way that decides the architecture.

## Decision

**sndlab gains a muse: a generator that writes basslines and melodies for Goa
trance and melodic techno, plays them on a real clock, and lets them be nudged
toward something worth keeping.**

The activity, in one sentence: *pick a scale, roll a line, hear it loop, mutate
it until you would keep it, and take it to a DAW.*

Seven decisions follow, each settled by the interview and the research behind it:

**1. One generator, not two.** Goa is the degenerate case of melodic techno's
algorithm: melodic techno anchors each phrase's boundary notes to a chord that
moves; Goa sets that chord to the tonic and never changes it. Same pitch stage,
different inputs.

**2. The generator owns its harmony.** It picks a progression from a small
table — `i–VI–III–VII` and relatives — at 2–4 bars per chord, with "one chord
forever" as the Goa setting. It does not read the chord pads, and it does not
require chord progressions to become recorded objects first.

**3. Bass and lead, plus a kick that can be silenced.** Both genres' basslines
are defined by the gap they leave for the kick; generating them without one means
auditioning the element that makes least sense alone. One sound, four to the
floor, one mute. No other drums.

**4. A real clock.** Lookahead scheduling against `AudioContext.currentTime`,
with tempo, loop and transport. This is the piece ADR 0005 deferred.

**5. Re-roll per lane, plus mutate.** The bass and the lead re-roll
independently, so a good bassline survives the hunt for a melody over it. Mutate
changes one step rather than regenerating — the single best-attested
compositional device in the Goa research, promoted to a UI verb. There is no
manual step editing.

**6. The pattern goes in the URL, as notes.** Not as a seed: a mutated line has
no seed. ADR 0003's budget accommodates a 16-step bass and lead comfortably.

**7. The engine grows ADSR, a per-note filter envelope with accent, and glide —
with no UI.** These are not polish. A rolling Goa bass needs sustain 0 and a
60–80 ms decay so each note dies before the next 16th; through the current
attack/release envelope it is a legato smear. Accent in the TB-303 model raises
volume *and* filter-envelope depth. Slide is portamento between tied notes. All
three are preset data plus per-step flags the generator already emits.

Delivered in slices: ① clock, generator, kick, ADSR/accent/glide, mutate, URL
· ② MIDI export (hand-written Type-0 SMF, no dependency — issue #15)
· ③ a delay send.

## Rationale

**The muse framing is what forces the clock, and the clock is what was deferred.**
The judgement a muse demands is not "is this line correct" but "does this still
sound good on the twentieth repeat" — a question about hypnotic, slowly evolving
music that cannot be asked without a loop. The research makes this concrete: the
strongest specific device found in Goa melody is a motif whose length is coprime
with the bar, so it precesses against the beat and realigns only after several
bars. That is inaudible in a one-shot. Everything else in this ADR is downstream
of needing to hear the line more than once.

**One generator is an evidence-based conclusion, not a preference.** The
melodic-techno rule, repeated near-verbatim across independent write-ups, is that
the first and last note of each phrase must be a chord tone while interior notes
are free within the scale — the contour repeats across the progression while
boundary pitches snap to the current chord. Goa's rule is a narrow weighted
random walk around a fixed root. Those are the same constraint satisfaction
problem with a different chord source, and modelling them as one generator
parameterised by (chord source, walk width, density, mutation rate) costs less
than modelling them separately. Where they genuinely diverge — Goa's coprime
motif length against melodic techno's 2-bar phrase, Phrygian's central ♭2 against
melodic techno's Aeolian/Dorian with no Phrygian found at all — the divergence
lives in parameters, not in control flow.

**The generator owns the harmony because the alternative is a larger feature
wearing a generator's clothes.** Reading the progression from the chord pads is
the better product eventually: it connects the two halves of the app. But the
pads are momentary presses, not a recorded sequence, so that route requires
building progression recording first. A generator that picks from a table serves
melodic techno as a first-class target now, and produces exactly the data model
that pad-driven progressions would later consume.

**Sound quality is a prerequisite here for the same reason ADR 0005 gave, with
more force.** That ADR admitted presets and a filter into a tool that
deliberately refused a synth panel, on the grounds that a scale played through a
buzzy sawtooth teaches nothing. The same argument applies harder to a muse: a
correct Goa bassline through a pad preset is unjudgeable, and would be rejected
for the wrong reason. The envelope work is what makes the generator's output
audible *as itself*.

**Randomness is the smallest part of this.** The research is unambiguous that
unconstrained randomness fails for four nameable reasons — no repetition, no
contour, no rhythmic anchor, no resolution to the root — and that both target
genres are rigid where it matters. The kick slot is always clear. Melodic-techno
bass is ~70% root in a one-octave range. Psytrance rolling bass is monotone with
an octave drop every 4–8 bars. What varies is small and deliberate. A generator
that randomises rhythm alongside pitch reproduces the documented failure mode, so
this one does not.

## Consequences

**The groovebox rejection is revisited, not circumvented.** ADR 0005 rejected the
groovebox as "a large build before anything is enjoyable". This ADR adds a clock,
patterns, a kick and URL-persisted pattern state — most of one. The honest
statement is that the rejection was of *building a groovebox up front*, and that
a muse arrives at adjacent machinery from a different direction and for a
different purpose. The line held is that there is no manual step editing, no drum
patterns, and no arrangement; the moment any of those is wanted, it is another
architecture decision, not a feature.

**The domain vocabulary returns.** **Step**, **Pattern**, **Clock** and **Tempo**
go back into `CONTEXT.md`, as ADR 0005 said they would, joined by **Lane**,
**Accent**, **Slide**, **Mutation** and **Muse**.

**sndlab now has two stated purposes.** Learning harmony by ear (ADR 0005) and
generating lines worth keeping. They share a scale model, an engine and a URL
codec, and they are not in conflict — but ADR 0005's one-sentence description of
the activity no longer covers the whole app, and this ADR's does not either.

**Slice one is the largest piece of work in this repo's history.** Clock,
generator, two lanes, kick, ADSR, accent, glide, mutation and a URL codec. It
needs splitting into tickets rather than a single implementation pass, and
`js/audio/` will cross the ~500-line rule in rule 5 during it.

**The Goa evidence is folklore, and the constants will need tuning by ear.**
Sources converge specifically and independently, which is real corroboration, but
no public transcriptions of Goa tracks exist. Ear-transcribing two bars of a
classic would outperform every source found. The generator's numbers should be
treated as starting points, not settled values.

**Verification gains a hard limit.** A verification run can assert that the clock
schedules 16 steps at the right times, that the kick slot is empty, that every
pitch is in scale. It cannot assert that a line is worth keeping. That judgement
belongs to `/accept-ticket` and to listening.

## Alternatives considered

**A teaching device** — the generated line demonstrates the scale in motion,
under your hands, so a mode's character becomes audible as movement rather than
as held notes. It fits ADR 0005 unchanged and caps its own scope. Rejected
because it does not describe what is actually wanted, and adopting it would have
meant building the same clock for a weaker reason.

**Export only, no playback** — generate, render the pattern, write a MIDI file,
judge it in Ableton. No clock at all, radically smaller. Rejected because a muse
you cannot audition is a bad muse: the loop *roll → listen → roll again* is the
entire activity, and this route reduces sndlab to a MIDI file generator with a
scale picker.

**One-shot playback without a transport** — fire the whole pattern as scheduled
notes at generate time. Much cheaper than a clock. Rejected because hypnotic
music heard once is not heard: repetition and slow evolution are the character
being judged.

**The progression comes from the chord pads** — play a progression in, generate
over it. The better product, and the one that connects the app's two halves.
Deferred rather than rejected: it needs progressions to become recorded objects
first, which is its own feature.

**Two generators, one per genre** — accepting the genres are different enough to
warrant separate code. Rejected on the evidence above, but it remains the
fallback if the shared pitch stage acquires more branches than parameters.

**Full pattern editing** — click a step, change a note. Rejected as the
groovebox. Worth naming that the boundary is thinner than it looks: mutation is a
one-step edit chosen by the machine, and manual editing is a one-step edit chosen
by the user.
