# sndlab

A tool for learning harmony by ear, that sounds good enough to enjoy playing.
Framework-free, in the browser.

**Live:** https://bop-del.github.io/sndlab/

Pick a scale, press a chord, play a melody over it, and hear why that scale
sounds the way it does. Not a synth and not a groovebox — harmony is the point,
and the synth is there to serve it, because a scale played through a bad tone
teaches nothing. See [ADR 0005](docs/adr/0005-a-tool-for-learning-harmony.md).

The frame is electronic music, so the scale list is short and opinionated rather
than complete, and each entry carries one sentence saying what to listen for.

## What it does

- **Scales** — natural minor and Phrygian, with the keyboard marking which notes
  belong. Out-of-scale notes still play; hearing the difference is the point.
- **Chord pads** — one per scale degree, labelled in roman numerals so the row
  is itself a picture of the scale's shape. They latch, one at a time.
- **A root drone** — a held tonic, and a peer of the pads rather than a setting.
  It is the other way harmony works in this music: Goa trance is a sustained
  tonal centre with modal melody over it, where chord changes work against the
  character. It is also what makes a scale audible — the ♭2 that defines
  Phrygian sits in a *major* chord, so the darkness only exists against the root.
- **Sound** — three presets with a filter you can sweep while notes are held.

## Architecture

No framework, no runtime dependency, no build step.

- **Vanilla JS + native ES modules** (`<script type="module">`)
- **Web Audio API** directly
- **Handwritten CSS**
- **GitHub Pages** — the repo *is* the website, push equals deploy

Reference: [AcidBros](https://github.com/acidsound/acidBros)

## Development

No build needed. Start a static server — ES modules require HTTP, `file://`
will not do:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Change a file, reload the browser. That is the whole loop.

`bin/setup` runs a health check over prerequisites and the deploy chain.

## Verification

There is no build step, but there is a verification run: headless Chromium and
WebKit are driven over the real page, and the Web Audio calls the engine
actually made are asserted on.

```bash
npm install                  # once — Playwright and its browsers
node scripts/verify.mjs      # the page, in a real browser
node scripts/check-theory.mjs  # scale and chord arithmetic, directly
```

`verify.mjs` writes screenshots to `.screenshots/` on every run, pass or fail.
**Nothing is verified until those have been looked at** — the checks assert
classes and call arguments, not whether a human can see or hear anything. Every
visual bug so far was caught by the screenshot and missed by the checks.

Two things it deliberately does not prove: that the result *sounds good*, and
that a layout *reads well*. Both stay human judgements. See
[ADR 0004](docs/adr/0004-dev-dependencies.md) for why dev dependencies are
allowed here while shipped code has none.

## Structure

```
index.html
css/base.css
js/
├── main.js          entry point
├── theory/          Scales — pure arithmetic, no audio, no DOM
├── audio/           AudioEngine, Notes (who holds what), Presets
└── ui/              Keyboard, ChordPads, ScalePicker, SoundControls
scripts/             verification runs — dev only, never shipped
docs/
├── adr/             architecture decisions
├── research/        sourced findings behind the design
└── agents/          how the tracker, labels and board are used
```

## Rules

- **No runtime dependencies.** No npm package in shipped code. Dev tooling under
  `scripts/` is the one exception, and it never reaches a browser.
- **No build step.** What is in the repo runs in the browser.
- **State in the URL.** Sharing without a backend, for as long as that holds.
- **Keep files small.** Split at ~500 lines.
- **English everywhere.**

See `CLAUDE.md` for the full working agreement, `CONTEXT.md` for the vocabulary,
and `docs/adr/` for the reasoning.
