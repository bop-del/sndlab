import { NOTE_NAMES, SCALES, scaleById } from '../theory/Scales.js';

// Which scale is selected, and the one sentence saying what to listen for.
//
// Holds the current root and scale for the whole app: the keyboard highlights
// from it, and the chord pads will build from it. Anything that needs to know
// the key asks here.
export const ScalePicker = {
    // C, not E. E Phrygian is every white key and no black one, so it is
    // correct and looks like nothing — the highlighting appears broken when it
    // is not. C Phrygian uses four black keys, so the marked notes are visibly
    // a pattern, and the feature demonstrates itself.
    root: 60,
    scale: scaleById('phrygian'),
    listeners: new Set(),

    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    },

    init(container) {
        this.render(container);
        this.announce();
    },

    render(container) {
        const rootSelect = document.createElement('select');
        rootSelect.id = 'root';
        rootSelect.setAttribute('aria-label', 'Root note');
        // One octave of roots. Which octave they name is a detail: a scale is a
        // shape, and C4 and C5 are the same shape.
        for (let i = 0; i < 12; i++) {
            const midiNumber = 60 + i;
            const option = new Option(NOTE_NAMES[i], String(midiNumber), false, midiNumber === this.root);
            rootSelect.append(option);
        }

        const scaleSelect = document.createElement('select');
        scaleSelect.id = 'scale';
        scaleSelect.setAttribute('aria-label', 'Scale');
        for (const scale of SCALES) {
            scaleSelect.append(new Option(scale.name, scale.id, false, scale.id === this.scale.id));
        }

        const why = document.createElement('p');
        why.id = 'why';
        why.className = 'why';

        rootSelect.addEventListener('change', () => {
            this.root = Number(rootSelect.value);
            this.announce();
        });
        scaleSelect.addEventListener('change', () => {
            this.scale = scaleById(scaleSelect.value);
            this.announce();
        });

        const row = document.createElement('div');
        row.className = 'scale-picker';
        row.append(rootSelect, scaleSelect);
        container.replaceChildren(row, why);

        this.why = why;
    },

    announce() {
        this.why.textContent = this.scale.why;
        for (const listener of this.listeners) listener(this.root, this.scale);
    },
};
