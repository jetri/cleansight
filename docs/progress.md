# Progress and approval record

Record reconciled: **2026-11-10 UTC**. M01 backend implementation is in progress; frontend implementation has been separately routed in parallel. No whole-M01 outcome acceptance exists. This is the **project-local progress authority**. The six-file documentation package landed on local `main` at `d9715a53a96bad36c87cb4cc23418caec5f9b48f` after explicit user merge approval. The former private overview is now pointer-only, not a second maintained tracker.

This record separates independent authorization, execution, evidence and acceptance. Milestone definitions live only in [milestones](milestones.md); README and any future project instructions must link here rather than duplicate mutable status.

## Current record

| Work | Approval / acceptance | Actual execution | Evidence / limits | Next action |
| --- | --- | --- | --- | --- |
| Local repository initialization | Historical completed fact, not a milestone acceptance | Empty local repository initialized before documentation | Initial commit `c876127` (`Initialize local project`); no application files existed at documentation start | No application capability inferred |
| Initial review/category research | Report prepared; not detector qualification | Design review/research only | Consolidated [requirements](requirements.md#categories-data-and-accuracy-policy); no camera/model tests | Use reviewed semantics, not off-the-shelf accuracy claims |
| Initial recall-scope decision | Explicitly approved recommendation: 70% visible qualifying supported bottle/cup recall, broader misses separately; 95% all-alert precision | Product policy decided; no evaluation | Approved recommendation retained in [accuracy policy](requirements.md#categories-data-and-accuracy-policy); no achieved metrics | Freeze configurable targets per later evaluation |
| Technical/delivery plans | R3 accepted for planning only: “Accept the proposals only; no implementation approval” | Combined proposal review answered; design/research history retained | [Architecture](architecture.md) and [milestones](milestones.md) consolidate R3; no product acceptance inferred | Subsequent implementation authority is recorded independently below |
| UI direction / design export | Evidence Desk D2 accepted as corrected UI direction only; no product/milestone outcome acceptance | Corrected source exists; frontend implementation is separately routed in parallel, not implemented/tested on this backend branch | [Design authority and historical export](design-reference.md); corrected tokens.css is the token authority, not the unchanged original export | UI worker owns implementation/integration evidence; no rendered-product claim from design acceptance |
| D01 portable documentation | Documentation preparation and six-file merge explicitly approved; no broader product/milestone acceptance granted | README and five focused docs landed on local `main`; former overview migrated to pointer-only; no application work | Landing commit `d9715a53a96bad36c87cb4cc23418caec5f9b48f`; [approval and historical validation](#documentation-evidence) preserve scope/limits | Keep this single progress authority |
| M01 | Explicitly approved to start, initially backend-first/UI-independent; whole-M01 acceptance absent | Backend work in progress on fm/littering-milestone-plan; frontend separately authorized/routed in parallel | [M01 criteria](milestones.md#m01---inspectable-local-camera-workbench); 37 backend checks passed including synthetic two-source RTSP/recovery, plus three API/recovery checks; final DB operations proof/documentation pending | Finish scoped backend checks and present local branch for merge approval, not whole-M01 acceptance; UI and real-camera journeys remain pending |
| M02 | Start approval absent; acceptance absent | Not started | [M02 scope/criteria](milestones.md#m02---functional-accuracy-development-mvp); no detector/staged evidence | Accepted M01 and separate M02 approval |
| M03 | Start approval absent; acceptance absent | Not started | [M03 scope/criteria](milestones.md#m03---accuracy-development-and-frozen-evaluation-readiness); no natural dataset/evaluator/frozen protocol | Accepted M02 and separate M03 approval |
| M04 | Start approval absent; acceptance absent | Not started | [M04 scope/criteria](milestones.md#m04---per-camerazone-qualification-and-local-gated-operation); no qualified/activated scope | Accepted M03 and separate M04 approval |

Historical documentation authorization was limited to portable README/specifications/progress. The subsequent, separate plan/UI/M01 decisions above do not approve project instruction files, accept unfinished product outcomes or start M02-M04. No completion percentages or automatic successor approvals are recorded.

## Subsequent authorization record (2026-11-10 UTC)

- Combined R3 review: “Accept the proposals only; no implementation approval”. This accepted the plans, not implementation.
- Separate M01 instruction: “M01 approved. Why don't we start with the implementation while waiting for the designs. Start with the ones that have no design dependency. When I say design, I mean UI and design system.” The backend branch executes only that bounded backend-first slice; original M01-A1 through A5 remain unchanged.
- Corrected D2 choice: “Accept corrected UI direction ONLY. No plan, implementation or milestone approval.” Single token authority is corrected `tokens.css`; original supplied export stays historical.
- Later parallel-UI instruction: “Since I've accepted the UI design, you can proceed with the UI implementation in parallel.” Firstmate routed frontend work separately; this branch does not implement or claim it.

These are distinct authorization/acceptance facts, not retroactive approval from tests. M01 outcome acceptance and M02-M04 starts remain absent. Backend test evidence is synthetic/fixture-only; no physical-camera credentials/recording permission have been supplied.

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

**Historical documentation-preparation validation (2026-11-10 UTC):** source-agreement reread passed; all 32 repository-relative links/anchors across six Markdown files resolve; heading/fence/table structure and intended-file review passed. Literal-path/session/secret-like-content checks and manual review found no machine paths, credentials, invented product commands or achieved-metric claims. Both working-tree and staged `git diff --check` passed. Only the six intended Markdown files are included. Export inventory confirmed all 30 manifest-declared files exist (11 HTML, two CSS, one script, 16 supporting); the script was not run. These are direct documentation checks, not a new verifier or a guarantee that a heuristic scan detects every possible secret. No product tests, builds or camera/model/container runs are applicable to the nonexistent application. Design browser audit is outside this task; no supplied verification claim is promoted to an independent test.

**Approved landing and migration:** the user explicitly approved: “Yes, you can merge the six documentation files into the project's main branch.” That approval covered `README.md`, `docs/requirements.md`, `docs/architecture.md`, `docs/design-reference.md`, `docs/milestones.md` and `docs/progress.md`. They landed on local `main` at `d9715a53a96bad36c87cb4cc23418caec5f9b48f`, and the former private overview was replaced with a pointer to repository progress. This is documentation merge approval and completed migration, not plan/UI/design-system acceptance, project instruction approval, milestone outcome acceptance or M01 start authorization. The AGENTS draft remains uninstalled pending its separate choice.

**Readiness versus landing:** a reviewed, validated, committed local branch may be documentation-ready. It becomes documentation-landed only through a separately approved merge. The original six-file package has landed. Recording that fact is not product implementation. Historical validation above is retained as evidence of the original documentation preparation, not rerun product validation.

## Update rule after landing

At real transitions only, record milestone/scope revision, explicit start-approval reference, actual execution state, criterion-level evidence link (including failed/missing work), independent outcome-acceptance reference and responsible next action. Add detailed acceptance notes only when real evidence exists. Preserve original machine/evaluation evidence and limitations; tests or a nice UI do not manufacture approval. The record must not advance from accepted predecessor to executing successor without separately explicit start authority.
