# ADR 0002 — Branch deploy instead of an Actions workflow

**Status:** accepted
**Date:** 2026-09-03

## Context

The repo initially carried a GitHub Actions workflow uploading the repo root as
a Pages artifact (the AcidBros pattern). The first push was rejected: an OAuth
token may not create files under `.github/workflows/` without the `workflow`
scope.

Two options: add the scope, or drop the workflow.

## Decision

Branch deploy. GitHub Pages serves directly from `main` / root. The workflow is
deleted. An empty `.nojekyll` in the root disables Jekyll processing.

## Rationale

Without a build step (see ADR 0001) the workflow did nothing the branch deploy
does not also do — both upload the repo root. Granting the scope would have paid
for ceremony without function.

## Consequences

**Positive:** One OAuth scope less. Fewer moving parts.

**Negative:** No deploy logs under "Actions" — only the status in Pages settings.
Acceptable for a static project.

**Negative:** As soon as a build step is needed (minification, Sass, an asset
pipeline), the workflow has to come back and the scope must be added:
`gh auth refresh -h github.com -s workflow`.

## Alternatives considered

**Cloudflare Pages** — unlimited bandwidth, preview deployments per branch,
`_headers`/`_redirects`, and a backend would be one file in `/functions` rather
than a migration. Not chosen because the code already lives on GitHub and Pages
is a checkbox there. **If server logic becomes necessary, Cloudflare is the
intended migration path** — new ADR at that point.
