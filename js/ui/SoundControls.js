import { AudioEngine } from '../audio/AudioEngine.js';
import { PRESETS, presetById } from '../audio/Presets.js';

// Preset, cutoff and resonance.
//
// The sliders move the shared filter, so they change notes already sounding —
// a filter you can only hear on the *next* note is not an instrument control,
// it is a setting. Sweeping the cutoff under a held chord is the single most
// characteristic gesture in electronic music.
export const SoundControls = {
    init(container) {
        const preset = document.createElement('select');
        preset.id = 'preset';
        preset.setAttribute('aria-label', 'Sound');
        for (const p of PRESETS) preset.append(new Option(p.name, p.id));

        // The cutoff slider is positional, not in hertz. Pitch is heard
        // logarithmically: on a linear 120–8000 scale, everything musically
        // interesting is crammed into the first tenth of the travel, and a
        // perfectly good 900 Hz pad shows a slider that looks switched off.
        // Position 0–1 maps onto the range geometrically, so equal movement is
        // equal musical distance.
        const cutoff = slider('cutoff', 'Cutoff', 0, 1, hzToPosition(PRESETS[0].cutoff), 0.001);
        const resonance = slider('resonance', 'Resonance', 0.5, 18, PRESETS[0].resonance, 0.5);

        preset.addEventListener('change', () => {
            AudioEngine.setPreset(preset.value);
            // The sliders show where the new preset put the filter, so they
            // never lie about what you are hearing.
            const chosen = presetById(preset.value);
            cutoff.input.value = String(hzToPosition(chosen.cutoff));
            resonance.input.value = String(chosen.resonance);
        });

        cutoff.input.addEventListener('input', () => AudioEngine.setCutoff(positionToHz(Number(cutoff.input.value))));
        resonance.input.addEventListener('input', () => AudioEngine.setResonance(Number(resonance.input.value)));

        const row = document.createElement('div');
        row.className = 'sound-controls';
        row.append(preset, cutoff.field, resonance.field);
        container.replaceChildren(row);
    },
};

// The audible range of a low-pass on this material. Below ~120 Hz everything
// is gone; above ~9 kHz the filter is doing nothing you can hear.
const MIN_HZ = 120;
const MAX_HZ = 9000;

const positionToHz = (position) => MIN_HZ * (MAX_HZ / MIN_HZ) ** position;
const hzToPosition = (hz) => Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ);

function slider(id, label, min, max, value, step) {
    const field = document.createElement('label');
    field.className = 'control';
    field.textContent = label;

    const input = document.createElement('input');
    input.type = 'range';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);

    field.append(input);
    return { field, input };
}
