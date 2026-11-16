# M01 backend evidence (2026-11-10)

This preserves the independent backend preparation evidence at `74d1a625170b2a49c6487d75705cf47edc28f2e5`, not a second tracker or whole-M01 acceptance. Later combined validation is in [integration evidence](m01-integration-evidence.md). The [historical record](progress-history.md) preserves authority and delivery evidence; [milestones](milestones.md) retain unchanged M01-A1 through A5. The user authorized M01, initially backend-first, and later authorized a separately owned parallel UI implementation. That preparation slice contained no UI/design-system code, detector, tracker, model download, GPU work, natural footage or accuracy evaluator.

## Implemented backend slice

- Django/ORM, digest-pinned local PostgreSQL/Compose, private runtime secret references, migrations, one loopback ASGI authority and exclusive database lease.
- Persistent camera/configuration revisions, normalized conservative geometry, sessions/epochs/segments/gaps, frozen replay runs/source indexing, artifact classes/lineage, bounded pins/rolling storage.
- Independent encoded recording, capped preview and bounded clip/frame jobs; conservative reconnect/clock/storage failures; clean stop and generation/scope-checked recovery of registered recorder children.
- Catalogued ID-only media, asynchronous bounded byte ranges, verified H.264/MP4/JPEG derivatives, immutable clip extensions and separate available parts across gaps.
- Conspicuous observation-fixture event histories and independent append-only review corrections, with PostgreSQL mutation guards. Production activation and actual visual positive-gate execution are absent/disabled.
- Producing source-code/runtime/dependency/configuration identity and raw/normalized source PTS are retained. Neither these hashes/history guards nor loopback/private files are production tamper-evident security.

## Actual checks and limitations

Environment: Apple M4 Pro, 24 GiB RAM, macOS arm64; Python 3.12.8, FFmpeg/ffprobe 8.0, Docker Engine 29.8.2, Compose 5.5.1, PostgreSQL 17.11 (official image digest in Compose), Django 5.2.19. No GPU or actual camera specification was inspected/assumed. Dependencies are version-pinned and `pip check` passed. Installed package license metadata was inspected (Django/Uvicorn BSD, psycopg LGPL-3.0-only, Shapely BSD; test tools MIT/BSD). The locally installed FFmpeg is a GPL-enabled build; binaries/models are not vendored or licensed/redistributed by this branch. This is not blanket license clearance for future packaging/dependencies/models.

**Final full bounded backend suite:** **43 checks passed in 73.97 seconds**, including the explicit missing-original-PTS guard. The preceding complete 42-check round passed in 74.60 seconds; the final run repeated both actual socket and RTSP recovery journeys rather than only isolated units. Django check, migration consistency, Ruff lint/format and dependency consistency were also exercised. Generated migrations are not manually reformatted.

The suite uses FFmpeg-generated 320x240 / 10 fps / 72-second test patterns and separately injected observation fixtures. It drives actual socket HTTP -> ASGI -> PostgreSQL -> FFmpeg/private media, including two simultaneous sources. The RTSP test uses one small pinned MediaMTX container solely for faithful loopback TCP transport, disconnect/reconnect and process recovery; it is not product infrastructure. No physical camera or unrelated device is contacted. Short test durations establish only those scenarios, not a representative long soak or real-camera capacity/latency.

Final successful protocol: backend ports 59201 and 59469; refused duplicate supervisor on 59408; RTSP fixture 59483, app ports 59486 and 59705. One backend workflow took 18.729 seconds; the RTSP pre-crash app process took 15.973 seconds and recovered app 6.677 seconds. The reconnect example recorded two source identities, two epochs, an explicit gap and INCOMPLETE fixture outcome. These are test-protocol observations, not throughput/FPS/p95 qualification. Normal subprocess termination and deliberately injected SIGKILL/duplicate-start exits are distinguished by the tests.

Covered assertions include server geometry validation/exclusion precedence; immutable/pinned revisions; exact transition retries versus conflicting history; separate feedback/corrections; source-time replay identity; pre-roll loss, full 60-second clips and extension through 71-second required end; source-indexed frame extraction; corrupted and same-size altered source identity; original-PTS absence, internal cadence gaps and reconnect epochs; partial clips without gap splicing; HEAD/single/open/suffix ranges and invalid multi-ranges; loopback/Host/CSRF/origin checks and secret-reference hygiene; quota faults/pins/expiry; interrupted publication; application restart and registered-child recovery; exclusive ownership and lost-lease fail-closed health.

### Defects found and corrected through validation

