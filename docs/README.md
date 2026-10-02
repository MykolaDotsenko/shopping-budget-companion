# Documentation map

The documentation is organized to minimize AI/contributor context while keeping current contracts explicit.

## Authority

Code and green executable tests establish what is implemented; the authoritative documents below establish intended current behaviour; decisions, reference and research explain rationale. The full source-of-truth order is in [AGENTS.md](../AGENTS.md).

If code and an authoritative contract disagree, reconcile the drift in the same change.

## Information architecture

Each location has one purpose:

| Location | Put here | Do not put here |
| --- | --- | --- |
| `docs/*.md` | small set of current cross-cutting authoritative contracts | research snapshots, completed plans, provider notes |
| `docs/specs/` | executable behavioural/data interaction specifications | copied TypeScript interfaces, product strategy |
| `docs/architecture/` | specialized engineering contracts that refine ARCHITECTURE | generic tech research |
| `docs/quality/` | cross-cutting release-quality contracts | feature roadmap ideas |
| `docs/decisions/` | accepted ADR rationale grouped by topic | current implementation-status checklists |
| `docs/reference/` | useful heuristics, ownership maps and non-authoritative guidance | rules that redefine current behaviour |
| `docs/evidence/` | protocols/results that support validation claims | product requirements |
| `docs/research/` | dated/external evidence and hypotheses | shipped capability claims |
| `docs/marketing/` | launch/store operational material | core product contracts |

### New-document rule

Prefer editing an existing owner over creating a new file.

Create a new document only when:

1. no current document clearly owns the concern;
2. the content has a distinct lifecycle or audience;
3. putting it in the existing owner would materially increase context cost;
4. its authority level and directory are unambiguous.

Do **not** create a second product, architecture, UX, functionality, testing or roadmap contract under a different name.

### Navigation invariant

A normal engineering task should usually need:

```text
AGENTS.md
  → docs/README.md
  → one primary owning contract
  → at most one or two detailed specs/references
  → affected code/tests
```

Use ADR/research/evidence only when the task requires rationale, external evidence or validation status.

Avoid dense cross-link meshes. `docs/README.md` is the hub; domain-specific documents may link to the exact refinement they depend on.

## Authoritative documents

| Document | Owns |
| --- | --- |
| [PRODUCT.md](./PRODUCT.md) | product job, principles, competitive strategy, feature decision rule |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | dependency boundaries, state ownership, architectural invariants |
| [DOMAIN.md](./DOMAIN.md) | current business concepts and invariants |
| [DESIGN.md](./DESIGN.md) | current production visual/interaction contract |
| [ROADMAP.md](./ROADMAP.md) | current evidence gates and future sequencing |
| [TESTING.md](./TESTING.md) | current quality/release contract |

Detailed executable specs:

- [specs/MONEY-SPEC.md](./specs/MONEY-SPEC.md)
- [specs/RELEASE-SPEC.md](./specs/RELEASE-SPEC.md)
- [specs/STATE-MACHINES.md](./specs/STATE-MACHINES.md)
- [specs/STORAGE-SCHEMA.md](./specs/STORAGE-SCHEMA.md)
- [specs/PRICE-ENTRY-CONTRACT.md](./specs/PRICE-ENTRY-CONTRACT.md)

Specialized contracts:

- [architecture/DATA-PERSISTENCE.md](./architecture/DATA-PERSISTENCE.md)
- [quality/ACCESSIBILITY.md](./quality/ACCESSIBILITY.md) — current accessibility/release-quality contract
- [quality/RELEASE-PROCESS.md](./quality/RELEASE-PROCESS.md) — evidence-bound Git tag/GitHub Release publication contract
- [quality/REPOSITORY-HYGIENE.md](./quality/REPOSITORY-HYGIENE.md) — conservative branch-retention and cleanup contract

Cross-cutting durable decisions:

- [DECISIONS.md](./DECISIONS.md) — short ADR index; open only the relevant category file

## Read by task

