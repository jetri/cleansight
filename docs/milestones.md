# Proposed milestones and acceptance stops

Scope revision: **R3 consolidated documentation**, preserving the established M01-M04 user-visible criteria. All implementation scopes remain proposed, not approved to start. Current execution/approval evidence belongs only in [progress](progress.md), not another status table here or in README. [Requirements](requirements.md) define evidence/accuracy semantics; [architecture](architecture.md) is an unaccepted implementation recommendation; [design integration](design-reference.md) remains pending.

The functional local MVP ends at **M02**. Accuracy qualification is a separate, uncertain **M04** outcome. Neither implies production-secure deployment. No elapsed-time estimate, guaranteed accuracy, sample-count shortcut or hardware throughput is promised.

## Approval and evidence contract

```text
proposed -> awaiting approval -> explicit start approval -> implementation
 -> ready for acceptance -> explicit outcome acceptance
 -> separately explicit successor start approval
```

Approval must identify the milestone and scope/criteria revision. Record start approval, actual execution, evidence and outcome acceptance independently. Planning/design acceptance, documentation authorization, recall-scope approval, passing tests, credentials, predecessor completion and silence are not start permission. Acceptance alone is not successor approval; one response may supply both only if it explicitly does so.

At each end, stop and present criterion-by-criterion pass/fail/not-run evidence, environment/inputs/settings, reproduction steps, failed/missing evidence, limitations and the requested next action. A material scope change, weaker criterion, added dependency or expanded envelope returns for approval before changed work begins. Correcting a failure within approved scope does not invent successor authority. Failed untouched evaluation cannot be rescued by post-hoc tuning/target changes; continuation requires new approval and fresh held-out evidence.

Use simple linked acceptance notes as work actually occurs, not dashboards, percentages or automatically advancing trackers. Lifecycle meanings: proposed/awaiting approval means stopped; approved to start is authority but not actual execution; in progress means authorized work really began; ready for acceptance is evidence presented but not accepted; accepted complete requires explicit outcome acceptance.

## M01 - Inspectable local camera workbench

**Dependency:** reconciled plan handoff and explicit M01-only start approval of its identified criteria.

**Outcome:** a real usable local camera/replay workbench, not a screenshot. Deliver persistent camera/zone revisions, preview/health, source-rate recording/local replay, playable queue/detail with clearly labeled fixture events, independent review persistence, local launch/stop instructions and basic storage/secret protections.

**Scope:** one real camera plus a second concurrent RTSP source; source/processing time, connection/reconnect/staleness/coverage, geometry validation, fixture event plumbing. **Excluded:** real visual classification, accuracy claims, production automatic status, public upload, remote access, enterprise security and a labeling/project-management platform.

| Criterion | Acceptance evidence required |
| --- | --- |
| M01-A1 | With documented steps, start on the actual development computer, open camera overview/detail and verify UI/API/media listeners are loopback-only. Show unredacted/unvalidated warnings. No secret values in ordinary saved config/logs/errors/exports. R3 launch evidence must document the proposed Node/Vite local build/assets and Django serving path, plus DB readiness/migrations; none is verified yet. |
| M01-A2 | UI add/edit/connect/start/stop/reconnect for one real camera and concurrent second RTSP source; independent IDs/state persist through restart. Label simulated/replayed second source in UI/evidence. Disconnect/reconnect changes health/staleness and records affected coverage; stale imagery never says live. |
| M01-A3 | Draw/save/reload littering and exclusion/bin polygons plus boundary buffers over actual imagery. Reject invalid geometry/ambiguous overlaps; exclusions win. Save new immutable revisions without rewriting history. |
| M01-A4 | Record permissioned input, replay the saved session through the shared application path with a new run ID/source timestamps, and play/seek locally. Restart preserves sessions, camera/zone config, fixture events and separately stored reviews. |
| M01-A5 | Queue/detail visibly separates provisional/final fixture outcomes and provenance. Missing segment and disk-limit/failure scenarios expose coverage/media problems, not clean negatives. Rolling deletion preserves explicitly reserved evaluation material. |

**Demonstration:** actual-computer walkthrough of onboarding, two-source state, zones, capture/clip/replay, review/restart and disconnect/reconnect. Include legible loading/empty/error/stale screenshots, keyboard/focus/layout evidence, exact environment/source settings/session lengths and A1-A5 test outcomes. Background refresh/save failures must preserve playback, drafts and notes. Fixtures prove plumbing only.

**Inputs/limits:** permissioned scene/credentials through protected runtime storage, camera transport/codec, disk/browser compatibility. A simulator cannot replace the required real-camera demo. Under proposed R3 verify actual Docker containment/readiness, protected DB credential, durable volume/restart and build/assets; no install/container start is authorized by this plan. GPU discovery is informational, not a workbench prerequisite. Missing inputs are reported, never fabricated as passes.

**Stop:** present A1-A5 for explicit outcome acceptance. Do not integrate the real detector or start M02 without separate approval.

