// What a scale is, and what follows from it. No audio, no DOM, no state.
//
// A scale is a root and a set of semitone steps from it. Everything else —
// which notes belong, what chord sits on each degree, whether that chord is
// major or minor — is arithmetic on that set. Keeping it that way is what lets
// the chord pads, the readout and any later generative work share one source of
// truth about pitch.
//
// Grounded in docs/research/electronic-music-scales.md. The ranked shortlist
// there is natural minor, Phrygian, Dorian, harmonic minor, Phrygian dominant,
// and Lydian; the first two are here, the rest follow.

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

// How a degree is written when the scale is spelled out: 1, ♭2, 3…
const DEGREE_NAMES = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];

// Chord quality by the two intervals above the root — third, then fifth.
const QUALITIES = {
    '4,7': { name: 'major', symbol: '' },
    '3,7': { name: 'minor', symbol: '' },
    '3,6': { name: 'diminished', symbol: '°' },
    '4,8': { name: 'augmented', symbol: '+' },
};

// Roman numerals, lowercased for minor and diminished by chordsIn().
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// The why-sentence is the tool's entire learning content, so it says what to
// listen for rather than what the scale is called.
export const SCALES = [
    {
        id: 'natural-minor',
        name: 'Natural minor',
        // Aeolian. The one claim in the research with corpus evidence behind
        // it rather than repetition: minor keys dominate electronic music.
        steps: [0, 2, 3, 5, 7, 8, 10],
        why: 'The default sound of electronic music — dark but settled. Start here; every other scale on this list is a small change to it.',
    },
    {
        id: 'phrygian',
        name: 'Phrygian',
        // Natural minor with the second flattened. That one note is the whole
        // character, and it is only audible against the root — which is what
        // the drone is for.
        steps: [0, 1, 3, 5, 7, 8, 10],
        why: 'Natural minor with the second note flattened. That one change is the whole difference: it sounds tense and Middle Eastern. Hold the drone and play the note right above it to hear why.',
    },
];

export const scaleById = (id) => SCALES.find((scale) => scale.id === id) ?? SCALES[0];

export const noteName = (midiNumber) => NOTE_NAMES[((midiNumber % 12) + 12) % 12];

/** Is this note in the scale, in any octave? */
export function inScale(midiNumber, root, scale) {
    const interval = (((midiNumber - root) % 12) + 12) % 12;
    return scale.steps.includes(interval);
}

/** Where this note sits in the scale — '1', '♭2', '5' — in any octave. */
export function degreeName(midiNumber, root) {
    const interval = (((midiNumber - root) % 12) + 12) % 12;
    return DEGREE_NAMES[interval];
}

/**
 * The triad built on one degree, as MIDI numbers.
 *
 * Stacked in scale steps, not in fixed intervals: the third and fifth are the
 * notes two and four positions along, wrapping into the next octave. That is
 * what makes the chord belong to the scale rather than being imposed on it, and
 * it is why the qualities come out uneven — some degrees are major, some minor,
 * one diminished. That unevenness is the scale's shape, and it is the lesson.
 */
export function triadOn(degreeIndex, root, scale) {
    const { steps } = scale;
    return [0, 2, 4].map((offset) => {
        const index = degreeIndex + offset;
        const octave = Math.floor(index / steps.length) * 12;
        return root + steps[index % steps.length] + octave;
    });
}

/** Major, minor, diminished or augmented, from the notes themselves. */
export function qualityOf(notes) {
    const [root, third, fifth] = notes;
    return QUALITIES[`${third - root},${fifth - root}`] ?? { name: 'unknown', symbol: '?' };
}

/** Every chord in the scale, in degree order, ready to label and play. */
export function chordsIn(root, scale) {
    return scale.steps.map((_, degreeIndex) => {
        const notes = triadOn(degreeIndex, root, scale);
        const quality = qualityOf(notes);
        const numeral = NUMERALS[degreeIndex];
        return {
            degreeIndex,
            notes,
            quality: quality.name,
            // Case carries the quality, so the row of labels is itself a
            // picture of the scale: i II III iv v° VI vii.
            label: (quality.name === 'major' ? numeral : numeral.toLowerCase()) + quality.symbol,
        };
    });
}
