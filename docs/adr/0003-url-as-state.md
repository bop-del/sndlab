# ADR 0003 — State in the URL instead of a backend

**Status:** accepted
**Date:** 2026-09-03

## Context

The project is purely static (ADR 0001) and has no backend. Even so, at some
point a sound or a pattern should be shareable — "listen to this".

The conventional route would be a database plus an API: store the patch, return
an id, share the link. That requires a server, operations and cost.

## Decision

Shareable state is encoded into the URL hash. A link carries the complete patch;
opening it restores that patch. No server involved.

## Rationale

**It pushes the backend boundary surprisingly far out.** Sharing and permalinks
are the most common reasons a static project acquires a backend. Remove the
reason and the project stays static for a long time.

**The reference architecture likely does the same.** AcidBros has a custom binary
format with ~1,200 lines of encoder/decoder instead of JSON — the most plausible
motive is getting patterns compact enough for a URL.

**The state belongs to the user.** No account, no data retention, no GDPR question.

## Consequences

**Positive:** Sharing, bookmarking, and undo-via-back-button come for free.

**Negative:** URL length is bounded (practically ~2,000 characters; browsers
vary). Compact encoding required — start with Base64 over a terse JSON shape;
if that is not enough, a binary format like AcidBros uses.

**Negative:** No gallery, no "what others built", no sync across devices. That is
the deliberate boundary — when it falls, it is an architecture decision with its
own ADR.

**Open:** `localStorage` for the most recent patch is compatible with this
(per-browser, no server) and not yet decided.
