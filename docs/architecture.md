# Architecture

**M01 implementation direction: accepted R3.** Current integration, authority, evidence and acceptance status live in [progress](progress.md). This consolidates the accepted direction rather than its historical alternatives. [Requirements](requirements.md) own event/evaluation semantics; [milestones](milestones.md) own acceptance and stop boundaries.

## One local application

The diagram includes the deferred vision path; detector/tracker/evidence estimation is not implemented in M01. See [milestone boundaries](milestones.md) before starting that work.

```text
Permissioned fixed RTSP camera(s)     Existing permissioned local session
              |                                 |
     FFmpeg capture child                 File/replay adapter
     encoded source-rate segments          preserve source clock
              +---------------+-----------------+
                              |
                    Session / segment catalog
                     |                  |
       independent preview child    vision child, per-camera contexts
       JPEG + source time/age       decode -> detector -> tracker
                     |              -> event-local evidence estimator
                     |              -> source-time evidence reducer
                     +------------------+
                              |
               Host Django app / single logical owner
             validation, domain/store/job/camera operations
                   |                       |
      local Docker PostgreSQL       bounded clip/media child
      durable metadata volume       validated derivatives + spans
                   |                       |
                   +--- private raw/derived files and observations
                              |
             loopback shell/assets + JSON + controlled media
                              |
       local browser: React/TypeScript + native video/canvas

Vite/Node build -> local asset bundle/manifest -> Django shell
Replay/evaluation reuses source, observation and evidence contracts
```

Django/ORM on ASGI/Uvicorn is the browser-facing authority for the authorized M01 slice. React owns one bounded workspace mounted in a Django shell; Vite builds local assets. Shell, assets, JSON and media share one loopback origin. Node is build/development tooling, not a separate data server. No separate FastAPI, React SSR/Next.js, public CDN, Redis/Celery, Kubernetes, model-service fleet or generic provider/control framework is proposed. FastAPI/SQLite and vanilla-JS-only recommendations are superseded. **TACO is removed from active dependencies, data work and experiments.**

Proposed Python vision baseline: a pinned small COCO-pretrained YOLO-family candidate with explicitly selected ByteTrack **without appearance ReID**, plus a separately versioned event-local possession/contact/release/landing/retrieval estimator and pure evidence reducer. COCO class availability is not camera support. Boxes, keypoints, overlap, optical flow and retained tracker predictions cannot manufacture physical contact evidence. A bounded targeted ROI/contact refinement may be compared only within approved feasibility scope; no open-ended model survey, training or VLM track is implied. Licenses for exact code, weights, binaries and transitive dependencies must be checked before adoption; none is cleared by this plan.

## Ownership, recording and media

- One logical supervisor/store/transition owner handles durable state and child lifecycle. Do not multiply camera owners by increasing web-server workers. Capture, preview, vision and clip work are bounded children, not browser-facing services. Decode/inference/conversion must not block request handlers or long DB transactions.
- Capture preserves every available frame in source-rate encoded rolling segments before inference. Missing packets remain explicit. Use a bounded decoded working set, not minutes of RGB frames. Short keyframe-aligned segments are proposed; actual codec/GOP/container behavior must be measured, not assumed to cut at exact requested seconds.
- Preview independently decodes recent sealed media with source timestamp/age and a bounded refresh rate. It may skip refreshes, never source recording. Model lag must not freeze preview or make recording appear healthy.
- Browser receives HTTP preview and validated seekable derivatives, not RTSP URLs. JPEG preview and H.264/MP4 playback need actual browser/codec testing for each supported environment; remux where compatible, transcode where required, retain original source and conversion provenance. Exact inspection uses source-indexed stills, not an assertion that ordinary video seeking is frame-accurate.
- Django serves only catalogued media IDs resolving to validated private paths, with tested bounded reads, MIME/range/seek behavior and no raw-directory mount. ASGI/FileResponse is not assumed to supply bounded asynchronous range serving automatically. New clip revisions prevent stale truncated caches; overlays use shared source coordinates/time.

