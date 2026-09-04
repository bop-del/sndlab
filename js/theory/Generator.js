// What a generated line is, and the rules it must obey. No audio, no DOM, no
// state — the same shape as Scales.js, and tested the same way: import it,
// call it, assert on what came back.
//
// Nothing here makes a sound. The point of keeping it pure is that every
// musical rule the muse depends on is asserted as data, where a failure names
// the rule it broke instead of sounding vaguely wrong.
//
// Grounded in docs/research/generative-basslines-and-melodies.md and decided in
// ADR 0007. The constants below are starting points to tune by ear, not settled
// values: the Goa evidence is convergent folklore with no transcriptions behind
// it, so expect the first lines to be wrong in ways no check can see.

import { SCALES } from './Scales.js';

/** One bar at 16th-note resolution. The TB-303's length, and both genres'. */
export const STEPS = 16;

/**
 * The kick lands on the quarter-note downbeats, and the bass is silent there.
 *
 * Not a stylistic option — it is the one rule every source for both genres
 * states, and the gap it leaves is what the bassline is actually made of. The
 * research indexes these steps 1, 5, 9, 13; this is the same four, zero-based.
 */
export const KICK_STEPS = [0, 4, 8, 12];

export const isKickStep = (step) => KICK_STEPS.includes(step % STEPS);

/**
 * Which steps the bass may fill, by genre.
 *
 * The grid is a template, never randomised. Randomising rhythm alongside pitch
 * is the most commonly reported cause of a generator sounding wrong even when
 * every pitch is correctly in the scale — the fixed grid is the reference that
 * makes pitch variation read as intentional rather than chaotic.
 *
 * Goa fills the three offbeat 16ths in each beat's gap: `K b b b` × 4.
 */
export const BASS_GRIDS = {
    goa: [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15],
};

/**
 * Which scale degrees the bass may sound, and how often.
 *
 * ~70% root, the rest doing harmonic work via the fifth, ♭3 or ♭7 — the one
 * ratio in the research that appears in more than one write-up. Degrees are
 * indices into the scale's steps, so the same table works for any scale: index
 * 4 is the fifth of a seven-note scale, index 2 its third, index 6 its seventh.
 */
export const ROOT_SHARE = 0.7;

// Named by their interval in a seven-note minor scale: the fifth, the third and
// the seventh degrees — ♭3 and ♭7 in every scale sndlab currently ships, which
// is what the research asks for. In a scale with a major third this is the
// third, not the ♭3; the degree index is the durable thing, the label is not.
export const COLOUR_DEGREES = [4, 2, 6];

/**
 * How often an optional step actually sounds, and how often it is decorated.
 *
 * Density below 1 is what keeps a rolling line from being a machine gun; the
 * accent and slide rates give the articulation the style depends on, since
 * "everything hitting at the same volume becomes flat" is a named failure.
 */
const DENSITY = 0.85;
const ACCENT_RATE = 0.3;
const SLIDE_RATE = 0.15;

const rest = () => ({ gate: 'rest', degree: 0, octave: 0, accent: false, slide: false });

/**
 * A Goa bassline for the given scale and root, as sixteen steps.
 *
 * `random` is injected so a check can pin the sequence and assert exactly —
 * the same call order always yields the same pattern. It defaults to
 * Math.random, which is what the app passes.
 *
 * `scale` decides how many degrees there are to choose from; `root` is taken
 * but not read. Neither resolves to a pitch here: `degree` is a scale degree
 * index, not a MIDI number, and the pitch is worked out against the scale at
 * schedule time. That is what lets a scale change re-pitch an existing line
 * instead of invalidating it — the arithmetic-on-a-scale principle Scales.js
 * already follows. `root` is in the signature because the caller thinks in
 * terms of a key, and because the lead generator will need it.
 */
export function generateBass({ scale = SCALES[0], root = 60, genre = 'goa', random = Math.random } = {}) {
    const grid = BASS_GRIDS[genre] ?? BASS_GRIDS.goa;
    const steps = Array.from({ length: STEPS }, rest);

    for (const step of grid) {
        // The kick slot is inviolable. The grids never include it, but a bad
        // genre template must not be able to break the one rule that matters.
        if (isKickStep(step)) continue;
        if (random() >= DENSITY) continue;

        // A scale shorter than seven notes has no sixth degree to reach for, so
        // the colour tones are filtered against the scale rather than assumed.
        const colours = COLOUR_DEGREES.filter((degree) => degree < scale.steps.length);

        steps[step] = {
            gate: 'note',
            degree: random() < ROOT_SHARE || colours.length === 0
                ? 0
                : colours[Math.floor(random() * colours.length)],
            // One octave of range, and it stays there. The hypnotic effect
            // depends on pitch being static most of the time; an octave drop is
            // a once-every-few-bars event, not a per-step decision.
            octave: 0,
            accent: random() < ACCENT_RATE,
            slide: random() < SLIDE_RATE,
        };
    }

    return clearDanglingSlides({ lane: 'bass', steps });
}

/**
 * Strip slides that cannot be heard.
 *
 * A slide glides into the *next* step, so one before a rest is an inaudible
 * no-op — and emitting them is a known bug source in 303-emulation generators.
 * Done as a pass rather than inline because whether a slide is audible depends
 * on a step that has not been generated yet when the slide is chosen.
 */
export function clearDanglingSlides(pattern) {
    const steps = pattern.steps.map((step, i) => {
        const next = pattern.steps[(i + 1) % STEPS];
        return step.slide && next.gate !== 'note' ? { ...step, slide: false } : step;
    });
    return { ...pattern, steps };
}
