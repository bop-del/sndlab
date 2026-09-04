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
    noteAt(midiNumber, when, duration = 0.12) {
        this.ensureContext();
        const voice = this.startVoice(midiNumber, when);
        // Scheduled on the audio clock rather than by a timer: a setTimeout
        // release would jitter against a sample-accurate start, which is
        // audible as an uneven gate length.
        voice.stopAt(when + duration, { holdThroughAttack: false });
        return voice;
    },

    startVoice(midiNumber, now) {
        const ctx = this.ensureContext();
        const destination = this.input();
        const { attack, release, peak, voices: layers } = this.preset;

        const frequency = noteToFrequency(midiNumber);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peak, now + attack);

        // Each voice gets its own filter so the cutoff moves over the life of
        // *that note*. A note that starts bright and darkens is most of what
        // separates a synth from a tone generator, and a static cutoff was the
        // single biggest thing missing from the first version.
        const env = this.preset.filterEnvelope;
        const voiceFilter = ctx.createBiquadFilter();
        voiceFilter.type = 'lowpass';
        voiceFilter.Q.value = this.preset.resonance;

        const base = this.preset.cutoff;
        const open = Math.min(base * 2 ** env.octaves, 18000);
        const sustained = Math.min(base * 2 ** (env.octaves * env.sustain), 18000);
        voiceFilter.frequency.setValueAtTime(base, now);
        voiceFilter.frequency.linearRampToValueAtTime(open, now + env.attack);
        // Exponential: brightness is heard logarithmically, so a linear fall
        // sounds like it stops moving halfway down.
        voiceFilter.frequency.exponentialRampToValueAtTime(
            Math.max(sustained, 40),
            now + env.attack + env.decay,
        );

        gain.connect(voiceFilter).connect(destination);

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

        // Both paths end a voice the same way; only the time differs. A held
        // key releases at whatever "now" is when the finger lifts, a sequenced
        // step at a time the clock decided in advance.
        const releaseAt = (requested, { holdThroughAttack = true } = {}) => {
            if (stopped) return;
            stopped = true;
            this.voices.delete(voice);

            // A held key is never released before its attack has finished: a
            // tap let go faster than resume() settles would otherwise end the
            // note before it began, which is silence again.
            //
            // A sequenced step is the opposite case. Its end is decided by the
            // clock, and stretching it to fit a slow preset's attack would make
            // every note outlast its own step — on the default pad (attack
            // 0.25s) a 16th at 138bpm lasts 0.109s, so notes would pile up
            // three deep and the line would smear into a drone. It is floored
            // at the start time instead: the envelope simply ends early, which
            // is quiet rather than wrong.
            const floor = holdThroughAttack ? now + attack : now;
            const end = Math.max(requested, floor);
            // Cancel the attack first: releasing mid-attack otherwise ramps
            // from a value the scheduler has not reached yet, which clicks.
            gain.gain.cancelScheduledValues(end);
            gain.gain.setValueAtTime(Math.max(gain.gain.value, SILENCE), end);
            gain.gain.exponentialRampToValueAtTime(SILENCE, end + release);
            for (const osc of oscillators) osc.stop(end + release);
        };

        const voice = {
            midiNumber,
            /** Release at an explicit time on the audio clock — the clock's path. */
            stopAt: (end, options) => releaseAt(end, options),
            stop: () => releaseAt(this.startTime()),
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
