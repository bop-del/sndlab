import { AudioEngine } from './AudioEngine.js';

// Who is holding which note, and therefore what is sounding.
//
// Extracted from Keyboard so that the chord pads and the root drone can hold
// notes on the same terms. The keyboard is one source of notes among several —
// press the C key while a chord pad is already sounding C and the note must
// survive whichever of them lets go first.
//
// The rules here were arrived at by fixing stuck and lost notes one at a time;
// they look fussier than they are. The two that matter:
//
//   - A note sounds once, however many owners hold it, and stops when the last
//     one lets go. Retriggering on a second press would cut the first note's
//     envelope; stopping on the first release would strand the other holder.
//   - An owner token identifies *who* is holding, not what: `pointer:3`,
//     `key:KeyZ`, `pad:iv`, `drone`. Two fingers on one key are two owners.
export const Notes = {
    held: new Map(), // MIDI number → voice handle
    holders: new Map(), // MIDI number → Set of owner tokens

    // Called when a note starts and stops sounding, so a view can light up.
    // Set by whoever renders notes; several listeners are allowed because the
    // keyboard and the chord pads both show state for the same note.
    listeners: new Set(),

    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    },

    announce(midiNumber, sounding) {
        for (const listener of this.listeners) listener(midiNumber, sounding);
    },

    isHeld(midiNumber) {
        return this.held.has(midiNumber);
    },

    press(midiNumber, owner) {
        const holders = this.holders.get(midiNumber) ?? new Set();
        holders.add(owner);
        this.holders.set(midiNumber, holders);

        // Already sounding — a key repeat, or another owner got here first. The
        // note keeps playing; this owner just joins the holders.
        if (this.held.has(midiNumber)) return;

        this.held.set(midiNumber, AudioEngine.noteOn(midiNumber));
        this.announce(midiNumber, true);
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
        this.announce(midiNumber, false);
    },

    // Drop every note, whoever is holding it: the blur safety net, where the
    // browser will deliver no keyup at all. Clears this module's own state
    // first, then lets the engine silence anything still sounding.
    releaseAll() {
        for (const midiNumber of [...this.held.keys()]) {
            this.holders.delete(midiNumber);
            this.release(midiNumber);
        }
        this.holders.clear();
        AudioEngine.stopAll();
    },
};
