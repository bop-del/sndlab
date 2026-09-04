# Domain context

The vocabulary of this project. Skills and tickets should use these terms rather
than inventing synonyms.

sndlab is a tool for learning harmony by ear
(`docs/adr/0005-a-tool-for-learning-harmony.md`) that also generates basslines
and melodies worth keeping (`docs/adr/0007-a-muse-with-a-clock.md`). The two
purposes share a scale model, an engine and a URL codec.

## Harmony

| Term | Meaning here |
|---|---|
| **Scale** | A set of intervals from a root, and the notes that follow from it. Natural minor and Phrygian differ by one note; that one note is the lesson. |
| **Root** | The note a scale is built on. E Phrygian and G Phrygian are the same shape at different pitches. |
| **Degree** | A note's position in its scale, counted from the root — `1`, `♭2`, `3`. What a scale sounds like *is* the relationship of its degrees to the root. |
| **Chord** | Notes sounding together, built on a degree of the scale. A triad is three; a seventh is four. |
| **Drone** | A voice holding the root continuously, so the other notes can be heard against it. The other way harmony works in this music, alongside chords — not a helper for them. |

## Audio

| Term | Meaning here |
|---|---|
| **AudioContext** | The single Web Audio context of the app. Created lazily on the first user gesture (autoplay policy), then lives for the session. |
| **Oscillator** | Tone generator. Waveform (`sine`, `sawtooth`, `square`, `triangle`) + frequency. |
| **Envelope** | Amplitude over time. Currently attack and release, held in between. The full form is ADSR (attack, decay, sustain, release). |
| **Filter** | Shapes timbre by attenuating frequency ranges. Low-pass is the classic synth filter; cutoff and resonance are its parameters. |
| **Voice** | One playable voice — oscillator plus envelope. Polyphony means several at once. |
| **Preset** | A named set of sound parameters — waveform, envelope, filter defaults. What makes the difference between a pad and a pluck. |
| **AudioWorklet** | Dedicated audio thread for DSP code. Needed when the built-in nodes are not enough (e.g. a custom filter algorithm). |

## Sequencing

Returned with ADR 0007, which reversed ADR 0005's deferral of the clock. These
terms were removed from this glossary while the project could still have become
a groovebox; they are back because generating lines requires hearing them loop.

| Term | Meaning here |
|---|---|
| **Clock** | The scheduler that turns tempo into note events. Lookahead: a timer wakes periodically and schedules everything due in the next window against `AudioContext.currentTime`, because `setTimeout` is not accurate enough to play music. |
| **Tempo** | Speed, in BPM. One number, shared by everything that plays. |
| **Step** | One slot in a pattern — a 16th note. Sixteen to a bar. A step holds a gate (note, tie or rest), a pitch, an octave offset, and the accent and slide flags. The model is the TB-303's. |
| **Pattern** | A bar of steps for one lane. What the generator produces and what the URL carries. |
| **Lane** | One voice the clock drives — bass, lead, or kick. Lanes re-roll independently, so a good bassline survives the hunt for a melody over it. |
| **Accent** | A step flag. Raises volume *and* filter-envelope depth — brighter, not just louder. From the 303, where it is the main articulation. |
| **Slide** | A step flag: glide in pitch from this step into the next instead of re-triggering. Only audible when the next step is a note. |
| **Mutation** | Changing one thing in a pattern rather than regenerating it — the documented way goa melodies evolve, and the difference between rolling dice and steering. |
| **Muse** | What the generator is for: lines you would keep, not lines that demonstrate a scale. The bar is "would you drop this in a project", which is why the engine grew an envelope. |

## Project-specific

| Term | Meaning here |
|---|---|
| **Patch** | The complete sound setting — every parameter of an instrument. The thing you want to share and restore. |
| **State-in-URL** | A patch (and the chosen scale) is encoded into the URL hash so sharing works without a backend. See `docs/adr/0003-url-as-state.md`. |
| **Engine** | `js/audio/AudioEngine.js` — the layer that wraps Web Audio. The UI calls the engine, never Web Audio directly. |
| **Check** | One claim about the running app that either holds or fails — a note plays at the right pitch, the console is clean. |
| **Verification run** | One pass over every check against a real browser, ending in a screenshot. The evidence behind "it works". |

## Boundaries

What this project deliberately does **not** have, for as long as that holds:

- **No server state.** Nothing persists between users. The moment that becomes
  necessary it is an architecture decision, not a feature — write an ADR.
- **No accounts, no identity.**
- **No build step.** See `docs/adr/0001-no-framework.md`.
- **No groovebox.** There is a clock, patterns and a kick (ADR 0007), which is
  most of one. The line held is that patterns are generated and mutated, never
  edited step by step; there is one kick and no drum patterns; and there is no
  arrangement. When any of those is wanted it is an architecture decision, not a
  feature.
