// Melodies. The lead lane, for both genres, from one pitch stage.
//
// Split from Generator.js when it approached the 500 lines rule 5 allows. The
// seam is the lane: bass and its grids there, lead and its walk here, with the
// step model and the rules both share — STEPS, the kick slot, the dangling
// slide pass — staying in Generator.js as the thing they are both built from.
//
// Grounded in docs/research/generative-basslines-and-melodies.md §3.

import { SCALES } from './Scales.js';
import { STATIC_TONIC, chordAt } from './Progressions.js';
import { ACCENT_RATE, SLIDE_RATE, STEPS, clearDanglingSlides, rest } from './Generator.js';

/**
 * How a lead moves, by genre. The whole genre difference, as numbers.
 *
 * These are the parameters ADR 0007 bet the design on: *"Goa is melodic
 * techno's algorithm with the progression set to one chord and the walk
 * narrowed. The divergences sit in parameters — walk width, chord source,
 * motif length, mutation schedule — not in control flow."*
 *
 * `motif` is the length of the repeating cell. Goa's is coprime with the bar
 * (5 or 7 against 16), so it precesses: the cell lands on different steps each
 * bar and only realigns after several. That is the hypnotic device, and it is
 * the one rule in the Goa research with a specific mechanism behind it rather
 * than a vibe. Melodic techno's is bar-aligned, because its phrases are the
 * two-bar units the progression moves in.
 */
export const LEAD_VOICES = {
    goa: {
        // A narrow walk: neighbour motion dominates, leaps are deliberate
        // outliers. "Pick a note around which you bounce up and down
        // semi-randomly on the scale."
        // Measured, not guessed: at 0.08 the observed rate was 18%, because a
        // leap is drawn per *step* while the criterion counts intervals
        // between sounding notes — and the density gate means many steps do
        // not sound, so consecutive sounding notes are often two draws apart.
        leapRate: 0.03,
        // The ♭2 is the primary colour tone, not a passing note — the
        // second-most-visited pitch after the root. That one degree is what
        // makes Phrygian audible, and weighting it is the difference between
        // sounding modal and sounding like a scale exercise.
        colourDegree: 1,
        // The interval that *is* the colour, not merely its index. A ♭2 is one
        // semitone above the root in any scale that has one; the degree it
        // occupies differs by scale, and in a scale without it there is no
        // colour tone to weight.
        colourSemitones: 1,
        // 0.18, not 0.3: at 0.3 the ♭2 became the *most* visited pitch, and
        // the research is specific that it is the second — "often the
        // second-most-visited note after the root". A colour tone that
        // outranks the root is not colour, it is the centre.
        colourWeight: 0.18,
        // The walk is pulled home. Without this the root is just one degree of
        // seven and a "walk around the root" wanders away from it — the centre
        // has to be a centre.
        homeWeight: 0.22,
        motif: 7,
        density: 0.75,
    },
    'melodic-techno': {
        leapRate: 0.2,
        // No equivalent colour tone: the research finds no Phrygian in the
        // genre, so nothing is weighted above the scale itself.
        colourDegree: null,
        colourSemitones: null,
        colourWeight: 0,
        // No pull home either — melodic techno's centre is the chord, which
        // moves, and the boundary rule already anchors the line to it. Goa has
        // no moving chord to anchor to, so its centre has to be a weight.
        //
        // Stated as 0 rather than omitted: a parameter one genre carries and
        // the other does not is a branch wearing a table's clothes, and a
        // check asserts the two voices declare the same keys.
        homeWeight: 0,
        motif: 8,
        density: 0.5,
    },
};

/**
 * The genre's colour degree, if this scale actually has it.
 *
 * Goa's is the ♭2 — one semitone above the root, which is what makes Phrygian
 * sound like Phrygian. Natural minor's second degree is a whole tone up and is
 * not that note, so weighting index 1 there would emphasise something the
 * research never mentions. The spec is explicit: *"the ♭2 is visited more than
 * any pitch except the root, **in a scale that has one**."*
 */
export function colourIn(voice, scale) {
    if (voice.colourDegree === null) return null;
    const wanted = voice.colourSemitones;
    const found = scale.steps.indexOf(wanted);
    return found === -1 ? null : found;
}

