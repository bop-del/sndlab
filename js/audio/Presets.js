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
        // 0.16, not the 0.3 this shipped with. At 0.3 the preset was staged
        // roughly twice as hot as the other two — 0.3 x 0.90 voice sum against
        // the pluck's 0.24 x 0.60 — and a chord with the drone under it
        // rendered past full scale, 73 samples of it, audibly (issue #25).
        //
        // The limiter could not save it. It holds firmly in steady state, but
        // it tracks a smoothed envelope, not sample peaks, and bass is a
        // waveform whose peaks swing far above its RMS. Staged this hot the
        // smoothed level already sat near the ceiling, so individual peaks
        // crossed it unseen — which is why the crackle ran through the whole
        // note rather than clicking once on the attack.
        //
        // Stopping the clipping is the low bar: 0.24 manages it at 0.998, which
        // is not clipping and one edit away from it. This value is set by the
        // rule at the top of this file instead — a six-voice chord renders
        // 0.929 here, against the pluck's 0.928 and the pad's 0.900. Bass now
        // has the same headroom as everything else rather than its own.
        peak: 0.16,
        cutoff: 220,
        resonance: 6, // acid-leaning, which is Goa territory
        filterEnvelope: { attack: 0.005, decay: 0.12, sustain: 0.1, octaves: 2.5 },
        reverb: 0.05, // reverb on low frequencies is mud
    },
];

/**
 * The kick. Not in PRESETS, because it is not a sound you can play.
 *
 * Every entry above is a pitched voice the keyboard can sound at any note. A
 * kick is neither: it is one fixed thump, and putting it in the preset picker
 * would offer the player an instrument that plays the same note whatever key
 * they press. It is preset *data* in the same spirit — plain numbers the engine
 * reads — but it is its own thing.
 *
 * The synthesis is the standard one, and it is two envelopes rather than a
 * waveform: a sine whose pitch falls fast from a click into a low fundamental,
 * under an amplitude decay of about the same length. The pitch drop is what
 * makes it read as a kick rather than a low beep — the ear hears the attack
 * transient as weight.
 *
 * `peak` is set by the rule at the top of this file, not in isolation. Issue
 * #25 is the cautionary tale: the master limiter tracks a smoothed envelope
 * rather than sample peaks, so a source staged hot clips *through* the limiter
 * rather than being caught by it. A kick has the highest peak-to-RMS of
 * anything here, so it is staged conservatively and gets its weight from the
 * pitch drop instead of from level.
 */
export const KICK = {
    // No id or name: nothing looks this up and the button carries its own
    // label. Fields that exist only to make it resemble a preset would argue
    // against the comment above, which is that it is not one.
    // From a click down to the fundamental. 55 Hz is low enough to feel and
    // high enough to survive a laptop speaker, which is where this is judged.
    startFrequency: 150,
    frequency: 55,
    // The drop has to finish well inside the amplitude decay, or the pitch is
    // still falling when the level has gone and the thump reads as a bloop.
    pitchDecay: 0.045,
    attack: 0.001,
    decay: 0.28,
    peak: 0.5,
};

export const presetById = (id) => PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
