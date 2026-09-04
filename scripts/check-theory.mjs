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
import { LOOKAHEAD, createClock, secondsPerStep } from '../js/audio/Clock.js';

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
