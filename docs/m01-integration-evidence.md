# M01 combined synthetic integration evidence

Validation date: **2026-11-10 UTC**. This is bounded evidence, not a second progress tracker, whole-M01 acceptance or M02 authority. [Progress](progress.md) owns approvals/current delivery. Required permissioned real-camera evidence is still absent; the [same-computer walkthrough](m01-camera-walkthrough.md) is prepared, not executed.

## Integrated source and launch

The delivery branch preserves both original histories: backend `74d1a625170b2a49c6487d75705cf47edc28f2e5` and UI `8dd0529e8a98faf4ff51a40ee44d454d131582a9`. The original preparation branches/evidence remain unchanged. Documentation conflicts were reconciled into one progress record. Django's existing URL configuration now includes `workbench.ui_urls`; shell, manifest-selected assets, API and catalogued private media share one origin. No Vite data server, broad CORS/CSRF exemption, public listener, detector or design-only archive was added.

Environment: macOS 27.0.1 arm64, Python 3.12.8, Django 5.2.19, FFmpeg/ffprobe 8.0, PostgreSQL 17, Docker 29.8.2 / Compose 5.5.1, Node 26.13.0 / npm 11.20.0, Chrome for Testing 143.0.7499.4. A new task-private runtime, protected secrets, Compose project/volume and separate app/test databases were used, never a preparation worker's live data. Actual migrations/readiness succeeded. Host listeners and Docker port inspection confirmed **127.0.0.1:8013** for Django and **127.0.0.1:55439** for PostgreSQL. Ports are observations, not required defaults.

## Actual combined browser journey

`chrome-devtools-axi` drove the built bundle against real Django/PostgreSQL and FFmpeg, with **no HTTP API/media mocks**:

- Opened the empty workspace, verified warnings and production OFF, registered a generated-file source using only protected reference and permission-reference names. No physical device, credential guessing or network scanning occurred.
- Used the zone editor to save a bootstrap ground polygon; started encoded capture and observed independent transport/recording/preview/processing facts with an actual 320x240 JPEG. Processing remained not implemented. Stopped capture and awaited stopped state. The first session retained 26 seconds of sealed indexed coverage and an explicit unverified tail gap.
- Created a new observation-fixture replay through the UI; original session/configuration/epoch stayed distinct from the run ID. Loaded 256 indexed records and requested an actual indexed JPEG job through the UI. Source microseconds and original PTS remained inspectable.
- Used the documented real fixture API only to inject an explicitly synthetic event and one terminal INCOMPLETE transition. The UI queue/detail displayed final/fixture/machine/review provenance independently, unavailable policy/object/gate facts honestly, and the complete retained transition. This is history plumbing, not an observed littering event.
- Requested a clip through the UI. FFmpeg produced a native MP4 covering source 0-26s, with missing pre/post context explicit and required 5-6s coverage present. Chrome reached readyState 4, played to 1.099s, paused and sought to 4s without a media error. A real HTTP range returned 206 with 32 bytes and no-store. No seamless gap crossing or frame-accurate native seek is claimed.
- Saved “needs better footage” feedback, appended an “ambiguous” correction, reloaded and restarted the owned application. The same event, pinned run/configuration, one unchanged machine transition and two separate feedback rows remained. A browser restart request made before readiness briefly refused connection; reopening after the actual health check succeeded, not an application fix or hidden passing retry.
- Started another synthetic session, reloaded a fresh actual JPEG reference, drew/saved an exclusion inside the ground zone as revision 2, and stopped capture. Existing replay/event configuration stayed pinned to revision 1. An expired older preview returned 410 and the editor explicitly displayed reference unavailable; fresh permission-safe capture supplied a new reference rather than substituting imagery.
- Reserved the current clip through the UI; the catalog showed one active bounded reservation and actual raw/derived lineage. A tokenless unsafe request was rejected with 403. Inspected source light/comfortable and evidence dark/compact views: no horizontal overflow at the actual 1200px viewport; warnings, hatches and inverse evidence labels remained legible. The independent UI preparation suite covers the wider layout matrix, not this particular combined browser read.

