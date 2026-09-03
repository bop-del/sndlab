import { AudioEngine } from '../audio/AudioEngine.js';

export const UI = {
    init() {
        const button = document.getElementById('play');
        const status = document.getElementById('status');

        button.addEventListener('click', () => {
            AudioEngine.playTone({ frequency: 220 });
            status.textContent = `A3 · 220 Hz · ${AudioEngine.ctx.state}`;
        });
    },
};
