import { Notes } from '../audio/Notes.js';
import { ChordPads } from './ChordPads.js';
import { Keyboard } from './Keyboard.js';
import { ScalePicker } from './ScalePicker.js';
import { SoundControls } from './SoundControls.js';

// Composition root: find the mount points, hand them to the components, and
// wire the dependencies between them. Everything hangs off the selected scale.
export const UI = {
    init() {
        Keyboard.init(document.getElementById('keyboard'));
        ChordPads.init(document.getElementById('chord-pads'));

        ScalePicker.onChange((root, scale) => {
            Keyboard.showScale(root, scale);
            ChordPads.setScale(root, scale);
        });
        ScalePicker.init(document.getElementById('scale-picker'));
        SoundControls.init(document.getElementById('sound-controls'));

        // Blur drops every note however it was started, so the pads must stop
        // claiming to be on — a lit pad holding nothing is a lie about state.
        window.addEventListener('blur', () => ChordPads.clear());
    },
};
