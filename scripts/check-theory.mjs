// The second seam, and the only one.
//
// Everything else in this project is verified through a real browser, because
// what matters is what the page does. Scales are the exception the design
// allows: they are pure arithmetic, and "E Phrygian contains F" is a fact.
// Proving it from a screenshot of highlighted keys would be slow, indirect, and
// would fail for reasons that have nothing to do with the arithmetic.
//
// The rule this exception is scoped by: pure theory functions only. Nothing
// with audio, DOM or state gets a direct test.
//
//   node scripts/check-theory.mjs

import { readFileSync } from 'node:fs';
import { SCALES, chordsIn, degreeName, inScale, noteName, scaleById, triadOn } from '../js/theory/Scales.js';
import {
    BASS_GRIDS,
    COLOUR_DEGREES,
    ROOT_SHARE,
    STEPS,
    clearDanglingSlides,
    generateBass,
    isKickStep,
} from '../js/theory/Generator.js';
import {
    LEAD_VOICES,
    PHRASE_BARS,
    chordTones,
    generateLead,
} from '../js/theory/Lead.js';
import { LOOKAHEAD, createClock, secondsPerStep } from '../js/audio/Clock.js';
import {
    PROGRESSIONS,
    STATIC_TONIC,
    changesAfter,
    chordAt,
    loopBars,
    pickProgression,
} from '../js/theory/Progressions.js';

const E = 64; // E4
const C = 60; // middle C

let failures = 0;

function check(name, run) {
    try {
        run();
        console.log(`  ok    ${name}`);
    } catch (err) {
        failures++;
        console.log(`  FAIL  ${name}\n          ${err.message}`);
    }
}

const equal = (actual, expected, what) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
};

const minor = scaleById('natural-minor');
const phrygian = scaleById('phrygian');

check('every scale has seven degrees', () => {
    for (const scale of SCALES) {
        if (scale.steps.length !== 7) throw new Error(`${scale.name} has ${scale.steps.length} steps`);
        if (scale.steps[0] !== 0) throw new Error(`${scale.name} does not start on its root`);
    }
});

check('every scale carries a why-sentence', () => {
    // It is the tool's entire learning content — a scale without one teaches
    // nothing, so shipping it empty must fail rather than render blank.
    for (const scale of SCALES) {
        if (!scale.why || scale.why.length < 40) throw new Error(`${scale.name} has no usable why-sentence`);
    }
});

check('Phrygian is natural minor with a flattened second', () => {
    // The entire character of the scale is this one interval. If this drifts,
    // the tool teaches something false.
    const differences = phrygian.steps.filter((step, i) => step !== minor.steps[i]);
    equal(differences, [1], 'the only differing step');
});

check('E Phrygian contains F, and not F♯', () => {
    if (!inScale(65, E, phrygian)) throw new Error('F is not in E Phrygian');
    if (inScale(66, E, phrygian)) throw new Error('F♯ is in E Phrygian');
    // And the contrast that makes the picker worth having.
    if (inScale(65, E, minor)) throw new Error('F is in E natural minor');
    if (!inScale(66, E, minor)) throw new Error('F♯ is not in E natural minor');
});

check('scale membership holds in every octave', () => {
    // A two-octave keyboard highlights the same note twice; an off-by-one in
    // the modulo would light one and not the other.
    for (const octave of [-12, 0, 12, 24]) {
        if (!inScale(65 + octave, E, phrygian)) throw new Error(`F at octave ${octave} is not in scale`);
    }
});

check('degrees are named from the root', () => {
    equal(degreeName(E, E), '1', 'the root');
    equal(degreeName(65, E), '♭2', 'F above E');
    equal(degreeName(71, E), '5', 'B above E');
    equal(degreeName(65 + 12, E), '♭2', 'F an octave up');
});