| Task | Read |
| --- | --- |
| release behaviour / acceptance | PRODUCT → RELEASE-SPEC → affected domain/design/test contract |
| money/parser | PRODUCT → DOMAIN → MONEY-SPEC → affected tests |
| trip command/selector | PRODUCT → DOMAIN → STATE-MACHINES where relevant → tests |
| controller/lifecycle | ARCHITECTURE → STATE-MACHINES → controller tests |
| architecture refactor / file ownership | ARCHITECTURE → CODE-OWNERSHIP → affected tests |
| persistence/recovery | ARCHITECTURE → DATA-PERSISTENCE → STORAGE-SCHEMA → tests |
| UI/interaction | PRODUCT → DESIGN → ACCESSIBILITY → component/E2E tests |
| camera, barcode, price tags | PRODUCT → DOMAIN → STATE-MACHINES (camera scan) → ACCESSIBILITY → component/E2E tests |
| real-store camera field validation | ROADMAP → CAMERA-FIELD-VALIDATION → issue #88 |
| tests/CI | TESTING → workflow/config |
| versioned release publishing | TESTING → RELEASE-PROCESS → Publish Release workflow |
| repository / branch cleanup | REPOSITORY-HYGIENE → branch-hygiene manifest/workflow |
| new capability | PRODUCT → ROADMAP → relevant decision/research |
| premium/brand polish | PRODUCT → DESIGN → BRAND reference only if identity work |
| marketing/launch | PRODUCT → MARKETING reference → launch material |
| historical rationale | relevant DECISIONS/reference only; git history keeps completed plans |

Do not read all docs for a narrow change.

## Supporting reference

Reference adds rationale or future planning; it does not redefine current implementation status.

- [reference/UX.md](./reference/UX.md) — practical interaction heuristics
- [reference/CODE-OWNERSHIP.md](./reference/CODE-OWNERSHIP.md) — source/module ownership map for refactors
- [reference/BRAND.md](./reference/BRAND.md) — brand positioning/voice/identity
- [reference/SCENARIOS.md](./reference/SCENARIOS.md) — compact product/UX challenge matrix
- [reference/TECH-STACK.md](./reference/TECH-STACK.md) — current stack intent and dependency admission
- [reference/MARKETING.md](./reference/MARKETING.md) — evidence-aware go-to-market guidance
- [reference/DESIGN-RATIONALE.md](./reference/DESIGN-RATIONALE.md)
- [reference/FUTURE-QUALITY-PLANS.md](./reference/FUTURE-QUALITY-PLANS.md)

## Evidence

Evidence documents define how claims become validated:

- [evidence/SPRINT-B-QUALITY-GATE.md](./evidence/SPRINT-B-QUALITY-GATE.md)
- [evidence/IMMUTABLE-STUDY-DEPLOYMENTS.md](./evidence/IMMUTABLE-STUDY-DEPLOYMENTS.md) — immutable versioned Pages surfaces for real-world studies
- [evidence/CAMERA-FIELD-VALIDATION.md](./evidence/CAMERA-FIELD-VALIDATION.md) — privacy-safe real-store protocol for shipped camera features
- [evidence/RETENTION-BETA.md](./evidence/RETENTION-BETA.md)
- [evidence/RETENTION-BETA-PLAYBOOK.md](./evidence/RETENTION-BETA-PLAYBOOK.md)
- [evidence/RETENTION-STUDY-LOG-TEMPLATE.md](./evidence/RETENTION-STUDY-LOG-TEMPLATE.md)
- [evidence/PHASE-4-DESIGN-VALIDATION.md](./evidence/PHASE-4-DESIGN-VALIDATION.md)
- [evidence/BRAND-IMPLEMENTATION-AUDIT.md](./evidence/BRAND-IMPLEMENTATION-AUDIT.md)

Automation does not substitute for explicitly required human/device evidence.

## Research / launch

Use only when the task depends on market evidence, alternatives or launch strategy:

- [research/COMPETITIVE-RESEARCH.md](./research/COMPETITIVE-RESEARCH.md)
- [research/PRODUCT-SUCCESS-STRATEGY.md](./research/PRODUCT-SUCCESS-STRATEGY.md)
- [research/TECHNOLOGY-RESEARCH.md](./research/TECHNOLOGY-RESEARCH.md)
- [research/MARKETING-RESEARCH.md](./research/MARKETING-RESEARCH.md)
- [marketing/LAUNCH-CHECKLIST.md](./marketing/LAUNCH-CHECKLIST.md)
- [marketing/STORE-LISTING-SPEC.md](./marketing/STORE-LISTING-SPEC.md)

## Maintenance

When behaviour changes:

1. update code/tests;
2. update the smallest owning authoritative contract;
3. update a detailed spec only if its executable contract changed;
4. add a decision only for durable cross-cutting choices;
5. move useful rationale out of current contracts;
6. delete duplicated status narration.

Documentation structure is enforced by:

```bash
npm run docs:check
```

The validator checks required contract paths, retired legacy paths, the allowed repository-root and docs-root Markdown files, relative Markdown links and their heading anchors, and that every document under `docs/` is reachable by links from this file. It runs inside `npm run check`.

Current docs use only:

- **IMPLEMENTED**
- **VALIDATED**
- **PLANNED / GATED**
- **HISTORICAL**
