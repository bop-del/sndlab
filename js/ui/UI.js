import { Keyboard } from './Keyboard.js';

// Composition root: find the mount points, hand them to the components.
export const UI = {
    init() {
        Keyboard.init(document.getElementById('keyboard'));
    },
};
