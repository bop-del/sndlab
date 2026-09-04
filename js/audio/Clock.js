// The clock: a pattern you can hear loop.
//
// A timer wakes periodically and schedules every note falling in the next
// window against the audio clock. setTimeout alone is not accurate enough to
// play music — it drifts and jitters by whole milliseconds under load, which is
// audible as a stumbling beat — so it is used only to decide *when to think*,
// never to decide when a note sounds. The note times are arithmetic against the
// audio clock, which is sample-accurate.
//
// Time comes in through `now`, and the next wake-up goes out through `wake`.
// Production passes `() => ctx.currentTime` and `setTimeout`; checks pass a
// counter and a drainable queue, which is what makes the timing claims
// assertable instead of flaky. Two optional parameters with real defaults, not
// an abstraction layer.
//
// `now` is the *only* way this module may read the audio clock. A second call
// site would silently make the fake clock non-authoritative — the checks would
// keep passing while measuring nothing — so it is asserted by a check rather
// than left as a comment.

import { STEPS } from '../theory/Generator.js';

/**
 * How far ahead to schedule, and how often to think, in seconds.
 *
 * The window must be comfortably longer than the interval, so a late timer
 * still lands before the notes it was meant to schedule. 100 ms of thinking
 * against a 250 ms horizon leaves 150 ms of slack — the standard shape of a
 * Web Audio lookahead scheduler.
 */
export const LOOKAHEAD = 0.25;
const INTERVAL = 0.1;

/** Four sixteenths to the beat, so a step is a quarter of a beat. */
const STEPS_PER_BEAT = 4;

export const secondsPerStep = (bpm) => 60 / bpm / STEPS_PER_BEAT;

/** The default tempo. Goa sits around here; the slider moves either way. */
export const DEFAULT_BPM = 138;

export function createClock({
    now,
    wake = (fn, seconds) => setTimeout(fn, seconds * 1000),
    play,
    bpm = DEFAULT_BPM,
} = {}) {
    if (typeof now !== 'function') throw new Error('createClock needs a now() function');

    let running = false;
    let tempo = bpm;
    // The step the scheduler will place next, and the time it falls at. Kept as
    // a pair so a tempo change can move the *next* step without recomputing the
    // ones already scheduled — which is what stops a change dropping or
    // duplicating a step.
    let nextStep = 0;
    let nextTime = 0;

    function scheduleDue() {
        const horizon = now() + LOOKAHEAD;
        while (running && nextTime < horizon) {
            // The step index wraps, the time does not: the first step of the
            // next bar is placed by the same addition as any other step, so the
            // loop has no seam to get wrong. There is no special case here on
            // purpose.
            play?.(nextStep % STEPS, nextTime);
            nextTime += secondsPerStep(tempo);
            nextStep += 1;
        }
    }

    function tick() {
        if (!running) return;
        scheduleDue();
        wake(tick, INTERVAL);
    }

    return {
        /**
         * Begin looping from the top of the bar.
         *
         * `startAt` is where the first step falls. The caller passes
         * AudioEngine.startTime() so the pattern inherits the resume headroom
         * that keeps a suspended context from swallowing the first note — the
         * documented iOS silence bug. Defaulting it to now() would schedule
         * against a frozen clock and play nothing.
         */
        start(startAt = now()) {
            if (running) return;
            running = true;
            nextStep = 0;
            nextTime = startAt;
            tick();
        },

        /** Silence: schedule nothing further. Notes already placed still sound. */
        stop() {
            running = false;
        },

        get running() {
            return running;
        },

        get bpm() {
            return tempo;
        },

        /**
         * Change tempo without dropping or duplicating a step.
         *
         * Only the gap to the step *after* the ones already scheduled changes.
         * Recomputing `nextTime` from a bar origin would move steps already
         * placed in the audio clock's future — audible as a skipped or doubled
         * note at the moment of the change.
         */
        setBpm(value) {
            tempo = value;
        },
    };
}
