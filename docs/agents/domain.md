# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the project's vocabulary.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo — one `CONTEXT.md` and one `docs/adr/`, both at the root:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-no-framework.md
│   ├── 0002-branch-deploy.md
│   └── 0003-url-as-state.md
├── css/
└── js/
```

There is no `src/`; the code lives in `js/` (`js/audio/`, `js/ui/`). If this ever
grows into separate contexts, the layout to move to is a root `CONTEXT-MAP.md`
pointing at one `CONTEXT.md` per context — but that is not this repo.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