- Actual initial DB bootstrap exposed a Docker-mounted shell execution failure. Replaced the new hook with a static SQL init hook and repaired the empty task-owned volume explicitly, without deletion. Then tested a fresh independent restore volume successfully. Trimmed the generated secret file's newline consistently for DB login.
- An actual generated file with a PTS gap exposed missing coverage indexing. Added source-cadence gap metadata/coverage subtraction; clips keep separate parts. Missing original PTS cannot become complete coverage from estimated time alone.
- An API request for provisional fixtures exposed NULL latest-state filtering; untransitioned fixtures now remain visible.
- A real socket fault terminating only the test database's supervisor lease showed stale recording='sealed' after the child stopped. The regression now requires degraded global health and stopped source metadata when writable, with no duplicate supervisor/recovery success claim. The implementation also marks returned health unverified if persistence is unavailable; a full database/disk outage was not simulated, so that broader failure combination is not claimed as tested.
- The RTSP fixture publisher ignored SIGTERM, and its cleanup initially repeated the timeout. Following supervision, both existing stop sites now use fixture-owned Popen handles with terminate/bounded-wait/kill/bounded-final-wait. All publishers and the exact test container are attempted even if another cleanup fails; failures are reported, not swallowed. Three focused timeout/cleanup regressions pass. No hardcoded PID or container sweep is in the shipped test path.

### Persistence and independent backup/restore

An isolated synthetic source, immutable fixture machine history, independent review and pinned raw artifact were persisted. Actual container restart and force-recreation retained them in the named volume. `pg_dump -Fc` plus a matching private media archive were restored into a **fresh separate PostgreSQL container/volume and database**, using the non-superuser app role for restored objects. Verified the same IDs, source bytes/hash, decoded video, review/machine separation and mutation guards. Original volume/media were retained. Task DB host ports were 55437 and 55438; Docker published only 127.0.0.1, independently confirmed by Docker inspect and the host listener.

An extracted media directory with permissive mode was refused by the private-directory guard; restore instructions preserve 0700 containment rather than weaken the guard. A regression covers that failure. Runtime credentials/media/backups/proof stay outside the checkout. The documented [direct backup path](backend.md#direct-consistent-backuprestore) stops the app before backup; it is not a coordinated live snapshot, encrypted backup or production retention system.

## Acceptance limits at backend preparation

These limits describe the preparation head above, not current delivery status; see the [historical record](progress-history.md) for subsequent evidence.

| Criterion | Backend evidence | Still pending at backend preparation |
| --- | --- | --- |
| M01-A1 | Actual backend launch/checks; loopback API/media and DB; CSRF/origin/Host denial; protected secret references; explicit unvalidated/unredacted JSON warnings | Actual UI overview/detail and warnings, accepted local frontend build/assets/user launch, integrated browser journey. Backend tests do not pass the whole criterion. |
| M01-A2 | Two source identities and concurrent generated RTSP/file capture, independent health/staleness, stop/start/reconnect/new epochs, app/process restart durability | One permissioned physical camera/credentials and actual UI onboarding/control. A simulator cannot replace it; not run/passed. |
| M01-A3 | Finite normalized polygon/buffer validation, self-intersection/ambiguous-overlap rejection, exclusions win, immutable revisions and event/run pinning | Drawing/saving/reloading on actual camera imagery through the UI, keyboard/error/draft persistence and visual alignment. |
| M01-A4 | Encoded synthetic recording, new replay run IDs/same input/source clocks, indexed frames, playable/seekable derivative/range path, immutable machine/review and DB/media restore evidence | Actual user-operated UI playback/review and physical-camera recording/replay. FFmpeg decode is not a browser/native-player demonstration. |
| M01-A5 | Fixture provisional/final data/history, corrupt/missing spans, controlled quota failure and retained evidence pins/expiry; no false negative or production status | Visible queue/detail/error/loading/empty/stale states and integrated UI provenance/usability checks. |

No whole-M01 criterion/outcome acceptance, natural accuracy or production-security claim is made. At that preparation head the physical-camera prerequisite was unsupplied; no credential request or unrelated camera probing occurred in that work. Integration, physical-camera demonstration and formal acceptance were separate next steps, not hidden passes; their subsequent disposition is in the [historical record](progress-history.md). Broader codec/hardware/long-soak characterization was not established.

## Delivery boundary

This worker supplies a clean tested local backend branch only; firstmate's separate delivery owner combines stable backend/UI heads and runs the selected no-mistakes/public-delivery path for https://github.com/jetri/cleansight. No push, merge, duplicate pipeline, automatic gate answer or public media/application listener is performed here. Public source is not permission to expose credentials, footage or the local application. The earlier origin-free tooling limitation is historical after the approved setup.