## M02 - Functional accuracy-development MVP

**Dependency:** accepted M01 plus explicit M02 start approval.

**Outcome:** actual bottle/cup visual observations use the same live/replay source-time evidence pipeline. Deliver pinned detector/tracker and explicit evidence logic, versioned events/clips, provisional/final queue, overlays/crops/history/gate/health reasons, independent feedback, manual miss bookmarks and fail-closed/load evidence.

**Scope:** conservative possession/release/landing/stability/retrieval, walk-away semantics, anonymous separate person/object tracks, duplicate correlation, timing/category controls, staged near/middle/far trials and measured one/two-source execution. **Excluded:** guaranteed 95%/70%, broad unknown-object discovery, extra automatic categories, activation, formal multi-role review software, external actions, LLM/VLM and open-ended training/model research. If pixels/boxes cannot prove a fact, abstain; broader research needs revised approval.

| Criterion | Acceptance evidence required |
| --- | --- |
| M02-A1 | Actual model observations from the real camera and saved replay feed the same evidence path. At least one clearly visible staged qualifying bottle sequence produces inspectable provisional evidence and correctly timed final experimental `WOULD_ALERT` with all gates passed. Cup processing also has a staged demonstration and documented failures/abstentions. Without cup feasibility the two-category criterion fails; bottle-only reduction needs explicit scope approval. |
| M02-A2 | Every required deterministic fixture below has expected outcomes and passing state/time/geometry assertions. Source time drives accelerated replay. Final positives never precede full observation; fixture injection is unmistakable and excluded from visual accuracy. |
| M02-A3 | Persistent camera/outcome/reason filtering; play/pause/seek/short-step, source-indexed tracks/crops/history/deadline/gates/gaps/revisions; independent review notes/history survive restart without rewriting machine predictions. A manual missed/unsupported bookmark does not pretend detection. |
| M02-A4 | Clips contain configured pre-context and complete release-through-deadline evidence, extending post-context as required. Evidence loss blocks positives. Events retain originating revisions while new candidates take new settings; safety disable works. Duplicate proposals produce one canonical event while simultaneous distinct objects remain distinct. |
| M02-A5 | Document one-source then two-source sessions on actual hardware: codecs, duration, settings, event counts, source/inference rates, resource/disk use, gaps, backlog and release-to-final-playable latency. Demonstrate p95 <= five minutes on a documented controlled set with sample-size limits, not natural qualification. Overload shows backpressure/paused eligibility/incomplete coverage, not silent loss. Unmet latency/capacity is failure, not an assumed GPU upgrade. |

**Required fixture coverage, then staged-real evidence where appropriate:** drop and immediate walk-away; original retrieval including inclusive deadline; ambiguous returning retriever; known third-party removal before/at/after the inclusive release-relative early boundary; handoff/temporary placement; object visibility loss; invalid/boundary/excluded landing and outside-to-inside roll; duplicates and distinct simultaneous objects; mid-event configuration change; long clip extension; outage/PTS discontinuity/corrupt segment; storage/backlog failure. Include retrieval during landing/stabilization and uncertain boundary timing. Logic assertions and actual visual outcomes must be reported separately.

**Demonstration:** user-operated live/replay journey, fixture/model provenance side by side, complete staged attempt manifest with near/middle/far object sizes and failures, clips/revisions, A1-A5 results and hardware/timing report. Repeat stable-state/keyboard/visual checks with busy inference and real observations. No staged success rate is natural precision/recall.

**Inputs/limits:** permissioned staged footage, visible camera geometry, actual GPU/runtime if needed, CPU/disk limits, exact dependency/model licensing. One real camera suffices; simulated second stream proves only tested load. Narrow/reposition unobservable zones, not weaker evidence gates. If core visual feasibility fails, stop for revised scope.

**Stop:** present the functional MVP for explicit acceptance, not production accuracy acceptance. Do not begin M03 natural-data/evaluation implementation without separate approval.

## M03 - Accuracy development and frozen evaluation readiness

**Dependency:** accepted M02 plus explicit M03 start approval.

**Outcome:** honest development accuracy/error view and an auditable frozen qualification package. Deliver permission/source manifest, independent full-interval labels, visibility/review rubric, event/time-separated development/validation and untouched partitions, reproducible evaluator/comparisons, bounded development tuning and frozen protocol/candidate.

**Scope:** permissioned natural target-site data; staged/synthetic data separate; missed-event discovery independent of proposals; per-camera/zone metrics and envelope. One camera supports time-held-out evidence only; independent added-camera evidence needs actual availability and approved scope. **Excluded:** activation, untouched-data tuning, hidden denominator changes, broad-category expansion, auto-training/promotion services, dedicated labeling platform or assumed fine-tuning/new temporal-model research.

