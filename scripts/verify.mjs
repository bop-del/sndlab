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
import { chromium } from 'playwright';

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
    window.audioSpy = { calls, nodes };

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

    wrap(window.AudioContext);
    wrap(window.OfflineAudioContext);
}

// ─── Checks ──────────────────────────────────────────────────────────────────
// One entry per claim. Kept inline while the app is small; when this list
// outgrows the file, split to scripts/checks/ along component lines — the same
// boundary UI.js will split on (see issue #3).

const checks = [
    {
        name: 'page loads with a title',
        async run(page) {
            const title = await page.title();
            if (!title) throw new Error('no <title>');
        },
    },
    {
        name: 'the keyboard renders two octaves of keys',
        async run(page) {
            // A dead listener is the classic no-build failure: the module 404s
            // and nothing renders. An empty container catches that.
            const keys = await page.$$('#keyboard .key');
            if (keys.length !== 25) throw new Error(`expected 25 keys (C to C), got ${keys.length}`);
            const white = await page.$$('#keyboard .key--white');
            const black = await page.$$('#keyboard .key--black');
            if (white.length !== 15) throw new Error(`expected 15 white keys, got ${white.length}`);
            if (black.length !== 10) throw new Error(`expected 10 black keys, got ${black.length}`);
        },
    },
    {
        name: 'clicking a key starts an oscillator at that pitch',
        async run(page) {
            // A4 = MIDI 69 = 440 Hz. Proves the whole chain: DOM → mapping →
            // MIDI → frequency → Web Audio.
            await press(page, '[data-note="69"]');
            const spy = await audioSpy(page);

            const started = spy.nodes.filter((n) => n.node === 'oscillator' && n.started);
            if (started.length !== 1) throw new Error(`expected 1 started oscillator, got ${started.length}`);
            const [osc] = started;
            if (Math.abs(osc.frequency - 440) > 0.01) throw new Error(`expected 440 Hz, got ${osc.frequency}`);
            if (osc.type !== 'sawtooth') throw new Error(`expected sawtooth, got ${osc.type}`);

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

            const started = spy.nodes.filter((n) => n.node === 'oscillator' && n.started);
            if (started.length !== 1) throw new Error(`expected 1 started oscillator, got ${started.length}`);
            if (Math.abs(started[0].frequency - 440) > 0.01) {
                throw new Error(`expected 440 Hz from the "n" key, got ${started[0].frequency}`);
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
            const started = spy.nodes.filter((n) => n.node === 'oscillator' && n.started);
            if (started.length !== 1) throw new Error(`expected 1 started oscillator, got ${started.length}`);
            if (!started[0].stopped) throw new Error('releasing the key did not stop the oscillator');
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
            const started = spy.nodes.filter((n) => n.node === 'oscillator' && n.started);
            if (started.length !== 1) {
                throw new Error(`three keydowns started ${started.length} oscillators, expected 1`);
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
            const started = spy.nodes.filter((n) => n.node === 'oscillator' && n.started);
            const sounding = started.filter((n) => !n.stopped);
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
            const sounding = spy.nodes.filter((n) => n.node === 'oscillator' && n.started && !n.stopped);
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
            const sounding = spy.nodes.filter((n) => n.node === 'oscillator' && n.started && !n.stopped);
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
            const sounding = spy.nodes.filter((n) => n.node === 'oscillator' && n.started && !n.stopped);
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
            const started = spy.nodes.filter((n) => n.node === 'oscillator' && n.started);
            if (started.length !== 0) throw new Error(`space replayed the clicked key (${started.length} oscillator)`);
            await page.keyboard.up(' ');
        },
    },
    {
        name: 'three keys held at once produce three live voices',
        async run(page) {
            await page.keyboard.down('z'); // C4
            await page.keyboard.down('c'); // E4
            await page.keyboard.down('b'); // G4

            const spy = await audioSpy(page);
            const sounding = spy.nodes.filter((n) => n.node === 'oscillator' && n.started && !n.stopped);
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
        },
    },
];

// ─── Check helpers ───────────────────────────────────────────────────────────
// Each check owns a clean spy: the run is one long-lived page, and a shared
// call log would make every check depend on the order of the ones before it.

async function audioSpy(page) {
    return page.evaluate(() => window.audioSpy);
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

async function isLit(page, midiNumber) {
    return page.evaluate(
        (note) => document.querySelector(`[data-note="${note}"]`).classList.contains('key--pressed'),
        midiNumber,
    );
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const server = await serve();
const browser = await chromium.launch();
let failures = 0;

try {
    const page = await browser.newPage();

    // Level 1: anything the page says about itself. Collected for the whole run,
    // asserted at the end so a late error still fails the run.
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    page.on('requestfailed', (r) => failedRequests.push(`${r.url()} — ${r.failure()?.errorText}`));

    await page.addInitScript(installAudioSpy);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

    for (const check of checks) {
        try {
            await resetSpy(page);
            await check.run(page);
            console.log(`  ok    ${check.name}`);
        } catch (err) {
            failures++;
            console.log(`  FAIL  ${check.name}\n          ${err.message}`);
        }
    }

    if (consoleErrors.length) {
        failures++;
        console.log(`  FAIL  console is clean\n${consoleErrors.map((e) => `          ${e}`).join('\n')}`);
    } else {
        console.log('  ok    console is clean');
    }

    if (failedRequests.length) {
        failures++;
        console.log(`  FAIL  all requests resolved\n${failedRequests.map((r) => `          ${r}`).join('\n')}`);
    } else {
        console.log('  ok    all requests resolved');
    }

    // Level 5: taken unconditionally, pass or fail. A visual check that only
    // runs on demand is one that gets skipped exactly when it matters.
    await mkdir(SHOTS, { recursive: true });

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const idle = join(SHOTS, 'app.png');
    await page.screenshot({ path: idle, fullPage: true });

    // The pressed state is where misalignment and an invisible active state
    // actually show, so the chord is the shot worth looking at hardest.
    for (const key of ['z', 'c', 'b']) await page.keyboard.down(key);
    const chord = join(SHOTS, 'app-chord.png');
    await page.screenshot({ path: chord, fullPage: true });
    for (const key of ['z', 'c', 'b']) await page.keyboard.up(key);

    console.log(`\n  screenshots → ${idle.replace(ROOT, '')}, ${chord.replace(ROOT, '')}`);
    console.log('                (look at them — it is not verified until you have)');
} finally {
    await browser.close();
    server.close();
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
