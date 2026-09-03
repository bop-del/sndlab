import { Keyboard } from './Keyboard.js';
import { ScalePicker } from './ScalePicker.js';

// Composition root: find the mount points, hand them to the components, and
// wire the one dependency between them — the keyboard highlights whatever the
// picker selects.
export const UI = {
    init() {
        Keyboard.init(document.getElementById('keyboard'));
        ScalePicker.onChange((root, scale) => Keyboard.showScale(root, scale));
        ScalePicker.init(document.getElementById('scale-picker'));
    },
};