## Durable contracts and recovery

PostgreSQL stores metadata, not video blobs. Private host files hold encoded raw segments, distinct derived clips/stills and immutable versioned observation batches. Catalog stable IDs, sensitivity/classification, lineage, source spans, hashes, retention/expiry/pins and revisions. Hashes establish identity/provenance, not truth or tamper-proof security.

| Contract | Required boundary |
| --- | --- |
| Source session / segment | Camera/session/epoch, live or file provenance, original timebase/PTS and normalized spans, arrival mapping/uncertainty, codec/rate/geometry, sealed/decode status and gaps. File existence is not evidence completeness. |
| Run / observations | Input identity, new run ID, fixture vs real-model mode, application/dependency/model/evidence-method/settings digests, source frames/crops/transforms and observed vs derived vs predicted-only facts. |
| Release / event | Anonymous local tracks, split/merge/association uncertainty, stable physical release episode, canonical aliases, pinned revisions, ordered transition sequence, timer origins/deadlines, hard gates/reasons, coverage and clip versions. |
| Review / labels | Append-only local review actions/corrections independent of machine history; separately versioned ground truth, disagreements and adjudication. Local reviewer labels are not authenticated identities. |
| Evaluation | Frozen inputs/labels/splits/rubric/category scope, model/configuration, matching/count/bound/guardrail policy and prediction/tool versions. |

Source presentation time drives the shared live/replay reducer; monotonic host time measures compute/queue durations and UTC supports display/log correlation. Preserve clock uncertainty. Finalization waits for complete required source coverage, inclusive deadline processing and validated playable media, not wall-clock sleeping or the arrival of a newer frame.

Commit idempotent observation/transition sequence, cursor/checkpoint, artifact references and pending jobs transactionally. Publish validated artifacts by temporary write then rename; reconcile DB/file publication after interruption because they are not one atomic transaction. Retried jobs must not duplicate events or rerun nondeterministic inference over historical decisions silently. Resume active episodes only with verified source coverage and compatible checkpoints; otherwise mark `restart_coverage_unverified` / `INCOMPLETE`. Explicit replay is a new run.

Pin the full zone-set/configuration at strong release, including before landing-zone selection. Activation records source/processing watermark. Incompatible model/calibration changes drain pending events or record interrupted coverage. Safety disable immediately blocks new production emissions while preserving frozen experimental decisions.

## Local database, capacity and containment

M01 uses a version-pinned PostgreSQL container with a named durable volume and protected DB credentials, a non-superuser application account, Django migrations and actual readiness checks. App/media stay on the host initially; Compose is for the DB only. The separate backend slice exercised PostgreSQL persistence/recovery; final combined UI/application evidence remains separate in the [historical record](progress-history.md). No container is started by this document and no model runtime is authorized by M01.

If a DB port is published, bind explicitly to loopback and verify actual reachability/engine behavior, including known older-engine localhost-publishing limitations. A named volume is not a backup. Persistence acceptance requires real PostgreSQL transaction/restart/recreation/lost-connection and independent backup/restore evidence with matching media manifests; SQLite tests cannot establish PostgreSQL parity. Never silently initialize empty history as successful recovery or casually delete a volume.

Measure actual OS/CPU/RAM/disk, GPU/VRAM/runtime if needed, camera transport/codec/GOP/bitrate/timebase and local browser before pinning versions or claiming capacity. Deterministic logic/UI tests need no GPU. CPU/offline fallback is not a real-time two-stream promise. Start one stream, then two; report per-source fairness, recording/processing/preview rates, resource/disk growth, gaps, queue lag and release-to-playable latency. A simulated second source proves only its tested load.

Use explicit measured quotas, free-space reserve, rolling expiry and bounded pins for active/evaluation evidence. Original seven-day raw/30-day event production retention defaults are deferred, not blindly adopted on a development disk. Soft backlog warns and protects source; hard health/backlog breach pauses eligibility and marks compromised coverage incomplete, retaining late output. Low disk rejects optional work and reclaims only expired unpinned data; write failure preserves existing evidence and exposes unverified intervals. No silent frame/evidence deletion to improve apparent speed.

