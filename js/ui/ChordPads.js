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

// Two octaves below the keyboard, so a chord and a melody do not collide.
const CHORD_OCTAVE = -24;
const DRONE_OCTAVE = -24;

export const ChordPads = {
    root: 60,
    scale: null,
    chords: [],
    pads: new Map(), // degree index → element

    // Which pad is latched. One at a time: two triads at once is mud, and mud
    // hides the interval this exists to make audible.
    active: null,
    droning: false,

    init(container) {
        this.container = container;
    },

    setScale(root, scale) {
        this.root = root;
        this.scale = scale;
        this.chords = chordsIn(root, scale);

        // A latched chord belongs to the scale that built it, so switching
        // scales must not leave it sounding — it would be a chord from nowhere.
        this.stopChord();
        if (this.droning) this.stopDrone();

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
        for (const note of chord.notes) Notes.press(note + CHORD_OCTAVE, `pad:${degreeIndex}`);
        this.active = degreeIndex;
        this.pads.get(degreeIndex)?.classList.add('pad--on');
        this.pads.get(degreeIndex)?.setAttribute('aria-pressed', 'true');
    },

    stopChord() {
        if (this.active === null) return;
        const chord = this.chords[this.active];
        for (const note of chord.notes) Notes.release(note + CHORD_OCTAVE, `pad:${this.active}`);
        this.pads.get(this.active)?.classList.remove('pad--on');
        this.pads.get(this.active)?.setAttribute('aria-pressed', 'false');
        this.active = null;
    },

    toggleDrone() {
        if (this.droning) return this.stopDrone();
        Notes.press(this.root + DRONE_OCTAVE, 'drone');
        this.droning = true;
        this.drone.classList.add('drone--on');
        this.drone.setAttribute('aria-pressed', 'true');
    },

    stopDrone() {
        if (!this.droning) return;
        Notes.release(this.root + DRONE_OCTAVE, 'drone');
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
