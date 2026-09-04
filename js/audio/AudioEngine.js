// Web Audio API directly — no framework, no dependency.
//
// The shared end of the graph, the context, and the presets a note is played
// with. Building the note itself lives in Voice.js — the seam issue #33 named,
// split when this file approached the 500 lines rule 5 allows.
import { KICK, presetById } from './Presets.js';
import { createVoice } from './Voice.js';
import { noteToFrequency } from './pitch.js';

// Re-exported: this was the import site before the split, and every caller
// already asks the engine for it.
export { noteToFrequency };

// Envelope shape comes from the selected preset. What stays constant is the
// floor an exponential ramp cannot cross — it never reaches zero, so silence
// has to be approached rather than arrived at.
const SILENCE = 0.0001;
// Where the shared filter rests: effectively open, so it colours nothing until
// the player moves it. The preset's own cutoff lives on the per-voice filter.
const SHARED_CUTOFF_OPEN = 9000;
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
    // The last node before the destination. The kick connects here, past the
    // player's filter but still under the limiter.
    limiter: null,

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
        // The player's control, not a second copy of the preset's. Each voice
        // has its own filter and envelope doing the tone shaping; setting this
        // one to the preset cutoff as well put two lowpasses in series at the
        // same frequency and made every note sound distant.
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = SHARED_CUTOFF_OPEN;
        filter.Q.value = 0.7; // gentle: resonance belongs to the voice filter

        const dry = ctx.createGain();
        const wet = ctx.createGain();
        dry.gain.value = 1;
        wet.gain.value = this.preset.reverb;

        // Four comb filters in parallel, each with its own damped feedback
        // loop, summed into the wet bus — the Schroeder/Freeverb shape.
        //
        // The first version ran away. Every comb was fed at full level and fed
        // back at 0.55, and with four summing into one bus the loop gain was
        // well over 1, so it self-oscillated: measured output peaked above 24,
        // twenty-four times full scale. That howl was most of "sounds really
        // bad". Two things keep it stable: each comb takes a quarter of the
        // input, and each damps inside its own loop rather than sharing one
        // filter, which had joined four loops into a single much louder one.
        const spread = ctx.createGain();
        spread.gain.value = 0.25;
        filter.connect(spread);

        // Output trim. Per-note gains are set low so a six-voice chord has
        // headroom, which leaves a single note too quiet to enjoy — this makes
        // up the difference after the sum, where the limiter can still catch a
        // pile-up. Raising the per-note gains instead would trade one problem
        // for the other.

        for (const ms of [29.7, 37.1, 41.1, 43.7]) {
            const delay = ctx.createDelay(1);
            delay.delayTime.value = ms / 1000;

            const feedback = ctx.createGain();
            feedback.gain.value = 0.7; // clear of 1, so the tail decays

            const damping = ctx.createBiquadFilter();
            damping.type = 'lowpass';
            damping.frequency.value = 3000; // rooms absorb treble first

            spread.connect(delay);
            delay.connect(damping).connect(feedback).connect(delay);
            delay.connect(wet);
        }

        // Nothing caps how many notes sound at once — a chord plus a drone
        // plus a melody is six voices — and dividing gain by voice count would
        // make single notes weak to guard against a rare case. Tone's Limiter
        // recipe instead: brick-wall ratio, fast release, threshold just under
        // full scale, so ordinary playing passes untouched.
        const trim = ctx.createGain();
        trim.gain.value = 2.6;

        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -6;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.05;
        limiter.knee.value = 0;

        filter.connect(dry);
        dry.connect(trim);
        wet.connect(trim);
        trim.connect(limiter);
        limiter.connect(ctx.destination);

        this.filter = filter;
        this.reverb = wet;
        this.limiter = limiter;
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
        // Only the reverb amount belongs to the preset here; the shared filter
        // is the player's and stays where they left it.
        this.reverb.gain.setTargetAtTime(this.preset.reverb, this.ctx.currentTime, 0.02);
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
        // ensureContext() first: startTime() reads the context's clock, and on
        // the very first note there is no context until this call builds one.
        this.ensureContext();
        return this.startVoice(midiNumber, this.startTime());
    },

    /**
     * A note that starts at a given time on the audio clock and stops itself.
     *
     * What the clock needs and noteOn cannot give it: noteOn starts now and is
     * held until the caller releases it, which is right for a key under a
     * finger and wrong for a sequenced step nobody is holding. The duration is
     * the step's, so the note ends without anything having to remember it.
     *
     * `when` comes from the clock and is already past startTime()'s resume
     * headroom — this must not add its own, or every scheduled note would drift
     * later than the step it belongs to.
     */
    noteAt(midiNumber, when, duration = 0.12, articulation = {}) {
        this.ensureContext();
        const voice = this.startVoice(midiNumber, when, articulation);
        // A slid step is not released here: the next step bends this same voice
        // and takes over responsibility for ending it. Releasing on schedule
        // would cut the note the glide is supposed to travel through.
        if (articulation.hold) return voice;
        // Scheduled on the audio clock rather than by a timer: a setTimeout
        // release would jitter against a sample-accurate start, which is
        // audible as an uneven gate length.
        voice.stopAt(when + duration, { holdThroughAttack: false });
        return voice;
    },

    /**
     * Start a voice. Delegates to Voice.js, which owns everything between a
     * note beginning and ending; the engine owns the chain it runs through.
     */
    startVoice(midiNumber, now, articulation) {
        return createVoice(this, midiNumber, now, articulation);
    },

    kickAt(when) {
        const ctx = this.ensureContext();
        this.input(); // builds the chain if this is the first sound

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        // Assigned as well as scheduled. Scheduled automation does not move the
        // param's own `value`, which stays at the 440 Hz default — so anything
        // reading the node afterwards (a check, a debugger) would be told this
        // oscillator is an A above middle C rather than a kick.
        osc.frequency.value = KICK.startFrequency;
        // The pitch drop, which is what makes it a kick rather than a low beep.
        // Exponential, because pitch is heard logarithmically — a linear fall
        // sounds like it stalls halfway down.
        osc.frequency.setValueAtTime(KICK.startFrequency, when);
        osc.frequency.exponentialRampToValueAtTime(KICK.frequency, when + KICK.pitchDecay);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(KICK.peak, when + KICK.attack);
        gain.gain.exponentialRampToValueAtTime(SILENCE, when + KICK.decay);

        // Past the shared filter, but still through the limiter — the one thing
        // that must see it, since a kick under a bass note is where a pile-up
        // would happen.
        osc.connect(gain).connect(this.limiter);
        osc.start(when);
        osc.stop(when + KICK.decay + 0.02);
        return osc;
    },

    // Silence everything currently sounding. The engine's own last resort: it
    // knows nothing about who was holding what, so a caller tracking notes must
    // clear its own state first or it will be left showing keys that no longer
    // sound. Keyboard.releaseAll() does exactly that.
    stopAll() {
        for (const voice of [...this.voices]) voice.stop();
    },
};
