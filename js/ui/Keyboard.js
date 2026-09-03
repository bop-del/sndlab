import { AudioEngine } from '../audio/AudioEngine.js';

// Two octaves, C to C. MIDI 60 is middle C.
const FIRST_NOTE = 60;
const NOTE_COUNT = 25;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const isBlack = (midiNumber) => NOTE_NAMES[midiNumber % 12].includes('#');

// Kept in step with .key--white / .key--black in css/base.css.
const WHITE_WIDTH = 44;
const BLACK_WIDTH = 28;

// The Ableton computer-MIDI layout: two chromatic rows, no shared keys. The
// ticket named `awsedftgyhuj` for the lower octave, but that collides with the
// upper row on w/e/t/y/u — the Z row is the conventional resolution and the one
// muscle memory actually carries.
const LOWER_ROW = 'zsxdcvgbhnjm';
const UPPER_ROW = 'q2w3er5t6y7u';

const KEY_TO_NOTE = new Map();
for (const [i, key] of [...LOWER_ROW].entries()) KEY_TO_NOTE.set(key, FIRST_NOTE + i);
for (const [i, key] of [...UPPER_ROW].entries()) KEY_TO_NOTE.set(key, FIRST_NOTE + 12 + i);

export const Keyboard = {
    // One source of truth for what is sounding: MIDI number → voice handle.
    // Two stores is where "key stuck lit after mouse-out" lives.
    held: new Map(),
    keys: new Map(), // MIDI number → element

    // Who is holding each sounding note. A note is released only when the last
    // holder lets go, so clicking a note the computer keyboard is already
    // holding does not cut it short when the mouse comes up.
    holders: new Map(), // MIDI number → Set of owner tokens

    // What each input path grabbed, so a release stops the note that was
    // actually pressed. Resolving it again at release time is wrong: focus can
    // move mid-hold, and then the wrong note gets released and the real one
    // sticks.
    //
    // Both are keyed rather than single slots, because both can hold several
    // notes at once: two fingers on a touchscreen, or Space and Enter together.
    // A single slot loses the first press and strands its note, sounding, for
    // good.
    pointerNotes: new Map(), // pointerId → MIDI number
    activationNotes: new Map(), // KeyboardEvent.code → MIDI number

    init(container) {
        this.render(container);
        this.bindPointer(container);
        this.bindComputerKeyboard();

        // A lost keyup — switching away mid-hold — otherwise leaves a note
        // sounding until reload.
        window.addEventListener('blur', () => this.releaseAll());
    },

    render(container) {
        const row = document.createElement('div');
        row.className = 'keyboard__keys';

        // Black keys are positioned over the white row rather than flowing in
        // it, so each needs to know how many white keys precede it.
        let whiteCount = 0;

        for (let i = 0; i < NOTE_COUNT; i++) {
            const midiNumber = FIRST_NOTE + i;
            const name = NOTE_NAMES[midiNumber % 12];
            const black = isBlack(midiNumber);

            const key = document.createElement('button');
            key.type = 'button';
            key.className = `key ${black ? 'key--black' : 'key--white'}`;
            key.dataset.note = String(midiNumber);
            key.setAttribute('aria-label', `${name}${Math.floor(midiNumber / 12) - 1}`);

            // Centre it on the boundary after the white keys placed so far,
            // which is what leaves the E–F and B–C gaps black-key-free.
            if (black) key.style.left = `${whiteCount * WHITE_WIDTH - BLACK_WIDTH / 2}px`;
            else whiteCount++;

            this.keys.set(midiNumber, key);
            row.append(key);
        }

        container.replaceChildren(row);
    },

    press(midiNumber, owner) {
        const holders = this.holders.get(midiNumber) ?? new Set();
        holders.add(owner);
        this.holders.set(midiNumber, holders);

        // Already sounding — a key repeat, or the other input path got here
        // first. The note keeps playing; this owner just joins the holders.
        if (this.held.has(midiNumber)) return;

        this.held.set(midiNumber, AudioEngine.noteOn(midiNumber));
        this.keys.get(midiNumber)?.classList.add('key--pressed');
    },

    release(midiNumber, owner) {
        const holders = this.holders.get(midiNumber);
        if (holders) {
            holders.delete(owner);
            // Someone else is still holding it — nothing to stop yet.
            if (holders.size > 0) return;
            this.holders.delete(midiNumber);
        }

        const voice = this.held.get(midiNumber);
        if (!voice) return;
        this.held.delete(midiNumber);
        voice.stop();
        this.keys.get(midiNumber)?.classList.remove('key--pressed');
    },

    // Drop every note, whoever is holding it: the blur safety net, where the
    // browser will deliver no keyup at all. Clears the UI's own state first,
    // then lets the engine silence anything still sounding.
    releaseAll() {
        for (const midiNumber of [...this.held.keys()]) {
            this.holders.delete(midiNumber);
            this.release(midiNumber);
        }
        this.holders.clear();
        this.pointerNotes.clear();
        this.activationNotes.clear();
        AudioEngine.stopAll();
    },

    bindPointer(container) {
        container.addEventListener('pointerdown', (event) => {
            const midiNumber = noteOf(event.target);
            if (midiNumber === null) return;

            // Do not let the click focus the key. A focused key answers Space,
            // and Space is the panic reflex on an instrument — it must not
            // replay the last key clicked. Tab still reaches the keys.
            event.preventDefault();

            this.pointerNotes.set(event.pointerId, midiNumber);
            // The owner token carries the pointer id, so two fingers on the
            // same key are two holders and the first to lift does not stop it.
            this.press(midiNumber, `pointer:${event.pointerId}`);
        });

        // Release from the document, not the key. A pointer dragged off the key
        // before it is lifted still stops the note. Not covered by a check —
        // driving it in Playwright is the flakiest assertion of the set, and a
        // check that goes red spuriously is a check that gets ignored.
        //
        // Each pointer releases only the note it pressed: notes held on the
        // computer keyboard, or under another finger, must survive.
        for (const type of ['pointerup', 'pointercancel']) {
            document.addEventListener(type, (event) => {
                const midiNumber = this.pointerNotes.get(event.pointerId);
                if (midiNumber === undefined) return;
                this.pointerNotes.delete(event.pointerId);
                this.release(midiNumber, `pointer:${event.pointerId}`);
            });
        }
    },

    bindComputerKeyboard() {
        window.addEventListener('keydown', (event) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;

            // A focused key responds to Space and Enter, so tabbing to a key and
            // holding it plays it — otherwise the keys are buttons that do
            // nothing when activated the standard way. The note is remembered
            // here, because focus may have moved by the time the keyup lands.
            if (isActivation(event)) {
                if (this.activationNotes.has(event.code)) return; // auto-repeat
                const focused = noteOf(document.activeElement);
                if (focused === null) return;
                event.preventDefault();
                this.activationNotes.set(event.code, focused);
                this.press(focused, `key:${event.code}`);
                return;
            }

            const midiNumber = KEY_TO_NOTE.get(event.key.toLowerCase());
            if (midiNumber === undefined) return;
            event.preventDefault();
            // press() does not retrigger a note already held, so auto-repeat is
            // harmless.
            this.press(midiNumber, 'note-row');
        });

        window.addEventListener('keyup', (event) => {
            if (isActivation(event)) {
                // Only the note this very key started: a stray Space keyup must
                // not release what Enter is holding, and vice versa.
                const midiNumber = this.activationNotes.get(event.code);
                if (midiNumber === undefined) return;
                this.activationNotes.delete(event.code);
                this.release(midiNumber, `key:${event.code}`);
                return;
            }

            const midiNumber = KEY_TO_NOTE.get(event.key.toLowerCase());
            if (midiNumber === undefined) return;
            this.release(midiNumber, 'note-row');
        });
    },
};

const isActivation = (event) => event.key === ' ' || event.key === 'Enter';

function noteOf(element) {
    const note = element?.closest?.('.key')?.dataset.note;
    return note === undefined ? null : Number(note);
}
