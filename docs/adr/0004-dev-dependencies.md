# ADR 0004 — Dev dependencies are permitted; shipped code stays dependency-free

**Status:** accepted
**Date:** 2026-09-03

## Context

Verification in this project was manual: serve the repo, open the page, click
the thing, listen, check the console. `CLAUDE.md` put it plainly — *"Never claim
'it works' without having seen it in the browser. HTTP 200 proves delivery, not
sound."*

That bar is correct and it is also unenforceable by an agent. An agent that
cannot open a browser either claims success it has not verified, or hands every
change back for manual checking. Both destroy the fast iteration loop that
ADR 0001 exists to protect.

Automating it requires driving a real browser, and every way to do that is Node
tooling. That collides with rule 1 in `CLAUDE.md`: **no runtime dependencies, no
npm package in shipped code.**

## Decision

**Dev dependencies are permitted. Shipped code stays dependency-free.**

The boundary is what the browser downloads from GitHub Pages. `index.html`,
`css/`, and `js/` have no dependencies and no build step — unchanged, and not
negotiable. Everything under `scripts/`, plus `package.json` and
`node_modules/`, is development tooling that never reaches a user.

Concretely: **Playwright** as a devDependency, driving Chromium headless from a
single script, `scripts/verify.mjs`.

The script serves the repo itself over `node:http` on port 8123 — the dev server
keeps 8000, so both run at once — then loads the page and asserts:

1. The page loads and every request resolves.
2. The console is clean (no errors, no uncaught exceptions).
3. The DOM behaves — clicking `#play` reports the note.
4. The audio graph is right — an oscillator started at the expected frequency
   and waveform, with an envelope on the gain.

It writes a screenshot to `.screenshots/` on **every** run, pass or fail.

## Rationale

**Rule 1 always said "shipped code."** The qualifier was there from the start.
Playwright is not imported by anything under `js/`, does not appear in
`index.html`, and GitHub Pages serves the repo untouched. *What is in the repo
runs in the browser* remains literally true. `node_modules/` was already in
`.gitignore` before this decision — dev-time Node tooling was anticipated.

**A hand-written alternative was seriously considered and rejected.** Driving
Chrome over the DevTools Protocol with Node's built-in WebSocket client needs no
packages at all, and was the first proposal on "no dependencies" grounds. It
loses on three counts: ~200 lines of WebSocket plumbing is *more* to read and
understand than `await page.screenshot()`, not less; CDP is a moving target that
we would then be maintaining against a browser that ships every four weeks,
where a Playwright version bump absorbs that; and a hand-rolled driver needs its
own waiting and retry logic, which is where homegrown automation becomes flaky
and then ignored. The goal was fast iteration, and the zero-dependency option
was the slower and less reliable one.

**The audio graph is observed, not self-reported.** The script wraps
`AudioContext.prototype.createOscillator` and `createGain` via
`page.addInitScript()` before app code runs, so checks assert on the Web Audio
calls the engine actually made. The alternative — having `AudioEngine` record
its own actions for the test to read — puts test scaffolding in shipped code and
verifies the engine's claim about itself rather than its behaviour. The observed
version also survives an aggressive rewrite of the engine, which ADR 0001 says
we want to keep possible.

**Rendered audio is deliberately out of scope.** Asserting on sample values via
`OfflineAudioContext` would be the only check that literally satisfies "notes
heard". It is rejected as a poor trade: "an oscillator started at 220 Hz" is the
meaningful claim, and "the samples were non-zero" adds little on top while
costing a great deal. Whether sound is *pleasant* is a human judgement that no
assertion replaces — the loop makes the agent trustworthy, not omniscient.

**Screenshots are for assessment, not regression.** Every run writes a
screenshot to be looked at and critiqued — layout, contrast, alignment. It is
explicitly **not** a committed baseline with a pixel diff. Baselines protect a
design you are afraid to break; this project is at the opposite end, and ADR
0001 states that no deployment state "permits aggressive rewrites". A pixel
baseline is precisely the friction that punishes those. Baselines are also
platform-dependent — one captured on this machine would fail everywhere else —
and would put binary PNGs in a public repo. Adding them later is purely
additive: the screenshot step already exists.

## Consequences

**Positive:** An agent can verify its own work. "It works" becomes a claim with
evidence behind it rather than an assumption.

**Positive:** Regressions that a no-build ES-modules project is uniquely prone
to — a bad import path, a 404 module, a dead listener — are caught immediately
rather than on the next manual page load.

**Negative:** The repo now has a `package.json`, a lockfile, and a
`node_modules/`. Cloning and *running* it still needs nothing; cloning and
*verifying* it needs `npm install` and a ~150 MB Chromium download. This is the
first crack in "clone it and it runs" and should not be widened casually: a
second devDependency needs a reason, not a precedent.

**Negative:** The Web Audio spy is coupled to which Web Audio methods the engine
calls. Move `AudioEngine` to an AudioWorklet and the wrappers see nothing. The
mitigation is in the script — an empty spy log fails a check rather than passing
silently, because a green suite that verifies nothing is the worst outcome
available.

**Neutral:** `scripts/verify.mjs` holds its checks inline while the app is
small. When that list outgrows the file it splits to `scripts/checks/` along the
same component boundary `js/ui/UI.js` will split on (issue #3).
