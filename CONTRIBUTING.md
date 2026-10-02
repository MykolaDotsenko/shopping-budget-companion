# Contributing

## Toolchain

- Node.js 24 (see `.node-version`)
- npm 11 with the committed `package-lock.json`

Start with:

```bash
npm ci
npm run check
npm run test:e2e -- --project=chromium
```

`docs/TESTING.md` defines what each gate covers and what CI adds.

## Workflow

1. Create a focused branch from current `main`.
2. Read `AGENTS.md`, `docs/README.md` and the owning contract for the change.
3. Keep one clear reason-to-change per patch.
4. Update code, tests and current documentation together when the contract changes.
5. Run the relevant quality gates locally.
6. Open a PR; do not bypass CI with direct changes to `main`.
7. After a merged PR passes the post-merge `Quality` run, its safely archived/unchanged head branch is deleted automatically. Branches with open PRs, unarchived unique work, or commits added after the recorded PR head are preserved; `study/*` evidence refs are never deleted automatically.

## Architectural boundaries

The intended dependency direction is:

```text
features ─────────▶ application ─────────▶ domain
                         ▲                    ▲
        implements ports │                    │ uses
                         └── infrastructure ──┘

composition root (src/app/composition-root.ts): wires the infrastructure adapters into the application
```

ESLint enforces the critical layer boundaries. Do not disable those rules to make a design fit.

## Product discipline

A user-facing change should improve at least one of:

- usefulness;
- interaction friction;
- premium interaction quality;
- competitive differentiation;
- reliability/accessibility.

Do not add framework or backend complexity for appearance alone.

## Pull requests

PRs should:

- be reviewable and narrowly scoped;
- explain user/product impact;
- state architecture impact;
- state validation performed;
- disclose unverified human/device evidence;
- avoid unrelated dependency upgrades.

Major dependency upgrades should be isolated from routine minor/patch updates.
