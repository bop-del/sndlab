// Throwaway repro for "clicking around leads to total silence".
//
//   node scripts/repro-silence.mjs
//
// Clicks through the app the way a person exploring it would — pads, drone,
// preset, scale, keys, in varying orders — and after each step asserts that a
// freshly played note still starts a voice. Goes red the moment the app stops
// making sound, and names the step that killed it.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8124;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = await new Promise((resolve) => {
    const s = createServer(async (req, res) => {
        const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '');
        try {
            res.writeHead(200, { 'content-type': `${MIME[extname(rel)] ?? 'application/octet-stream'}; charset=utf-8` });
            res.end(await readFile(join(ROOT, rel)));
        } catch {
            res.writeHead(404).end('not found');
        }
    });
    s.listen(PORT, () => resolve(s));
});

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.addInitScript(() => {
    const started = [];
    window.__probe = { started };
    const wrap = (Ctor) => {
        if (!Ctor) return;
        const orig = Ctor.prototype.createOscillator;
        Ctor.prototype.createOscillator = function (...args) {
            const osc = orig.apply(this, args);
            const origStart = osc.start.bind(osc);
            osc.start = (...a) => {
                started.push({ frequency: osc.frequency.value, at: Date.now() });
                return origStart(...a);
            };
            return osc;
        };
    };
    wrap(window.AudioContext);
    wrap(window.webkitAudioContext);

    // Oscillators starting is not the same as sound arriving. Tap the real
    // output with an analyser so the probe measures what a listener would.
    window.__level = async () => {
        const { AudioEngine } = await import('/js/audio/AudioEngine.js');
        const ctx = AudioEngine.ctx;
        if (!ctx) return null;
        if (!window.__analyser && AudioEngine.filter) {
            const a = ctx.createAnalyser();
            a.fftSize = 2048;
            AudioEngine.filter.connect(a);
            window.__analyser = a;
        }
        if (!window.__analyser) return null;
        const buf = new Float32Array(window.__analyser.fftSize);
        window.__analyser.getFloatTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v));
        return peak;
    };
});

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

// Does playing a key still make sound?
async function stillSounds(label) {
    await page.evaluate(() => { window.__probe.started.length = 0; });
    const box = await (await page.$('[data-note="67"]')).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
    await page.mouse.down();
    await page.waitForTimeout(180); // let the attack land before measuring
    const started = await page.evaluate(() => window.__probe.started.length);
    const peak = await page.evaluate(() => window.__level());
    const audible = peak !== null && peak > 0.001;
    const verdict = started > 0 && audible ? 'ok    ' : 'SILENT';
    const held = await page.evaluate(async () => {
        const { Notes } = await import('/js/audio/Notes.js');
        const { AudioEngine } = await import('/js/audio/AudioEngine.js');
        return `${Notes.held.size}/${AudioEngine.voices.size}`;
    });
    console.log(`  ${verdict} after: ${label.padEnd(28)} peak ${String(peak?.toFixed(4)).padEnd(7)} held/engine ${held}`);
    await page.mouse.up();
    return started > 0 && audible;
}

// The kind of poking around a person does when exploring.
const steps = [
    ['fresh load', async () => {}],
    ['press pad i', async () => page.click('.pad[data-degree="0"]')],
    ['press pad IV', async () => page.click('.pad[data-degree="3"]')],
    ['toggle it off', async () => page.click('.pad[data-degree="3"]')],
    ['drone on', async () => page.click('#drone')],
    ['drone off', async () => page.click('#drone')],
    ['drone on again', async () => page.click('#drone')],
    ['switch scale while droning', async () => page.selectOption('#scale', 'natural-minor')],
    ['switch root', async () => page.selectOption('#root', '65')],
    ['switch preset', async () => page.selectOption('#preset', 'pluck')],
    ['pad + drone together', async () => { await page.click('.pad[data-degree="2"]'); await page.click('#drone'); }],
    ['switch scale again', async () => page.selectOption('#scale', 'phrygian')],
    ['sweep the cutoff', async () => { await page.fill('#cutoff', '0.05'); await page.dispatchEvent('#cutoff', 'input'); }],
    ['cutoff back up', async () => { await page.fill('#cutoff', '0.6'); await page.dispatchEvent('#cutoff', 'input'); }],
    ['every pad in turn', async () => {
        for (let d = 0; d < 7; d++) await page.click(`.pad[data-degree="${d}"]`);
    }],
    ['preset back to pad', async () => page.selectOption('#preset', 'pad')],
];

// Warm-up: the analyser can only tap the filter once the engine has built it,
// which happens on the first note. Without this the first measurement reads
// zero and is a false red.
await stillSounds('warm-up (ignored)');

let firstSilent = null;
for (const [label, run] of steps) {
    await run();
    await page.waitForTimeout(40);
    if (!(await stillSounds(label)) && !firstSilent) firstSilent = label;
}

// The scripted tour is too polite. The report was "clicked around further and
// now nothing sounds", so hammer it: many interactions, fast, in a shuffled
// order, checking audibility throughout.
console.log('\n--- hammering ---');
const actions = [
    () => page.click('.pad[data-degree="0"]'),
    () => page.click('.pad[data-degree="1"]'),
    () => page.click('.pad[data-degree="4"]'),
    () => page.click('.pad[data-degree="6"]'),
    () => page.click('#drone'),
    () => page.selectOption('#scale', 'natural-minor'),
    () => page.selectOption('#scale', 'phrygian'),
    () => page.selectOption('#root', '62'),
    () => page.selectOption('#root', '60'),
    () => page.selectOption('#preset', 'pluck'),
    () => page.selectOption('#preset', 'pad'),
];
for (let round = 1; round <= 8; round++) {
    for (let i = 0; i < 12; i++) {
        await actions[Math.floor(Math.random() * actions.length)]();
        await page.waitForTimeout(15);
    }
    if (!(await stillSounds(`hammer round ${round}`)) && !firstSilent) firstSilent = `hammer round ${round}`;
}

// How many voices does the engine still think it has? A number that only grows
// is the shape of a leak.
const leaked = await page.evaluate(async () => {
    const { AudioEngine } = await import('/js/audio/AudioEngine.js');
    const { Notes } = await import('/js/audio/Notes.js');
    return { engineVoices: AudioEngine.voices.size, held: Notes.held.size, holders: Notes.holders.size };
});

console.log('\nengine state after all that:', JSON.stringify(leaked));
if (errors.length) console.log('console errors:\n  ' + errors.join('\n  '));
console.log(firstSilent ? `\nRED — first silent after: ${firstSilent}` : '\nGREEN — still sounding throughout');

await browser.close();
server.close();
process.exit(firstSilent ? 1 : 0);
