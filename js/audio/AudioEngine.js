// Web Audio API directly — no framework, no dependency.
import { presetById } from './Presets.js';

// Equal temperament, A4 = 440 Hz at MIDI 69. Pitch conversion lives here
// because it is audio domain knowledge: a second sound source must not
// duplicate it, and the UI must not have to know it.
export function noteToFrequency(midiNumber) {
    return 440 * 2 ** ((midiNumber - 69) / 12);
}

// Envelope shape comes from the selected preset. What stays constant is the
// floor an exponential ramp cannot cross — it never reaches zero, so silence
// has to be approached rather than arrived at.
const SILENCE = 0.0001;
// Headroom for an async resume() to land before the envelope starts. Inaudible
// as latency; the difference between a note and silence on iOS.
const RESUME_HEADROOM = 0.06;

export const AudioEngine = {
    ctx: null,

    // Every voice currently sounding. Implementation detail behind stopAll();
    // callers hold their own handles.
    voices: new Set(),

    preset: presetById('pad'),

    // The shared end of the graph: every voice runs through one filter and one
    // reverb rather than carrying its own. That is cheaper, and it is the
    // behaviour wanted — turning the cutoff should change what is already
    // sounding, not just the next note.
    filter: null,
    reverb: null,

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

    // Build the shared end of the graph once: voices → filter → reverb → out.
    //
    // The reverb is algorithmic — a handful of delay lines fed back through a
    // damping filter. Convolution would sound better, but it needs an
    // impulse-response file, and a binary asset sits badly against the
    // no-dependencies rule for the gain it buys here.
    buildChain(ctx) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = this.preset.cutoff;
        filter.Q.value = this.preset.resonance;

        const dry = ctx.createGain();
        const wet = ctx.createGain();
        dry.gain.value = 1;
        wet.gain.value = this.preset.reverb;

        // Prime numbers of milliseconds, so the delays never line up and the
        // tail reads as a room rather than as a rhythmic echo.
        const damping = ctx.createBiquadFilter();
        damping.type = 'lowpass';
        // Real rooms absorb treble first. Without this the tail sounds metallic.
        damping.frequency.value = 2400;

        for (const ms of [37, 53, 71, 97]) {
            const delay = ctx.createDelay(1);
            delay.delayTime.value = ms / 1000;
            const feedback = ctx.createGain();
            feedback.gain.value = 0.55;

            filter.connect(delay);
            delay.connect(feedback).connect(damping).connect(delay);
            delay.connect(wet);
        }

        filter.connect(dry);
        dry.connect(ctx.destination);
        wet.connect(ctx.destination);

        this.filter = filter;
        this.reverb = wet;
        return filter;
    },

    // The node voices connect to. Everything downstream is shared.
    input() {
        const ctx = this.ensureContext();
        return this.filter ?? this.buildChain(ctx);
    },

    /** Swap the sound. Affects notes started afterwards, not ones already held. */
    setPreset(id) {
        this.preset = presetById(id);
        if (!this.filter) return;
        const now = this.ctx.currentTime;
        // Ramped rather than set: a jump in cutoff on a sounding note is an
        // audible click.
        this.filter.frequency.setTargetAtTime(this.preset.cutoff, now, 0.02);
        this.filter.Q.setTargetAtTime(this.preset.resonance, now, 0.02);
        this.reverb.gain.setTargetAtTime(this.preset.reverb, now, 0.02);
    },

    /** Live filter control — takes effect on notes already sounding. */
    setCutoff(hz) {
        const ctx = this.ensureContext();
        this.input();
        this.filter.frequency.setTargetAtTime(hz, ctx.currentTime, 0.01);
    },

    setResonance(q) {
        const ctx = this.ensureContext();
        this.input();
        this.filter.Q.setTargetAtTime(q, ctx.currentTime, 0.01);
    },

    // Start a voice at the given MIDI note and hold it until stop() is called.
    // Returns the handle, so the caller needs no note-id namespace of its own.
    //
    // A voice is several oscillators, not one: detuned copies beating against
    // each other are most of what separates a synth from a test tone. They
    // share one envelope, so the voice still stops as a single thing.
    noteOn(midiNumber) {
        const ctx = this.ensureContext();
        const destination = this.input();
        const now = this.startTime();
        const { attack, release, peak, voices: layers } = this.preset;

        const frequency = noteToFrequency(midiNumber);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peak, now + attack);
        gain.connect(destination);

        const oscillators = layers.map((layer) => {
            const osc = ctx.createOscillator();
            osc.type = layer.type;
            osc.frequency.value = frequency;
            osc.detune.value = layer.detune;

            const level = ctx.createGain();
            level.gain.value = layer.gain;
            osc.connect(level).connect(gain);
            osc.start(now);
            return osc;
        });

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
                const end = Math.max(this.startTime(), now + attack);
                // Cancel the attack first: releasing mid-attack otherwise ramps
                // from a value the scheduler has not reached yet, which clicks.
                gain.gain.cancelScheduledValues(end);
                gain.gain.setValueAtTime(Math.max(gain.gain.value, SILENCE), end);
                gain.gain.exponentialRampToValueAtTime(SILENCE, end + release);
                for (const osc of oscillators) osc.stop(end + release);
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
