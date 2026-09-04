// Building one voice: oscillators, envelopes, and how a note ends.
//
// Split from AudioEngine at the seam issue #33 named — voice construction on
// this side, the shared graph on the other. The engine owns the chain every
// voice runs through and the context it lives in; this owns what happens
// between a note starting and finishing.
//
// The engine is passed in rather than imported, so this module holds no state
// and cannot reach back into the singleton — a voice knows the engine it was
// asked for and nothing else.

import { noteToFrequency } from './pitch.js';

// The floor an exponential ramp cannot cross: it never reaches zero, so silence
// has to be approached rather than arrived at.
const SILENCE = 0.0001;

// What an accent is worth. Louder and brighter together — the 303 model, where
// doing only the volume half is the usual mistake. Both are ear territory: no
// source gives numbers, so these are starting points.
const ACCENT_GAIN = 1.4;
const ACCENT_OCTAVES = 1.35;

// How fast a slide travels. setTargetAtTime approaches its target
// exponentially, so this is a time constant, not a duration — the glide is
// effectively done after about three of them.
const SLIDE_TIME = 0.02;

/**
 * What the amplitude envelope is worth `elapsed` seconds after the note began.
 *
 * Computed rather than read off the node: a scheduled note is released at a
 * time in the future, and `gain.value` reports the level *now*. Reading it
 * pinned a value the ramp had not reached and the note jumped back to full
 * peak on top of its own decay — 32 clipped samples per note, shipped by #31
 * and caught by #32's clipping criterion.
 */
export function envelopeAt(elapsed, { attack, decay, sustain, peak }) {
    if (elapsed <= 0) return 0;
    // Linear, matching linearRampToValueAtTime.
    if (elapsed < attack) return peak * (elapsed / attack);
    if (decay <= 0 || sustain >= 1) return peak;
    const into = elapsed - attack;
    if (into >= decay) return peak * sustain;
    // Exponential, matching exponentialRampToValueAtTime: the ratio travelled
    // is what is linear in time, not the level.
    //
    // The floor is the ramp's *target as a ratio of peak*, not the sustain
    // level itself. The ramp below cannot reach zero, so it aims at
    // max(peak * sustain, SILENCE) — and dividing that by peak is the only way
    // this arrives at the same curve. Clamping the ratio to SILENCE instead
    // made this under-read by six times at the end of a sustain-0 decay: the
    // same class of mismatch the docblock above exists to prevent, in the safe
    // direction rather than the clipping one.
    const floor = Math.max(sustain, SILENCE / peak);
    return peak * floor ** (into / decay);
}

/**
 * Start a voice and return its handle.
 *
 * `accent` raises the amplitude peak and the filter envelope's depth together.
 * `preset` lets the caller bring its own sound — the transport does, so the
 * muse is judged on its notes rather than through whichever patch the player
 * has selected.
 */
