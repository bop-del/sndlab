// Verification run: serve, load, check, screenshot.
//
// Dev-only. Nothing here ships — see docs/adr/0004-dev-dependencies.md.
//
//   node scripts/verify.mjs
//
// Exits non-zero if any check fails. Always writes a screenshot to
// .screenshots/ so the visual result can be assessed by eye, pass or fail.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8123; // deliberately not 8000 — the dev server keeps that one
const SHOTS = join(ROOT, '.screenshots');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.wav': 'audio/wav',
};

// ─── Server ──────────────────────────────────────────────────────────────────
// Same job as `python3 -m http.server`, minus the process management. Node's
// built-ins only; no dependency.

function serve() {
    const server = createServer(async (req, res) => {
        const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '');
        try {
            const body = await readFile(join(ROOT, rel));
            res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' });
            res.end(body);
        } catch {
            res.writeHead(404).end('not found');
        }
    });
    return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

// ─── Web Audio spy ───────────────────────────────────────────────────────────
// Injected before any app code runs. Wraps the real Web Audio constructors so
// checks assert on what the engine *did*, not on what it reports about itself.
// The engine stays free of test scaffolding.
//
// If AudioEngine is ever rewritten onto an AudioWorklet these wrappers stop
// seeing anything — so `audioSpy.calls` going empty must fail a check rather
// than quietly pass. See the "engine started an oscillator" check below.

function installAudioSpy() {
    const calls = [];
    const nodes = [];
    // The shared filter is built once and lives for the session, so its record
    // is kept outside `nodes` — resetSpy() clears that log between checks, and
    // would otherwise erase the only handle on a node that still exists.
    const shared = {};
    window.audioSpy = { calls, nodes, shared };

    const wrap = (Ctor) => {
        if (!Ctor) return;
        const proto = Ctor.prototype;

        const origOsc = proto.createOscillator;
        if (origOsc) {
            proto.createOscillator = function (...args) {
                const osc = origOsc.apply(this, args);
                const record = { node: 'oscillator', type: osc.type, frequency: osc.frequency.value, started: false, stopped: false };
                nodes.push(record);
                calls.push('createOscillator');

                const origStart = osc.start.bind(osc);
                osc.start = (...a) => {
                    // Read at start(), not at creation — the engine sets type and
                    // frequency after createOscillator() returns.
                    record.type = osc.type;
                    record.frequency = osc.frequency.value;
                    record.started = true;
                    calls.push('oscillator.start');
                    return origStart(...a);
                };

                const origStop = osc.stop.bind(osc);
                osc.stop = (...a) => {
                    record.stopped = true;
                    calls.push('oscillator.stop');
                    return origStop(...a);
                };
                return osc;
            };
        }

        // The shared filter is the one node a slider moves after construction,
        // so its automation has to be recorded too — otherwise "the cutoff
        // changed while a note was held" is unobservable from outside, and the
        // only alternative is a hook in shipped code.
        const origFilter = proto.createBiquadFilter;
        if (origFilter) {
            proto.createBiquadFilter = function (...args) {
                const node = origFilter.apply(this, args);
                // A getter, not a snapshot. createBiquadFilter() returns with
                // a default of 350 Hz and the engine assigns the real cutoff
                // afterwards, so a value read here would be the default for
                // ever — the same trap the oscillator wrapper avoids by reading
                // at start().
                const record = { node: 'filter', targets: [] };
                Object.defineProperty(record, 'frequency', {
                    get: () => node.frequency.value,
                    enumerable: true,
                });
                nodes.push(record);
                // First filter built is the shared one; the reverb's damping
                // filter comes after and is not what the slider moves.
                shared.filter ??= record;
                calls.push('createBiquadFilter');

                const orig = node.frequency.setTargetAtTime.bind(node.frequency);
                node.frequency.setTargetAtTime = (value, ...rest) => {
                    record.targets.push(value);
                    return orig(value, ...rest);
                };
                return node;
            };
        }

        const origGain = proto.createGain;
        if (origGain) {
            proto.createGain = function (...args) {
                const gain = origGain.apply(this, args);
                const record = { node: 'gain', ramps: [] };
                nodes.push(record);
                calls.push('createGain');

                for (const method of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) {
                    const orig = gain.gain[method].bind(gain.gain);
                    gain.gain[method] = (value, time) => {
                        record.ramps.push({ method, value });
                        return orig(value, time);
                    };
                }
                return gain;
            };
        }
    };

    // Both spellings: on WebKit the engine may construct the prefixed one, and a
    // spy that watches only the unprefixed name would record nothing while the
    // app worked fine — reporting a failure that is entirely its own.
    wrap(window.AudioContext);
    wrap(window.webkitAudioContext);
    wrap(window.OfflineAudioContext);
    wrap(window.webkitOfflineAudioContext);
}

// ─── Silence ─────────────────────────────────────────────────────────────────
// A verification run must not play out loud. Headless is not silent: measured
// on macOS, chromium *and* webkit each open a real coreaudiod output stream
// while a tone runs (an `audio-out BuiltInSpeakerDevice` assertion appears for
// the duration and goes again on close), so both engines genuinely sound the
// forty-odd notes the checks trigger.
//
// Chromium has `--mute-audio` for this. WebKit exposes no equivalent through
// Playwright, and a fix that silenced one engine and not the other would leave
// half the run audible — so the mute goes in the page, where both engines are
// the same.
//
// It costs no coverage. The spy records `type`, `frequency`, `started` and
// `stopped`, all set on the JS side of the graph before a sample reaches the
// device. This inserts a zero gain at the very last hop, between the graph and
// the speakers: everything the checks assert on still happens, and nothing
// comes out.
//
// Measured, by tapping the destination with an analyser and reading peak
// amplitude: unmuted both engines put a full-scale 440 Hz tone on the device;
// with this in place peak is 0.000000 on both, while an OfflineAudioContext
// still renders 0.999999 and the oscillator still reports sine/440.

function silenceOutput() {
    const mute = (Ctor) => {
        if (!Ctor) return;
        // `destination` lives on BaseAudioContext, which OfflineAudioContext
        // inherits too — so redefining it on the prototype that owns it would
        // zero offline renders as well. It is defined on each live context
        // instead: the override shadows the inherited accessor for that one
        // context, and an OfflineAudioContext keeps the real one.
        let proto = Ctor.prototype;
        let realDestination;
        while (proto && !(realDestination = Object.getOwnPropertyDescriptor(proto, 'destination'))) {
            proto = Object.getPrototypeOf(proto);
        }
        if (!realDestination?.get) return;

        // Built through the *unpatched* createGain. installAudioSpy replaces
        // the prototype method and logs every gain node it makes, so calling
        // ctx.createGain() here would seed the spy with a node no check caused
        // — a record the checks did not ask for, in a log they read.
        const createGain = Ctor.prototype.createGain;

        const Wrapped = function (...args) {
            const ctx = new Ctor(...args);
            const destination = realDestination.get.call(ctx);
            const gain = createGain.call(ctx);
            gain.gain.value = 0;
            gain.connect(destination);
            // Own property, so it shadows the inherited getter for this context
            // only. Built once: `destination` is read on every connect(), and a
            // node per read would fan the graph out into nodes nothing holds.
            Object.defineProperty(ctx, 'destination', {
                configurable: true,
                get: () => gain,
            });
            return ctx;
        };
        // Not cosmetic: the late-resume check does `class extends
        // window.AudioContext`, and sharing the prototype is what keeps that
        // subclass working through the wrapper.
        Wrapped.prototype = Ctor.prototype;
        return Wrapped;
    };

    const AudioCtx = mute(window.AudioContext);
    if (AudioCtx) window.AudioContext = AudioCtx;
    const WebkitCtx = mute(window.webkitAudioContext);
    if (WebkitCtx) window.webkitAudioContext = WebkitCtx;
}