/**
 * How many bars a phrase spans.
 *
 * Two, across both genres: the recurring unit in the melodic techno research,
 * and for Goa it makes no difference — its chord never changes, so anchoring
 * the first and last note of a two-bar phrase pins them to the same tonic
 * triad either way.
 */
export const PHRASE_BARS = 2;

/** Every scale degree in the triad on a given degree — the chord's own tones. */
export function chordTones(degree, scale) {
    return [0, 2, 4].map((offset) => (degree + offset) % scale.steps.length);
}

/**
 * A melody for one bar.
 *
 * **One rule, two genres.** The crux, stated near-verbatim across the melodic
 * techno write-ups: *"Start on a chord tone, land on a chord tone. The first
 * and last note of each phrase must belong to the underlying chord; everything
 * in between is free within the scale."*
 *
 * Goa is that rule with a chord that never changes. Its boundaries anchor to
 * the tonic triad every bar — because `chordAt` returns the same degree every
 * bar — so the constraint is satisfied trivially and what is left is the walk.
 * No branch anywhere decides this; the progression decides it.
 *
 * The walk is where the genres differ, and only by numbers: how often it leaps
 * rather than steps, whether a colour tone is weighted, and how long the cell
 * is before it repeats.
 */
export function generateLead({
    scale = SCALES[0],
    root = 60,
    genre = 'goa',
    progression = STATIC_TONIC,
    bar = 0,
    // The cell this bar reads from. Passed in so one idea can precess across a
    // whole loop; omitted, a fresh one is drawn, which is right for a single
    // bar and wrong for a sequence of them.
    cell: pattern = null,
    random = Math.random,
} = {}) {
    const voice = LEAD_VOICES[genre] ?? LEAD_VOICES.goa;
    const tones = chordTones(chordAt(progression, bar), scale);
    const steps = Array.from({ length: STEPS }, rest);

    // Where the cell starts in this bar. A motif coprime with 16 lands
    // somewhere new every bar and returns to the top only after `motif` bars —
    // seven, for Goa. This is the precession, and it is why a Goa line heard
    // for one bar sounds like a loop and heard for eight sounds like it is
    // developing.
    const offset = (bar * STEPS) % voice.motif;

    // The cell is given, not drawn here. Drawing it per call meant every bar of
    // a loop got a *different* cell, and shifting new material each bar is
    // indistinguishable from randomness — which is what it sounded like. One
    // cell moving is the whole device; seven cells moving is noise.
    const cell = pattern ?? drawCell({ voice, scale, tones, random });

    for (let step = 0; step < STEPS; step++) {
        if (random() >= voice.density) continue;

        steps[step] = {
            gate: 'note',
            degree: cell[(offset + step) % voice.motif],
            octave: 0,
            accent: random() < ACCENT_RATE,
            slide: random() < SLIDE_RATE,
        };
    }

    // Start on a chord tone, land on a chord tone — at the boundaries of the
    // *phrase*, not of every bar. The spec and the research agree the unit is
    // two bars ("2 bars is the recurring unit — write a 2-bar phrase, repeat it
    // verbatim, alter only its ending"), and anchoring every bar constrained a
    // quarter of all notes rather than the handful at each end. The interior
    // being free is the point of the rule; forcing it bar by bar quietly
    // removes what the rule protects.
    //
    // Applied after the walk rather than during it, because which step *is* the
    // last sounding one is not known until the density gate has run.
    const place = bar % PHRASE_BARS;
    anchor(steps, tones, scale.steps.length, {
        start: place === 0,
        end: place === PHRASE_BARS - 1,
    });

    return clearDanglingSlides({ lane: 'lead', steps });
}

/**
 * A short run of pitches, walked once — the thing that repeats.
 *
 * *"A short 3–5 note cell repeated many times per phrase, with movement
 * introduced through velocity and accent rather than new pitches."* The cell is
 * the melody's identity; where each bar starts reading it is what precesses.
 *
 * Drawn once per loop rather than per bar. A motif coprime with 16 begins at a
 * different place each bar — 0, 2, 4, 6, 1, 3, 5 for a seven-note cell — so one
 * handful of notes lands in a different rhythm every bar and only comes round
 * after seven.
 */
