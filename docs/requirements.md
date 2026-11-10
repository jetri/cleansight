# Requirements and event model

Status: consolidated planning specification, not accepted implementation or measured capability. [Milestone criteria](milestones.md) govern delivery; [progress](progress.md) records actual authority and execution. Later user clarifications supersede original global-person-visibility and production-dashboard-first sequencing. The approved recall-scope decision is retained below; historical framework/dataset alternatives are not active requirements.

## Product boundary

Build an inspectable single-user local workbench for one real fixed RTSP camera and two concurrent source capacity on the processing/development computer. Local captured-session replay supports reproducible development/evaluation, not a required public video-upload product. Initial supported-envelope experiments are daylight, clear weather, moderate crowding and human-inspectable ground zones. Night/weather/heavy occlusion, moving/PTZ cameras, three-to-five-camera expansion and cross-camera fusion are outside initial scope.

Detect observable possession/interaction, release, valid landing, stabilization and non-retrieval by the original person. Accidental drops may qualify. No intent, guilt, legal attribution, biometrics, face recognition, identity database, cross-camera identity recovery, aggressive re-identification, enforcement, cleanup dispatch or external notifications. Dashboard status is the only planned alert channel. No LLM/VLM or external footage-processing dependency.

Permission to record/process/retain/review/delete inputs is required before use. Loopback-only UI/API/media, protected runtime secrets, private storage and explicit disk/quota/deletion behavior apply from first connection. Evaluation reservations are bounded and visible, not unlimited retention. Credentials/footage must not enter source control or ordinary configuration/logs/errors/exports. MVP views must say local development, unvalidated and unredacted. Production security remains [deferred](architecture.md#security-seams-and-limitations).

## Complete state machine

Original domain vocabulary is preserved:

```text
NO_EVENT -> INTERACTION_CANDIDATE -> RELEASE_CANDIDATE
 -> LANDING_CANDIDATE -> STABILIZED -> RETRIEVAL_WINDOW
 -> CONFIRMATION_CHECK -> AUTOMATIC_ALERT / UNCERTAIN / REJECTED / INCOMPLETE
```

The corrected decision boundary separates experimentation from production activation:

```text
CONFIRMATION_CHECK -> WOULD_ALERT / UNCERTAIN / REJECTED / INCOMPLETE
WOULD_ALERT + independently qualified and explicitly enabled scope
 + current health/coverage/safety gates -> AUTOMATIC_ALERT
```

`WOULD_ALERT` is a frozen **final experimental positive**, before review, used to evaluate the prospective automatic policy while activation is off. It is not a provisional candidate, reviewer confirmation or production alert. `AUTOMATIC_ALERT` is a deterministic pre-review, dashboard-only system status additionally gated by qualified camera/zone/category policy and explicit activation. M01/M02 cannot enable it. Neither outcome is a legal finding.

| State | Evidence-gated transition |
| --- | --- |
| `NO_EVENT` | No qualifying interaction currently tracked. Does not prove absence of litter or complete coverage. |
| `INTERACTION_CANDIDATE` | Persistent person-object association supported by visible possession/contact and temporal continuity. Compatible motion may support, not replace, evidence. Proximity, box overlap and tracker IDs alone are insufficient. A visible handoff transfers possession; it is not a release. |
| `RELEASE_CANDIDATE` | Visible separation from the established possessor, not a newly appearing ground object. Strong release immediately creates a provisional event and pins revisions/media. Temporary placement retaining possession is not a release. |
| `LANDING_CANDIDATE` | First ground-contact point/footprint, including uncertainty, lies inside a valid litter zone. Use landing geometry, not the final resting center. Exclusions/bin/collection polygons override; invalid ambiguous overlaps cannot activate. Boundary ambiguity abstains. An outside landing followed by rolling inside cannot qualify automatically. |
| `STABILIZED` | Position remains within pinned zone tolerance under continuously sufficient observations for initially **3 seconds**. Movement outside tolerance prevents/resets stabilization. Predicted-only tracking or occlusion cannot prove stability. |
| `RETRIEVAL_WINDOW` | Observe original-person retrieval through the inclusive source-time deadline, initially **30 seconds after stabilization completes**. Monitor retrieval/removal from release onward, including landing/stabilization. |
| `CONFIRMATION_CHECK` | All visual, temporal, geometry, declared experimental category, duplicate and confidence gates pass; required coverage, processed-through watermark and validated playable media are ready. Statistical qualification/activation stays separate. |

Early terminal decisions may stop a prefix when a hard negative, ambiguity or missing coverage is established. Preserve the history; never display unobserved/skipped stages as passed. Candidate lifetime is version-bounded; failure to stabilize is not an automatic positive. One physical release has one canonical event within a run. Correlate duplicates with observed continuity and pinned rules, preserving aliases/reasons; nearby distinct objects must remain distinct. A retrieved object visibly released again starts a new event.

### Terminal evidence outcomes

- `REJECTED`: sufficient positive evidence of a hard negative, such as original retrieval, handoff, retained possession or observed excluded/outside landing. Absence of a detection is not rejection.
- `UNCERTAIN`: adequate recorded pixels but ambiguous/unvalidated evidence, including occlusion, unresolved attribution, boundary/timing ambiguity, unknown category or unresolved duplicates.
- `INCOMPLETE`: required capture/media/processing integrity missing or compromised: stream gap, timestamp discontinuity, corrupt/missing segment, storage/hard health/backlog failure or unverified restart coverage.
- `WOULD_ALERT`: every frozen experimental evidence gate passes. No missing fact can be supplied by confidence, a learned model, interpolation or a tracker prediction.

Retain all applicable reasons; missing required coverage cannot be hidden behind a more favorable visual label. A hard negative needs evidence; ambiguity and missing coverage are not negatives.

Every qualifying experimental positive needs observed possession, release and valid track continuity; declared experimental category eligibility; conservative inside-zone landing without exclusions; stabilization; sufficient retrieval observation and no original retrieval through the deadline; no inclusive early third-party removal; no unresolved duplicate; all frozen confidence thresholds; and intact timestamps, recording, processing and playable evidence. Applicable schedules and temporary exclusions must permit the decision. Production `AUTOMATIC_ALERT` additionally requires a validated category allowlist and independently accepted, currently qualified and explicitly activated camera/zone within its supported envelope, with current health/storage/backlog/safety gates satisfied. A confidence score cannot bypass any gate.

## Timers, person exit and retrieval

Let `t_release` be observed release, `t_stable_complete` stabilization completion, `T_retrieve` the pinned retrieval duration and `W_early` the separately configured early-third-party duration. No default for `W_early` is established.

- Inclusive original deadline: `D = t_stable_complete + T_retrieve`, initially `T_retrieve = 30s`. Verified original retrieval at or before `D`, including equality, rejects as `dropped_then_retrieved`. Do not start the timer at release, person exit, inference completion or wall-clock sleep.
- Retrieval requires visible physical contact followed by possession or movement visibly off the ground. Approach, proximity, disappearance, compatible motion alone and a new track ID are insufficient. Observe from release onward so pickups during stabilization are not ignored.
- Preserve contact onset, completed pickup and source-frame uncertainty. A pickup underway at `D` must resolve or remain uncertain; boundary-straddling uncertainty abstains, not rounded-time emission.
- Early third-party removal means the **first verified distinct-person removal** satisfies `0 <= t_remove - t_release <= W_early`, including equality. It causes `UNCERTAIN`; timing never establishes group membership. Later verified third-party removal may retain eligibility if every other gate passes.
- Third-party removal records time, remover track when available, trajectory/terminal state and `removed_by_third_party`. It neither erases the release nor shortens the original window. Continue observing relevant ground/scene through `D`, including reappearance/substitution. Do not demand a view of an object already visibly removed, or say it still remains. If the evidence cannot exclude unresolved pickup/swap/return, abstain.
- The original person may exit after continuously attributed possession/release. Exit alone does not abstain if the same object and relevant ground/contact area remain sufficiently observable. Person tracking is needed where attribution matters, not globally after exit.
- A returning/new person who never touches the continuously observed unchanged object need not be identified. A pickup by someone who cannot be distinguished from the original returning person is `UNCERTAIN`; never assume a new ID means a third party or use biometric recovery.
- Object disappearance/hidden possible pickup with adequate recorded pixels is `UNCERTAIN`. Missing/corrupt capture or processing evidence is `INCOMPLETE`. Neither proves non-retrieval.

## Evidence, clocks and event history

Source time drives all windows in live, accelerated and stepped replay. Preserve raw/normalized presentation timestamps, timebase, source epoch and source-to-arrival mapping/uncertainty. PTS is not automatically UTC. Processing/arrival/publication time is separate. Discontinuities create a new epoch when continuity is unverified; never advance a timer across an outage or subtract unrelated epochs. A processed-through watermark accounts for every required frame as processed or unavailable, not merely the newest arrival. An intact slow queue is delayed evidence; hard compromised coverage becomes incomplete.

At strong release, pin configuration, the full calibration/zone-set snapshot, model/evidence method, thresholds, schedules, category rules, duplicate settings, health, clip and retention revisions. New revisions affect new candidates; incompatible model changes drain pending work or explicitly interrupt coverage. An immediate safety disable blocks new production emissions without rewriting pinned experimental history. Replay gets a new run ID and never silently repairs an original outcome or emits a new live alert.

Initial evidence context is **15 seconds pre-release** plus the full release/landing sequence and **at least 45 seconds post-release**, extended through stabilization resets, the complete retrieval deadline and any necessary resolution/context tail. Pin source-rate encoded evidence; preview/inference sampling cannot erase it.

Provisional clips may be partial and extended via immutable new clip revisions. Store requested, required-fact, available and missing/corrupt spans. Preserve partial artifacts; show separate spans or unmistakable gap markers, never concatenate across a gap as continuous observation. Missing required/config-required evidence blocks qualifying finalization. Missing optional context can only be distinguished under a frozen explicit clip policy; conservative initial policy blocks required span loss. Final evidence requires validated playable media, not a filename or successful conversion exit alone. Ordinary video seeking is not promised frame-accurate; exact inspection uses source-indexed stills.

Every event record needs camera/zone/session/run/release/track IDs; provenance; pinned revisions; interaction/release/landing/stabilization/deadline/retrieval/removal times; visibility and association quality; category; hard-gate/confidence components; structured reasons; clip and coverage references; and independent review history. A visible chronological transition history must show:

- Previous and next state, source timestamp/offset, reason and observed/derived/predicted-only provenance.
- Supporting clip span/frame/crop references linked to source-indexed inspection.
- Timer origins, reset/completion/deadline, person-exit/removal annotations and unresolved boundaries.
- Required/available/missing spans, processed watermark, exact producing revisions and separate processing/publication timestamps.

Predicted-only positions cannot satisfy hard gates. Machine history and pre-review outcomes remain immutable; reanalysis is a new run/finding.

## Independent states and user experience

Do not collapse these dimensions into a single confirmed badge:

| Dimension | Required distinction |
| --- | --- |
| Provenance | Observation fixture vs actual-model run; live vs replay; synthetic vs staged-real vs natural footage; human bookmark vs detected proposal. |
| Event phase | Provisional vs final, with all intermediate FSM states visible. |
| Machine outcome | Frozen `WOULD_ALERT`, `UNCERTAIN`, `REJECTED`, `INCOMPLETE`. |
| Production state | Not evaluated/insufficient/failed/qualified separately from disabled/enabled/safety-disabled, per exact scope. |
| Object state | Still present, original retrieval, third-party removal or unknown. |
| Human review | `new -> under_review -> confirmed / rejected / needs_better_footage`; reasons/notes/corrections retained separately. Ambiguous feedback is a judgment/reason, not a machine rewrite. |
| Write status | Draft, saving, acknowledged saved, failed/retry. No durable-success claim before acknowledgement. |

Single-user feedback is sufficient early; formal roles/SLA/adjudication software is deferred. Evaluation second review can use simple versioned records and must preserve disagreements. UI feedback does not automatically become ground truth, approval or activation.

Display source/transport, recording/captured-through/gaps, processing/watermark/backlog/clip readiness and preview/source-age/staleness **independently**. A connected source or healthy preview proves neither recording integrity nor inference progress. Preview refreshes may drop; source evidence may not silently drop. Frozen frames must never look live. Show unsupported envelope, quality, moved/invalid geometry, disk and coverage warnings.

Required journeys: source onboarding/control; zone/exclusion editing; persistent provisional/final queue and filters; evidence playback/seek/short-step/stills/overlays/crops/history; separate feedback; local capture/replay selection and human miss bookmarks. Loading, empty, stale, error, overload, missing media and failed-write states must be honest. Background refreshes must preserve playback, selection, filters, drafts, notes, focus and scroll; stale responses cannot overwrite another selected event. Use labeled keyboard controls, visible focus, non-color status meaning and wide/compact desktop layouts without hidden actions or page overflow. [Design integration](design-reference.md) remains pending.

## Categories, data and accuracy policy

Bottles/cups are experimental starters, not a validated allowlist. A closed-class detector does not discover every unknown object. Proposed unknown/unvalidated objects remain review-only, usually `UNCERTAIN`; never-proposed wrappers, scraps, cans or cigarette butts are uncaptured misses, not successfully handled abstentions. Manual bookmarks are human-created. A human-qualified bottle/cup mislabeled unknown still belongs in supported recall.

Current configurable production targets are **at least 95% precision across all automatic-path emissions** and **at least 70% recall for human-clearly-visible qualifying supported bottle/cup releases**. The recall-scope recommendation was explicitly approved; broader visible categories/releases/misses must be reported separately. No target is achieved. Targets are evaluation policy, not detector-confidence sliders.

Keep three evidence classes separate: synthetic media/observation fixtures establish deterministic integration/logic; permissioned staged real footage establishes observed visual feasibility; permissioned naturally occurring target-site footage establishes accuracy only under a valid frozen protocol. No staged/synthetic samples enter headline natural metrics. One camera can support time-held-out evidence, not cross-camera generalization.

Before each evaluation freeze category/visibility rubric, targets, source/label partitions, matching/duplicate rules, model/configuration/calibration, minimum alert/positive counts, confidence-bound/clustering method, false-alert ceiling and coverage/health/backlog/latency guardrails. Tune on development/validation only. Split whole events and time/session blocks, with camera-held-out evidence only when available; never random adjacent frames or overlapping incidents. Changing policy after results requires a new version and fresh held-out evidence.

Independent human review of **complete sampled intervals**, not candidate clips alone, finds misses and defines visibility without model output. Second-review apparent positives/ambiguous cases, preserve disagreement and adjudicate explicitly. Unresolved human truth is separately reported, not invented as negative. If independent footage establishes a supported visible positive, every abstention, incomplete algorithm outcome, misclassification or unproposed event remains a recall miss. If no footage establishes truth, report missing hours/ranges and coverage violations instead; surviving easy footage cannot hide downtime.

Score all frozen pre-review `WOULD_ALERT` predictions as prospective automatic emissions. No post-hoc filtering to reviewed, playable or favorable categories. One-to-one truth matching prevents duplicate true positives; unmatched duplicate emissions count as errors. Report adjudicated precision and a conservative precision counting unresolved emitted alerts as errors; use the conservative result for qualification.

Qualification is independent **per camera and zone**, within the declared category/envelope policy. Each must meet predeclared minimum counts and one-sided **95% lower confidence bounds** meeting the **95% precision / 70% supported recall** targets, plus frozen false-alert, uncertain/incomplete/duplicate, coverage/health/backlog gates and **p95 source-release-to-finalized-playable-queue-result latency <= five minutes**. Include clock-mapping uncertainty and do not discard late events. Minimum counts and exact false-alert ceiling are not yet specified; M03 must justify/freeze them before untouched evaluation. Aggregate success cannot rescue weak or undersampled scopes; insufficient evidence stays review-only.

Report TP/FP/FN, emissions/unresolved alerts, visible positive counts, broader misses, exposure/unavailable hours, false alerts per camera-hour, abstention/incomplete/duplicate rates, median/p95 latency and category/visibility/hard-negative errors per scope plus aggregate. No universal detector support, hardware throughput or production-readiness claim follows from a model class name, fixture pass or attractive UI.
