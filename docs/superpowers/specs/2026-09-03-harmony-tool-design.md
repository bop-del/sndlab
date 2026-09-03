# sndlab — a tool for learning harmony by ear

**Date:** 2026-09-03
**Status:** design agreed, not yet built
**Resolves:** [#1 — Decide the scope: what is sndlab going to be?](https://github.com/bop-del/sndlab/issues/1)

## What this is

**A tool for learning harmony by ear, that sounds good enough to enjoy playing.**

Not a synth, not a groovebox. The activity it supports, in one sentence: *pick a
scale, press a chord, play a melody over it, and hear why that scale sounds the
way it does.*

Three consequences, stated because they settle later arguments:

**Harmony is the point; the synth serves it.** Sound quality is not a feature, it
is a prerequisite — a scale played through a bad tone teaches nothing. But the
synth stays as simple as it can while still sounding good. When effort is
contested, it goes to the harmony side.

**Electronic music is the frame**, not general music theory. That is why the
scale list is curated rather than complete, and why the presets are pads and
basses rather than pianos and strings.

**You learn by playing, not by reading.** No lessons, no exercises. The tool
shows what is in a scale and lets you hear it. The only prose is one sentence per
scale saying why it is on the list.

### Not in this scope

- **No sequencer and no clock.** Deferred, not rejected — generative melodies and
  basslines need one, and that work comes back later.
- **No full synth panel.** Presets plus two live controls. "One instrument done
  well" stays a separate, deferred idea.
- **No MIDI input.** The engine already speaks MIDI note numbers, so this is a
  small adapter whenever it is wanted.
- **No written theory content, lessons, or exercises.**

### Effect on the domain model

This resolves the ambiguity that opened #1: `CONTEXT.md` carried the vocabulary
of two products at once. **Voice, Patch, Envelope and Filter stay. Step,
Pattern, Clock and Tempo go** — they return if and when the generative work
does. `Scale`, `Degree` and `Chord` join them.

## Problem

The app is a playable two-octave keyboard with one fixed sawtooth voice. Every
note sounds identical and slightly unpleasant, so there is nothing to explore and
no reason to stay. More importantly there is nothing to *learn* from it: it makes
sound, but it says nothing about which sounds go together.

Boris wants to understand harmony — scales, chords, why certain scales dominate
electronic music — and has no background in it. Reading about Phrygian does not
teach what Phrygian sounds like. Playing it does, provided the tone is good
enough that the character is audible.

## Solution

One screen, no modes, no navigation.

```
┌────────────────────────────────────────────────────┐
│  sndlab                                            │
│                                                    │
│  Scale:  [ E Phrygian ▾ ]                          │
│  The dark one — a flat second gives it a Middle    │
│  Eastern edge. Common in techno and hard dance.    │
│                                                    │
│  ┌────┬────┬────┬────┬────┬────┬────┐              │
│  │ i  │ II │III │ iv │ v° │ VI │vii │  ← chord pads│
│  └────┴────┴────┴────┴────┴────┴────┘              │
│                                                    │
│  Sound: [ Warm pad ▾ ]   Cutoff ──●──  Res ─●───   │
│                                                    │
│  ▓░▓░▓▓░▓░▓░▓▓░▓░▓░▓▓░▓░▓   ← keyboard, scale     │
│  █ █ █ █ █ █ █ █ █ █ █ █ █     notes highlighted   │
│                                                    │
│  Playing: E – G – B  (i)                           │
└────────────────────────────────────────────────────┘
```

**Scale picker** — a short curated list. Choosing one re-labels the chord pads and
re-highlights the keyboard. The sentence underneath is the entire learning
content.

**Chord pads** — seven, one per scale degree, labelled in roman numerals.
Uppercase is major, lowercase minor, `°` diminished, so the labels themselves
show the scale's shape. Pads **latch**: press to start, press again to stop.
**One chord at a time** — pressing a second pad releases the first, which is what
hearing a progression requires.

**Sound controls** — a preset dropdown, plus cutoff and resonance sliders that
take effect on notes already sounding.

**Keyboard** — as it is today, two octaves, mouse and computer keyboard. New:
notes in the selected scale are visually distinct. **Out-of-scale notes still
play** — muting them would hide the very contrast the tool exists to teach.

**Readout** — the notes currently sounding and, when they form a recognisable
chord, its name and degree.

Deliberately absent: transport, record, save, and any octave control on the pads.
Chords sound in a fixed register below the keyboard's range so a chord and a
melody do not collide.

## User Stories

1. As someone who does not know music theory, I want to hear a scale's
   characteristic chords immediately, so that I learn its sound before its name.
2. As a learner, I want each scale labelled with why it is on the list, so that I
   know what I am listening for.
3. As a learner, I want to play a melody over a held chord, so that I hear how
   scale notes behave against harmony.
4. As a learner, I want to play notes outside the scale too, so that I can hear
   the difference rather than be prevented from making it.
5. As a learner, I want the keyboard to show which notes belong to the scale, so
   that I can find them without counting.
6. As a learner, I want chords labelled in roman numerals, so that I start to see
   the pattern of major, minor and diminished degrees.
7. As a learner, I want to switch scale and hear the same progression change, so
   that the difference between scales becomes concrete.
8. As a player, I want a chord to keep sounding after I let go, so that both
   hands are free for the melody.
9. As a player, I want pressing a second pad to replace the first, so that
   playing a progression needs no stop action.
10. As a player, I want to be told what I am currently playing, so that I can
    connect a sound I like back to its name.
11. As someone who finds the current sound unpleasant, I want presets that sound
    like electronic music, so that I want to keep playing.
12. As a player, I want a filter I can sweep while notes sound, so that the
    instrument feels alive rather than static.
13. As a player, I want some space on the sound by default, so that it does not
    sound dry and cheap.
14. As a developer, I want scale and chord knowledge in one place with no audio
    or DOM dependency, so that generative work can reuse it unchanged.
15. As a developer, I want adding a scale to be a data change, so that widening
    the list costs nothing.

## Architecture

Four modules, each with one job. The existing rule holds: **the UI calls the
Engine, never Web Audio directly.**

```
js/
├── main.js              entry point
├── theory/
│   └── Scales.js        NEW — scale data + chord construction. No audio, no DOM.
├── audio/
│   ├── AudioEngine.js   EXISTS — voices, note on/off. Gains presets + filter.
│   └── Presets.js       NEW — named parameter sets
└── ui/
    ├── UI.js            composition root
    ├── Keyboard.js      EXISTS — gains scale highlighting
    ├── ChordPads.js     NEW — seven latching pads
    └── Readout.js       NEW — what is sounding, and its name
```

### theory/Scales.js

The heart of the tool, and pure data plus arithmetic. A scale is a name, a set of
semitone intervals from the root, and a why-sentence. Everything else derives:
which MIDI notes are in the scale, which chord sits on each degree, and whether
that chord is major, minor or diminished.

```
Phrygian = [0, 1, 3, 5, 7, 8, 10]     the ♭2 is the whole character
```

No audio, no DOM, no state. That is what makes it reusable when generative work
arrives, and it is the reason this module is worth having as its own thing rather
than as a table inside the UI.

### The audio graph

Two new shared nodes, not per-voice:

```
voice → voice gain ┐
voice → voice gain ┼→ filter (cutoff, resonance) → reverb → destination
voice → voice gain ┘
```

Shared is both cheaper and the behaviour wanted: turning the cutoff knob affects
what is already sounding. Reverb is a small algorithmic one — delay lines with
feedback — because a convolution reverb needs an impulse-response file, and a
binary asset sits awkwardly with the no-dependencies rule for a marginal gain.

A **preset** is a plain object: waveform, detune, envelope times, filter
defaults. Changing preset changes what new voices use; it does not retune notes
already sounding.

### Shared state

Chord pads and the keyboard both make sound, and both go through the `noteOn` /
`voice.stop()` handles that already exist — the pad holds its three voices, the
keyboard holds its own. No new registry and no new concepts.

The readout needs to know everything currently sounding, from both sources. That
is one small piece of shared state: a set of active MIDI notes that both inputs
write and the readout reads.

## Testing

The existing seam is `scripts/verify.mjs` driving the real page in a headless
browser, and it stays the primary one. Everything user-visible is asserted
through it: pads sound the right notes, highlighting matches the scale, the
filter knob changes the graph, out-of-scale notes still play.

**One deliberate exception — a second seam for `theory/Scales.js`.** It is pure
functions, and "E Phrygian contains F" is a fact that should be asserted
directly, not inferred from a screenshot of highlighted keys. Verifying scale
arithmetic through the DOM would be slow, indirect, and would fail for reasons
unrelated to the arithmetic.

This is a deliberate departure from the one-seam preference, and it is scoped:
**pure theory functions only.** Nothing with audio, DOM, or state gets a direct
test.

Screenshots continue to be taken every run and assessed by eye — the chord pads
and highlighting are visual, and no assertion catches a layout that reads badly.

## Build order

### Slice 1 — prove the idea works

E Phrygian, hardcoded. Seven latching chord pads, triads. Keyboard highlights
scale notes. One preset ("Warm pad") replacing the raw sawtooth, with filter and
reverb in the graph. No scale picker — a picker with one entry is a lie.

**Done when:** pressing a pad gives a chord worth hearing, a melody over it feels
good, and the response is "I want to keep doing this." If the answer is "this is
unpleasant", the design is wrong and one build has been spent finding out rather
than five.

### Slice 2 — the scale picker

The curated shortlist, each entry with its why-sentence. This is where learning
actually starts: hearing the same progression in Phrygian and then in natural
minor is the lesson. Mostly a data change, because slice 1 builds the structure.

### Slice 3 — the readout

"You are playing E–G–B, that is i." Third because it is the only piece that is
real logic rather than data, and the tool works without it.

### Slice 4 — widening

More presets, and the triads/sevenths toggle. Both pure widening.

### Later, not planned

Generative melodies and basslines — which needs a clock, and brings the
sequencer vocabulary back. MIDI input. Any of it may change once slices 1–3 have
actually been used.

## The scale shortlist

Settled by research against primary sources — see
`docs/research/electronic-music-scales.md` for citations and evidence quality.
Ranked; slice 2 adds them in this order.

1. **Natural minor (Aeolian)** — the default scale of electronic music. Without
   it the tool has no baseline to contrast anything against. The one item here
   with corpus-level evidence rather than folk wisdom.
2. **Phrygian** — the clearest "second scale". One flipped note against natural
   minor, an enormous change in mood, so it teaches the ♭2 cleanly.
3. **Dorian** — the raised 6th, as a minimal contrast to natural minor.
   Characteristic of synthwave and of house's brighter minor moments.
4. **Harmonic minor** — the borrowed leading tone; explains why some minor tracks
   suddenly get a major V.
5. **Phrygian dominant** — distinct and memorable, and the fifth mode of harmonic
   minor, so it follows naturally from 4.
6. **Lydian** — optional. The only non-minor entry; earns its place only if
   ambient is worth covering. Cut first.

**Two things the research changed, and the tool must not misrepresent:**

**The "harmonic minor and Phrygian dominant are everywhere in hard dance and
psytrance" claim does not hold up** in the form it is usually stated. It survives
only narrowly: Phrygian dominant as a lead or arpeggio device in psytrance
intros, over a groove that is otherwise plain minor or a static root. Every
source asserting more is a production blog or forum post; no corpus study
supports it. **So its why-sentence frames it as a melodic colour, not a
harmonic foundation.**

**No verifiable canonical psytrance example was found.** Genre-level claims
exist; a specific named track with a confirmed Phrygian dominant key does not.
If the tool ever cites example tracks, that one must be verified against actual
notes rather than repeated from a blog — better to omit an example than ship a
fabricated one.

## Open questions

None blocking. The risks below are things to discover by building, not decisions
left unmade.

## Risks

**The preset may not sound good enough.** A single filtered sawtooth called "Warm
pad" may still sound cheap. The usual fix is stacked, slightly detuned
oscillators, which means more voices per note. Better discovered in slice 1 than
designed around blindly.

**Latching one-chord-at-a-time may feel wrong.** It is a judgement call, not
something anyone has tried. If two pads at once turns out to be wanted, it is a
small change.

**The tool may be too shallow to hold attention.** Without rhythm or repetition
this is a five-minute toy rather than a twenty-minute one. That is the honest
cost of deferring the clock, and slice 1's "done when" is the test of whether it
matters.
