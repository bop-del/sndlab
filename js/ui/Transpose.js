// Where the two typing rows start playing.
//
// Three fixed positions rather than an open-ended stepper. A stepper is the
// right pattern for a wide range and the wrong one for exactly three values,
// where it hides two-thirds of the state behind arithmetic and needs disabled
// handling at both ends. A select costs two clicks for a control that is played
// rather than configured.
//
// The value names where the rows *start* — C3, C4, C5 — not an offset from
// somewhere. A control that reads "−1" tells you about a delta; one that reads
// "C3" tells you where your hands are.
const POSITIONS = [48, 60, 72]; // C3, C4, C5
const DEFAULT = 60; // C4 — today's behaviour, so the default changes nothing

// Bound by physical position, like the note rows and for the same reason: a
// control's identity is where it is under the hand, not what character it
// produces on one layout.
//
// Ableton binds Z and X to octave down and up, and this app cannot: those are
// the C and D of the lower playing row. That is the price of the two-row layout
// — Live has one octave of keys and spends Z/X on moving it. `,` and `.` sit
// immediately right of the lower row's last key, so the hand is already there,
// and the keycaps read as `<` and `>`.
const DOWN = 'Comma';
const UP = 'Period';

export const Transpose = {
    value: DEFAULT,
    listeners: new Set(),
    buttons: new Map(), // MIDI number → element

    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    },

    init(container) {
        this.render(container);
        this.bindKeys();
        this.announce();
    },

    render(container) {
        const row = document.createElement('div');
        row.className = 'transpose';
        // Named, because three unlabelled buttons beside the scale picker do
        // not say what they do.
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', 'Typing octave');

        for (const note of POSITIONS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'transpose__button';
            // A stable data attribute naming the octave, mirroring how the pads
            // carry their degree index, so checks address it the way they
            // already address pads.
            button.dataset.octave = String(octaveName(note));
            button.textContent = octaveName(note);
            button.setAttribute('aria-pressed', String(note === this.value));
            button.addEventListener('click', () => this.set(note));
            this.buttons.set(note, button);
            row.append(button);
        }

        container.replaceChildren(row);
        this.mark();
    },

    // Clamp, do not wrap. Pressing down at the bottom is a no-op: wrapping would
    // silently throw the player two octaves the other way mid-phrase.
    step(direction) {
        const index = POSITIONS.indexOf(this.value);
        const next = POSITIONS[Math.min(Math.max(index + direction, 0), POSITIONS.length - 1)];
        this.set(next);
    },

    set(note) {
        if (note === this.value) return;
        this.value = note;
        this.mark();
        this.announce();
    },

    // The latched position, visible rather than inferred from what you hear.
    mark() {
        for (const [note, button] of this.buttons) {
            const on = note === this.value;
            button.classList.toggle('transpose__button--on', on);
            button.setAttribute('aria-pressed', String(on));
        }
    },

    bindKeys() {
        window.addEventListener('keydown', (event) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.code !== DOWN && event.code !== UP) return;
            event.preventDefault();
            this.step(event.code === DOWN ? -1 : 1);
        });
    },

    announce() {
        for (const listener of this.listeners) listener(this.value);
    },
};

// MIDI 60 is C4, so the octave number is the note divided by twelve, less one.
const octaveName = (midiNumber) => `C${Math.floor(midiNumber / 12) - 1}`;
