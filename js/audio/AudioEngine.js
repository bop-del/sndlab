// Web Audio API directly — no framework, no dependency.
export const AudioEngine = {
    ctx: null,

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

    playTone({ frequency = 220, duration = 0.4, type = 'sawtooth' } = {}) {
        const ctx = this.ensureContext();
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = frequency;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
    },
};
