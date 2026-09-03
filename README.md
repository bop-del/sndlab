# sndlab

A small web synth / audio application in the browser. Framework-free.

**Live:** https://bop-del.github.io/sndlab/

## Architecture

No framework, no runtime dependency, no build step.

- **Vanilla JS + native ES modules** (`<script type="module">`)
- **Web Audio API** directly, AudioWorklets for DSP
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

## Structure

```
index.html
css/base.css
js/
├── main.js          entry point
├── audio/           AudioEngine, synth voices, worklets
└── ui/              UI components
docs/adr/            architecture decisions
```

## Rules

- **No runtime dependencies.** No npm package in shipped code.
- **No build step.** What is in the repo runs in the browser.
- **State in the URL.** Sharing without a backend, for as long as that holds.
- **Keep files small.** Split at ~500 lines.
- **English everywhere.**

See `CLAUDE.md` for the full working agreement and `docs/adr/` for the reasoning.