check('E natural minor spells i ii° III iv v VI VII', () => {
    // The row of labels is itself the lesson: it shows the scale's shape.
    equal(chordsIn(E, minor).map((c) => c.label), ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'], 'labels');
});

check('E Phrygian spells i II III iv v° VI vii', () => {
    equal(chordsIn(E, phrygian).map((c) => c.label), ['i', 'II', 'III', 'iv', 'v°', 'VI', 'vii'], 'labels');
});

check('the Phrygian II is major, and contains the flat second', () => {
    // The design turns on this: the ♭2 sits in a *bright* major chord, so the
    // darkness is only audible against the root. If II ever comes out minor,
    // the drone's whole justification is gone.
    const [two] = chordsIn(E, phrygian).filter((c) => c.degreeIndex === 1);
    equal(two.quality, 'major', 'quality of II');
    equal(two.notes.map(noteName), ['F', 'A', 'C'], 'notes of II');
});

check('chords are built from scale notes only', () => {
    for (const scale of SCALES) {
        for (const chord of chordsIn(C, scale)) {
            for (const note of chord.notes) {
                if (!inScale(note, C, scale)) {
                    throw new Error(`${scale.name}: ${noteName(note)} is not in the scale`);
                }
            }
        }
    }
});

check('chords ascend, so a triad is never inverted', () => {
    // Wrapping into the next octave is what keeps the shape a stack of thirds;
    // without it the top degrees fold back down and sound like a different chord.
    for (const scale of SCALES) {
        for (const chord of chordsIn(C, scale)) {
            const [root, third, fifth] = chord.notes;
            if (!(root < third && third < fifth)) {
                throw new Error(`${scale.name} ${chord.label}: notes out of order`);
            }
        }
    }
});

check('a scale transposes without changing shape', () => {
    // Same intervals from any root, so the picker can move key later.
    const fromE = triadOn(0, E, phrygian).map((n) => n - E);
    const fromC = triadOn(0, C, phrygian).map((n) => n - C);
    equal(fromE, fromC, 'intervals of i');
});

// ─── The generator ───────────────────────────────────────────────────────────
// The muse's rules, asserted as data. Pure in, pure out — so this belongs here
// rather than in the browser run, by the same exception that lets the scales be
// tested directly. A failure names the musical rule it broke instead of
// sounding vaguely wrong.
//
// A fixed sequence, long enough not to alias against the twelve-slot grid: a
// pattern draws up to four values per grid step, so a shorter cycle would land
// the same value on the same step every bar and prove less than it looks.
function pinned(seed = 1) {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
}

const patterns = (count, options = {}) =>
    Array.from({ length: count }, () => generateBass(options));

check('the bass never sounds on the kick step', () => {
    // The one inviolable rule, and the reason the grid exists at all.
    for (const { steps } of patterns(500, { random: pinned(7) })) {
        steps.forEach((step, index) => {
            if (step.gate === 'note' && isKickStep(index)) {
                throw new Error(`a note landed on kick step ${index}`);
            }
        });
    }
});

check('the bass is roughly 70% root', () => {
    let sounding = 0;
    let root = 0;
    for (const { steps } of patterns(500, { random: pinned(11) })) {
        for (const step of steps) {
            if (step.gate !== 'note') continue;
            sounding++;
            if (step.degree === 0) root++;
        }
    }
    if (sounding === 0) throw new Error('the generator emitted no notes at all');
    // A tolerance, not equality: the ratio is a weighting, so over 500 patterns
    // it should land close without ever being exact.
    const ratio = root / sounding;
    if (Math.abs(ratio - ROOT_SHARE) > 0.05) {
        throw new Error(`root share ${ratio.toFixed(3)}, expected ~${ROOT_SHARE}`);
    }
});

check('every sounding step is in the scale, in one octave', () => {
    for (const scale of SCALES) {
        for (const { steps } of patterns(100, { scale, random: pinned(3) })) {
            for (const step of steps) {
                if (step.gate !== 'note') continue;
                // Asserted against the scale itself rather than a copy of the
                // colour table: a degree the scale does not have would resolve
                // to an undefined pitch at schedule time.
                if (step.degree >= scale.steps.length) {
                    throw new Error(`${scale.name}: degree ${step.degree} is off the end of the scale`);
                }
                if (![0, ...COLOUR_DEGREES].includes(step.degree)) {
                    throw new Error(`${scale.name}: degree ${step.degree} is not the root or a colour tone`);
                }
                // One octave of range. The hypnotic effect depends on pitch
                // staying static, so an octave drop is a once-every-few-bars
                // event rather than a per-step decision.
                if (step.octave !== 0) throw new Error(`${scale.name}: step left the octave`);
            }
        }
    }
});

check('the bass fills the Goa grid and nothing else', () => {
    // Asserted against the exported grid, not a transcription of it — a copy
    // here would keep passing after the grid changed.
    for (const { steps } of patterns(500, { random: pinned(5) })) {
        steps.forEach((step, index) => {
            if (step.gate === 'note' && !BASS_GRIDS.goa.includes(index)) {
                throw new Error(`a note fell outside the Goa grid, at step ${index}`);
            }
        });
    }
});

check('no step slides into silence', () => {
    // A slide glides into the next step, so one before a rest is inaudible —
    // and emitting them is a known bug source in 303 emulations.
    for (const { steps } of patterns(500, { random: pinned(13) })) {
        steps.forEach((step, index) => {
            if (step.slide && steps[(index + 1) % STEPS].gate !== 'note') {
                throw new Error(`step ${index} slides into a ${steps[(index + 1) % STEPS].gate}`);
            }
        });
    }
});

check('clearDanglingSlides strips exactly the inaudible slides', () => {
    // Asserted directly, because the invariant above holds by construction and
    // would still pass if this pass were deleted.
    const steps = Array.from({ length: STEPS }, () => ({
        gate: 'rest', degree: 0, octave: 0, accent: false, slide: false,
    }));
    steps[1] = { gate: 'note', degree: 0, octave: 0, accent: false, slide: true };
    steps[2] = { gate: 'note', degree: 0, octave: 0, accent: false, slide: true };
    // Step 1 slides into a note and survives; step 2 slides into a rest.
    const cleared = clearDanglingSlides({ lane: 'bass', steps });
    if (!cleared.steps[1].slide) throw new Error('an audible slide was stripped');
    if (cleared.steps[2].slide) throw new Error('a slide into a rest survived');
});

check('the same random sequence produces the same pattern', () => {
    const a = generateBass({ random: pinned(42) });
    const b = generateBass({ random: pinned(42) });
    equal(a, b, 'two runs of one pinned sequence');
});

check('a different random sequence produces a different pattern', () => {
    // A muse that returns one line is a lookup table. Compared against another
    // *pinned* sequence, so this cannot pass by accident on Math.random alone.
    const a = JSON.stringify(generateBass({ random: pinned(42) }));
    const differing = [1, 2, 3, 4, 5, 6, 7, 8]
        .map((seed) => JSON.stringify(generateBass({ random: pinned(seed) })))
        .filter((pattern) => pattern !== a);
    if (differing.length === 0) {
        throw new Error('every seed produced the same pattern — random is not reaching the choices');
    }
});

check('the rhythm is a template, not a random layer', () => {
    // Randomising rhythm alongside pitch is the most reported cause of a
    // generator sounding wrong even when every pitch is in the scale. Whatever
    // the seed, a note can only ever appear on a grid slot.
    const slots = new Set();
    for (let seed = 1; seed <= 40; seed++) {
        generateBass({ random: pinned(seed) }).steps.forEach((step, index) => {
            if (step.gate === 'note') slots.add(index);
        });
    }
    for (const slot of slots) {
        if (!BASS_GRIDS.goa.includes(slot)) throw new Error(`step ${slot} sounded off-grid`);
    }
});

// ─── The lead ────────────────────────────────────────────────────────────────
// Where ADR 0007's bet is under real strain. The bass mostly ignores the
// progression, so one algorithm serving both genres was barely tested by #34.
// The lead genuinely diverges — and these assert that it diverges by numbers.

// How far two degrees are apart, the short way round the scale. A step is 1;
// anything more is a leap, and degree 6 to degree 0 is a step, not a sixth.
const apart = (a, b, size) => Math.min((a - b + size) % size, (b - a + size) % size);

const leadNotes = (options, runs = 400) => {
    const notes = [];
    for (let i = 0; i < runs; i++) {
        const { steps } = generateLead({ bar: i % 8, random: pinned(i + 1), ...options });
        notes.push(steps.map((step, index) => ({ ...step, index })).filter((step) => step.gate === 'note'));
    }
    return notes;
};

check('the Goa lead walks rather than jumps', () => {
    let moves = 0;
    let leaps = 0;
    for (const bar of leadNotes({ scale: phrygian, genre: 'goa' })) {
        for (let i = 1; i < bar.length; i++) {
            moves++;
            if (apart(bar[i].degree, bar[i - 1].degree, phrygian.steps.length) > 1) leaps++;
        }
    }
    if (moves === 0) throw new Error('the lead produced no notes to measure');
    const rate = leaps / moves;
    // "Leaps are rare, small, and function as deliberate outlier events (~5–10%
    // of notes) rather than a phrase norm." Measured at 9.4% over 3000 bars, so
    // the ceiling is the research's own upper bound plus a point of slack —
    // an earlier 12% was set above the band to fit the implementation, which is
    // widening the target rather than hitting it. A line that leaps a fifth of
    // the time is arpeggiating, which Goa leads are not.
    if (rate > 0.11) throw new Error(`the Goa lead leaps ${(rate * 100).toFixed(1)}% of the time, wanted the research's ~5–10%`);
});

check('the ♭2 is the Goa lead\'s colour tone, second only to the root', () => {
    const counts = new Array(phrygian.steps.length).fill(0);
    for (const bar of leadNotes({ scale: phrygian, genre: 'goa' })) {
        for (const note of bar) counts[note.degree]++;
    }
    const ranked = counts.map((count, degree) => ({ degree, count }))
        .sort((a, b) => b.count - a.count);
    // "Often the second-most-visited note after the root, sitting a semitone
    // above it" — the one degree that makes Phrygian audible. A ♭2 that
    // outranks the root is not a colour tone, it is the centre.
    if (ranked[0].degree !== 0) throw new Error(`degree ${ranked[0].degree} is visited more than the root`);
    if (ranked[1].degree !== 1) throw new Error(`the second-most-visited degree is ${ranked[1].degree}, not the ♭2`);
});

check('the Goa motif is coprime with the bar, and precesses against it', () => {
    const { motif } = LEAD_VOICES.goa;
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    if (gcd(motif, STEPS) !== 1) throw new Error(`a motif of ${motif} is not coprime with ${STEPS} — it cannot precess`);

    // Precession is the claim, and it is only visible across bars: the same
    // cell read from a different starting place each bar, realigning after
    // `motif` bars. One bar of it looks like a loop.
    const shapes = new Set();
    for (let bar = 0; bar < motif; bar++) {
        shapes.add(JSON.stringify(generateLead({
            scale: phrygian, genre: 'goa', bar, random: pinned(42),
        }).steps.map((step) => (step.gate === 'note' ? step.degree : '.'))));
    }
    if (shapes.size < motif - 1) {
        throw new Error(`${shapes.size} distinct bars across ${motif} — the cell is not precessing`);
    }
});

check('a melodic techno phrase starts and ends on a chord tone', () => {
    // The crux rule, near-verbatim across independent write-ups: "the first and
    // last note of each phrase must belong to the underlying chord; everything
    // in between is free within the scale."
    //
    // The phrase, not the bar. Asserting it per bar would certify a narrowing
    // rather than catch it: anchoring every bar constrains a quarter of all
    // notes, and the free interior is what the rule exists to protect.
    const progression = PROGRESSIONS[0];
    for (let phrase = 0; phrase < 4; phrase++) {
        for (let seed = 1; seed <= 40; seed++) {
            const bars = Array.from({ length: PHRASE_BARS }, (_, offset) => generateLead({
                scale: minor,
                genre: 'melodic-techno',
                progression,
                bar: phrase * PHRASE_BARS + offset,
                random: pinned(phrase * 40 + seed),
            }));
            const notes = bars.flatMap((pattern, offset) => pattern.steps
                .filter((step) => step.gate === 'note')
                .map((step) => ({ step, bar: phrase * PHRASE_BARS + offset })));
            if (notes.length === 0) continue;

            for (const boundary of [notes[0], notes.at(-1)]) {
                const tones = chordTones(chordAt(progression, boundary.bar), minor);
                if (!tones.includes(boundary.step.degree)) {
                    throw new Error(`phrase ${phrase}: a boundary sounded degree ${boundary.step.degree}, not a tone of ${tones.join('/')}`);
                }
            }
        }
    }
});

check('every lead note is in the scale, in both genres', () => {
    // "No chromatic passing tones. Stay in the scale of the chords."
    for (const [genre, scale, progression] of [
        ['goa', phrygian, STATIC_TONIC],
        ['melodic-techno', minor, PROGRESSIONS[0]],
    ]) {
        for (const bar of leadNotes({ scale, genre, progression }, 200)) {
            for (const note of bar) {
                if (!Number.isInteger(note.degree) || note.degree < 0 || note.degree >= scale.steps.length) {
                    throw new Error(`${genre}: degree ${note.degree} is not in the scale`);
                }
                if (note.octave !== 0) throw new Error(`${genre}: a lead note left its octave`);
            }
        }
    }
});

check('the genres differ by their voice parameters, not by a code path', () => {
    // The bet, asserted as data: everything that separates a Goa lead from a
    // melodic techno one is a number in this table. If a future ticket needs a
    // branch instead, this check is where that shows up as an argument.
    const goa = LEAD_VOICES.goa;
    const techno = LEAD_VOICES['melodic-techno'];
    if (!(goa.leapRate < techno.leapRate)) throw new Error('Goa should leap less than melodic techno');
    if (goa.colourDegree !== 1) throw new Error('Goa\'s colour tone should be the ♭2');
    if (techno.colourDegree !== null) throw new Error('melodic techno should weight no colour tone — the research finds no Phrygian in it');
    if (Object.keys(goa).sort().join() !== Object.keys(techno).sort().join()) {
        // Different keys would mean one genre carries a parameter the other
        // cannot express, which is a branch wearing a table's clothes.
        const only = (a, b) => Object.keys(a).filter((k) => !(k in b));
        throw new Error(`the two voices have different parameters: ${only(goa, techno).concat(only(techno, goa)).join(', ')}`);
    }
});

// ─── Harmony, and the one-generator bet ──────────────────────────────────────
// ADR 0007 stakes the design on Goa being melodic techno's algorithm with the
// progression set to one chord. These assert that the two genres differ by the
// values they are handed and not by the path they take.

check('Goa is one chord that never changes', () => {
    const goa = pickProgression({ genre: 'goa' });
    if (goa.degrees.length !== 1) throw new Error(`Goa has ${goa.degrees.length} chords, expected one`);
    if (goa.degrees[0] !== 0) throw new Error('the one Goa chord is not the tonic');
    for (let bar = 0; bar < 64; bar++) {
        if (chordAt(goa, bar) !== 0) throw new Error(`Goa moved off the tonic at bar ${bar}`);
        // The whole bet: no chord change means no walkdown, with no branch on
        // genre anywhere. If this ever became true the degenerate case would
        // have stopped being degenerate.
        if (changesAfter(goa, bar)) throw new Error(`Goa's progression changed after bar ${bar}`);
    }
});

check('melodic techno moves at 2 to 4 bars per chord', () => {
    for (const progression of PROGRESSIONS) {
        if (progression.barsPerChord < 2 || progression.barsPerChord > 4) {
            throw new Error(`${progression.label} is ${progression.barsPerChord} bars/chord, wanted 2–4`);
        }
        if (progression.degrees.length !== 4) {
            throw new Error(`${progression.label} has ${progression.degrees.length} chords, expected a 4-chord loop`);
        }
        if (progression.degrees[0] !== 0) throw new Error(`${progression.label} does not start on the tonic`);
        // Every chord is a degree of the scale, so the table works in any key
        // and any scale sndlab ships.
        for (const degree of progression.degrees) {
            if (!Number.isInteger(degree) || degree < 0 || degree > 6) {
                throw new Error(`${progression.label} names degree ${degree}, which is not a scale degree`);
            }
        }
        // 8 or 16 bars, per the research.
        const loop = progression.degrees.length * progression.barsPerChord;
        if (loop !== 8 && loop !== 16) throw new Error(`${progression.label} loops over ${loop} bars, expected 8 or 16`);
    }
});

check('a chord change is announced by a walkdown, and only then', () => {
    const progression = PROGRESSIONS[0]; // i–VI–III–VII, 2 bars per chord
    for (let bar = 0; bar < 8; bar++) {
        const steps = generateBass({
            scale: minor, genre: 'melodic-techno', progression, bar, random: pinned(bar + 1),
        }).steps;
        const tail = steps.slice(STEPS / 2).filter((step) => step.gate === 'note');
        const degrees = tail.map((step) => step.degree);

        if (!changesAfter(progression, bar)) continue;

        // The half-bar before a change is a descent arriving on the next
        // chord's root — the research's "A A G F", stepwise and pre-announcing.
        const target = chordAt(progression, bar + 1);
        if (degrees.at(-1) !== target) {
            throw new Error(`bar ${bar} ended on degree ${degrees.at(-1)}, not the coming chord's ${target}`);
        }
        // Descending *by scale step*, which is not the same as descending
        // numerically: degree 0 to degree 6 is one step down into the octave
        // below, and reads as a fall. Comparing the indices directly would call
        // that an ascent and demand a walkdown the music does not want.
        for (let i = 1; i < degrees.length; i++) {
            const fell = (degrees[i - 1] - degrees[i] + minor.steps.length) % minor.steps.length;
            if (fell !== 1) {
                throw new Error(`bar ${bar} does not walk down one step at a time: ${degrees.join(' → ')}`);
            }
        }
    }
});

check('the bass does not follow the chord roots', () => {
    // The clearest divergence from generic techno: in melodic techno the chords
    // move above a bass that stays largely on the tonic, and the bass is a
    // chord-transition device rather than a countermelody.
    //
    // Measured two ways, because one number alone hides the other. An earlier
    // version of this check excluded walkdown bars, which are exactly the bars
    // that move the figure — so it re-asserted #30's constant on a code path
    // #34 never touched and could not fail.
    const progression = PROGRESSIONS[0];
    const tally = { steady: { notes: 0, root: 0 }, all: { notes: 0, root: 0 } };
    for (let bar = 0; bar < 8; bar++) {
        for (let seed = 1; seed <= 60; seed++) {
            for (const step of generateBass({
                scale: minor, genre: 'melodic-techno', progression, bar, random: pinned(bar * 100 + seed),
            }).steps) {
                if (step.gate !== 'note') continue;
                tally.all.notes++;
                if (step.degree === 0) tally.all.root++;
                if (changesAfter(progression, bar)) continue;
                tally.steady.notes++;
                if (step.degree === 0) tally.steady.root++;
            }
        }
    }

    // Away from the chord changes the bass is the same ~70% root as Goa's.
    const steady = tally.steady.root / tally.steady.notes;
    if (Math.abs(steady - ROOT_SHARE) > 0.05) {
        throw new Error(`root share between changes is ${steady.toFixed(3)}, expected ~${ROOT_SHARE}`);
    }

    // Across the whole progression it is lower, and that is the walkdown's
    // cost rather than a fault: a quarter of all notes are the approach to a
    // chord change, and none of those are the tonic. Asserted so the cost stays
    // visible — if it drifts, either the walkdown or the density has moved.
    const overall = tally.all.root / tally.all.notes;
    if (Math.abs(overall - 0.575) > 0.05) {
        throw new Error(`root share across the progression is ${overall.toFixed(3)}, expected ~0.575`);
    }

    // The claim that actually matters: the bass does not chase the harmony.
    // A bass tracking each chord would sit on that chord's root, so the tonic
    // share on non-tonic chords would collapse.
    if (overall < 0.4) {
        throw new Error(`root share ${overall.toFixed(3)} — the bass is following the chord roots`);
    }
});

check('both genres keep every invariant the bass generator guarantees', () => {
    // Whatever else changed, the rules from #30 hold in both genres.
    for (const [genre, progression] of [['goa', STATIC_TONIC], ['melodic-techno', PROGRESSIONS[0]]]) {
        for (let bar = 0; bar < 8; bar++) {
            for (let seed = 1; seed <= 30; seed++) {
                const { steps } = generateBass({
                    scale: minor, genre, progression, bar, random: pinned(bar * 50 + seed),
                });
                steps.forEach((step, index) => {
                    if (step.gate !== 'note') return;
                    if (isKickStep(index)) throw new Error(`${genre}: a note landed on kick step ${index}`);
                    if (step.degree >= minor.steps.length) throw new Error(`${genre}: degree ${step.degree} is off the scale`);
                    if (step.octave !== 0) throw new Error(`${genre}: a step left the octave`);
                    if (step.slide && steps[(index + 1) % STEPS].gate !== 'note') {
                        throw new Error(`${genre}: a slide points at a rest`);
                    }
                });
            }
        }
    }
});

check('melodic techno is the offbeat 8ths, Goa the rolling 16ths', () => {
    const density = (genre, progression) => {
        let notes = 0;
        for (let seed = 1; seed <= 40; seed++) {
            notes += generateBass({ scale: minor, genre, progression, bar: 0, random: pinned(seed) })
                .steps.filter((step) => step.gate === 'note').length;
        }
        return notes / 40;
    };
    const goa = density('goa', STATIC_TONIC);
    const techno = density('melodic-techno', PROGRESSIONS[0]);
    // Four to the bar against twelve: the genre difference is a density
    // parameter, which is the point.
    if (techno > 4) throw new Error(`melodic techno sounds ${techno.toFixed(1)} steps a bar, expected the four offbeat 8ths`);
    if (goa < 8) throw new Error(`Goa sounds only ${goa.toFixed(1)} steps a bar, expected the rolling 16ths`);
});

check('the loop is the progression length, and one bar for a static tonic', () => {
    // Owned by Progressions rather than computed by the caller: multiplying by
    // an Infinite barsPerChord needs a special case for Goa wherever it is
    // done, which is a branch on genre by proxy.
    if (loopBars(STATIC_TONIC) !== 1) throw new Error(`Goa loops over ${loopBars(STATIC_TONIC)} bars, expected one`);
    for (const progression of PROGRESSIONS) {
        const bars = loopBars(progression);
        if (bars !== 8 && bars !== 16) throw new Error(`${progression.label} loops over ${bars} bars, expected 8 or 16`);
        // And the loop really does come round: the chord at bar 0 and at one
        // full loop later must be the same.
        if (chordAt(progression, 0) !== chordAt(progression, bars)) {
            throw new Error(`${progression.label} does not repeat after ${bars} bars`);
        }
    }
});

// ─── The clock, on fake time ─────────────────────────────────────────────────
// The scheduler is arithmetic over an injected clock, so it is testable here
// without a browser — and must be. Asserting a schedule against wall-clock time
// measures the browser's timer jitter, not the scheduler, and the tolerance
// needed to make that pass on a loaded machine is wide enough that the check
// could never fail. The engine actually playing the schedule is asserted in
// verify.mjs, where there is a real audio graph to watch.
//
// `now` is a counter and `wake` a drainable queue: advancing time runs whatever
// was due, in order, exactly as a real timer would but deterministically.
function fakeTime() {
    let t = 0;
    let queue = [];
    return {
        now: () => t,
        wake: (fn, seconds) => queue.push({ at: t + seconds, fn }),
        advance(to) {
            for (;;) {
                const next = queue.filter((e) => e.at <= to).sort((a, b) => a.at - b.at)[0];
                if (!next) break;
                queue = queue.filter((e) => e !== next);
                t = next.at;
                next.fn();
            }
            t = to;
        },
    };
}

const runClock = (bpm, until, act) => {
    const time = fakeTime();
    const played = [];
    const clock = createClock({
        now: time.now,
        wake: time.wake,
        play: (step, when) => played.push({ step, when }),
        bpm,
    });
    clock.start(0);
    if (act) act(clock, time);
    time.advance(until);
    return { played, clock, time };
};

check('sixteen steps land at the right offsets for the tempo', () => {
    const { played } = runClock(120, 2.1);
    const gap = secondsPerStep(120);
    if (Math.abs(gap - 0.125) > 1e-12) throw new Error(`a step at 120bpm is ${gap}s, expected 0.125`);
    played.slice(0, STEPS).forEach(({ step, when }, i) => {
        if (step !== i) throw new Error(`step ${i} was scheduled as ${step}`);
        if (Math.abs(when - i * gap) > 1e-9) throw new Error(`step ${i} at ${when}s, expected ${i * gap}s`);
    });
});

check('the loop wraps with no gap and no doubled step', () => {
    const { played } = runClock(120, 2.1);
    // The seam is the whole risk: step 15 to step 0 must be the same distance
    // as any other pair, because the next bar is placed by the same addition
    // rather than as a special case.
    const gaps = played.slice(1).map((p, i) => Number((p.when - played[i].when).toFixed(9)));
    if (new Set(gaps).size !== 1) throw new Error(`the loop seams: gaps ${[...new Set(gaps)].join(', ')}`);
    played.forEach(({ step }, i) => {
        if (step !== i % STEPS) throw new Error(`step ${i} came out as ${step} — the wrap is wrong`);
    });
});

check('a tempo change mid-bar drops no step and duplicates none', () => {
    const { played } = runClock(120, 2.0, (clock, time) => {
        time.advance(0.5);
        clock.setBpm(140);
    });
    const times = played.map((p) => p.when);
    if (!times.every((t, i) => i === 0 || t > times[i - 1])) throw new Error('times are not ascending');
    if (new Set(times.map((t) => t.toFixed(9))).size !== times.length) throw new Error('a step was scheduled twice');
    played.forEach(({ step }, i) => {
        if (i > 0 && step !== (played[i - 1].step + 1) % STEPS) {
            throw new Error(`step ${step} followed ${played[i - 1].step} — one was dropped`);
        }
    });
    // Both tempos should be represented, and nothing else.
    const gaps = new Set(played.slice(1).map((p, i) => Number((p.when - played[i].when).toFixed(6))));
    const expected = [secondsPerStep(120), secondsPerStep(140)].map((g) => Number(g.toFixed(6)));
    for (const gap of gaps) {
        if (!expected.includes(gap)) throw new Error(`unexpected step gap ${gap}s`);
    }
});

check('stop schedules nothing further', () => {
    const { played, clock, time } = runClock(120, 1.0);
    const before = played.length;
    if (before === 0) throw new Error('nothing was scheduled before stopping');
    clock.stop();
    time.advance(20);
    if (played.length !== before) throw new Error(`${played.length - before} steps scheduled after stop`);
    if (clock.running) throw new Error('the clock still reports itself running');
});

check('the clock schedules ahead of the audio clock, never behind it', () => {
    // A scheduler that hands the engine a time already in the past has failed
    // even if every gap is right: the note is dropped or played late.
    const time = fakeTime();
    const seen = [];
    const clock = createClock({
        now: time.now,
        wake: time.wake,
        play: (step, when) => seen.push(when - time.now()),
        bpm: 138,
    });
    clock.start(0);
    time.advance(4);
    if (seen.some((lead) => lead < 0)) throw new Error('a step was scheduled in the past');
    if (seen.some((lead) => lead > LOOKAHEAD + 1e-9)) throw new Error('a step was scheduled beyond the lookahead window');
});

check('the clock reads the audio clock only through the injected function', () => {
    // Asserted, not documented. A second call site would silently make the fake
    // clock non-authoritative — every check above would keep passing while
    // measuring a clock the checks do not control, which is the failure mode
    // this whole seam exists to prevent.
    const source = readFileSync(new URL('../js/audio/Clock.js', import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    if (code.includes('currentTime')) {
        throw new Error('Clock.js reads currentTime directly — it must come in through now()');
    }
    if (/\bDate\.now\b|\bperformance\.now\b/.test(code)) {
        throw new Error('Clock.js reads a wall clock — time must come in through now()');
    }
});

console.log(failures === 0 ? '\nAll theory checks passed.' : `\n${failures} theory check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
