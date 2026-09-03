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
// Headroom for an async resume() to land before the envelope starts. Inaudible
// as latency; the difference between a note and silence on iOS.
const RESUME_HEADROOM = 0.06;
const WAVEFORM = 'sawtooth';

export const AudioEngine = {
    ctx: null,

    // Every voice currently sounding. Implementation detail behind stopAll();
    // callers hold their own handles.
    voices: new Set(),

    // Create the AudioContext on a user gesture only (autoplay policy).
    //
    // `webkitAudioContext` is the fallback for older WebKit; current iOS has the
    // unprefixed name, so on most phones this picks the standard one.
    //
    // resume() is async and deliberately not awaited: noteOn must stay
    // synchronous inside the gesture handler, because iOS only honours the
    // gesture on the same tick. The context is therefore still `suspended` when
    // the caller returns — which is why nothing here may schedule against
    // `currentTime`. See startTime().
    ensureContext() {
        if (!this.ctx) {
            const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
            if (!Ctor) throw new Error('Web Audio is not available in this browser');
            this.ctx = new Ctor();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    },

    // When a note starting *now* should actually begin.
    //
    // A suspended context has a frozen clock: `currentTime` reads 0 and stays
    // there until resume() settles, a tick or more later on iOS. Scheduling an
    // envelope at that frozen time puts the whole attack in the past, so by the
    // time the clock starts the note has already been and gone — the app plays
    // silence with no error anywhere. Desktop resumes fast enough to hide it.
    //
    // The small offset gives resume() room to land before the ramp begins. It is
    // inaudible as latency and is the difference between a note and silence.
    startTime() {
        return this.ctx.currentTime + (this.ctx.state === 'running' ? 0 : RESUME_HEADROOM);
    },

    // Start a voice at the given MIDI note and hold it until stop() is called.
    // Returns the handle, so the caller needs no note-id namespace of its own.
    noteOn(midiNumber) {
        const ctx = this.ensureContext();
        const now = this.startTime();

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

                // Never before the note was scheduled to start: a tap released
                // faster than resume() settles would otherwise end the note
                // before it began, which is silence again.
                const end = Math.max(this.startTime(), now + ATTACK);
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