## Security seams and limitations

These are proposed architectural seams, **not delivered controls**. The MVP trusts the local OS user. Loopback/private files, secret hygiene and append-only domain history do not provide production authentication, encryption, redaction or tamper evidence. Media-tool subprocess arguments/runtime state can remain visible to the trusted local OS user; do not promise invisible camera credentials.

| Requirement family | Preserve now | Separately approved later implementation |
| --- | --- | --- |
| Permission and on-premise data | Permission/provenance references, local files/compute, no hosted fallback; no identity/enforcement fields. | Site governance, revocation/purpose controls; any optional hosted analysis requires separate privacy/egress approval. |
| Classified media and privacy | Stable IDs/lineage for raw, original event, unredacted/redacted derivatives, stills/crops/exports/evaluation copies; one server read boundary. MVP explicitly unredacted. | Measured default face/plate redaction across all views/exports, controlled originals and safe caches. Failed redaction cannot fall back to raw. |
| Identity and access | Server-owned domain/media validation; no client authorization authority, no secrets in bundle; same-origin unsafe operations with Django CSRF/host/origin protections and safe text rendering. | Private authenticated ingress/OIDC, application-owned least-privilege roles and resource authorization, sessions/TLS and IDOR/role tests before wider/multi-user access. |
| Encryption and secrets | Protected runtime references, masked forms, secret-redacted errors/diagnostics, private paths, no source-controlled credentials. | Key custody/rotation/recovery, encryption/backfill of media/metadata/temp/backups, production secret/service-account hardening and controlled original access. |
| Audit and reviews | Immutable machine history, append-only feedback/corrections, actor/correlation fields where applicable, versioned labels. | Authenticated second review/adjudication/ownership/SLA and independently protected append-only tamper-evident sensitive-action audit. Old local records cannot become retroactively secure. |
| Retention and deletion | Artifact classes/expiry/pins, quota/rotation and explicit evaluation preservation/deletion. | Authorized per-class production retention/defaults, exception/hold expiry, deletion across derivatives/caches/backups and restore reconciliation. |
| Configuration and import | Immutable validated snapshots/pinning/rollback, secret-free configuration; no external package import. | Formal validate/evaluate/approve/activate roles and privacy policy; signed package trust/path/size/media verification for separately scoped secure review. |
| Alert channel | Dashboard-only system status, independent review and qualification/activation. | No external action is assumed; any notification/dispatch/enforcement expansion requires a new design and approval. |

Future enforcement attaches to domain operations, controlled media, classified storage and provenance. It requires real schema/data migration, encryption/redaction backfill, audit cutover, backup/retention and concurrency testing, not a free framework toggle. No generic policy engine, provider layer or service fleet is justified now.

## Verification scope

The UI uses pinned TypeScript/Vite/ESLint/Vitest and Playwright for real Chromium journeys against explicitly mocked HTTP resources, plus standalone real-Django shell/asset checks. [Frontend build/assembly/check instructions](../frontend/README.md) and [actual evidence/limits](progress-history.md#m01-ui-source-evidence) distinguish those checks from combined Django/PostgreSQL/capture/media verification. Pytest owns backend/domain/integration checks; a frozen accuracy evaluator and real detector remain later scope, not delivered M01 tooling.

Verify deterministic timing/geometry/denominator fixtures, shared live/replay paths, local RTSP/browser E2E, failed writes/restarts/secret leakage/CSRF/media-path faults, one/two-stream soak and careful wide/compact keyboard/visual review. Django ordinary test clients relax CSRF, so negative tests must explicitly enforce checks. Preserve a failing user-flow replay before a bug fix. Fixtures establish logic, staged real observations establish feasibility, natural held-out evaluation establishes per-scope accuracy. See [milestone evidence gates](milestones.md).
