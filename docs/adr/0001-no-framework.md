# ADR 0001 — No framework, no build step

**Status:** accepted
**Date:** 2026-09-03

## Context

This is a browser audio application. The conventional choice would be a framework
(React, Svelte) plus a bundler (Vite) — component model, HMR, tree-shaking.

A secondary goal of the project is fast iteration with agents (Claude Code).
That shifts the trade-off.

## Decision

Vanilla JavaScript with native ES modules. Handwritten CSS. No bundler, no
transpiler, no runtime dependencies. What is in the repo runs in the browser.

## Rationale

**An agent can hold the whole project in view.** No build configuration that can
go wrong, no abstraction layer between code and result, no `node_modules` with
hidden behaviour. That is the most common reason agents get things wrong — and
it disappears here.

**The browser is a serious runtime now.** ES modules, Web Audio, AudioWorklets,
Web MIDI — all native. The reference architecture
[AcidBros](https://github.com/acidsound/acidBros) does 10,000 lines of real-time
audio synthesis with zero dependencies.

**Client-side compute is free and unlimited.** The load sits with the user;
static hosting costs nothing and still runs in ten years.

## Consequences

**Positive:** Push equals deploy. No migrations, no staging, no production state.
Breaking things is consequence-free, which permits aggressive rewrites.

**Negative:** No component model — UI structure has to be disciplined by hand.
AcidBros' `UI.js` is 2,737 lines; that is exactly where "no framework" starts to
hurt. Mitigation: rule 5 in `CLAUDE.md` — split at ~500 lines.

**Negative:** No tree-shaking, no minification. Irrelevant at this size; if it
ever matters, that is a new ADR.

## Alternatives considered

**Vite without a framework** — would give HMR and bundling at low configuration
cost. Rejected because a build step undermines the core claim: what is in the
repo runs. A reload is fast enough.