// Every page in the run is made here, so no page can be born audible. The mute
// is per-page (addInitScript), so a check that opened its own page and skipped
// it played out loud — which is exactly what happened, twice per run, until a
// review caught it. A helper closes the class of bug rather than the instance.
//
// Order matters: silenceOutput captures the pristine createGain, before the spy
// replaces it. The other way round the mute's own gain node lands in the log
// the checks read.
async function newPage(browser) {
    const page = await browser.newPage();
    await page.addInitScript(silenceOutput);
    await page.addInitScript(installAudioSpy);
    return page;
}

// ─── Checks ──────────────────────────────────────────────────────────────────
// One entry per claim. Kept inline while the app is small; when this list
// outgrows the file, split to scripts/checks/ along component lines — the same
// boundary UI.js will split on (see issue #3).

const checks = [
    {
        name: 'the pads are labelled for the selected scale',
        async run(page) {
            await page.selectOption('#root', '60');
            await page.selectOption('#scale', 'phrygian');
            // The row of labels is itself the lesson: case carries the quality,
            // so the row is a picture of the scale's shape.
            const phrygian = await page.$$eval('.pad', (ps) => ps.map((p) => p.textContent));
            if (phrygian.join(' ') !== 'i II III iv v° VI vii') {
                throw new Error(`Phrygian mislabelled: ${phrygian.join(' ')}`);
            }
            await page.selectOption('#scale', 'natural-minor');
            const minor = await page.$$eval('.pad', (ps) => ps.map((p) => p.textContent));
            if (minor.join(' ') !== 'i ii° III iv v VI VII') {
                throw new Error(`natural minor mislabelled: ${minor.join(' ')}`);
            }
            await page.selectOption('#scale', 'phrygian');
        },
    },
    {
        name: 'a pad sounds its three notes',
        async run(page) {
            await resetSpy(page);
            await page.click('.pad[data-degree="0"]');
            const voices = voicesIn(await audioSpy(page));
            if (voices.length !== 3) throw new Error(`expected a triad, got ${voices.length} voices`);
            await page.click('.pad[data-degree="0"]');
        },
    },
    {
        name: 'pads latch, and a second pad releases the first',
        async run(page) {
            await resetSpy(page);
            await page.click('.pad[data-degree="0"]');
            // Latching is the point: both hands stay free for a melody, so the
            // chord must still sound after the click is over.
            let sounding = voicesIn(await audioSpy(page)).filter((v) => !v.stopped);
            if (sounding.length !== 3) throw new Error(`chord did not latch: ${sounding.length} voices`);

            await page.click('.pad[data-degree="3"]');
            sounding = voicesIn(await audioSpy(page)).filter((v) => !v.stopped);
            // Two triads at once is mud, and mud hides the interval this tool
            // exists to make audible.
            if (sounding.length !== 3) throw new Error(`expected one chord at a time, ${sounding.length} sounding`);

            await page.click('.pad[data-degree="3"]');
            sounding = voicesIn(await audioSpy(page)).filter((v) => !v.stopped);
            if (sounding.length !== 0) throw new Error(`pressing the lit pad did not stop it: ${sounding.length}`);
        },
    },
    {
        name: 'the drone holds the root until stopped',
        async run(page) {
            await resetSpy(page);
            await page.click('#drone');
            let sounding = voicesIn(await audioSpy(page)).filter((v) => !v.stopped);
            if (sounding.length !== 1) throw new Error(`expected one droning note, got ${sounding.length}`);

            await page.click('#drone');
            sounding = voicesIn(await audioSpy(page)).filter((v) => !v.stopped);
            if (sounding.length !== 0) throw new Error('the drone did not stop');
        },
    },
    {
        name: 'a chord, the drone and a played note sound together',
        async run(page) {
            // Three sources holding notes at once, none stealing another's
            // release. This is the tool working: hold the drone, press a chord,
            // play a melody over it.
            await resetSpy(page);
            await page.click('#drone');
            await page.click('.pad[data-degree="1"]'); // II — carries the flat second
            await press(page, '[data-note="72"]');

            const sounding = voicesIn(await audioSpy(page)).filter((v) => !v.stopped);
            if (sounding.length !== 5) throw new Error(`expected drone + triad + melody = 5, got ${sounding.length}`);

            await release(page);
            await page.click('.pad[data-degree="1"]');
            await page.click('#drone');
        },
    },
    {
        name: 'switching root strands neither a latched chord nor the drone',
        async run(page) {
            // The root is stored before the sounding notes are released, so a
            // release computed from the *new* root frees notes that were never
            // pressed and leaves the real ones held for ever. Every root change
            // then adds voices that can never be stopped, and the app grows
            // steadily louder and muddier until it is unusable.
            await page.selectOption('#root', '60');
            await resetSpy(page);
            await page.click('.pad[data-degree="0"]');
            await page.click('#drone');
            await page.selectOption('#root', '62');

            const sounding = voicesIn(await audioSpy(page)).filter((v) => !v.stopped);
            if (sounding.length !== 0) throw new Error(`${sounding.length} voices survived the root change`);

            await page.selectOption('#root', '60');
        },
    },
    {
        name: 'switching scale strands neither a latched chord nor the drone',
        async run(page) {
            await resetSpy(page);
            await page.click('.pad[data-degree="0"]');
            await page.click('#drone');
            await page.selectOption('#scale', 'natural-minor');

            // A chord built from a scale you have left is a chord from nowhere.
            const sounding = voicesIn(await audioSpy(page)).filter((v) => !v.stopped);
            if (sounding.length !== 0) throw new Error(`${sounding.length} voices survived the scale change`);
            const lit = await page.$$eval('.pad--on, .drone--on', (els) => els.length);
            if (lit !== 0) throw new Error(`${lit} controls still claim to be on`);

            await page.selectOption('#scale', 'phrygian');
        },
    },
    {
        name: 'a chord pad lights the keys it plays',
        async run(page) {
            // The bug this ticket exists for. Chords sound two octaves below
            // the keyboard's lowest key, so every note a pad played fell off
            // the range, lit nothing, and raised nothing — the pad's own
            // highlight was checked, the keyboard's was not, and a total
            // failure shipped in silence.
            await page.selectOption('#root', '60');
            await page.selectOption('#scale', 'phrygian');
            await page.click('.pad[data-degree="0"]');

            // Un-latch whatever happens. A throw between the click and the
            // release leaves the pad holding three notes, and the next check
            // then fails on those rather than on its own subject — a cascade
            // that hides the real failure behind a misleading one.
            try {
                // C phrygian i: C, E flat, G — two octaves down from the pad's
                // own register, which is where the keyboard now reaches.
                const expected = [36, 39, 43];
                for (const note of expected) {
                    if (!(await isLit(page, note))) throw new Error(`the pad plays MIDI ${note} but that key is not lit`);
                }
                const lit = await litNotes(page);
                if (String(lit) !== String(expected)) {
                    throw new Error(`expected exactly [${expected}] lit, got [${lit}]`);
                }
            } finally {
                await page.click('.pad[data-degree="0"]');
            }

            if ((await litNotes(page)).length !== 0) throw new Error('releasing the chord left keys lit');
        },
    },
    {
        name: 'the drone lights its root',
        async run(page) {
            // Set the root rather than inheriting it: an absolute MIDI number
            // asserted against whatever the previous check left behind fails
            // for reasons that have nothing to do with the drone.
            await page.selectOption('#root', '60');
            await page.click('#drone');
            try {
                const lit = await litNotes(page);
                if (String(lit) !== String([36])) throw new Error(`expected the root C2 lit, got [${lit}]`);
            } finally {
                await page.click('#drone');
            }
            if ((await litNotes(page)).length !== 0) throw new Error('stopping the drone left the key lit');
        },
    },
    {
        name: 'changing scale or root clears the keys a chord had lit',
        async run(page) {
            // Each half asserts the keys were lit first: with the old two-octave
            // keyboard nothing ever lit, so "nothing is lit afterwards" passed
            // while saying nothing at all.
            //
            // The restore is in a finally: four assertions can throw above it,
            // and a check that leaves the picker on another scale hands its
            // world to every check after it — and to the screenshot, whose
            // whole point is showing the app's default state.
            try {
                await page.selectOption('#root', '60');
                await page.selectOption('#scale', 'phrygian');

                await page.click('.pad[data-degree="0"]');
                if ((await litNotes(page)).length === 0) throw new Error('the chord lit nothing to clear');
                await page.selectOption('#scale', 'natural-minor');
                if ((await litNotes(page)).length !== 0) throw new Error('the scale change left keys lit');

                await page.click('.pad[data-degree="0"]');
                if ((await litNotes(page)).length === 0) throw new Error('the chord lit nothing to clear');
                await page.selectOption('#root', '62');
                if ((await litNotes(page)).length !== 0) throw new Error('the root change left keys lit');
            } finally {
                await page.selectOption('#root', '60');
                await page.selectOption('#scale', 'phrygian');
            }
        },
    },
    {
        name: 'a preset stacks several oscillators per note',
        async run(page) {
            // One oscillator is a test tone. Detuned copies beating against
            // each other are most of what separates a synth from a beep, so a
            // note falling back to a single layer is a regression in the sound
            // even though it would still play the right pitch.
            await resetSpy(page);
            await press(page, '[data-note="60"]');
            const voices = voicesIn(await audioSpy(page));
            if (voices.length !== 1) throw new Error(`expected 1 voice, got ${voices.length}`);
            if (voices[0].oscillators.length < 2) {
                throw new Error(`expected a stacked voice, got ${voices[0].oscillators.length} oscillator`);
            }
            await release(page);
        },
    },
    {
        name: 'both presets are offered and can be selected',
        async run(page) {
            const presets = await page.$$eval('#preset option', (os) => os.map((o) => o.value));
            if (presets.length < 2) throw new Error(`expected 2 presets, got ${presets.length}`);
            await page.selectOption('#preset', presets[1]);
            await page.selectOption('#preset', presets[0]);
        },
    },
    {
        name: 'the presets sound different from each other',
        async run(page) {
            // Two presets exist to separate "this sound is badly designed" from
            // "the whole idea does not work". Two that behave identically would
            // answer neither question.
            const shapeOf = async (preset) => {
                await page.selectOption('#preset', preset);
                await resetSpy(page);
                await press(page, '[data-note="60"]');
                const [voice] = voicesIn(await audioSpy(page));
                await release(page);
                return { layers: voice.oscillators.length, types: voice.types.join(',') };
            };
            const pad = await shapeOf('pad');
            const pluck = await shapeOf('pluck');
            if (pad.layers === pluck.layers && pad.types === pluck.types) {
                throw new Error(`the presets build the same voice: ${JSON.stringify(pad)}`);
            }
            await page.selectOption('#preset', 'pad');
        },
    },
    {
        name: 'the cutoff slider changes a note already sounding',
        async run(page) {
            // A filter you can only hear on the *next* note is a setting, not
            // an instrument control. Sweeping under a held chord is the point.
            await press(page, '[data-note="60"]');
            const filterBefore = (await audioSpy(page)).shared.filter;
            if (!filterBefore) throw new Error('no filter in the graph — voices run dry to the destination');
            const before = filterBefore.frequency;

            // The slider is a 0–1 position, not hertz — pitch is heard
            // logarithmically, so the control is geometric over the range.
            await page.fill('#cutoff', '0.1');
            await page.dispatchEvent('#cutoff', 'input');
            await new Promise((r) => setTimeout(r, 120));

            const after = (await audioSpy(page)).shared.filter.frequency;
            await release(page);

            // Put the slider back. The screenshot is taken after every check
            // runs, so a check that leaves a control moved makes the screenshot
            // show the test's world rather than the app's.
            await page.selectOption('#preset', 'pluck');
            await page.selectOption('#preset', 'pad');

            if (!(after < before)) throw new Error(`cutoff did not fall while a note was held: ${before} → ${after}`);
        },
    },

    {
        name: 'the scale picker offers both scales, with a why-sentence',
        async run(page) {
            const scales = await page.$$eval('#scale option', (os) => os.map((o) => o.value));
            if (scales.length < 2) throw new Error(`expected at least 2 scales, got ${scales.length}`);
            // The why-sentence is the tool's entire learning content. A blank
            // one means the tool teaches nothing, and nothing else would fail.
            const why = await page.textContent('#why');
            if (!why || why.trim().length < 40) throw new Error(`why-sentence missing or too short: "${why}"`);
        },
    },
    {
        name: 'the keyboard marks the notes of the selected scale',
        async run(page) {
            await page.selectOption('#root', '64'); // E
            await page.selectOption('#scale', 'phrygian');

            // E Phrygian: F is in, F sharp is not. That one note is the whole
            // difference between this scale and natural minor.
            const inScale = async (note) =>
                page.$eval(`[data-note="${note}"]`, (el) => el.classList.contains('key--in-scale'));
            if (!(await inScale(65))) throw new Error('F is not marked in E Phrygian');
            if (await inScale(66)) throw new Error('F sharp is marked in E Phrygian');
            // And in the octave above, which a modulo error would miss.
            if (!(await inScale(77))) throw new Error('F an octave up is not marked');
        },
    },
    {
        name: 'switching scale re-marks the keyboard',
        async run(page) {
            await page.selectOption('#scale', 'natural-minor');
            const inScale = async (note) =>
                page.$eval(`[data-note="${note}"]`, (el) => el.classList.contains('key--in-scale'));
            // The contrast that makes the picker worth having: the same two
            // notes swap roles.
            if (await inScale(65)) throw new Error('F is still marked in E natural minor');
            if (!(await inScale(66))) throw new Error('F sharp is not marked in E natural minor');

            // Put the app back to its defaults. The screenshot is taken after
            // every check has run, so a check that leaves state behind makes
            // the screenshot show the test's world rather than the app's — and
            // then the visual assessment is of something no user ever sees.
            await page.selectOption('#scale', 'phrygian');
            await page.selectOption('#root', '60');
        },
    },
    {
        name: 'an out-of-scale note still plays',
        async run(page) {
            // Muting them would hide the very contrast the tool teaches, so
            // this is a behaviour to protect, not an oversight.
            await page.selectOption('#scale', 'phrygian');
            await page.evaluate(() => { window.audioSpy.nodes.length = 0; window.audioSpy.calls.length = 0; });
            await press(page, '[data-note="66"]'); // F sharp, outside E Phrygian
            const spy = await audioSpy(page);
            if (voicesIn(spy).length !== 1) throw new Error(`expected the out-of-scale note to sound, got ${voicesIn(spy).length} voices`);
            await release(page);
        },
    },

    {
        name: 'page loads with a title',
        async run(page) {
            const title = await page.title();
            if (!title) throw new Error('no <title>');
        },
    },
    {
        name: 'the keyboard is there on a plain load, with no waiting',
        async run(page, browser) {
            // Every other check runs against a page already settled by
            // `networkidle`, which would hide init that never happened on an
            // ordinary load. This one asks immediately, on a fresh page.
            const fresh = await newPage(browser);
            try {
                await fresh.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
                const keys = await fresh.$$eval('#keyboard .key', (els) => els.length);
                if (keys !== 49) throw new Error(`expected 49 keys immediately after load, got ${keys}`);
            } finally {
                await fresh.close();
            }
        },
    },
    {
        name: 'the engine works where only webkitAudioContext exists',
        async run(page, browser) {
            // Older WebKit ships only the prefixed constructor. Current iOS has
            // the unprefixed one — so this is defensive, not the cause of #5;
            // that turned out to be the resume race checked above.
            const ios = await newPage(browser);
            try {
                await ios.addInitScript(() => {
                    window.webkitAudioContext = window.AudioContext;
                    delete window.AudioContext;
                });
                await ios.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

                const box = await (await ios.$('[data-note="69"]')).boundingBox();
                await ios.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
                await ios.mouse.down();

                const spy = await ios.evaluate(() => window.audioSpy);
                const voices = voicesIn(spy);
                if (voices.length !== 1) {
                    throw new Error(`expected the note to sound with only webkitAudioContext, got ${voices.length} oscillators`);
                }
                if (Math.abs(voices[0].frequency - 440) > 0.01) {
                    throw new Error(`expected 440 Hz, got ${voices[0].frequency}`);
                }
                await ios.mouse.up();
            } finally {
                await ios.close();
            }
        },
    },
    {
        name: 'a note is scheduled where a late-resuming context can hear it',
        async run(page, browser) {
            // Issue #5. iOS creates the context suspended and resume() settles a
            // tick later; a suspended context's clock is frozen at 0. Scheduling
            // the envelope at that frozen time puts the note before audio starts
            // flowing, so it is never heard — silent, with no error anywhere.
            // Desktop resumes fast enough to hide it entirely.
            const ios = await newPage(browser);
            try {
                await ios.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
                const result = await ios.evaluate(async () => {
                    const { AudioEngine } = await import('/js/audio/AudioEngine.js?' + Math.random());
                    const RESUME_DELAY = 0.12;

                    const Real = window.AudioContext;
                    window.AudioContext = class extends Real {
                        constructor(...args) {
                            super(...args);
                            this._resumed = false;
                            const realResume = super.resume.bind(this);
                            Object.defineProperty(this, 'state', { get: () => (this._resumed ? 'running' : 'suspended') });
                            Object.defineProperty(this, 'currentTime', {
                                get: () => (this._resumed ? Real.prototype.__lookupGetter__('currentTime').call(this) : 0),
                            });
                            this.resume = () => {
                                setTimeout(() => { this._resumed = true; }, RESUME_DELAY * 1000);
                                return realResume();
                            };
                        }
                    };

                    let scheduledAt = null;
                    const origSet = AudioParam.prototype.setValueAtTime;
                    AudioParam.prototype.setValueAtTime = function (value, time) {
                        if (scheduledAt === null) scheduledAt = time;
                        return origSet.call(this, value, time);
                    };
                    AudioEngine.noteOn(69);
                    AudioParam.prototype.setValueAtTime = origSet;
                    return { scheduledAt, resumeDelay: RESUME_DELAY };
                });

                if (result.scheduledAt === null) throw new Error('the envelope was never scheduled');
                if (result.scheduledAt <= 0) {
                    throw new Error(
                        `the note is scheduled at ${result.scheduledAt}s, inside the frozen window before audio starts — it would never be heard`,
                    );
                }
            } finally {
                await ios.close();
            }
        },
    },
    {
        name: 'the keyboard renders four octaves of keys',
        async run(page) {
            // A dead listener is the classic no-build failure: the module 404s
            // and nothing renders. An empty container catches that.
            const keys = await page.$$('#keyboard .key');
            if (keys.length !== 49) throw new Error(`expected 49 keys (C2 to C6), got ${keys.length}`);
            const white = await page.$$('#keyboard .key--white');
            const black = await page.$$('#keyboard .key--black');
            if (white.length !== 29) throw new Error(`expected 29 white keys, got ${white.length}`);
            if (black.length !== 20) throw new Error(`expected 20 black keys, got ${black.length}`);

            // The ends are the range: chords reach down to C2, and the played
            // octaves run up to C6.
            const notes = await page.$$eval('#keyboard .key', (els) => els.map((el) => Number(el.dataset.note)));
            if (Math.min(...notes) !== 36) throw new Error(`the lowest key is MIDI ${Math.min(...notes)}, expected 36 (C2)`);
            if (Math.max(...notes) !== 84) throw new Error(`the highest key is MIDI ${Math.max(...notes)}, expected 84 (C6)`);

            // The hairline marks where the typing rows begin — one key, C4.
            const marked = await page.$$eval('#keyboard .key--typing-start', (els) => els.map((el) => Number(el.dataset.note)));
            if (String(marked) !== String([60])) throw new Error(`expected the hairline on C4 alone, got [${marked}]`);
        },
    },
    {
        name: 'clicking a key starts an oscillator at that pitch',
        async run(page) {
            // A4 = MIDI 69 = 440 Hz. Proves the whole chain: DOM → mapping →
            // MIDI → frequency → Web Audio.
            await press(page, '[data-note="69"]');
            const spy = await audioSpy(page);

            const voices = voicesIn(spy);
            if (voices.length !== 1) throw new Error(`expected 1 voice, got ${voices.length}`);
            const [voice] = voices;
            // Rounded to the nearest hertz by voicesIn, since a preset's layers
            // sit a few cents either side of the true pitch.
            if (voice.frequency !== 440) throw new Error(`expected 440 Hz, got ${voice.frequency}`);
            if (!voice.types.includes('sawtooth')) throw new Error(`expected a sawtooth layer, got ${voice.types.join(', ')}`);

            await release(page);
        },
    },
    {
        name: 'a computer keydown plays the same note as clicking it',
        async run(page) {
            // 'n' is A in the lower row of the Ableton layout — the same A4 the
            // click check played.
            await page.keyboard.down('n');
            const spy = await audioSpy(page);

            const voices = voicesIn(spy);
            if (voices.length !== 1) throw new Error(`expected 1 voice, got ${voices.length}`);
            if (voices[0].frequency !== 440) {
                throw new Error(`expected 440 Hz from the "n" key, got ${voices[0].frequency}`);
            }

            await page.keyboard.up('n');
        },
    },
    {
        name: 'releasing a key stops its voice',
        async run(page) {
            await press(page, '[data-note="60"]');
            let spy = await audioSpy(page);
            if (spy.nodes.some((n) => n.node === 'oscillator' && n.stopped)) {
                throw new Error('the voice stopped while the key was still held');
            }

            await release(page);
            spy = await audioSpy(page);
            const voices = voicesIn(spy);
            if (voices.length !== 1) throw new Error(`expected 1 voice, got ${voices.length}`);
            if (!voices[0].stopped) throw new Error('releasing the key did not stop the note');
        },
    },
    {
        name: 'a held key is lit, from either input path',
        async run(page) {
            await press(page, '[data-note="62"]');
            if (!(await isLit(page, 62))) throw new Error('a clicked key is not lit while held');
            await release(page);
            if (await isLit(page, 62)) throw new Error('a clicked key stayed lit after release');

            await page.keyboard.down('x'); // D in the lower row — the same key
            if (!(await isLit(page, 62))) throw new Error('a computer-keyboard key is not lit while held');
            await page.keyboard.up('x');
            if (await isLit(page, 62)) throw new Error('a computer-keyboard key stayed lit after release');
        },
    },
    {
        name: 'key repeat does not retrigger the note',
        async run(page) {
            // What auto-repeat delivers: keydown, keydown, keydown, one keyup.
            await page.keyboard.down('z');
            await page.keyboard.down('z');
            await page.keyboard.down('z');

            const spy = await audioSpy(page);
            const voices = voicesIn(spy);
            if (voices.length !== 1) {
                throw new Error(`three keydowns started ${voices.length} oscillators, expected 1`);
            }

            await page.keyboard.up('z');
        },
    },
    {
        name: 'blur releases every held note',
        async run(page) {
            await page.keyboard.down('z');
            await page.keyboard.down('x');
            await page.keyboard.down('c');

            await page.evaluate(() => window.dispatchEvent(new Event('blur')));

            const spy = await audioSpy(page);
            const voices = voicesIn(spy);
            const sounding = voicesIn(spy).filter((v) => !v.stopped);
            if (sounding.length !== 0) throw new Error(`${sounding.length} note(s) still sounding after blur`);

            const lit = await page.$$('#keyboard .key--pressed');
            if (lit.length !== 0) throw new Error(`${lit.length} key(s) still lit after blur`);

            // The browser delivers no keyup after a real blur; clear the state
            // Playwright still holds so the next check starts clean.
            for (const key of ['z', 'x', 'c']) await page.keyboard.up(key);
        },
    },
    {
        name: 'a focused key is playable without a mouse',
        async run(page) {
            // User story 15: the keys are buttons, so they must do something
            // when activated the standard way.
            await page.focus('[data-note="67"]');
            await page.keyboard.down(' ');

            const spy = await audioSpy(page);
            const sounding = voicesIn(spy).filter((v) => !v.stopped);
            if (sounding.length !== 1) throw new Error(`expected 1 live oscillator, got ${sounding.length}`);
            if (Math.abs(sounding[0].frequency - 392) > 0.5) {
                throw new Error(`expected ~392 Hz (G4), got ${sounding[0].frequency}`);
            }
            if (!(await isLit(page, 67))) throw new Error('the focused key is not lit while held');

            await page.keyboard.up(' ');
            if (await isLit(page, 67)) throw new Error('the focused key stayed lit after release');
            await page.evaluate(() => document.activeElement.blur());
        },
    },
    {
        name: 'a focused key released after focus moves does not stick',
        async run(page) {
            // Resolving the note from activeElement at keyup released the wrong
            // note and left the real one sounding until a reload.
            await page.focus('[data-note="67"]');
            await page.keyboard.down(' ');
            await page.keyboard.press('Tab');
            await page.keyboard.up(' ');

            const lit = await page.$$('#keyboard .key--pressed');
            if (lit.length !== 0) throw new Error(`${lit.length} key(s) stuck lit after focus moved mid-hold`);

            const spy = await audioSpy(page);
            const sounding = voicesIn(spy).filter((v) => !v.stopped);
            if (sounding.length !== 0) throw new Error(`${sounding.length} note(s) still sounding`);

            await page.evaluate(() => document.activeElement.blur());
        },
    },
    {
        name: 'a mouse release does not cut a note the keyboard still holds',
        async run(page) {
            // Both paths share one note; the last holder to let go stops it.
            await page.keyboard.down('z'); // C4
            await press(page, '[data-note="60"]');
            await release(page);

            if (!(await isLit(page, 60))) throw new Error('the note went dark while "z" was still down');
            const spy = await audioSpy(page);
            const sounding = voicesIn(spy).filter((v) => !v.stopped);
            if (sounding.length !== 1) throw new Error(`expected the note to keep sounding, got ${sounding.length} live`);

            await page.keyboard.up('z');
            if (await isLit(page, 60)) throw new Error('the note stayed lit after the last holder released');
        },
    },
    {
        name: 'space after a click does not replay the clicked key',
        async run(page) {
            // Space is the panic reflex on an instrument: it must not sound the
            // last key the mouse touched.
            await press(page, '[data-note="60"]');
            await release(page);
            await resetSpy(page);

            await page.keyboard.down(' ');
            const spy = await audioSpy(page);
            const voices = voicesIn(spy);
            if (voices.length !== 0) throw new Error(`space replayed the clicked key (${voices.length} voices)`);
            await page.keyboard.up(' ');
        },
    },
    {
        name: 'black keys fall into the 2–3 groups of a real keyboard',
        async run(page) {
            // Issue #4: the pitch mapping can be perfect while the thing does
            // not read as a keyboard. No other check looks at position, so this
            // regression would otherwise only ever be caught by eye.
            assertKeyboardGeometry(await keyboardLayout(page));
        },
    },
    {
        name: 'the keyboard fills the width it is given, and stays aligned doing it',
        async run(page) {
            // Issue #13. Keys are a fraction of the row rather than a fixed
            // pixel count, so the whole layout is a different arithmetic at
            // every window width — and the one that was looked at by eye is
            // the one width it is guaranteed correct at.
            //
            // Two widths, both wide enough that the keyboard fits: the point is
            // that it *uses* the room, and that black keys still straddle their
            // boundaries when a white key is no longer a round number of pixels.
            const original = page.viewportSize();
            try {
                const widths = [1280, 900];
                const measured = [];
                for (const width of widths) {
                    await page.setViewportSize({ width, height: 800 });
                    const layout = await keyboardLayout(page);
                    // Alignment is the whole risk of fluid sizing, so every
                    // geometric assertion is re-run at each width rather than
                    // trusted from the default one.
                    assertKeyboardGeometry(layout);
                    measured.push({ width, row: layout.row.right - layout.row.left });
                }

                // Fluid means the rendered keyboard is narrower in a narrower
                // window. A fixed-width keyboard passes every alignment
                // assertion above and fails here, which is the defect.
                const [wide, narrow] = measured;
                if (narrow.row >= wide.row - 1) {
                    throw new Error(
                        `the keyboard is ${narrow.row}px at ${narrow.width}px wide and ${wide.row}px at `
                        + `${wide.width}px — it does not follow the window`,
                    );
                }

                // It fills the width it is given up to the cap — past which a
                // wider key is not a better one, so the row stops growing and
                // centres instead. Asserted as "either filling the box or at
                // the cap", because either is correct and which one applies
                // depends on a size decision that lives in the stylesheet.
                await page.setViewportSize({ width: 900, height: 800 });
                const fit = await page.evaluate(() => {
                    const keyboard = document.querySelector('.keyboard');
                    const row = keyboard.querySelector('.keyboard__keys');
                    const style = getComputedStyle(row);
                    return {
                        fill: row.getBoundingClientRect().width / keyboard.clientWidth,
                        atCap: Math.abs(row.getBoundingClientRect().width - parseFloat(style.maxWidth)) < 1,
                    };
                });
                if (fit.fill < 0.99 && !fit.atCap) {
                    throw new Error(`the keyboard fills only ${Math.round(fit.fill * 100)}% of the width it has, and is not at its cap`);
                }

                // A key stays a key's shape at every width — the failure fluid
                // sizing invites is a squat block on a wide screen or a thin
                // slat on a narrow one, and no pitch assertion can see it.
                for (const width of [1280, 700]) {
                    await page.setViewportSize({ width, height: 800 });
                    const shape = await page.evaluate(() => {
                        const key = document.querySelector('#keyboard .key--white').getBoundingClientRect();
                        return key.height / key.width;
                    });
                    if (shape < 4 || shape > 8) {
                        throw new Error(`a white key is ${shape.toFixed(1)}× taller than wide at ${width}px — not a key's proportions`);
                    }
                }
            } finally {
                await page.setViewportSize(original);
            }
        },
    },
    {
        name: 'no key size is written down in the rendering code',
        async run(page) {
            // The coupling this ticket removes: a key's width used to live in
            // the stylesheet *and* in Keyboard.js, which multiplied it to place
            // the black keys, with a comment asking the two to be kept in step
            // by hand. The stylesheet is now the only place a size is decided,
            // and this is what keeps a pixel from creeping back in.
            const source = await (await fetch(`http://localhost:${PORT}/js/ui/Keyboard.js`)).text();
            const pixels = source
                .split('\n')
                .filter((line) => !line.trim().startsWith('//'))
                .filter((line) => /\d+\s*px/.test(line));
            if (pixels.length) {
                throw new Error(`Keyboard.js decides a size in pixels:\n            ${pixels.join('\n            ')}`);
            }

            // The inline styles it does write are percentages of the row — the
            // one thing a fraction-sized keyboard can be positioned in.
            const offsets = await page.$$eval('#keyboard .key--black', (els) => els.map((el) => el.style.left));
            const wrong = offsets.filter((left) => !left.endsWith('%'));
            if (wrong.length) throw new Error(`a black key is positioned in ${wrong[0]}, not a percentage`);

            // The one number both sides still share: how many white keys the
            // range has. Keyboard.js derives it from the range, so it cannot
            // drift; the stylesheet states it, so it can. If they disagree the
            // black keys land on fractions of the wrong row and every offset
            // is subtly off — which is the failure this ticket's whole point
            // was to make impossible, so it gets an assertion rather than a
            // comment asking for care.
            const agreed = await page.evaluate(() => {
                const declared = Number(
                    getComputedStyle(document.querySelector('.keyboard')).getPropertyValue('--white-keys'),
                );
                return { declared, rendered: document.querySelectorAll('#keyboard .key--white').length };
            });
            if (agreed.declared !== agreed.rendered) {
                throw new Error(
                    `the stylesheet sizes for ${agreed.declared} white keys, the keyboard renders ${agreed.rendered}`,
                );
            }
        },
    },
    {
        name: 'three keys held at once produce three live voices',
        async run(page) {
            await page.keyboard.down('z'); // C4
            await page.keyboard.down('c'); // E4
            await page.keyboard.down('b'); // G4

            const spy = await audioSpy(page);
            const sounding = voicesIn(spy).filter((v) => !v.stopped);
            if (sounding.length !== 3) throw new Error(`expected 3 live oscillators, got ${sounding.length}`);

            const frequencies = sounding.map((n) => Math.round(n.frequency));
            // C major: C4 261.63, E4 329.63, G4 392.00
            for (const expected of [262, 330, 392]) {
                if (!frequencies.includes(expected)) {
                    throw new Error(`expected ~${expected} Hz among [${frequencies}]`);
                }
            }

            const lit = await page.$$('#keyboard .key--pressed');
            if (lit.length !== 3) throw new Error(`expected 3 lit keys, got ${lit.length}`);

            // Release them: leaving keys down makes the next check, and the
            // screenshots, depend on this one's teardown.
            for (const key of ['z', 'c', 'b']) await page.keyboard.up(key);
        },
    },
    {
        name: 'the note rows follow physical position, not the character typed',
        async run(page) {
            // On QWERTZ the bottom-left key emits 'y', on AZERTY 'w'. Mapping on
            // event.key scrambles the row for every non-QWERTY layout; mapping
            // on event.code makes the position the identity. Simulated here by
            // sending the German pairing: code KeyZ carrying the character 'y'.
            await page.evaluate(() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', code: 'KeyZ', bubbles: true }));
            });

            const spy = await audioSpy(page);
            const voices = voicesIn(spy);
            if (voices.length !== 1) throw new Error(`expected 1 voice from the physical Z key, got ${voices.length}`);
            if (Math.abs(voices[0].frequency - 262) > 1) {
                throw new Error(`the physical Z key should play C4 (~262 Hz), got ${voices[0].frequency}`);
            }
            if (!(await isLit(page, 60))) throw new Error('the C4 key is not lit');

            await page.evaluate(() => {
                window.dispatchEvent(new KeyboardEvent('keyup', { key: 'y', code: 'KeyZ', bubbles: true }));
            });
            if (await isLit(page, 60)) throw new Error('the note did not release');
        },
    },
    {
        name: 'the typing rows still sound C4–C6, not the keyboard\'s new lowest note',
        async run(page) {
            // The rows are anchored to their own constant, not to the range's
            // first note. Widening the keyboard down to C2 must not drag them
            // with it: nothing needs to type a C2, and moving them would break
            // muscle memory that already works.
            await resetSpy(page);
            await page.keyboard.down('z'); // first key of the lower row
            const first = voicesIn(await audioSpy(page));
            if (first.length !== 1) throw new Error(`expected 1 voice, got ${first.length}`);
            if (Math.abs(first[0].frequency - 262) > 1) {
                throw new Error(`the lower row should start at C4 (~262 Hz), got ${first[0].frequency}`);
            }
            if (!(await isLit(page, 60))) throw new Error('the C4 key is not the one lit');
            await page.keyboard.up('z');

            // And the top of the upper row is the top of the range.
            await resetSpy(page);
            await page.keyboard.down('u'); // last key of the upper row
            if (!(await isLit(page, 83))) throw new Error('the top of the upper row is not B5');
            await page.keyboard.up('u');
        },
    },
    {
        name: 'a narrow window does not push the page sideways',
        async run(page) {
            // Four octaves is wider than a phone, and the default 1280px
            // viewport hides that from every other check — which is exactly how
            // a layout defect ships. The keyboard must scroll inside its own
            // box rather than dragging the heading and the pads off-screen.
            const original = page.viewportSize();
            try {
                await page.setViewportSize({ width: 390, height: 800 });
                const overflow = await page.evaluate(() => ({
                    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                    keyboardScrolls: document.querySelector('.keyboard').scrollWidth
                        > document.querySelector('.keyboard').clientWidth,
                }));
                if (overflow.page > 1) throw new Error(`the page scrolls sideways by ${overflow.page}px at 390px wide`);
                if (!overflow.keyboardScrolls) throw new Error('the keyboard does not scroll inside its own box at 390px');

                // And it still fits without scrolling where there is room.
                await page.setViewportSize({ width: 1280, height: 800 });
                const wide = await page.evaluate(() => {
                    const k = document.querySelector('.keyboard');
                    return k.scrollWidth - k.clientWidth;
                });
                if (wide > 1) throw new Error(`the keyboard scrolls at 1280px, where it should fit (${wide}px)`);
            } finally {
                await page.setViewportSize(original);
            }
        },
    },
    {
        name: 'the chord register plays when clicked',
        async run(page) {
            // The lower octaves are a register, not a display. The typing rows
            // do not reach them, so the mouse is the only way in — and if that
            // stopped working they would be decoration.
            await resetSpy(page);
            await press(page, '[data-note="36"]'); // C2, the lowest key
            const voices = voicesIn(await audioSpy(page));
            if (voices.length !== 1) throw new Error(`expected the lowest key to sound, got ${voices.length} voices`);
            if (Math.abs(voices[0].frequency - 65) > 1) {
                throw new Error(`C2 should be ~65 Hz, got ${voices[0].frequency}`);
            }
            await release(page);
            if (await isLit(page, 36)) throw new Error('the lowest key stayed lit after release');
        },
    },
    {
        name: 'the whole upper octave sounds',
        async run(page) {
            // The upper row being dead entirely went undetected: every check
            // that pressed a note used the lower row.
            await page.keyboard.down('q'); // C5
            await page.keyboard.down('u'); // B5

            const spy = await audioSpy(page);
            const sounding = voicesIn(spy).filter((v) => !v.stopped);
            if (sounding.length !== 2) throw new Error(`expected 2 live oscillators, got ${sounding.length}`);
            const frequencies = sounding.map((n) => Math.round(n.frequency));
            for (const expected of [523, 988]) { // C5, B5
                if (!frequencies.includes(expected)) throw new Error(`expected ~${expected} Hz among [${frequencies}]`);
            }

            for (const key of ['q', 'u']) await page.keyboard.up(key);
        },
    },
    {
        name: 'Enter and Space hold independently',
        async run(page) {
            // One shared slot meant either key's release stopped the other's
            // note, and a stray keyup killed a note that was still held.
            await page.focus('[data-note="64"]');
            await page.keyboard.down(' ');
            await page.keyboard.down('Enter');
            await page.keyboard.up('Enter');

            if (!(await isLit(page, 64))) throw new Error('releasing Enter stopped the note Space is holding');

            await page.keyboard.up(' ');
            if (await isLit(page, 64)) throw new Error('the note outlived both keys');
            await page.evaluate(() => document.activeElement.blur());
        },
    },
    {
        name: 'two pointers on different keys each release their own note',
        async run(page) {
            // A single pointer slot lost the first press, stranding its note
            // sounding for good — the app's worst failure mode, and the default
            // way anyone plays a chord on a touchscreen.
            //
            // Dispatched as real PointerEvents rather than driven through CDP:
            // CDP is Chromium-only, and this must run on WebKit too, which is
            // the engine every iOS browser actually uses.
            await page.evaluate(() => {
                const fire = (target, type, pointerId) => target.dispatchEvent(
                    new PointerEvent(type, { pointerId, pointerType: 'touch', bubbles: true, cancelable: true }),
                );
                const first = document.querySelector('[data-note="60"]');
                const second = document.querySelector('[data-note="64"]');

                fire(first, 'pointerdown', 1);
                fire(second, 'pointerdown', 2);
                fire(document, 'pointerup', 1); // lift the first finger
                fire(document, 'pointerup', 2); // then the second
            });

            const lit = await page.$$('#keyboard .key--pressed');
            if (lit.length !== 0) throw new Error(`${lit.length} key(s) stuck lit after both fingers lifted`);

            const spy = await audioSpy(page);
            const voices = voicesIn(spy);
            if (voices.length !== 2) throw new Error(`expected 2 notes from 2 fingers, got ${voices.length}`);
            const sounding = voicesIn(spy).filter((v) => !v.stopped);
            if (sounding.length !== 0) throw new Error(`${sounding.length} note(s) sounding after both fingers lifted`);
        },
    },
    {
        name: 'a cancelled pointer releases its note',
        async run(page) {
            // pointercancel fires whenever the browser takes over the gesture —
            // a scroll, a system gesture. Dropping it strands the note.
            await page.evaluate(() => {
                window.__lastPointerId = null;
                document.addEventListener('pointerdown', (e) => { window.__lastPointerId = e.pointerId; }, { once: true });
            });
            await press(page, '[data-note="60"]');
            if (!(await isLit(page, 60))) throw new Error('the note did not start');

            // Cancel alone, with no pointerup after it — otherwise pointerup
            // does the release and the check passes even with pointercancel
            // unregistered.
            const pointerId = await page.evaluate(() => window.__lastPointerId);
            await page.evaluate((id) => {
                document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, bubbles: true }));
            }, pointerId);

            const lit = await page.$$('#keyboard .key--pressed');
            if (lit.length !== 0) throw new Error(`${lit.length} key(s) still lit after pointercancel`);

            await page.mouse.up(); // tidy up the still-down mouse button
        },
    },
    {
        name: 'the build number on screen is the one in the source',
        async run(page) {
            // The tag exists to tell a stale CDN copy from a fresh one, so the
            // only failure that matters is the page showing something other
            // than what the repo says — a hardcoded string in the markup, or a
            // module that silently failed to load, would both look fine by eye.
            const shown = await page.textContent('#version-tag');
            const source = await page.evaluate(async () => {
                const mod = await import('/js/version.js?cachebust=' + Date.now());
                return mod.VERSION;
            });
            if (shown !== source) {
                throw new Error(`tag shows "${shown}", js/version.js says "${source}"`);
            }
            if (!/^b\d+$/.test(source)) {
                throw new Error(`build number should be b<digits>, got "${source}"`);
            }
        },
    },
    {
        name: 'the build number does not sit on anything clickable',
        async run(page) {
            // It is fixed over the page, so it overlaps whatever scrolls under
            // it. `pointer-events: none` is the thing under test: the element
            // under that point must never be the tag itself.
            const box = await page.$eval('#version-tag', (el) => {
                const r = el.getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            });
            const hit = await page.evaluate(
                ({ x, y }) => document.elementFromPoint(x, y)?.id ?? '',
                box,
            );
            if (hit === 'version-tag') throw new Error('the build tag is swallowing clicks');
        },
    },
];