The health endpoint initially still said `ui: not_implemented` and `status: local_backend_only` while the browser was visibly using the integrated shell. This was reproduced through that same browser/API before correction. It now reports `ui: django_shell`, `status: local_workbench` (or degraded), without implying asset/camera readiness. The detector remains not implemented. A combined URL/middleware/CSRF regression verifies the seam and private-path denials.

Console inspection retained the intentional expired-media 410, strict-CSP eval restriction and browser form-autofill advisories; these are not silently relabeled clean console output or reasons to weaken CSP. Private screenshots, request/readback logs, generated footage and operational IDs remain outside public source.

## Implementation checks

- Production Vite build/typecheck and ESLint passed; **32/32** Vitest tests passed. npm audit found zero vulnerabilities; pip dependency consistency passed. Built output is ignored, not committed.
- The inherited Chromium suite passed **13/13 in 25.5s** in the combined checkout. It deliberately uses HTTP doubles and synthetic native-codec fixtures, so it remains distinct from the actual Django/browser journey above.
- Combined Python run: **58 passed in 70.76s** = 43 existing backend checks, 14 shell checks and one new assembled URL/middleware regression. `LITTERING_RTSP_TEST=1` exercised real sockets, two synthetic RTSP sources, disconnect/new epoch/gap, registered-child crash recovery, lost-lease health and private media/storage faults. The earlier integration run passed 57/57 before adding the health/seam regression.
- Django system check, migration consistency and Ruff lint/format passed. Independent source preparation evidence remains [backend-scoped](m01-backend-evidence.md) and [UI-scoped](progress.md#m01-ui-source-evidence); neither is retroactively combined acceptance.

Reproduce with a new isolated runtime/project using [backend setup](backend.md) and [frontend build](../frontend/README.md), provision its separate test database, then run:

```sh
LITTERING_RTSP_TEST=1 python -m pytest tests frontend/tests/test_ui_shell.py --reuse-db -q -s
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test
```

The no-mistakes pipeline alone owns final review/test/fix/publication. These implementation checks are not a second final-review gate. No automatic PR merge is authorized.

## Acceptance limits

| Criterion | Combined evidence now available | Remaining acceptance limit |
| --- | --- | --- |
| A1 | Actual local build, Django shell/API/media, DB readiness/migrations, listener containment, warnings, protected references and CSRF rejection | Formal outcome acceptance absent; this trusted-local MVP is not production authentication/encryption/redaction |
| A2 | Browser synthetic onboarding/start/stop/health and persisted identities; actual two-source synthetic RTSP disconnect/recovery in automated tests | **No real camera** or combined two-source real-camera browser demonstration; model/RTSP capability, protected configuration and permissioned recording scope unconfirmed |
| A3 | Browser normalized ground/exclusion revisions on actual generated JPEGs, immutable pinning; backend invalid/overlap/exclusion regressions | Actual permissioned camera imagery and full user-operated keyboard/buffer validation still required |
| A4 | Actual encoded capture, new replay, indexed JPEG, native MP4 play/seek, review correction and app-restart readback | Real-camera recording/replay not run; original backend backup/restore evidence is preserved, not rerun here |
| A5 | Actual fixture detail/history, partial context, expired-image unavailability, bounded reservation readback; automated storage/corruption/retention faults | Full combined browser destructive-fault walkthrough on isolated synthetic data still needed for whole-criterion acceptance; no production retention/security or soak qualification |

Generated patterns and observation fixtures are never real-camera, physical-contact or accuracy evidence. No whole-M01 acceptance, M02 start, achieved 95%/70% targets or production activation is claimed. Stop for explicit outcome acceptance after the missing permissioned walkthrough, not an automatic successor milestone.
