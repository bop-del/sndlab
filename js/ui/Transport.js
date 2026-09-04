import { DEFAULT_BPM, createClock, secondsPerStep } from '../audio/Clock.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { MUSE_PRESETS } from '../audio/Presets.js';

// How many step voices to keep handles for. A step releases itself well inside
// one bar, so anything older than a handful has finished — this bounds the set
// without ever being reached in normal play.
const VOICE_CAP = 8;
import { SCALES } from '../theory/Scales.js';
import { generateBass, isKickStep } from '../theory/Generator.js';

// Play, stop and tempo — the controls that turn a generated pattern into
// something you can hear loop.
//
// The pattern is generated once when the transport first starts, and kept, so
// pressing stop and play again returns the same line rather than a new one.
// Re-rolling is a separate verb and a separate ticket (#36); silently rolling a
// new pattern on every play would make the two indistinguishable.
export const Transport = {
    clock: null,
    pattern: null,
    // The steps this transport started, so stop() can silence its own loop
    // without touching notes the keyboard or the pads are holding.
    sounding: new Set(),
    // The voice a slide would bend, and the step that set it going. A slide is
    // a property of the step *before* the one it lands on, so this is the only
    // way playStep can know it is continuing a note rather than starting one.
    gliding: null,
    // The tempo lives here, not in the slider's value: reading the DOM back for
    // a number this module rendered makes the input the store, and the store
    // then disagrees with the clock the moment either is set another way.
    bpm: DEFAULT_BPM,
    root: 60,
    scale: null,
    // A control, not state: the ticket is explicit that this does not go in the
    // URL. Muting the kick is something you do for a moment while judging the
    // line's pitch content, not a property of the line worth sharing.
    kickMuted: false,

    init(container) {
        const play = document.createElement('button');
        play.id = 'play';
        play.type = 'button';
        play.textContent = 'Play';
        play.setAttribute('aria-pressed', 'false');

        const tempo = document.createElement('input');
        tempo.id = 'tempo';
        tempo.type = 'range';
        tempo.min = 90;
        tempo.max = 175;
        tempo.step = 1;
        tempo.value = DEFAULT_BPM;

        const reading = document.createElement('span');
        reading.className = 'tempo-reading';
        const showTempo = () => { reading.textContent = `${tempo.value} BPM`; };
        showTempo();

        const kick = document.createElement('button');
        kick.id = 'kick-mute';
        kick.type = 'button';
        kick.textContent = 'Kick';
        // Pressed means *sounding*, the same way a latched chord pad reads —
        // not "muted", which would invert the meaning of every other toggle in
        // the app.
        kick.setAttribute('aria-pressed', 'true');

        kick.addEventListener('click', () => {
            this.kickMuted = !this.kickMuted;
            kick.setAttribute('aria-pressed', String(!this.kickMuted));
            // Nothing else to do: the next scheduled downbeat reads the flag.
            // Muting cannot disturb the bass, because it does not touch the
            // clock, the pattern or anything already scheduled.
        });

        play.addEventListener('click', () => {
            if (this.clock?.running) this.stop(); else this.start();
            play.textContent = this.clock?.running ? 'Stop' : 'Play';
            play.setAttribute('aria-pressed', String(Boolean(this.clock?.running)));
        });

        tempo.addEventListener('input', () => {
            this.bpm = Number(tempo.value);
            showTempo();
            // Live, so the speed can be found without stopping — the clock
            // moves only the gap to the next unscheduled step.
            this.clock?.setBpm(this.bpm);
        });

        // Labelled like the cutoff and resonance sliders next to it: an
        // unlabelled slider between a button and a number reads as a mystery
        // control, and this one sets the speed the whole line is judged at.
        const field = document.createElement('label');
        field.className = 'control';
        field.append('Tempo', tempo);

        const row = document.createElement('div');
        row.className = 'transport';
        row.append(play, kick, field, reading);
        container.replaceChildren(row);

        // Blur stops the transport as well as the held notes. A loop that keeps
        // playing into a backgrounded tab is the one noise the app must never
        // make, and the existing blur handler only releases what is held.
        window.addEventListener('blur', () => {
            if (!this.clock?.running) return;
            this.stop();
            play.textContent = 'Play';
            play.setAttribute('aria-pressed', 'false');
        });
    },

    setScale(root, scale) {
        this.root = root;
        this.scale = scale;
        // The pattern is degrees, not pitches, so a scale change re-pitches the
        // line already playing instead of invalidating it.
    },

    start() {
        const ctx = AudioEngine.ensureContext();
        this.pattern ??= generateBass({ scale: this.scale, root: this.root });

        this.clock ??= createClock({
            // The engine's clock, read through one function and nowhere else.
            now: () => ctx.currentTime,
            play: (step, when) => this.playStep(step, when),
            bpm: this.bpm,
        });

        // startTime(), not currentTime: a suspended context has a frozen clock,
        // and scheduling the first step against it puts the whole bar in the
        // past — the documented iOS silence bug.
        this.clock.start(AudioEngine.startTime());
    },

    stop() {
        this.clock?.stop();
        this.gliding = null;
        // Only the steps this clock scheduled. AudioEngine.stopAll() would
        // silence every voice in the engine — including a chord pad or a key
        // held by a finger — and leave Notes' own map claiming they still
        // sound, so the pad stays lit, silent, and refuses to retrigger.
        // Stopping the transport is not a panic button; blur is, and that path
        // already goes through Notes.releaseAll().
        for (const voice of [...this.sounding]) voice.stop();
        this.sounding.clear();
    },

    playStep(step, when) {
        // The kick first, and independent of the pattern: it is four to the
        // floor whatever the bass is doing, and the gap the bass leaves on
        // these steps is only audible as groove because this lands in it.
        if (isKickStep(step) && !this.kickMuted) AudioEngine.kickAt(when);

        const cell = this.pattern?.steps[step];
        if (!cell || cell.gate !== 'note') {
            // A slide travels into the note that follows it, so one pointing at
            // a rest has nothing to reach. The generator strips those, but the
            // held voice would drone if one ever arrived here — the engine must
            // not depend on the generator's guarantee to avoid a stuck note.
            if (this.gliding?.from?.slide) {
                this.gliding.voice.stopAt(when, { holdThroughAttack: false });
                this.gliding = null;
            }
            return;
        }
        const note = this.degreeToNote(cell);

        // A slide bends the voice that is already sounding rather than starting
        // another one — the 303 glides between tied notes on one oscillator, so
        // the line sings instead of re-articulating. The *previous* step's
        // slide flag decides this, not this step's: a slide travels into the
        // note that follows it, which is why a slide before a rest is
        // inaudible and why the generator strips those.
        if (this.gliding?.voice && this.gliding.from?.slide) {
            this.gliding.voice.slideTo(note, when);
            // The bent voice is still held, so responsibility for ending it
            // passes to this step: a chain of slides is one voice, and only the
            // last link releases it.
            this.gliding = { voice: this.gliding.voice, from: cell };
            if (!cell.slide) this.gliding.voice.stopAt(when + this.stepSeconds(), { holdThroughAttack: false });
            return;
        }

        // Played through the muse's own bass, not whatever the player has
        // selected: the line is being judged on its notes, and judging it
        // through the chord-pad patch judges the patch.
        const voice = AudioEngine.noteAt(note, when, this.stepSeconds(), {
            accent: cell.accent,
            preset: MUSE_PRESETS.bass,
            // A slid step must still be sounding when the next step arrives, or
            // there is nothing left to bend. Held to the full step rather than
            // the shortened gate.
            hold: cell.slide,
        });
        this.gliding = { voice, from: cell };
        this.sounding.add(voice);

        // Stopped, not merely forgotten. Dropping the handle leaves the voice
        // sounding with nothing able to reach it — and a slid step is held
        // rather than self-releasing, so an evicted one drones for ever. The
        // cap exists to bound the set, not to end notes: a self-releasing voice
        // has already finished by the time it is evicted, and stop() on a
        // finished voice is a no-op.
        if (this.sounding.size > VOICE_CAP) {
            for (const spent of [...this.sounding].slice(0, this.sounding.size - VOICE_CAP)) {
                if (spent !== this.gliding?.voice) spent.stop();
                this.sounding.delete(spent);
            }
        }
    },

    /** A step's length: the gap to the next one, less a hair so notes do not touch. */
    stepSeconds() {
        return secondsPerStep(this.clock?.bpm ?? this.bpm) * 0.9;
    },

    /**
     * Resolve a step's scale degree to a MIDI note.
     *
     * The degree is an index into the scale, so this is the arithmetic
     * Scales.js already does for chords: the note is the root plus the scale's
     * semitone step, moved by the step's octave. Two octaves down, where a
     * bassline actually sits.
     */
    degreeToNote({ degree, octave }) {
        const { steps } = this.scale ?? SCALES[0];
        // The same wrap Scales.js uses for a triad: a degree past the end of the
        // scale carries into the next octave rather than folding back down to a
        // note it does not mean. The Goa bass never reaches that far today, so
        // this is latent — but the arithmetic should not be subtly different
        // from the one place that already owns it.
        const carry = Math.floor(degree / steps.length) * 12;
        // Two octaves below the keyboard's root, where a bassline sits.
        return this.root - 24 + steps[degree % steps.length] + carry + octave * 12;
    },
};