export function createVoice(engine, midiNumber, now, { accent = false, preset = null } = {}) {
    const ctx = engine.ensureContext();
    const destination = engine.input();
    // The caller may bring its own sound. The transport does, so the muse
    // is judged on its notes rather than through whichever patch the player
    // happens to have selected; a key press brings nothing and gets the
    // engine's current preset, exactly as before.
    const voicePreset = preset ?? engine.preset;
    const { attack, release, voices: layers } = voicePreset;
    // Sustain defaults to 1 and decay to 0, which is exactly the old
    // attack-then-hold envelope: every preset written before this existed
    // keeps the sound it had. Only a preset that asks for a decay gets one.
    const decay = voicePreset.decay ?? 0;
    const sustain = voicePreset.sustain ?? 1;

    // Accent raises the amplitude peak *and* the filter envelope's depth —
    // brighter, not merely louder. That is the 303 model, and doing only
    // the volume half is the common way to get it wrong.
    const peak = Math.min(voicePreset.peak * (accent ? ACCENT_GAIN : 1), 1);

    const frequency = noteToFrequency(midiNumber);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    // The decay stage, and the reason a rolling bass rolls: at sustain 0
    // the note dies inside its own step instead of running into the next
    // one, which is a legato smear. Exponential because loudness is heard
    // that way, and floored at SILENCE because an exponential ramp cannot
    // reach zero.
    if (decay > 0 && sustain < 1) {
        gain.gain.exponentialRampToValueAtTime(
            Math.max(peak * sustain, SILENCE),
            now + attack + decay,
        );
    }

    // Each voice gets its own filter so the cutoff moves over the life of
    // *that note*. A note that starts bright and darkens is most of what
    // separates a synth from a tone generator, and a static cutoff was the
    // single biggest thing missing from the first version.
    const env = voicePreset.filterEnvelope;
    const voiceFilter = ctx.createBiquadFilter();
    voiceFilter.type = 'lowpass';
    voiceFilter.Q.value = voicePreset.resonance;

    const base = voicePreset.cutoff;
    // The other half of accent: more envelope depth, so the note opens
    // brighter rather than just arriving louder.
    const octaves = env.octaves * (accent ? ACCENT_OCTAVES : 1);
    const open = Math.min(base * 2 ** octaves, 18000);
    const sustained = Math.min(base * 2 ** (octaves * env.sustain), 18000);
    voiceFilter.frequency.setValueAtTime(base, now);
    voiceFilter.frequency.linearRampToValueAtTime(open, now + env.attack);
    // Exponential: brightness is heard logarithmically, so a linear fall
    // sounds like it stops moving halfway down.
    voiceFilter.frequency.exponentialRampToValueAtTime(
        Math.max(sustained, 40),
        now + env.attack + env.decay,
    );

    gain.connect(voiceFilter).connect(destination);

    const oscillators = layers.map((layer) => {
        const osc = ctx.createOscillator();
        osc.type = layer.type;
        osc.frequency.value = frequency;
        osc.detune.value = layer.detune;

        const level = ctx.createGain();
        level.gain.value = layer.gain;
        osc.connect(level).connect(gain);
        osc.start(now);
        return osc;
    });

    let stopped = false;

    // Both paths end a voice the same way; only the time differs. A held
    // key releases at whatever "now" is when the finger lifts, a sequenced
    // step at a time the clock decided in advance.
    const releaseAt = (requested, { holdThroughAttack = true } = {}) => {
        if (stopped) return;
        stopped = true;
        engine.voices.delete(voice);

        // A held key is never released before its attack has finished: a
        // tap let go faster than resume() settles would otherwise end the
        // note before it began, which is silence again.
        //
        // A sequenced step is the opposite case. Its end is decided by the
        // clock, and stretching it to fit a slow preset's attack would make
        // every note outlast its own step — on the default pad (attack
        // 0.25s) a 16th at 138bpm lasts 0.109s, so notes would pile up
        // three deep and the line would smear into a drone. It is floored
        // at the start time instead: the envelope simply ends early, which
        // is quiet rather than wrong.
        const floor = holdThroughAttack ? now + attack : now;
        const end = Math.max(requested, floor);

        // Cancel the attack first: releasing mid-attack otherwise ramps
        // from a value the scheduler has not reached yet, which clicks.
        gain.gain.cancelScheduledValues(end);

        // What the envelope is worth at `end`, computed rather than read.
        //
        // `gain.gain.value` is the level *now*, and for a scheduled note
        // `end` is in the future — so reading it pins a value the ramp has
        // not reached, and the envelope jumps there instead of continuing.
        // For a bass 16th that jump was a step up: the note re-attacked at
        // full peak on top of its own decaying oscillator and rendered at
        // 1.23, thirty-two clipped samples per note. The limiter cannot
        // catch it for the reason issue #25 records — it tracks a smoothed
        // envelope, not sample peaks.
        //
        // A held key is unaffected either way, because `end` is genuinely
        // now for a finger leaving a key. Only the clock's path is in the
        // future, and only it was clipping.
        const elapsed = end - now;
        const level = envelopeAt(elapsed, { attack, decay, sustain, peak });
        gain.gain.setValueAtTime(Math.max(level, SILENCE), end);
        gain.gain.exponentialRampToValueAtTime(SILENCE, end + release);
        for (const osc of oscillators) osc.stop(end + release);
    };

    const voice = {
        midiNumber,
        /** Release at an explicit time on the audio clock — the clock's path. */
        stopAt: (end, options) => releaseAt(end, options),
        stop: () => releaseAt(engine.startTime()),

        /**
         * Bend this voice to a new pitch instead of starting another one.
         *
         * What a slide is: the 303 glides between tied notes on one
         * oscillator, so the line sings rather than re-articulating. A
         * second voice crossfaded against the first is a different sound —
         * two notes overlapping, not one note moving.
         *
         * setTargetAtTime rather than a ramp, because the approach is
         * exponential and never quite arrives, which is what portamento
         * actually sounds like.
         */
        slideTo: (target, when) => {
            if (stopped) return;
            const to = noteToFrequency(target);
            for (const osc of oscillators) {
                // Frequency only. Each layer's interval lives on its own
                // `detune` param, which is untouched — so the sub stays an
                // octave down through the glide instead of converging on
                // the fundamental.
                osc.frequency.setTargetAtTime(to, when, SLIDE_TIME);
            }
            voice.midiNumber = target;
        },
    };

    engine.voices.add(voice);
    return voice;
}
