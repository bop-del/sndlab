// Named sounds. A preset is plain data — the engine reads it, nothing more.
//
// The numbers are grounded in docs/research/sound-design.md, which traced them
// to Tone.js and Strudel source. The first version of this file was invented,
// and it sounded like it.
//
// Three things separate this from a beep, in order of how much they matter:
//
//   - **A filter envelope.** The cutoff moves over the life of a note. Real
//     notes start bright and darken; a static cutoff is why a synth sounds
//     cheap. `octaves: 3` on the pluck is Tone's MonoSynth default.
//   - **Detune around ±10 cents.** Tone's FatOscillator spreads 20 cents over
//     three voices, and Strudel's supersaw lands in the same band. Narrower
//     reads as chorus; wider as out of tune.
//   - **Headroom.** Low enough per note that a six-voice chord does not clip,
//     with the master limiter as a safety net rather than the plan.

export const PRESETS = [
    {
        id: 'pluck',
        name: 'Pluck',
        // First, so it is the default. A pad cannot answer a click: its attack
        // is longer than the click lasts, which made every quick note sound
        // like nothing was happening.
        voices: [
            { type: 'sawtooth', detune: 0, gain: 0.45 },
            // Octave-up square for bite, without muddying the fundamental.
            { type: 'square', detune: 1200, gain: 0.15 },
        ],
        attack: 0.003,
        release: 0.3,
        peak: 0.24,
        // Rests low and is swept open by the envelope — that movement is the
        // sound. A static 2600 Hz was the lifeless version.
        cutoff: 500,
        resonance: 4,
        filterEnvelope: { attack: 0.008, decay: 0.2, sustain: 0.15, octaves: 3 },
        reverb: 0.18,
    },
    {
        id: 'pad',
        name: 'Warm pad',
        voices: [
            { type: 'sawtooth', detune: -10, gain: 0.28 },
            { type: 'sawtooth', detune: 0, gain: 0.28 },
            { type: 'sawtooth', detune: 10, gain: 0.28 },
        ],
        // Slow, but not so slow a tap is inaudible: at 0.35 s a short click
        // never reached a third of the way up the ramp.
        attack: 0.25,
        release: 1.4,
        peak: 0.18,
        cutoff: 700,
        resonance: 1.5,
        // Breathes rather than sweeps.
        filterEnvelope: { attack: 1.2, decay: 0.8, sustain: 0.6, octaves: 1.5 },
        reverb: 0.5,
    },
    {
        id: 'bass',
        name: 'Bass',
        voices: [
            { type: 'sawtooth', detune: 0, gain: 0.55 },
            // Sub an octave down. A sine adds weight without harmonics that
            // would compete with the saw above it.
            { type: 'sine', detune: -1200, gain: 0.35 },
        ],
        attack: 0.004,
        release: 0.15,
        peak: 0.3,
        cutoff: 220,
        resonance: 6, // acid-leaning, which is Goa territory
        filterEnvelope: { attack: 0.005, decay: 0.12, sustain: 0.1, octaves: 2.5 },
        reverb: 0.05, // reverb on low frequencies is mud
    },
];

export const presetById = (id) => PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