// ─── Check helpers ───────────────────────────────────────────────────────────
// Each check owns a clean spy: the run is one long-lived page, and a shared
// call log would make every check depend on the order of the ones before it.

async function audioSpy(page) {
    return page.evaluate(() => window.audioSpy);
}

// A note is several oscillators, not one: a preset stacks detuned copies, which
// is most of what separates a synth from a test tone. Checks care how many
// *notes* are sounding, so they count distinct pitches — that stays true however
// many layers a preset grows.
function voicesIn(spy) {
    const started = spy.nodes.filter((n) => n.node === 'oscillator' && n.started);
    const byPitch = new Map();
    for (const osc of started) {
        // Round: detuned layers sit a few cents either side of the true pitch.
        const pitch = Math.round(osc.frequency);
        if (!byPitch.has(pitch)) byPitch.set(pitch, []);
        byPitch.get(pitch).push(osc);
    }
    return [...byPitch.entries()].map(([frequency, oscillators]) => ({
        frequency,
        oscillators,
        // The waveforms a preset stacked for this note.
        types: [...new Set(oscillators.map((o) => o.type))],
        stopped: oscillators.every((o) => o.stopped),
    }));
}

async function resetSpy(page) {
    await page.evaluate(() => {
        window.audioSpy.calls.length = 0;
        window.audioSpy.nodes.length = 0;
    });
}