| Criterion | Acceptance evidence required |
| --- | --- |
| M03-A1 | Manifest accounts for every source/permission, natural/staged/synthetic provenance, camera/zone/interval/partition. No physical event or overlapping recording leaks between splits. Humans review full sampled intervals independently of candidate output to discover missed positives. |
| M03-A2 | Visibility labels independent of model output; apparent positives/ambiguous cases second-reviewed, disagreements preserved and adjudicated, unresolved ambiguity listed. Recall uses approved visible qualifying bottle/cup scope with supported visible abstentions counted as misses; broader categories/misses remain visible. |
| M03-A3 | Versioned evaluator reproduces matching/counts and reports pre-review `WOULD_ALERT` precision/recall, counts/bounds, false alerts/hour, abstentions/incomplete/duplicates, median/p95 latency and category/visibility/hard-negative errors per scope plus aggregate. Conservative unresolved emitted alerts count as errors. Fixtures verify denominator/matching rules. |
| M03-A4 | Before opening untouched qualification results, freeze natural manifest, model/config/calibration, category/visibility scope, matching/duplicate rules, targets, confidence/clustering method, minimum alert/positive counts, false-alert ceiling, latency/clock definition and coverage/health/backlog guardrails. Justify protocol values from development evidence and present them for M04 approval, never select after results. |
| M03-A5 | Development/validation comparisons/error clips establish limits and a defensible frozen candidate. Reserve/protect an untouched natural acceptance set sufficient for the proposed protocol. Insufficient natural events, permission or review coverage means readiness incomplete; no staged fill or lowered target. |

**Demonstration:** simple local accuracy summary, representative false-alert/miss clips, review/label samples, leakage checks, evaluator fixtures, development comparisons, frozen protocol/candidate identifiers and M04 readiness checklist. No full analytics application required.

**Inputs/limits:** permissioned natural outdoor sessions, real positive-event prevalence, independent review, representative negatives and storage. Accumulation may take time; one camera cannot establish generalization. Lack of counts blocks readiness/claims, not the earlier useful local workbench.

**Stop:** present A1-A5 and frozen package for explicit acceptance. Do not open official M04 results or activate by implication; a development score is not acceptance/start authority.

## M04 - Per-camera/zone qualification and local gated operation

**Dependency:** accepted M03 plus explicit M04 start approval of the identified frozen protocol and any bounded local activation.

**Outcome:** untouched per-scope qualification report, pass/fail/insufficient ledger, reproducible errors/outcomes, actual guardrail/latency evidence and gated local dashboard operation only where all criteria and explicit approval permit it.

**Scope:** execute accepted protocol without tuning; independent camera/zone/category-policy decisions; manual disable and health/envelope/latency/backlog/coverage fallback; version-preserving rollback. **Excluded:** guaranteed success, post-test optimization, simulation-as-second-camera accuracy, extra categories, LAN/public/multi-user deployment, security-complete production, external actions, LLM/VLM or autonomous updates.

| Criterion | Acceptance evidence required |
| --- | --- |
| M04-A1 | Each declared camera/zone has an untouched run with exactly accepted protocol/candidate versions. Each qualified scope independently meets predeclared minimum counts, one-sided 95% lower bounds >=95% precision across all automatic-path predictions and >=70% supported visible bottle/cup recall, plus frozen false-alert/coverage/uncertain/duplicate/health/backlog gates. Aggregate cannot rescue failing/undersampled scope. |
| M04-A2 | Natural target-site results separate from staged/synthetic/research/development, with exposure/counts/bounds/misses/unresolved alerts/exclusions. Actual tested hardware/load meets frozen source-release-to-finalized-playable-result p95 <= five minutes, including clock uncertainty treatment. Simulated second stream qualifies tested load only. |
| M04-A3 | UI distinguishes per-scope qualification from activation. Only independently passing, explicitly approved scopes may emit local `AUTOMATIC_ALERT`; others remain experimental/review-only. Demonstrate manual disable, leaving envelope, outage/loss, guardrail violation and rollback. Stale/incomplete evidence cannot generate a new automatic alert; history keeps its meanings/revisions. |
| M04-A4 | Present criterion results, all error clips, limits, reproducibility and production exclusions. If none passes A1-A3, deliver honest failure/insufficient evidence: evaluation work is reviewable, accuracy objective is not achieved and activation stays off. More data/tuning/retest requires separately approved continuation and fresh untouched evidence. |

**Demonstration:** accepted protocol reference, frozen manifests/run IDs, per-scope metric/count/bound tables, complete error inventory, local qualification/status display, guardrail/fallback/rollback evidence and explicit unsupported scopes.

**Inputs/limits:** sufficient natural positive/emission samples, human adjudication, defensible confidence assumptions, stable geometry, actual capacity and maintained permissions. Failed bounds are legitimate, not permission to relax gates.

**Final stop:** present outcome for explicit acceptance. No automatic production-hardening, extra camera/category, wider access or research successor is authorized. M04 local qualification does not deliver production security; follow-on work needs a newly scoped approved milestone.
