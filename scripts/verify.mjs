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
                const record = { node: 'oscillator', type: osc.type, frequency: osc.frequency.value, started: false };
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
        name: 'module graph resolves (UI is wired to the button)',
        async run(page) {
            const button = await page.$('#play');
            if (!button) throw new Error('#play not found');
            // A dead listener is the classic no-build failure: the module 404s,
            // the button renders, and nothing happens on click.
            const status = await page.textContent('#status');
            if (status !== '') throw new Error(`#status should start empty, got "${status}"`);
        },
    },
    {
        name: 'clicking play reports the note in #status',
        async run(page) {
            await page.click('#play');
            await page.waitForFunction(() => document.getElementById('status').textContent !== '');
            const status = await page.textContent('#status');
            if (!status.includes('220 Hz')) throw new Error(`expected "220 Hz" in status, got "${status}"`);
            if (!status.includes('running')) throw new Error(`AudioContext not running: "${status}"`);
        },
    },
    {
        name: 'engine started an oscillator at 220 Hz',
        async run(page) {
            const spy = await page.evaluate(() => window.audioSpy);

            // Guard against a silently blind spy: if the engine moves to an
            // AudioWorklet these wrappers see nothing, and an empty log must
            // fail loudly rather than pass as "no errors".
            if (spy.calls.length === 0) {
                throw new Error('audio spy recorded nothing — engine may no longer use the wrapped Web Audio calls');
            }

            const started = spy.nodes.filter((n) => n.node === 'oscillator' && n.started);
            if (started.length !== 1) throw new Error(`expected 1 started oscillator, got ${started.length}`);
            const [osc] = started;
            if (osc.frequency !== 220) throw new Error(`expected 220 Hz, got ${osc.frequency}`);
            if (osc.type !== 'sawtooth') throw new Error(`expected sawtooth, got ${osc.type}`);
        },
    },
    {
        name: 'envelope ramps the gain up and back down',
        async run(page) {
            const spy = await page.evaluate(() => window.audioSpy);
            const gain = spy.nodes.find((n) => n.node === 'gain');
            if (!gain) throw new Error('no gain node — the oscillator is connected straight to the destination');
            const methods = gain.ramps.map((r) => r.method);
            if (!methods.includes('linearRampToValueAtTime')) throw new Error('no attack ramp');
            if (!methods.includes('exponentialRampToValueAtTime')) throw new Error('no decay ramp');
        },
    },
];

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
    const shot = join(SHOTS, 'app.png');
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`\n  screenshot → ${shot.replace(ROOT, '')}  (look at it — it is not verified until you have)`);
} finally {
    await browser.close();
    server.close();
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
