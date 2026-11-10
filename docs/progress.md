# Progress and approval record

Snapshot: **2026-11-10 UTC**. Planning/design only; no application exists. This is the **proposed project-local authority after this documentation branch is approved and landed**. Until then the pre-existing private project overview remains authoritative and unchanged. This branch does not claim to have migrated that authority or landed itself. After landing, replace the old overview's maintained status table with a pointer to this file; do not maintain two trackers.

This record separates independent authorization, execution, evidence and acceptance. Milestone definitions live only in [milestones](milestones.md); README and any future project instructions must link here rather than duplicate mutable status.

## Current record

| Work | Approval / acceptance | Actual execution | Evidence / limits | Next action |
| --- | --- | --- | --- | --- |
| Local repository initialization | Historical completed fact, not a milestone acceptance | Empty local repository initialized before documentation | Initial commit `c876127` (`Initialize local project`); no application files existed at documentation start | No application capability inferred |
| Initial review/category research | Report prepared; not detector qualification | Design review/research only | Consolidated [requirements](requirements.md#categories-data-and-accuracy-policy); no camera/model tests | Use reviewed semantics, not off-the-shelf accuracy claims |
| Initial recall-scope decision | Explicitly approved recommendation: 70% visible qualifying supported bottle/cup recall, broader misses separately; 95% all-alert precision | Product policy decided; no evaluation | Approved recommendation retained in [accuracy policy](requirements.md#categories-data-and-accuracy-policy); no achieved metrics | Freeze configurable targets per later evaluation |
| Technical/delivery plans | Latest R3 proposed; acceptance absent | Planning reports prepared | [Architecture](architecture.md) and [milestones](milestones.md) consolidate R3; historical alternatives superseded | Owner reviews identified plan revision; start approval remains separate |
| UI direction / design export | Integration, token authority and design acceptance absent | Illustrative UI exploration and supplied export exist; separate product-fit review pending | [Design inventory/provenance](design-reference.md); supplier static verification is partial, not app/browser evidence | Review design fit/token authority; do not infer acceptance or integration |
| D01 portable documentation | Documentation preparation explicitly authorized; branch approval/landing and outcome acceptance pending | Documentation-ready: README and five focused docs authored and directly validated; no application work | [Coverage and validation](#documentation-evidence); definitions below preserve imported decisions/limits | Review/approve and land ready documentation branch; then migrate old overview to pointer |
| M01 | Start approval absent; acceptance absent | Not started | [M01 scope/criteria](milestones.md#m01---inspectable-local-camera-workbench); no app/UI/RTSP/DB/build evidence | Explicit approval of identified M01 scope needed before execution |
| M02 | Start approval absent; acceptance absent | Not started | [M02 scope/criteria](milestones.md#m02---functional-accuracy-development-mvp); no detector/staged evidence | Accepted M01 and separate M02 approval |
| M03 | Start approval absent; acceptance absent | Not started | [M03 scope/criteria](milestones.md#m03---accuracy-development-and-frozen-evaluation-readiness); no natural dataset/evaluator/frozen protocol | Accepted M02 and separate M03 approval |
| M04 | Start approval absent; acceptance absent | Not started | [M04 scope/criteria](milestones.md#m04---per-camerazone-qualification-and-local-gated-operation); no qualified/activated scope | Accepted M03 and separate M04 approval |

Documentation authorization is limited to portable README/specifications/progress. It does not accept the plans/UI, approve project instruction files or start milestones. No completion percentages or automatic successor approvals are recorded.

## Documentation evidence

**D01 scope:** README entry point; focused requirements/event model, current proposed architecture and design-reference contract; M01-M04 acceptance/stops; this single progress record. No project `AGENTS.md` or `CLAUDE.md` was created or edited. A minimal exact AGENTS draft is held outside the project for deliberate human review. The pending choice is whether to approve/install that exact instruction content separately; it does not block authorized docs.

**Source reconciliation:** the documentation plan, original design and user clarifications, design-review report and recall-scope answer, complete milestone report, complete technical report (latest section 13/R3), and OpenDesign requirements brief were read before authoring. The supplied export's DESIGN, handoff, manifest and verification record were inventoried read-only. Sources are named below for historical attribution; no private path or live session is required to use this repository.

| Source / decision basis | Current truth preserved here |
| --- | --- |
| Original design, sections 5-7 and 9-10 | Full FSM, hard gates, conservative zones, source evidence, versioning, clips and independent statistical qualification. |
| User clarifications and corrected design review | Early full local RTSP UI, configurable targets, walk-away correction and original-person/third-party retrieval distinctions override conflicting older sequencing/visibility assumptions. |
| Recorded recall-scope recommendation approval | 70% supported visible bottle/cup recall with supported abstentions as misses; broader misses separate; 95% precision across all alerts. The review's old open recall question is closed. |
| Milestone report, complete M01-M04 definitions and R3 follow-up | Functional MVP at M02, qualification at M04, exact criterion IDs, independent start/acceptance/successor gates; all unstarted. |
| Technical report, latest explicit section 13/R3 | Proposed Django/ORM/React-TypeScript/Vite/local Docker-PostgreSQL replaces historical FastAPI/SQLite and vanilla-JS-only proposals; TACO removed. Media/time/recovery contracts and deferred security seams retained. |
| OpenDesign brief / documentation plan | Desktop evidence workbench, full timestamped transition history, independent status/provenance/health, review of exact project instructions and one progress authority. |
| Supplied design export / supplier verification | Export available, generated kit not approved; generic screens/claims/instructions do not expand scope. Fingerprinted [inventory](design-reference.md#inventory-of-the-supplied-snapshot) distinguishes supplier claims from this task's checks. |

These entries are a consolidated historical evidence summary, not newly obtained approvals or re-verification of earlier research. Private source reports are not bulk-vendored; their operational/review-session history is intentionally not a repository dependency. No primary approval transcript has been invented. Future approvals must record a durable, permission-safe reference with scope/revision and an accurate summary before state changes.

**Direct validation (2026-11-10 UTC):** source-agreement reread passed; all 32 repository-relative links/anchors across six Markdown files resolve; heading/fence/table structure and intended-file review passed. Literal-path/session/secret-like-content checks and manual review found no machine paths, credentials, invented product commands or achieved-metric claims. Both working-tree and staged `git diff --check` passed. Only the six intended Markdown files are included. Export inventory confirmed all 30 manifest-declared files exist (11 HTML, two CSS, one script, 16 supporting); the script was not run. These are direct documentation checks, not a new verifier or a guarantee that a heuristic scan detects every possible secret. No product tests, builds or camera/model/container runs are applicable to the nonexistent application. Design browser audit is outside this task; no supplied verification claim is promoted to an independent test.

**Readiness versus landing:** a reviewed, validated, committed local branch may be documentation-ready. It becomes documentation-landed only through a separately approved merge. This snapshot records no merge, plan/UI acceptance or M01 authorization.

## Update rule after landing

At real transitions only, record milestone/scope revision, explicit start-approval reference, actual execution state, criterion-level evidence link (including failed/missing work), independent outcome-acceptance reference and responsible next action. Add detailed acceptance notes only when real evidence exists. Preserve original machine/evaluation evidence and limitations; tests or a nice UI do not manufacture approval. The record must not advance from accepted predecessor to executing successor without separately explicit start authority.
