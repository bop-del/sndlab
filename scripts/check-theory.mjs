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

import { SCALES, chordsIn, degreeName, inScale, noteName, scaleById, triadOn } from '../js/theory/Scales.js';

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

console.log(failures === 0 ? '\nAll theory checks passed.' : `\n${failures} theory check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
