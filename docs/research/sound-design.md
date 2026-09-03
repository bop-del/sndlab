# Making the Web Audio synth sound good

Research for `js/audio/AudioEngine.js` and `js/audio/Presets.js`. The
presets currently sound cheap; this asks why, using real synthesis
references (Sound on Sound, CCRMA/Julius O. Smith, product manuals) and
real library source code (Tone.js, Strudel's superdough) rather than
production-blog assertions. Every numeric claim below is tagged by evidence
quality:

- **(a) primary** — quoted directly from a spec, an academic reference, or
  library source code fetched and read for this document.
- **(b) named source** — a credible, named publication or manual's stated
  claim, not independently re-derived here.
- **(c) consensus/inference** — general practitioner agreement with no one
  citable source, or this document's own reasoning from adjacent (a)/(b)
  material. Treated as a reasonable starting point, not a fact.

## Summary — priority order

1. **The clipping is real and structural, not a tuning mistake.** Nothing
   in the current chain — `AudioEngine.buildChain()` — attenuates for
   polyphony or limits the master output. Every voice sums at full gain
   into a bare `GainNode` chain with no ceiling. This is fixable with one
   new node and a small peak-gain cut. Do this first; it is the only item
   here that can make an existing preset go from "clipping" to "not
   clipping" without changing how anything sounds otherwise.
2. **The pluck is missing a filter envelope.** This is the single biggest
   timbral gap: a static cutoff cannot produce the bright-attack/dark-tail
   shape that defines a "pluck" as a category of sound, independent of the
   clipping issue.
3. **The reverb algorithm is the right family, tuned generically.** The
   four-feedback-delay-line approach is a legitimate simplification of
   Schroeder's design, not a wrong algorithm — but it is missing the
   allpass diffusion stage that stops a comb-only reverb from sounding
   metallic, and a generated-impulse-response `ConvolverNode` is a
   credible, dependency-free upgrade with real precedent in two respected
   libraries.
4. **Detune amounts are already in a reasonable range.** ±7 cents for the
   pad is not the bug. Small polish items exist (phase, drift, a
   sub-oscillator for bass) but reordering priorities around them before
   fixing gain staging and the pluck's filter envelope would be
   backwards.

---

## 1. Gain staging and headroom

### What the current code does

`AudioEngine.buildChain()` (`js/audio/AudioEngine.js:77-113`) connects
`filter → dry → destination` and `filter → [4 feedback delay lines] → wet →
destination`, with `dry.gain = 1` and `wet.gain = preset.reverb`. There is
no `DynamicsCompressorNode`, no per-voice or master gain scaling by
polyphony, anywhere in the file. Every oscillator's `level` gain
(`Presets.js`) and the note envelope's `peak` sum linearly. Measured
headroom use of 0.82–0.90 for a 3-note chord plus drone is the direct,
expected consequence of a graph with no ceiling at all — not a subtle
bug, an absent safety net.

### What real libraries actually do — this was the interesting finding

The naive assumption going in was "surely a respected synth library scales
per-voice gain by `1/N`." **Neither of the two Web Audio-based projects
inspected does this.**

**Tone.js — verified from source.** `Tone.PolySynth._getNextAvailableVoice()`
connects each new voice straight to the shared output with no gain math at
all:

```ts
voice.connect(this.output);
this._voices.push(voice);
```
— [`Tone/instrument/PolySynth.ts:222`](https://github.com/Tonejs/Tone.js/blob/dev/Tone/instrument/PolySynth.ts)

The only protection against runaway polyphony is a hard voice cap
(`maxPolyphony: 32` by default), and exceeding it drops the note with a
console warning rather than attenuating:

```ts
static getDefaults(): PolySynthOptions<Synth> {
    return Object.assign(Instrument.getDefaults(), {
        maxPolyphony: 32,
        options: {},
        voice: Synth,
    });
}
// ...
} else {
    warn("Max polyphony exceeded. Note dropped.");
}
```

Every voice's own default volume is **0 dB (unity)** — inherited from the
base `Instrument` class, confirmed at
[`Tone/instrument/Instrument.ts`](https://github.com/Tonejs/Tone.js/blob/dev/Tone/instrument/Instrument.ts).
`Tone.Destination` — the master bus — is just `Volume → Gain → speakers`,
also defaulting to 0 dB, with **no compressor or limiter wired in by
default**:

```ts
input: Volume = new Volume({ context: this.context });
output: Gain = new Gain({ context: this.context });
connectSeries(this.input, this.output, this.context.rawContext.destination);
static getDefaults(): DestinationOptions {
    return Object.assign(ToneAudioNode.getDefaults(), { mute: false, volume: 0 });
}
```
— [`Tone/core/context/Destination.ts`](https://github.com/Tonejs/Tone.js/blob/dev/Tone/core/context/Destination.ts)

Tone.js does ship a ready-made `Tone.Limiter`, but it is opt-in — the user
must explicitly insert it. Its own preset, read directly from source, is
the most concrete "limiter as safety net" numbers found anywhere in this
research (a):

```ts
this._compressor = this.input = this.output = new Compressor({
    context: this.context,
    ratio: 20,
    attack: 0.003,
    release: 0.01,
    threshold: options.threshold, // default -12
});
static getDefaults(): LimiterOptions {
    return Object.assign(ToneAudioNode.getDefaults(), { threshold: -12 });
}
```
— [`Tone/component/dynamics/Limiter.ts`](https://github.com/Tonejs/Tone.js/blob/dev/Tone/component/dynamics/Limiter.ts)

Because none of this is automatic, users hit real clipping in practice —
Tone.js issue #637 ("PolySynth ... causing clipping/popping noises") is a
real, named issue title confirming this is a known gap in the library, not
a solved problem (b — issue title verified, body not independently
re-fetched).

**Strudel/superdough — verified from source** (repo moved to
[codeberg.org/uzu/strudel](https://codeberg.org/uzu/strudel); the GitHub
mirror is a stub). Also no `1/N` scaling anywhere — confirmed by grep
across the whole `superdough` package for voice-count-based gain math.
Instead, superdough combines two different mechanisms:

- A fixed, modest per-voice attenuation baked in at the point a basic
  oscillator voice is built — literally commented `// turn down`:
  ```js
  const g = gainNode(0.3);
  ```
  — [`packages/superdough/synth.mjs:54`](https://codeberg.org/uzu/strudel/src/branch/main/packages/superdough/synth.mjs)
  (a separate, higher-level per-event default gain of `0.8` also exists in
  the pattern-parameter defaults table — these are two different points in
  the chain, an internal oscillator trim and a user-facing note-volume
  default, not a contradiction.)
- A hard polyphony ceiling with voice-stealing (oldest voice killed, not
  attenuated) rather than gain reduction:
  ```js
  export const DEFAULT_MAX_POLYPHONY = 128;
  // oldest audio nodes will be destroyed if maximum polyphony is exceeded
  ```
  — `packages/superdough/superdough.mjs`

Compression exists in superdough only as an **opt-in per-pattern effect**
(`.compressor()`), never wired in globally:
```js
const options = {
  threshold: threshold ?? -3,
  ratio: ratio ?? 10,
  knee: knee ?? 10,
  attack: attack ?? 0.005,
  release: release ?? 0.05,
};
```
— `packages/superdough/helpers.mjs`

**One real project does scale by voice count, and the formula is worth
copying.** Superdough's own `supersaw` sound — a genuine multi-oscillator
unison voice, not a polyphony manager — normalizes its own internal stack
of N detuned oscillators by **`1 / Math.sqrt(voices)`**, not `1/N`:
```js
const voices = clamp(unison, 1, 100);
const gainAdjustment = 1 / Math.sqrt(voices);
// ...
getParamADSR(envGain.gain, attack, decay, sustain, release, 0, 0.3 * gainAdjustment, begin, holdend, 'linear');
```
— [`packages/superdough/synth.mjs:169-194`](https://codeberg.org/uzu/strudel/src/branch/main/packages/superdough/synth.mjs)

This is the theoretically correct curve for summing signals that are not
fully phase-correlated: RMS/perceived loudness of N such signals grows
with `√N`, not `N`, so dividing by `√N` keeps perceived loudness roughly
constant as voice count changes, whereas dividing by `N` over-attenuates.
A Cycling '74 (Max/MSP) forum thread on polyphonic amplitude discusses this
same `sqrt(1/N)` preference over linear `1/N` for the same reason (c —
one practitioner's stated preference, not a standard, but consistent with
the DSP reasoning and with real shipped code above).

**DynamicsCompressorNode spec defaults — verified against the W3C spec
text directly (a):**

| Param | Spec default | Range |
|---|---|---|
| threshold | **−24 dB** | [−100, 0] |
| knee | **30 dB** | — |
| ratio | **12** | [1, 20] |
| attack | **0.003 s** | [0, 1] |
| release | **0.25 s** | [0, 1] |

These are browser defaults, not a "safety limiter" recipe — MDN describes
the node's purpose ("prevent clipping and distortion when multiple sounds
are... multiplexed together") without giving a recommended limiter preset.
The most concrete purpose-built "limiter" numbers found in real, shipped
code are Tone.js's own, above (threshold −12 dB, ratio 20, attack 3 ms,
release 10 ms) — a `ratio` at or above roughly 15–20:1 is the rule of
thumb (b, webaudiotech.com via Wayback Machine) for a compressor to
function as a limiter rather than a coloring compressor.

Boris Smus's O'Reilly *Web Audio API* book states the general principle
plainly (a — quoted from the fetched book text):

> "Since multiple sounds playing simultaneously are additive with no level
> reduction, you may find yourself in a situation where you are exceeding
> past the threshold of your speaker's capability... The way to prevent
> clipping is to reduce the overall level of the signal... Using moderate
> amounts of dynamics compression in your mix is generally a good idea."

### What this means for sndlab

The honest synthesis of the above: **no respected library relies on
dynamic `1/N` scaling as the primary defense.** The real pattern is
layered, static headroom (a fixed, conservative per-voice ceiling chosen
once, by ear) plus a hard voice cap, plus — recommended by every named
source, though not automatically wired in by either library studied — a
`DynamicsCompressorNode` on the master bus as a backstop for the cases
static headroom doesn't fully cover (a full chord plus a fat pad drone
plus reverb tail, which is exactly the sndlab scenario that measured
0.82–0.90).

Concrete recommendation for `AudioEngine.buildChain()`:

1. Add one `DynamicsCompressorNode` between the existing `dry`/`wet` sum
   and `ctx.destination`, using Tone.js's own limiter numbers as a
   starting point since they're the most concrete real-world "limiter, not
   creative compressor" preset found: `threshold: -12, ratio: 20, attack:
   0.003, release: 0.01, knee: 0` (a tight knee reads as more "limiter",
   though Tone.js doesn't override the spec's `knee: 30` on its
   `Compressor` — start conservative and listen).
2. Independently, cut fixed per-voice/per-preset gain a bit — the
   `Presets.js` `gain`/`peak` values are already reasonable per the pad's
   measured 0.22 single-voice peak; the actual overshoot comes from
   summing 3 chord notes plus reverb feedback with no ceiling at all, so a
   compressor genuinely fixes this rather than papering over an
   individually-too-loud voice.
3. Do not implement `1/N` voice-count-based scaling as the fix — it is not
   what any real library does, and it actively fights the "each voice
   should sound the same regardless of what else is playing" goal that a
   fixed-headroom-plus-limiter approach preserves.

---

## 2. Warmth and "analogue" character

### Detune amounts, in cents

**Tone.js's `FatOscillator`** — a purpose-built unison-stack oscillator —
defaults to `spread: 20` cents across `count: 3` voices, landing roughly
at `[-10, 0, 10]` (a, from source:
[`Tone/source/oscillator/FatOscillator.ts`](https://github.com/Tonejs/Tone.js/blob/dev/Tone/source/oscillator/FatOscillator.ts)).
sndlab's pad preset uses **±7 cents** across 3 saws — inside the same
range, and not the source of the reported problem.

**Spectrasonics Omnisphere 2** (a, product manual) documents FINE detune
up to "a half step/99 cents" and COARSE up to a fifth or octave — useful
as an upper bound for how far unison detune can go before it stops reading
as chorus and starts reading as a chord, not as a recommended value.

The JP-8000 supersaw's famous 7-voice spacing is **not** a single citable
number — Roland never published it, and reverse-engineering threads
(Gearspace, KVR) agree only that it's non-uniform and, at moderate detune
settings, narrower than people assume (c). Treat any specific "supersaw =
±14 cents" figure elsewhere as folklore.

**Strudel's real, shipped `supersaw`** uses **5 unison voices**, a
`spread` (stereo pan spread) of `0.6`, and a `detune` default of `0.18` in
its own normalized unit (a, from source, `synth.mjs` — see gain section
above for the file). This is a genuinely useful reference point for a
5-voice unison stack, separate from the smaller 3-voice pad case.

### Phase — does it matter for a slow-detuned stack?

Web Audio's `OscillatorNode.start(time)` gives every voice the same phase
origin; there is no phase-offset parameter. Whether this matters depends
on stack tightness:

- **Omnisphere's manual** (a) treats phase as a real, named synthesis
  parameter — "the initial phases of the Unison voices can be randomly
  spread... In-Phase to 180° out of Phase" — and states plainly that
  "in-phase settings produce digital synthesizer results, while
  out-of-phase settings create classic analog-like tones."
- **KVR forum discussion** (b) explains the mechanism: oscillators started
  in-phase and lightly detuned periodically re-converge (beat), and at the
  convergence moment there's a small recurring amplitude "pluck" —
  audible as a rhythmic pulsing, more noticeable the tighter and denser
  the unison stack (supersaw-style, 15+ cents / 5+ voices) than for a
  slow, wide, 3-voice pad detune like sndlab's ±7 cents (~1 Hz beat rate).

**Verdict:** not the primary lever for sndlab's current bug, but a
legitimate secondary polish item, cheap to add: start each stacked
oscillator at `start(time + tinyRandomOffset)` with the offset on the
order of 0–5 ms, which is equivalent to a phase offset at audio-note
frequencies.

### Slow pitch drift

Real analogue oscillators drift in pitch slowly due to thermal/component
variance, and named analogue-modeling synths (u-he Diva's "Age", Arturia's
emulations) implement this explicitly as a documented feature (b — the
technique's existence is well-attested; I could not fetch one primary
spec sheet with exact drift-rate/depth numbers in this pass). The
numbers below are this document's own inference (c), calibrated against
the sourced detune ranges above, not a quoted spec:

- Rate: ~0.1–0.5 Hz (well below any audible vibrato)
- Depth: ~2–4 cents peak, randomized independently per oscillator (a
  drift that moves the whole stack together is just a pitch bend, not
  useful here)
- Implementation: a slow sine `OscillatorNode` (~0.2 Hz) through a
  small-range `GainNode` into each voice's `detune` `AudioParam`.

### Sub-oscillator, one octave down

Well-documented, standard trick — **(a) Electric Druid**, a respected
hardware synth-design reference (not a blog opinion piece; the author
designs real synth DSP), states plainly:

> "A simple square wave one octave below the main oscillator pitch is the
> commonest sub-oscillator, and on many synths, this is the only option
> available via a simple switch or mixer knob."
> — [electricdruid.net, "A Study of Sub-Oscillators"](https://electricdruid.net/a-study-of-sub-oscillators/)

Square is the historical default because a divider circuit produces it
"for free" from the main oscillator's frequency — a cost reason from
hardware history, not necessarily the cleanest tonal choice. The
**Roland SH-101** (a, named shipped synth) offered exactly three modes:
"square at -1 octave, square at -2 octaves, and 25% pulse at -2 octaves."
On mixing level, the same source notes that a sub-octave square "at half
the level" of the main oscillator is a normal reference point (b, less
precisely sourced than the waveform claim).

**Verdict:** standard and low-risk for a **bass** preset specifically —
sine (cleaner, no added harmonics) or square (adds odd harmonics, more
perceived loudness/"body") one octave down at roughly 40–60% of the main
oscillator's gain. Less commonly used for pads or plucks; not a fix for
the current two presets, but directly relevant to a bass preset per §5.

---

## 3. Filter envelope: the pluck's real missing ingredient

The current pluck preset has an amplitude envelope but a **static**
filter cutoff — `AudioEngine.buildChain()` sets `filter.frequency` once
per preset and only re-ramps it on preset *switch* (`setPreset`), never
per note. This means every pluck note has an identical, unchanging
timbre for its whole duration; only its volume moves.

This is very likely the single biggest missing ingredient for the pluck
specifically. A moving filter envelope — bright at the attack, dark by
the tail — is what separates a "pluck" as a timbral category from "a saw
wave with a fast volume envelope." Confirmed as the standard architecture
by:

- **Tone.MonoSynth** (a, source) — ships a *separate* `FrequencyEnvelope`
  wired directly to `filter.frequency`, distinct from the amplitude
  envelope:
  ```ts
  filter: { type: "lowpass", Q: 1, rolloff: -12 },
  filterEnvelope: {
      attack: 0.6, decay: 0.2, sustain: 0.5, release: 2,
      baseFrequency: 200, octaves: 3, exponent: 2,
  },
  ```
  — [`Tone/instrument/MonoSynth.ts`](https://github.com/Tonejs/Tone.js/blob/dev/Tone/instrument/MonoSynth.ts)
  (this particular default is tuned slow, more pad-like than pluck — the
  *architecture*, not these exact numbers, is the point.)
- **Tone.js's own bundled example patch**, `examples/monoSynth.html` (a,
  source) — a `PolySynth(MonoSynth)` preset that is much closer to an
  actual pluck timbre:
  ```js
  envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 0.8 },
  filterEnvelope: {
      attack: 0.001, decay: 0.7, sustain: 0.1, release: 0.8,
      baseFrequency: 300, octaves: 4,
  }
  ```
  Filter envelope attack near-instant, decay to a low sustain, cutoff
  sweeping from 300 Hz up to `300 × 2⁴ = 4800 Hz` — i.e. **4 octaves of
  sweep**, exactly the "bright attack, dark tail" shape being sought.
- **Surge XT** (open source), independently confirmed to use the same
  two-envelope architecture — separate 4-stage ADSR for filter and for
  amplitude ([manual](https://surge-synthesizer.github.io/manual-xt/)) —
  though a numeric factory-patch dump wasn't recoverable in this pass.
- **General patch-programming convention** (c, consensus, corroborated by
  Attack Magazine-style tutorials found in this research): filter envelope
  attack set at or slightly *before* the amp envelope's attack, so
  brightness peaks just ahead of full volume; filter release usually
  shorter than the amp release, so the tail darkens before it goes silent.

**Recommended pluck filter envelope for sndlab**, synthesizing the sourced
MonoSynth example above with the existing amp envelope (attack 0.004,
release 0.35):
- attack: 0.002–0.005 s (matches amp attack)
- decay: 0.15–0.3 s
- sustain: 0.05–0.15 (low, not zero — a fully-zero sustain plus a filter
  Q of 7 can produce an audible "thump" as the filter slams shut)
- release: ≤ amp release (0.15–0.3 s)
- sweep depth: 2–4 octaves above the preset's resting cutoff (i.e. peak
  cutoff ≈ 4×–16× resting cutoff)

---

## 4. Reverb without an impulse-response file

### Is the current 4-feedback-delay-line design fundamentally wrong?

No — it's a legitimate simplification of the right family of algorithm,
just missing the piece that stops it sounding metallic. Confirmed from a
strong primary academic source, **Julius O. Smith's CCRMA pages on
Schroeder reverberators** (a, quoted directly):

> "A series connection of several allpass filters / A parallel bank of
> feedback comb filters / A mixing matrix." —
> [ccrma.stanford.edu, Schroeder Reverberators](https://ccrma.stanford.edu/~jos/pasp/Schroeder_Reverberators.html)

Schroeder's own reasoning, preserved on the same page, for *why* the
comb-filter bank alone isn't enough:

> "There are about 15 large response peaks in every 100 cps interval for a
> room with 1 sec reverberation time... between 3 and 4 comb filters in
> parallel... with incommensurate delays, are required to approximate the
> number of peaks... the open loop gain of the comb filters should not
> exceed about 0.85 or −1.4 dB to keep the response fluctuations from
> being excessive."

And why allpass filters specifically fix this without recoloring the
sound:

> "the allpass filters provide 'colorless' high-density echoes in the late
> impulse response of the reverberator... For steady-state tones... the
> allpass property gives the same gain at every frequency, unlike comb
> filters."

In plain terms: a bank of feedback comb filters alone has a frequency
response that is a strict, evenly-spaced harmonic comb tied to each
delay's length — audible as metallic ringing or "flutter," especially
with only 3–4 lines. Cascaded allpass filters add echo density
("diffusion") *without* adding this periodic coloration, because an ideal
allpass has flat magnitude response — it only manipulates phase.
sndlab's `buildChain()` has the comb-filter half of Schroeder's design (4
delay lines, feedback 0.55, prime-ish millisecond spacing, a damping
lowpass) but no allpass diffusion stage at all — that is the concrete,
sourced reason it's likely to sound comby/metallic rather than smooth.

### Freeverb — the standard reference algorithm, exact published constants

Fetched directly from the original public-domain source (a):

```c
// Written by Jezar at Dreampoint, June 2000. Public domain.
const int   numcombs      = 8;
const int   numallpasses  = 4;
const float fixedgain     = 0.015f;
const float scalewet      = 3;
const float scaledry      = 2;
const float scaledamp     = 0.4f;
const float scaleroom     = 0.28f;
const float offsetroom    = 0.7f;
const float initialroom   = 0.5f;
const float initialdamp   = 0.5f;
const int   stereospread  = 23;

// Comb filter delays, left channel (right = left + stereospread), samples @ 44.1kHz
combtuningL1..L8 = 1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617

// Allpass filter delays, left channel (right = left + stereospread), samples
allpasstuningL1..L4 = 556, 441, 341, 225
```
— [tuning.h, mirrored from the original Freeverb source](https://raw.githubusercontent.com/alexmacrae/SamplerBox/master/freeverb/tuning.h)

A genuine Web-Audio-native port of this exists
([mmckegg/freeverb](https://github.com/mmckegg/freeverb), itself adapted
from an older, since-removed Tone.js `Freeverb` effect). Its approach is
worth noting as a pragmatic shortcut: it implements the comb stage with
native `DelayNode`s (delay times converted to seconds, e.g. `1557/44100`)
plus feedback and a damping lowpass — matching sndlab's existing
approach almost exactly — but implements the "allpass" stage as native
`BiquadFilterNode`s with `type: 'allpass'` addressed by **frequency**
(225/556/441/341 Hz), not as literal delay-line Schroeder allpass
sections. This is a legitimate, much cheaper approximation: a frequency-domain
allpass biquad shapes phase around a corner frequency rather than
providing a genuine delayed-echo diffusion tap, but it's simple, uses only
stock Web Audio nodes, and is a straightforward addition to sndlab's
existing comb-filter bank.

**Tone.js's own `JCReverb`** (a, source) is an independent, real
implementation of the same idea (Schroeder/Chowning-style, allpass
cascaded before parallel comb filters, using the same "biquad allpass by
frequency" shortcut) with its own published constants:
```ts
const combFilterDelayTimes = [1687/25000, 1601/25000, 2053/25000, 2251/25000]; // seconds
const combFilterResonances = [0.773, 0.802, 0.753, 0.733];
const allpassFilterFreqs = [347, 113, 37]; // Hz
```
— [`Tone/effect/JCReverb.ts`](https://github.com/Tonejs/Tone.js/blob/dev/Tone/effect/JCReverb.ts)

**Concrete, minimal upgrade for sndlab's existing reverb**: add 2–3
`BiquadFilterNode`s with `type: 'allpass'` in series, at frequencies in
the few-hundred-Hz range (Tone.js's `[347, 113, 37]` or Freeverb-style
spacing scaled to Hz), between the filter output and the existing 4
delay lines. This is a few lines of code, uses only nodes already in use
elsewhere in the file, and directly targets the sourced cause of
metallic coloration above.

### Generating an impulse response in JavaScript — genuinely viable, no binary asset

This is real, shipped, and — notably — implemented **independently by
two respected projects using the same author's algorithm lineage**,
which is unusually strong corroboration for a Web Audio technique.

**Tone.js's `Reverb.ts`** (a, source) generates its IR at runtime via an
`OfflineAudioContext`, crediting the same lineage explicitly:

> "Simple convolution created with decaying noise. Generates an Impulse
> Response Buffer with Tone.Offline then feeds the IR into ConvolverNode...
> Inspiration from [ReverbGen](https://github.com/adelespinasse/reverbGen).
> Copyright (c) 2014 Alan deLespinasse Apache 2.0 License."

```ts
static getDefaults(): ReverbOptions {
    return Object.assign(Effect.getDefaults(), { decay: 1.5, preDelay: 0.01 });
}
// two independent Tone.Noise sources merged to stereo (decorrelated L/R),
// shaped by a Gain node ramped with an exponential-approach curve:
gainNode.gain.setValueAtTime(0, 0);
gainNode.gain.setValueAtTime(1, this._preDelay);
gainNode.gain.exponentialApproachValueAtTime(0, this._preDelay, this.decay);
```
— [`Tone/effect/Reverb.ts`](https://github.com/Tonejs/Tone.js/blob/dev/Tone/effect/Reverb.ts)

`exponentialApproachValueAtTime` is a native Web Audio `AudioParam`
automation under the hood (`setTargetAtTime` plus a final linear ramp to
guarantee it actually reaches zero rather than asymptoting forever) —
directly reusable with plain Web Audio, no Tone.js required:
```ts
exponentialApproachValueAtTime(value, time, rampTime) {
    const timeConstant = Math.log(rampTime + 1) / Math.log(200);
    this.setTargetAtTime(value, time, timeConstant);
    this.cancelAndHoldAtTime(time + rampTime * 0.9);
    this.linearRampToValueAtTime(value, time + rampTime);
}
```
— [`Tone/core/context/Param.ts`](https://github.com/Tonejs/Tone.js/blob/dev/Tone/core/context/Param.ts)

**Strudel's superdough independently ships the actual named `reverbGen`
algorithm** that Tone.js credits as inspiration — same Apache-2.0 license,
same author (Alan deLespinasse, 2014) — with the literal per-sample
`Math.pow` decay curve named in the original brief (a, fetched in full):

```js
// params.decayTime is the -60dB fade time; runs 50% longer to reach -90dB
var totalTime = params.decayTime * 1.5;
var decaySampleFrames = Math.round(params.decayTime * sampleRate);
var numSampleFrames = Math.round(totalTime * sampleRate);
// 60dB is a factor of 1,000,000 in power, or 1000 in amplitude
var decayBase = Math.pow(1 / 1000, 1 / decaySampleFrames);
for (var i = 0; i < numChannels; i++) {
  var chan = reverbIR.getChannelData(i);
  for (var j = 0; j < numSampleFrames; j++) {
    chan[j] = (Math.random() * 2 - 1) * Math.pow(decayBase, j);
  }
}
```
— [`packages/superdough/reverbGen.mjs`](https://codeberg.org/uzu/strudel/src/branch/main/packages/superdough/reverbGen.mjs)

A third independent source for essentially the same technique: a 2012
W3C public-audio mailing list post by Matt Diamond (author of the
well-known `Recorder.js` library), explicitly framed as an alternative to
shipping a binary IR file (a, quoted in full):

> "Just wondering if anyone else has been working on code to generate
> impulses on-the-fly for use in convolution nodes... a lot of examples
> involve downloading pre-recorded impulses, but I figure if you're in
> need of some quick-and-dirty reverb, you probably don't need to rope in
> additional audio file dependencies."
> — [W3C public-audio list, July 2012](https://lists.w3.org/Archives/Public/public-audio/2012JulSep/0795.html)

```js
function ReverbNodeFactory(context, seconds, options){
    var length = context.sampleRate * seconds;
    var impulse = context.createBuffer(2, length, context.sampleRate);
    var impulseL = impulse.getChannelData(0);
    var impulseR = impulse.getChannelData(1);
    var decay = options.decay || 2;
    for (var i = 0; i < length; i++){
      impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    var convolver = context.createConvolver();
    convolver.buffer = impulse;
    return convolver;
}
```

**Caveat worth stating plainly:** this technique is real and has a
credible library-source lineage, but it is conspicuously **absent from
MDN's own `ConvolverNode` page** (verified by fetch — MDN only documents
loading a `.wav` file) and Boris Smus's O'Reilly book explicitly declines
to cover it ("It's also possible to generate these impulse responses
synthetically, but this topic is outside of the scope of this book" —
quoted from the fetched text). So: well-known and well-precedented among
library authors, not "officially documented" in the sense of MDN/spec
coverage.

**This is the best fit for sndlab's constraints** — zero binary assets,
pure Web Audio primitives (`OfflineAudioContext` or just building the
buffer directly on the main context, `ConvolverNode`), and two independent
real-world implementations to check work against. Concrete parameters,
synthesizing the three sources above:
- IR length: 1.5–3 s for a pad-appropriate space (Tone.js default: 1.5 s
  decay + 0.01 s pre-delay)
- Decay exponent: 2 (W3C post's own default) is a reasonable start;
  higher values (3–4) front-load energy more and taper faster
- Stereo decorrelation: generate left and right channels from independent
  random sequences (both sourced implementations do this) — this is what
  makes a synthetic IR sound spacious rather than mono-summed
- Optional: a gentle lowpass sweep across the IR's duration (superdough's
  `reverbGen` supports this via `applyGradualLowpass`) emulates a real
  room's high-frequency absorption over time, avoiding a metallic/bright
  tail

This would replace the whole `buildChain()` reverb section with: build
one `AudioBuffer` once (or regenerate on preset change, matching sndlab's
existing `setPreset` pattern), route through a single `ConvolverNode`,
and remove the 4 hand-rolled delay lines and their feedback loop entirely
— fewer nodes, less code, and directly traceable to library precedent
rather than a from-scratch design.

---

## 5. Concrete preset recipes

Ranked by how directly they trace to a real, checkable source.

### Pad — richest sourced recipe found (b, named source, Attack Magazine)

[Attack Magazine, "Synth Secrets: Detuned Pad"](https://www.attackmagazine.com/technique/synth-secrets/detuned-pad/)
(Sylenth1-specific, so values are on that plugin's own 0–127-ish scales
where noted — treat as proportions/relationships to adapt, not literal
sndlab units):

- Layer A: 5 voices, one octave down, detune ~4 cents
- Layer B: 7 voices, sawtooth, detune ~3 cents, phase-inverted relative to A
- Filter: lowpass, cutoff ≈ 800 Hz, resonance moderate (≈3 of Sylenth's 0–10 scale)
- A slow LFO on Layer B's volume acting as a sidechain-style pump
- Chorus (16 ms delay, 0.22 Hz rate) and a long reverb (size 6/10, 30% wet)

**sndlab-adapted pad recipe** (adapting the above to the existing 3-voice
sawtooth structure and this project's simpler chain, prioritizing what's
directly implementable without new node types beyond the reverb/limiter
changes above):
- Voices: 3× sawtooth, detune `[-9, 0, 9]` cents (near Tone.js's
  `FatOscillator` default ratio, slightly wider than the current ±7 for
  more perceptible movement), gain `0.3` each
- Attack: 0.4 s, release: 1.2 s (slightly longer than current 0.35/0.9 —
  Attack Magazine's own pad leans slower)
- Filter: lowpass, cutoff 700–900 Hz (keep close to current 900), Q 2–3
- Reverb: 30–45% wet once the allpass-diffusion fix from §4 is in (the
  current 45% is likely a touch high once diffusion stops it sounding
  metallic and starts sounding good — re-audition after that change)

### Pluck — MonoSynth example patch (a, verified source)

[`examples/monoSynth.html`](https://github.com/Tonejs/Tone.js/blob/dev/examples/monoSynth.html):
```js
oscillator: { type: "square8" },  // 8-partial additive square
envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 0.8 },
filterEnvelope: {
  attack: 0.001, decay: 0.7, sustain: 0.1, release: 0.8,
  baseFrequency: 300, octaves: 4,
}
```
**sndlab-adapted pluck recipe** (keeping the existing saw+square-octave
voice structure, adding the filter envelope from §3):
- Voices: unchanged — sawtooth (gain 0.5) + square an octave up (gain
  0.18) is a reasonable, already-working timbral choice
- Amp envelope: attack 0.004 (keep), decay/release ≈ 0.25–0.35 s, low
  sustain if adding one (0.05–0.1)
- **New:** filter envelope — attack 0.002–0.005 s, decay 0.15–0.25 s,
  sustain 0.1, release 0.15–0.2 s, sweeping from the current 2600 Hz
  resting cutoff... actually invert this: rest the filter *lower*
  (≈ 600–900 Hz) and let the envelope sweep **up** to 2600–4000 Hz on
  attack, which is the shape every sourced example above actually uses
  (bright transient, settling lower) — this is the one substantive change
  needed here, more than the exact numbers
- Q: keep 7, or 5–6 if the added filter movement plus resonance feels
  too aggressive once combined

### Bass — sourced from Myloops' trance bassline tutorial (b, named source) + Electric Druid sub-oscillator (a)

[myloops.net, "How to Make an Uplifting Trance Bassline"](https://www.myloops.net/how-to-make-an-uplifting-trance-bassline):
- Sub layer: sine, steep lowpass above ~120 Hz
- Mid layer: sawtooth, highpassed at 90–100 Hz (i.e. the sub carries the
  fundamental, the saw carries the growl/harmonics above it)
- Amp envelope: 0 ms attack, 30–60 ms decay, zero sustain, release ≈
  decay ("air between notes" — a plucked/rolling bass character, not a
  sustained drone)
- Monophonic with a short 5–15 ms glide between notes

**sndlab-adapted bass recipe**, combining this with Electric Druid's
sub-oscillator convention (§2 — sub one octave down, square or sine, ~50%
of main oscillator's gain):
- Voices: sawtooth (gain 0.5) + sine one octave down (gain 0.5, i.e. sub-osc)
- Filter: lowpass, cutoff 250–500 Hz for the "rolling" Goa/trance
  character, resonance 5–8 (pushed higher than the pad/pluck, since a
  present resonant peak is part of this genre's bass identity)
- Amp envelope: attack near-0 (0.002 s), decay 0.15–0.3 s, sustain
  0–0.15, release 0.1–0.2 s — short and percussive, not sustained
- If AudioEngine gains a filter envelope (§3), a *small* one here (1–1.5
  octaves, fast decay) reinforces the pluck of each note without turning
  it into the lead pluck's brighter character

Goa-specific coloring (c, general consensus across the sourced tutorials
in this research, not one single citation): often a single, undetuned
oscillator rather than a unison stack for bass — width comes from the
filter and resonance, not from stacked pitches, which keeps low end
mono/tight rather than smeared.

---

## 6. Notes on what was and wasn't findable

- **Tone.js `PluckSynth`** exists and is worth knowing about even though
  it's architecturally unrelated to sndlab's subtractive approach: it's a
  Karplus-Strong physical model (pink noise burst through a resonant
  `LowpassCombFilter`), not a filter-envelope subtractive patch. Defaults:
  `dampening: 4000` Hz, `resonance: 0.7`. Not recommended as a direction
  for sndlab's pluck (a bigger architectural change than the filter-
  envelope fix above, for a different flavor of "pluck" — a string
  simulation rather than a synth-pluck), but worth knowing it's a
  different, valid family if a more string-like pluck is ever wanted.
- **Strudel's plain-waveform default envelope** is worth noting as a
  cross-check on sndlab's pluck timing: `attack: 0.001, decay: 0.05,
  sustain: 0.6, release: 0.01` (a, source) — i.e. even Strudel's generic,
  non-"pluck"-branded default is quite percussive. This corroborates that
  fast attack/short decay is the right default character for a lot of
  electronic-music synth voices generally, not just dedicated pluck
  patches.
- Several named production-tutorial sites returned HTTP 403 or
  JS-rendered chrome with no extractable body text (Point Blank, ADSR
  Sounds, allanmorrowstudios.com, avid.com's SynthCell trance-pluck page)
  — flagged here rather than silently omitted, since the brief asked for
  explicit treatment of what couldn't be verified.
- Sound on Sound's "Synth Secrets" series (Gordon Reid) is exactly the
  widely-respected reference the brief asked to check, but the specific
  article fetched ("More About Envelopes") turned out to be historical/
  conceptual — discussing early hardware envelope generators and brass-
  patch contour shapes — with no concrete ADSR numbers for a pluck. Cited
  here for the general principle (a separate, purpose-built filter
  envelope is foundational subtractive-synth vocabulary), not for any
  specific number.
