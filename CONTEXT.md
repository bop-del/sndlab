# Domain context

The vocabulary of this project. Skills and tickets should use these terms rather
than inventing synonyms.

## Audio fundamentals

| Term | Meaning here |
|---|---|
| **AudioContext** | The single Web Audio context of the app. Created lazily on the first user gesture (autoplay policy), then lives for the session. |
| **Oscillator** | Tone generator. Waveform (`sine`, `sawtooth`, `square`, `triangle`) + frequency. |
| **Envelope** | Amplitude over time. Currently simple: attack ramp, then exponential decay. The full form is ADSR (attack, decay, sustain, release). |
| **Filter** | Shapes timbre by attenuating frequency ranges. Low-pass is the classic synth filter; cutoff and resonance are its parameters. |
| **Voice** | One playable voice — oscillator + envelope + filter as a unit. Polyphony means several voices at once. |
| **AudioWorklet** | Dedicated audio thread for DSP code. Needed when the built-in nodes are not enough (e.g. a custom filter algorithm). |

## Sequencing

| Term | Meaning here |
|---|---|
| **Step** | One position in the grid. A 16-step sequencer has 16 positions per bar. |
| **Pattern** | A sequence of steps with their values (note on/off, pitch, accent). |
| **Clock** | The timekeeper. Must run on the audio timeline, not on `setTimeout` — otherwise it drifts audibly. |
| **Tempo / BPM** | Speed in beats per minute. |

## Project-specific

| Term | Meaning here |
|---|---|
| **Patch** | The complete sound setting — every parameter of an instrument. The thing you want to share and restore. |
| **State-in-URL** | A patch (and later a pattern) is encoded into the URL hash so sharing works without a backend. See `docs/adr/0003-url-as-state.md`. |
| **Engine** | `js/audio/AudioEngine.js` — the layer that wraps Web Audio. The UI calls the engine, never Web Audio directly. |
| **Check** | One claim about the running app that either holds or fails — a note plays at the right pitch, the console is clean. |
| **Verification run** | One pass over every check against a real browser, ending in a screenshot. The evidence behind "it works". |

## Boundaries

What this project deliberately does **not** have, for as long as that holds:

- **No server state.** Nothing persists between users. The moment that becomes
  necessary it is an architecture decision, not a feature — write an ADR.
- **No accounts, no identity.**
- **No build step.** See `docs/adr/0001-no-framework.md`.