// Pointer down and up are separate: holding is the thing under test, so no
// check may use click(), which does both.
async function press(page, selector) {
    const box = await (await page.$(selector)).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
    await page.mouse.down();
}

// The pointer is released wherever it happens to be — that is what the
// document-level listener handles, and it is how a real release behaves.
async function release(page) {
    await page.mouse.up();
}

// ─── Keyboard geometry ───────────────────────────────────────────────────────
// Read once, asserted many times. Keys are sized as a fraction of the row
// (issue #13), so the layout is different arithmetic at every window width and
// every geometric assertion has to be re-runnable at a new one.

async function keyboardLayout(page) {
    return page.evaluate(() => {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const keys = [...document.querySelectorAll('#keyboard .key')].map((key) => ({
            note: Number(key.dataset.note),
            black: key.classList.contains('key--black'),
            left: key.getBoundingClientRect().left,
            right: key.getBoundingClientRect().right,
        }));
        const row = document.querySelector('.keyboard__keys').getBoundingClientRect();
        return {
            row: { left: row.left, right: row.right },
            keys: keys.map((k) => ({ ...k, name: names[k.note % 12] })),
        };
    });
}

function assertKeyboardGeometry(layout) {
    // 1. No black key on the E–F or B–C boundary — the gaps are what
    //    make the groups legible.
    for (const white of layout.keys.filter((k) => !k.black)) {
        if (white.name !== 'E' && white.name !== 'B') continue;
        const next = layout.keys.find((k) => k.note === white.note + 1);
        if (next?.black) throw new Error(`a black key sits above ${white.name} — that gap must be empty`);
    }

    // 2. Each black key straddles the boundary between two white keys,
    //    rather than floating over the middle of one. The tolerance is a
    //    device pixel: a fractional key width means the boundary lands
    //    off the integer grid, and the browser rounds the two rectangles
    //    independently. Anything looser stops being an alignment check.
    const whites = layout.keys.filter((k) => !k.black);
    for (const black of layout.keys.filter((k) => k.black)) {
        const centre = (black.left + black.right) / 2;
        const straddled = whites.some((w) => Math.abs(w.right - centre) < 1);
        if (!straddled) throw new Error(`the black key at MIDI ${black.note} does not sit on a white-key boundary`);
    }

    // 3. The groups really are 2 then 3. DOM order is chromatic, so
    //    black keys are never adjacent there — the grouping is a fact
    //    about horizontal position. Walk them left to right and split
    //    the run wherever the gap widens to a skipped white key.
    const blacks = layout.keys.filter((k) => k.black).sort((a, b) => a.left - b.left);
    const step = Math.min(...blacks.slice(1).map((k, i) => k.left - blacks[i].left));
    const groups = [];
    let run = 1;
    for (let i = 1; i < blacks.length; i++) {
        // A gap of one step means the next black key is the neighbour;
        // anything wider is the E–F or B–C skip that ends a group.
        if (blacks[i].left - blacks[i - 1].left < step * 1.5) run++;
        else { groups.push(run); run = 1; }
    }
    groups.push(run);

    // Four octaves from C: 2,3 four times — the final C adds no black key.
    const expected = [2, 3, 2, 3, 2, 3, 2, 3];
    if (String(groups) !== String(expected)) {
        throw new Error(`black keys group as [${groups}], expected [${expected}]`);
    }

    // 4. Nothing clipped at either end — black keys included. A black key
    //    is centred on a boundary, and C2 and C6 are naturals with no
    //    black key outside them, so every key of either colour must fall
    //    inside the row.
    const leftmost = Math.min(...layout.keys.map((k) => k.left));
    const rightmost = Math.max(...layout.keys.map((k) => k.right));
    if (leftmost < layout.row.left - 1) throw new Error('a key is clipped at the left edge');
    if (rightmost > layout.row.right + 1) throw new Error('a key is clipped at the right edge');
}