export function drawCell({ voice, scale, tones, random = Math.random }) {
    const cell = [];
    let degree = tones[0];
    for (let i = 0; i < voice.motif; i++) {
        cell.push(degree);
        // The last note walks back toward the first rather than onward. A cell
        // repeats, so its wrap is an interval the ear hears every time round —
        // and a cell that ended far from where it started turned that seam into
        // a recurring leap, which pushed the measured rate to 13.7% even though
        // every other move was a step.
        degree = i === voice.motif - 2
            ? stepBetween(degree, cell[0], scale.steps.length)
            : nextDegree(degree, voice, scale, random);
    }
    return cell;
}

/** How far apart two degrees are, the short way round the scale. */
function degreesApart(a, b, size) {
    return Math.min((a - b + size) % size, (b - a + size) % size);
}

/**
 * One step from `from` toward `target`, the short way round the scale.
 *
 * The short way matters: degree 6 is one step below degree 0, not six above
 * it, and walking the long way round turns every approach into a leap.
 */
function stepBetween(from, target, size) {
    if (from === target) return from;
    const up = (target - from + size) % size;
    const down = (from - target + size) % size;
    return up <= down ? (from + 1) % size : (from - 1 + size) % size;
}

/**
 * The next pitch in the walk.
 *
 * Neighbour motion by default; a leap when the dice say so. The colour tone is
 * drawn ahead of the general scale, which is what makes it the second-most
 * visited pitch rather than one degree among seven.
 */
function nextDegree(from, voice, scale, random) {
    const size = scale.steps.length;

    // Pulls are expressed as *which way to step*, never as a destination.
    // Teleporting to the target is what a first version did, and it accounted
    // for nearly 60% of the observed leaps: a walk that jumps home from three
    // degrees away has leapt, whatever the intent.

    // The colour tone. Approached, not jumped to — which is also what the
    // sources describe: "jumping a lot between the first and second scale
    // degree" is a step between neighbours, not a leap.
    //
    // `colourDegree` is resolved against the scale rather than taken as an
    // index, so a scale without a ♭2 weights nothing: in natural minor degree
    // 1 is a major second, and weighting it would be emphasising a note the
    // research says nothing about.
    const colour = colourIn(voice, scale);
    if (colour !== null && random() < voice.colourWeight) {
        return stepBetween(from, colour, size);
    }

    // Home. A narrow walk around a centre tone needs the centre to attract, or
    // it is a random walk that happens to start on the root. Compared rather
    // than short-circuited, so both genres consume the same draws and a seeded
    // stream stays comparable between them.
    if (random() < voice.homeWeight) return stepBetween(from, 0, size);

    if (random() < voice.leapRate) {
        // A leap is a third or a fourth — small, and an event rather than a
        // norm. Larger intervals read as arpeggiation, which Goa leads are not.
        const leap = 2 + Math.floor(random() * 2);
        const up = random() < 0.5 ? leap : -leap;
        return ((from + up) % size + size) % size;
    }
    const stepUp = random() < 0.5 ? 1 : -1;
    return ((from + stepUp) % size + size) % size;
}

/**
 * Force the first and last sounding steps onto chord tones.
 *
 * The rule that unifies the genres. For melodic techno it re-voices the
 * contour onto each new chord; for Goa the chord is always the tonic triad, so
 * it pins the line to the root without anything knowing it is Goa.
 */
function anchor(steps, tones, size, { start, end }) {
    const sounding = steps
        .map((step, index) => (step.gate === 'note' ? index : -1))
        .filter((index) => index !== -1);
    if (sounding.length === 0) return;
    const boundaries = [];
    if (start) boundaries.push(sounding[0]);
    if (end) boundaries.push(sounding.at(-1));
    for (const index of boundaries) {
        // The nearest chord tone, so anchoring nudges the line rather than
        // jerking it — a boundary that jumped would undo the walk it is meant
        // to frame.
        const from = steps[index].degree;
        // Nearest *around the scale*, not by index: degree 6 is one step from
        // degree 0, and comparing indices calls that a distance of six. The
        // size comes from the scale, which an earlier version hardcoded to 7 —
        // correct for both scales shipped today and wrong for the next one.
        const nearest = tones.reduce((best, tone) =>
            (degreesApart(tone, from, size) < degreesApart(best, from, size) ? tone : best));
        steps[index] = { ...steps[index], degree: nearest };
    }
}
