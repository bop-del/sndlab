// Web Audio API directly — no framework, no dependency.

// Equal temperament, A4 = 440 Hz at MIDI 69. Pitch conversion lives here
// because it is audio domain knowledge: a second sound source must not
// duplicate it, and the UI must not have to know it.
export function noteToFrequency(midiNumber) {
    return 440 * 2 ** ((midiNumber - 69) / 12);
}

// Envelope constants. Deliberately not parameters — parameters are a Patch
// concern, and Patch belongs to the instrument-character work (#1).
const ATTACK = 0.01; // s to full level
const RELEASE = 0.08; // s to silence; short and exponential so notes do not click
const PEAK = 0.3;
const WAVEFORM = 'sawtooth';

export const AudioEngine = {
    ctx: null,

    // Every voice currently sounding. Implementation detail behind stopAll();
    // callers hold their own handles.
    voices: new Set(),

    // Create the AudioContext on a user gesture only (autoplay policy).
    ensureContext() {
        if (!this.ctx) {
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    },

    // Start a voice at the given MIDI note and hold it until stop() is called.
    // Returns the handle, so the caller needs no note-id namespace of its own.
    noteOn(midiNumber) {
        const ctx = this.ensureContext();
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = WAVEFORM;
        osc.frequency.value = noteToFrequency(midiNumber);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(PEAK, now + ATTACK);

        osc.connect(gain).connect(ctx.destination);
        osc.start(now);

        let stopped = false;
        const voice = {
            midiNumber,
            stop: () => {
                if (stopped) return;
                stopped = true;
                this.voices.delete(voice);

                const end = ctx.currentTime;
                // Cancel the attack first: releasing mid-attack otherwise ramps
                // from a value the scheduler has not reached yet, which clicks.
                gain.gain.cancelScheduledValues(end);
                gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), end);
                gain.gain.exponentialRampToValueAtTime(0.0001, end + RELEASE);
                osc.stop(end + RELEASE);
            },
        };

        this.voices.add(voice);
        return voice;
    },

    // Silence everything currently sounding. The engine's own last resort: it
    // knows nothing about who was holding what, so a caller tracking notes must
    // clear its own state first or it will be left showing keys that no longer
    // sound. Keyboard.releaseAll() does exactly that.
    stopAll() {
        for (const voice of [...this.voices]) voice.stop();
    },
};