async function isLit(page, midiNumber) {
    return page.evaluate(
        (note) => document.querySelector(`[data-note="${note}"]`).classList.contains('key--pressed'),
        midiNumber,
    );
}

// Every lit key, ascending. Asserting the whole set rather than one key at a
// time is what catches a chord lighting notes it does not play.
async function litNotes(page) {
    return page.$$eval('#keyboard .key--pressed', (els) => els.map((el) => Number(el.dataset.note)).sort((a, b) => a - b));
}

// ─── Run ─────────────────────────────────────────────────────────────────────
// Every check runs against both engines. Chromium alone let a WebKit-only bug
// ship: the engine constructed an unprefixed AudioContext, which does not exist
// on older iOS, so the app was silent on every browser on the platform (they are
// all WebKit underneath) while the checks stayed green. See issue #5.
//
// Playwright's WebKit is not Safari-on-iOS — it does not enforce iOS's stricter
// gesture rules for audio — so a real device stays the final word. It is much
// closer than Chromium, and it would have caught that bug.

const ENGINES = [
    { name: 'chromium', launch: chromium, screenshots: true },
    // Screenshots come from one engine only: two sets of the same layout is
    // twice the images and no more information.
    { name: 'webkit', launch: webkit, screenshots: false },
];

const server = await serve();
let failures = 0;

