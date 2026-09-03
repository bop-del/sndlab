# Domain context

The vocabulary of this project. Skills and tickets should use these terms rather
than inventing synonyms.

sndlab is a tool for learning harmony by ear — see
`docs/adr/0005-a-tool-for-learning-harmony.md`.

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
- **No sequencer.** **Step**, **Pattern**, **Clock** and **Tempo** were in this
  glossary while the project could still have become a groovebox. They are gone
  because it did not (ADR 0005). Generative melodies would need a clock, so they
  return with that work — and not before, because a glossary describing two
  possible products describes neither.
