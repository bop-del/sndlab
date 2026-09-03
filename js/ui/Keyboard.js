import { Notes } from '../audio/Notes.js';
import { inScale } from '../theory/Scales.js';

// Four octaves, C2 to C6. MIDI 60 is middle C, so the range starts two octaves
// below it — which is where the chord pads and the drone sound. The upper half
// is the played range; the lower half exists so a chord is visible as notes
// rather than as a roman numeral, and so it can be clicked.
const FIRST_NOTE = 36;
const NOTE_COUNT = 49;

// Where the computer-keyboard rows start playing. The rows keep C4–C6: nothing
// needs to type a C2, and moving them would break muscle memory that works.
const TYPING_FIRST_NOTE = 60;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const isBlack = (midiNumber) => NOTE_NAMES[midiNumber % 12].includes('#');

// How many white keys the range has. This is the one number black-key placement
// needs: a black key sits at `n / WHITE_COUNT` of the row's width, so the offset
// is a fraction and nothing here knows how wide a key is in pixels. Key size is
// decided in css/base.css alone (issue #13) — the two used to be written down
// twice and kept in step by hand.
const WHITE_COUNT = [...Array(NOTE_COUNT).keys()].filter((i) => !isBlack(FIRST_NOTE + i)).length;

// The Ableton computer-MIDI layout: two chromatic rows, no shared keys. The
// ticket named `awsedftgyhuj` for the lower octave, but that collides with the
// upper row on w/e/t/y/u — the Z row is the conventional resolution and the one
// muscle memory actually carries.
//
// Keyed by physical position (`KeyboardEvent.code`), not by the character the
// key produces. A piano row is a shape under the hand, so what matters is where
// the key *is*: on QWERTZ the bottom-left key reports 'y', on AZERTY 'w'. Using
// event.key scrambles the row for everyone not on QWERTY; using event.code makes
// every layout work with no detection, because the position is the identity.
const LOWER_ROW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM'];
const UPPER_ROW = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU'];

const KEY_TO_NOTE = new Map();
for (const [i, code] of LOWER_ROW.entries()) KEY_TO_NOTE.set(code, TYPING_FIRST_NOTE + i);
for (const [i, code] of UPPER_ROW.entries()) KEY_TO_NOTE.set(code, TYPING_FIRST_NOTE + 12 + i);

// Note ownership lives in Notes: the keyboard is one source among several, and
// the chord pads and drone hold notes on the same terms. What stays here is the
// keyboard's own business — its keys, their lit state, and its two input paths.
export const Keyboard = {
    keys: new Map(), // MIDI number → element

    // What each input path grabbed, so a release stops the note that was
    // actually pressed. Resolving it again at release time is wrong: focus can
    // move mid-hold, and then the wrong note gets released and the real one
    // sticks.
    //
    // Each is keyed rather than a single slot, because each can hold several
    // notes at once: two fingers on a touchscreen, Space and Enter together,
    // two row keys under two fingers. A single slot loses the first press and
    // strands its note, sounding, for good.
    pointerNotes: new Map(), // pointerId → MIDI number
    activationNotes: new Map(), // KeyboardEvent.code → MIDI number
    rowNotes: new Map(), // KeyboardEvent.code → MIDI number

    init(container) {
        this.render(container);
        this.bindPointer(container);
        this.bindComputerKeyboard();

        // Light the key whoever started the note — a note played by a chord pad
        // shows on the keyboard too, which is the point of one shared store.
        Notes.onChange((midiNumber, sounding) => {
            this.keys.get(midiNumber)?.classList.toggle('key--pressed', sounding);
        });

        // A lost keyup — switching away mid-hold — otherwise leaves a note
        // sounding until reload.
        window.addEventListener('blur', () => this.releaseAll());
    },

    // Mark which keys belong to the selected scale. Out-of-scale keys stay
    // playable — muting them would hide the very contrast being taught.
    showScale(root, scale) {
        for (const [midiNumber, key] of this.keys) {
            key.classList.toggle('key--in-scale', inScale(midiNumber, root, scale));
        }
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
            // The hairline marks where the typing rows begin — a boundary in
            // what the computer keyboard reaches, not in what is playable:
            // every key below it still sounds when clicked.
            const typingStart = midiNumber === TYPING_FIRST_NOTE ? ' key--typing-start' : '';
            key.className = `key ${black ? 'key--black' : 'key--white'}${typingStart}`;
            key.dataset.note = String(midiNumber);
            key.setAttribute('aria-label', `${name}${Math.floor(midiNumber / 12) - 1}`);

            // Put its *left edge* on the boundary after the white keys placed
            // so far — which is what leaves the E–F and B–C gaps
            // black-key-free — and let the stylesheet centre it on that
            // boundary with a translate. A percentage resolves against the
            // white row's width, so the boundary is still the boundary at any
            // window width; centring in CSS is what keeps the black key's own
            // width out of this file.
            if (black) key.style.left = `${(whiteCount / WHITE_COUNT) * 100}%`;
            else whiteCount++;

            this.keys.set(midiNumber, key);
            row.append(key);
        }

        container.replaceChildren(row);
    },

    press(midiNumber, owner) {
        Notes.press(midiNumber, owner);
    },

    release(midiNumber, owner) {
        Notes.release(midiNumber, owner);
    },

    // The blur safety net. Clears this view's own per-input state, then drops
    // every note however it was started — including any held by a chord pad.
    releaseAll() {
        this.pointerNotes.clear();
        this.activationNotes.clear();
        this.rowNotes.clear();
        Notes.releaseAll();
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

            const midiNumber = KEY_TO_NOTE.get(event.code);
            if (midiNumber === undefined) return;
            event.preventDefault();
            if (this.rowNotes.has(event.code)) return; // auto-repeat
            // Remembered per key, so the keyup releases what this keydown
            // started rather than whatever the mapping says by then.
            this.rowNotes.set(event.code, midiNumber);
            // The owner token names the key, not the row: two keys held at once
            // are two holders, and one letting go leaves the other sounding.
            this.press(midiNumber, `row:${event.code}`);
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

            const midiNumber = this.rowNotes.get(event.code);
            if (midiNumber === undefined) return;
            this.rowNotes.delete(event.code);
            this.release(midiNumber, `row:${event.code}`);
        });
    },
};

const isActivation = (event) => event.key === ' ' || event.key === 'Enter';

function noteOf(element) {
    const note = element?.closest?.('.key')?.dataset.note;
    return note === undefined ? null : Number(note);
}