try {
    for (const engine of ENGINES) {
        console.log(`\n  ${engine.name}`);
        const browser = await engine.launch.launch();
        try {
            failures += await runChecks(browser, engine);
        } finally {
            await browser.close();
        }
    }
} finally {
    server.close();
}

async function runChecks(browser, engine) {
    let failed = 0;
    const page = await newPage(browser);

    // Level 1: anything the page says about itself. Collected for the whole run,
    // asserted at the end so a late error still fails the run.
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    page.on('requestfailed', (r) => failedRequests.push(`${r.url()} — ${r.failure()?.errorText}`));

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

    for (const check of checks) {
        try {
            await resetSpy(page);
            await check.run(page, browser);
            console.log(`    ok    ${check.name}`);
        } catch (err) {
            failed++;
            console.log(`    FAIL  ${check.name}\n            ${err.message}`);
        }
    }

    if (consoleErrors.length) {
        failed++;
        console.log(`    FAIL  console is clean\n${consoleErrors.map((e) => `            ${e}`).join('\n')}`);
    } else {
        console.log('    ok    console is clean');
    }

    if (failedRequests.length) {
        failed++;
        console.log(`    FAIL  all requests resolved\n${failedRequests.map((r) => `            ${r}`).join('\n')}`);
    } else {
        console.log('    ok    all requests resolved');
    }

    if (engine.screenshots) {
        // Level 5: taken unconditionally, pass or fail. A visual check that only
        // runs on demand is one that gets skipped exactly when it matters.
        await mkdir(SHOTS, { recursive: true });

        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        const idle = join(SHOTS, 'app.png');
        await page.screenshot({ path: idle, fullPage: true });

        // The pressed state is where misalignment and an invisible active state
        // actually show, so the chord is the shot worth looking at hardest.
        // A pad and the drone, plus a melody note held by hand: this is the
        // shot that shows both registers lit at once, which is the whole point
        // of the four-octave range.
        await page.click('.pad[data-degree="0"]');
        await page.click('#drone');
        for (const key of ['e', 'y']) await page.keyboard.down(key);
        const chord = join(SHOTS, 'app-chord.png');
        await page.screenshot({ path: chord, fullPage: true });
        for (const key of ['e', 'y']) await page.keyboard.up(key);
        await page.click('#drone');
        await page.click('.pad[data-degree="0"]');

        // The keyboard is sized as a fraction of the window (issue #13), so
        // there is no longer one layout to look at. A narrow shot is where
        // fluid sizing actually goes wrong — keys too thin to read, a
        // misaligned black key, the in-scale dot bigger than the key it marks —
        // and none of that is visible at 1280px.
        const original = page.viewportSize();
        await page.setViewportSize({ width: 700, height: 800 });
        const narrow = join(SHOTS, 'app-narrow.png');
        await page.screenshot({ path: narrow, fullPage: true });
        await page.setViewportSize(original);

        const shots = [idle, chord, narrow].map((f) => f.replace(ROOT, '')).join(', ');
        console.log(`\n  screenshots → ${shots}`);
        console.log('                (look at them — it is not verified until you have)');
    }

    await page.close();
    return failed;
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
