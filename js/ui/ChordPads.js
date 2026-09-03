import { Notes } from '../audio/Notes.js';
import { chordsIn } from '../theory/Scales.js';

// Two ways to make harmony, side by side.
//
// **Chord pads** are the mechanism for the genres built on chord movement —
// melodic techno and progressive house run on progressions like i–VI–III–VII.
//
// **The drone** is the mechanism for the genres that are not. Goa trance is a
// sustained tonal centre with modal melody over it, and introducing Western
// chord changes works against that character rather than with it. So the drone
// is a peer of the pad row, not a helper tucked into the sound settings.
//
// It is also what makes any scale's character audible at all. The flat second
// that defines Phrygian sits in a *major* II chord, which sounds bright on its
// own — the darkness is entirely in the relationship to the root. Something has
// to hold the root for that relationship to exist.

// One octave below where the typing rows start, so a chord is a floor heard
// under the hands rather than a distant rumble, and harmony stays below melody
// wherever the player puts the rows.
//
// This used to be a fixed two octaves below middle C. Following the transpose
// is what keeps the relationship rather than the absolute pitch — and at the
// default position it sounds an octave higher than it used to. That is a
// deliberate change: C2 triads are muddy in their own right.
const BELOW_ROWS = -12;

// The octave the scale picker names its roots in — MIDI 60 to 71. The register
// offset is measured from here, so the pads move with the transpose and not
// with the root.
const PICKER_OCTAVE = 60;

export const ChordPads = {
    root: 60,
    scale: null,
    chords: [],
    pads: new Map(), // degree index → element

    // Where the typing rows start. The pad and drone register is derived from
    // it, so both follow the transpose.
    typingFirst: 60,

    // Which pad is latched. One at a time: two triads at once is mud, and mud
    // hides the interval this exists to make audible.
    active: null,
    droning: false,

    init(container) {
        this.container = container;
    },

    // The offset from the scale's own notes down to the register the pads and
    // the drone actually sound in.
    //
    // chordsIn() builds triads from the root the picker selected, which sits in
    // the octave above middle C; the offset carries them down to one octave
    // below the typing rows. Measured from that root rather than from an
    // absolute pitch, so moving the root transposes the chord and moving the
    // transpose moves the register, and the two do not fight.
    get register() {
        return this.typingFirst + BELOW_ROWS - PICKER_OCTAVE;
    },

    // Move the harmony register with the rows.
    //
    // Stop first, then move — the same order setScale() uses, and for the same
    // reason: both stops release notes worked out from the *current* register,
    // so storing the new one first would release notes that were never pressed
    // and leave the sounding ones held for ever.
    setTranspose(typingFirst) {
        this.stopChord();
        this.stopDrone();
        this.typingFirst = typingFirst;
    },

    setScale(root, scale) {
        // Stop first, then move. Both stops release notes worked out from the
        // current root and chord list, so storing the new ones first releases
        // notes that were never pressed and leaves the sounding ones held for
        // ever — every root change then piling up voices nothing can stop.
        //
        // A latched chord belongs to the scale that built it, so it must not
        // survive the change either: it would be a chord from nowhere.
        this.stopChord();
        this.stopDrone();

        this.root = root;
        this.scale = scale;
        this.chords = chordsIn(root, scale);

        this.render();
    },

    render() {
        const row = document.createElement('div');
        row.className = 'pads';

        for (const chord of this.chords) {
            const pad = document.createElement('button');
            pad.type = 'button';
            pad.className = 'pad';
            pad.dataset.degree = String(chord.degreeIndex);
            // The label carries the quality in its case — i II III iv v° VI vii
            // — so the row is itself a picture of the scale's shape.
            pad.textContent = chord.label;
            pad.setAttribute('aria-pressed', 'false');
            pad.addEventListener('click', () => this.toggleChord(chord.degreeIndex));
            this.pads.set(chord.degreeIndex, pad);
            row.append(pad);
        }

        const drone = document.createElement('button');
        drone.type = 'button';
        drone.id = 'drone';
        drone.className = 'drone';
        drone.textContent = 'Drone';
        drone.setAttribute('aria-pressed', 'false');
        drone.addEventListener('click', () => this.toggleDrone());
        this.drone = drone;

        this.container.replaceChildren(row, drone);
    },

    toggleChord(degreeIndex) {
        const wasActive = this.active === degreeIndex;
        this.stopChord();
        if (wasActive) return; // latched pads toggle off

        const chord = this.chords[degreeIndex];
        for (const note of chord.notes) Notes.press(note + this.register, `pad:${degreeIndex}`);
        this.active = degreeIndex;
        this.pads.get(degreeIndex)?.classList.add('pad--on');
        this.pads.get(degreeIndex)?.setAttribute('aria-pressed', 'true');
    },

    stopChord() {
        if (this.active === null) return;
        const chord = this.chords[this.active];
        for (const note of chord.notes) Notes.release(note + this.register, `pad:${this.active}`);
        this.pads.get(this.active)?.classList.remove('pad--on');
        this.pads.get(this.active)?.setAttribute('aria-pressed', 'false');
        this.active = null;
    },

    toggleDrone() {
        if (this.droning) return this.stopDrone();
        Notes.press(this.root + this.register, 'drone');
        this.droning = true;
        this.drone.classList.add('drone--on');
        this.drone.setAttribute('aria-pressed', 'true');
    },

    stopDrone() {
        if (!this.droning) return;
        Notes.release(this.root + this.register, 'drone');
        this.droning = false;
        this.drone.classList.remove('drone--on');
        this.drone.setAttribute('aria-pressed', 'false');
    },

    // The blur safety net drops every note, so the buttons must stop claiming
    // to be on — otherwise a lit pad holds nothing.
    clear() {
        this.stopChord();
        this.stopDrone();
    },
};
