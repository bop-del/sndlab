// Named sounds. A preset is plain data — the engine reads it, nothing more.
//
// Two of them, and deliberately not one. The risk in this design is that a
// preset still sounds cheap; with one sound a disappointing result is
// ambiguous, and with two it separates "this sound is badly designed" from
// "the whole idea does not work". So they are as different from each other as
// two presets can usefully be: one slow and sustained, one immediate and
// decaying.
//
// What makes these sound like electronic music rather than a beep:
//
//   - **Detuned stacked oscillators.** One oscillator is a test tone. Two or
//     three a few cents apart beat slowly against each other, and that movement
//     is most of what "warm" and "analogue" mean in practice.
//   - **A low-pass filter.** A raw sawtooth has every harmonic at full
//     strength, which is the buzzy sound this replaces. Rolling the top off is
//     the single most audible thing a synth does.
//   - **An envelope that is not instant.** A note that starts and stops
//     abruptly reads as a click; the shape of the attack is the difference
//     between a pluck and a pad.

export const PRESETS = [
    {
        id: 'pad',
        name: 'Warm pad',
        // Three saws, spread wide. The detune is what does the work — at ±7
        // cents they drift in and out of phase over about a second, which is
        // heard as movement rather than as tuning.
        voices: [
            { type: 'sawtooth', detune: -7, gain: 0.34 },
            { type: 'sawtooth', detune: 0, gain: 0.34 },
            { type: 'sawtooth', detune: 7, gain: 0.34 },
        ],
        attack: 0.35,
        release: 0.9,
        peak: 0.22,
        // Dark, so held chords sit behind a melody rather than fighting it.
        cutoff: 900,
        resonance: 3,
        // A pad without space sounds like a test tone. This is the one that
        // most needs the reverb.
        reverb: 0.45,
    },
    {
        id: 'pluck',
        name: 'Pluck',
        // Two voices a perfect fifth apart rather than a detuned unison: the
        // fifth reinforces the harmonic series instead of beating against it,
        // which reads as bright and defined where the pad reads as wide.
        voices: [
            { type: 'sawtooth', detune: 0, gain: 0.5 },
            { type: 'square', detune: 1200, gain: 0.18 },
        ],
        attack: 0.004,
        // Short, so notes stay separate and you can hear which pitches are
        // sounding — the sound to judge harmony through.
        release: 0.35,
        peak: 0.3,
        cutoff: 2600,
        // Enough resonance to give the filter a voice of its own when swept.
        resonance: 7,
        reverb: 0.22,
    },
];

export const presetById = (id) => PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
