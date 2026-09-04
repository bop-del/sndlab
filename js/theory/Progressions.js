// What chords a generated line moves over. Pure data plus a picker — no audio,
// no DOM, no state, the same shape as Scales.js.
//
// The generator owns its harmony (ADR 0007 decision 2): it picks from this
// table rather than reading the chord pads, so a line can be heard without
// anyone supplying a progression first.
//
// Grounded in docs/research/generative-basslines-and-melodies.md §7. The
// numerals are folklore, though `i–VI–III–VII` appears in two independent
// write-ups — the strongest evidence any progression here has.

/**
 * Degrees are indices into the scale, not roman numerals or MIDI numbers.
 *
 * `i` is 0, `VI` is 5, `III` is 2, `VII` is 6 — the same arithmetic-on-a-scale
 * principle Scales.js uses for triads. That is what lets one table serve every
 * scale sndlab ships: the numeral is a label, the index is the durable thing.
 */
export const PROGRESSIONS = [
    {
        id: 'i-VI-III-VII',
        label: 'i–VI–III–VII',
        degrees: [0, 5, 2, 6],
        barsPerChord: 2,
    },
    {
        id: 'i-III-VII-VI',
        label: 'i–III–VII–VI',
        degrees: [0, 2, 6, 5],
        barsPerChord: 4,
    },
    {
        id: 'i-iv-VI-V',
        label: 'i–iv–VI–V',
        degrees: [0, 3, 5, 4],
        barsPerChord: 2,
    },
    {
        id: 'i-VII-VI-V',
        label: 'i–VII–VI–V',
        degrees: [0, 6, 5, 4],
        barsPerChord: 2,
    },
    {
        id: 'i-i-VI-VI',
        label: 'i–i–VI–VI',
        degrees: [0, 0, 5, 5],
        barsPerChord: 4,
    },
];

/**
 * Goa's harmony: one chord, forever.
 *
 * Not an absence of progression but a progression of length one — which is the
 * whole architectural bet. ADR 0007: *"Goa is the degenerate case of melodic
 * techno's algorithm: melodic techno anchors each phrase's boundary notes to a
 * chord that moves; Goa sets that chord to the tonic and never changes it."*
 *
 * The modal centre is the point. Western chord movement destabilises it, which
 * is why the research finds no progression in the genre at all rather than a
 * slow one.
 */
export const STATIC_TONIC = {
    id: 'tonic',
    label: 'i',
    degrees: [0],
    barsPerChord: Infinity,
};

/**
 * The progression a genre uses.
 *
 * Goa always gets the static tonic; melodic techno draws from the table. This
 * is the parameter the one-generator bet rests on — same code path, different
 * progression, and "one chord forever" is just a shorter list.
 */
export function pickProgression({ genre = 'goa', random = Math.random } = {}) {
    if (genre !== 'melodic-techno') return STATIC_TONIC;
    return PROGRESSIONS[Math.floor(random() * PROGRESSIONS.length)];
}

/**
 * Which chord is sounding in a given bar, as a degree index.
 *
 * `barsPerChord: Infinity` on the static tonic makes this return degree 0 for
 * every bar without a special case — the division is what handles it, not a
 * branch on genre.
 */
export function chordAt(progression, bar) {
    const index = Math.floor(bar / progression.barsPerChord) % progression.degrees.length;
    return progression.degrees[index];
}

/**
 * How many bars before the progression repeats.
 *
 * Owned here rather than computed by the caller: `degrees.length *
 * barsPerChord` is Infinity for the static tonic, so every caller doing that
 * multiplication needs a special case for Goa — which is a branch on genre by
 * proxy, in a file that has none. One bar is the right answer for a
 * progression that never moves.
 */
export function loopBars(progression) {
    return Number.isFinite(progression.barsPerChord)
        ? progression.degrees.length * progression.barsPerChord
        : 1;
}

/** Is the next bar a different chord? True when a walkdown should announce it. */
export function changesAfter(progression, bar) {
    return chordAt(progression, bar) !== chordAt(progression, bar + 1);
}
