# M01 backend: setup, API and local recovery

This documents the M01 backend integrated with the Evidence Desk UI, not a classifier or accepted M01 outcome. The [historical record](progress-history.md) preserves authority and evidence; [backend preparation evidence](m01-backend-evidence.md) preserves the earlier backend-only checks and their limits. No M02 implementation is included.

## Prerequisites and isolated setup

Verified environment: Python 3.12.8, FFmpeg/ffprobe 8.0 with H.264 encoding, Docker Engine 29.8.2 / Compose 5.5.1, macOS arm64. Other OS/browser/codec/hardware combinations are not qualified. Install prerequisites through your normal approved local process; this project does not install or upgrade global services. Python dependencies are pinned in `requirements.lock`; no model/GPU/Node dependency is needed by this backend slice.

From this checkout, choose a **unique runtime directory, Compose project and free loopback ports** for each checkout/worker. Never reuse another worker's secrets, test DB, container or volume.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
export LITTERING_RUNTIME="$HOME/.local/share/littering-local"
export LITTERING_DB_PORT=55432
.venv/bin/python -m litterwatch.init_runtime "$LITTERING_RUNTIME"
docker compose --project-name littering-local up -d --wait
.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py check
.venv/bin/python -m litterwatch --port 8000
```

Equivalent commands were exercised with separate task-owned paths/ports. `init_runtime` creates 0700 directories and 0600 random Django/DB secrets, never overwrites existing credentials, and does not start anything. The official PostgreSQL image is digest-pinned in `compose.yaml`; its SQL initialization hook creates `littering_app` without superuser/database-creation/role-creation rights. Credentials are mounted from protected files, not embedded in Compose or ordinary configuration. A named volume survives container recreation; it is not a backup.

The supported launcher always binds `127.0.0.1`, one ASGI process, no reload. A database advisory lease refuses another supervisor for that same database. Do not bypass the launcher with a public listener or multiple web workers. Request handlers do not decode source media: capture, independent preview and bounded media jobs own that work. Build the [frontend](../frontend/README.md) before launch, then open `http://127.0.0.1:8000/`. The shell, local assets, API and catalogued media share this origin. `http://127.0.0.1:8000/api/health` exposes backend readiness.

Stop the app with Ctrl+C, wait for process exit, then optionally `docker compose --project-name littering-local stop db`. Keep the volume. **Do not use `down -v`, delete volumes, or repair a failed initialization by silently starting empty history.** Init hooks run only on a new volume; diagnose/repair an interrupted bootstrap explicitly before migrations. Changing a secret file does not automatically rotate an existing database role password.

## Protected camera references

Only after permission and actual camera inputs exist, place a complete RTSP/RTSPS source value in a 0600 file under `$LITTERING_RUNTIME/secrets/<reference>`, using a protected local editor, not shell history, ordinary config, logs or API JSON. The API receives only the reference name (`[A-Za-z0-9_-]`, up to 80 characters) and a permission/provenance reference. There is no secret-writing endpoint.

For generated file fixtures, the secret value is an absolute regular file directly under `$LITTERING_RUNTIME/input`; the source kind is `file_fixture` and its provenance must remain synthetic. Source paths/credentials never become browser media URLs. RTSP transport and footage provenance are separate: a synthetic RTSP fixture must explicitly declare `data_provenance:'synthetic'`, not natural-camera evidence.

Secrets and media stay private, outside source control and a static web root. These local safeguards trust the OS user: FFmpeg arguments/runtime state may remain visible to that user. There is no application login, production original-access authorization, redaction, encryption/key custody, tamper-evident audit or legal-hold workflow.

## JSON/CSRF contract

Routes have no trailing slash. `GET /api/health` returns a masked `data.csrf_token` and sets the strict same-site Django cookie. Send that token as `X-CSRFToken`, same-origin cookies and `Content-Type: application/json` on every POST. Do not exempt endpoints or enable broad CORS. The Vite bundle/shell uses the same Django origin and relative API/media URLs; no Node data server is required. The shell can supply a strict local-assets CSP; the middleware preserves it while denying content by default for API/media.

Responses use `{data, warnings, production_activation:'disabled'}`. Warnings explicitly identify local development, unvalidated/unredacted footage, fixture provenance and absent production security. Names/notes are text, never trusted HTML. Local reviewer labels are not authenticated identities.

| Resource | Actual contract |
| --- | --- |
| `GET/POST /api/cameras` | List or create `{name,kind,secret_ref,permission_ref,data_provenance?}`. Kind is `rtsp` or `file_fixture`; at most two registered identities. Provenance is synthetic/staged_real/natural/unclassified. |
| `GET/POST /api/cameras/:id` | Read or edit name/secret_ref/permission_ref; name edits and unchanged references are allowed during capture. Stop and await shutdown before changing either reference. |
| `GET/POST /api/cameras/:id/configurations` | Immutable revisions; POST `{geometry,settings?}`. Existing run/event revisions stay pinned. |
| `POST /api/cameras/:id/recording` | `{enabled:true|false}` returns 202 desired state, not immediate connection success. Poll sessions. Reconnect is stop, await stopped, then start. |
| `GET /api/sessions?camera=:id`, `/api/sessions/:id` | Latest sessions, independent health, epochs/gaps; detail includes segment IDs/spans/media IDs/status, never private paths. |
| `POST /api/sessions/:id/replays`, `GET /api/runs?session=:id` | New persistent run with frozen input/versions and the original session configuration, not the latest camera revision; mode media_replay or observation_fixture. Existing history is unchanged. No detector starts. |
| `GET /api/runs/:id/timeline?segment=0&frame=0` | Up to 256 source-indexed frames, original PTS/timebase, gaps/unavailability and next cursor. Scheduling never reinterprets source time. |
| `GET /api/events?camera=&run=&outcome=&reason=&phase=` | Latest <=100 fixture events, optional filters; phase provisional/final. Untransitioned events have outcome NO_EVENT and remain provisional. Reason matches retained history. |
| `GET/POST /api/runs/:id/events`, `GET /api/events/:id` | Fixture creation `{epoch,release_key,release_us}` only on fixture runs; same-key exact retry is idempotent. Read phase, immutable history, provenance, clips and independent reviews. |
| `POST /api/events/:id/transitions` | Ordered `{sequence,state,source_us,reason,evidence?}` fixture history, exact retries accepted. No skipped stages/backward times/production activation. M01 rejects WOULD_ALERT as well as AUTOMATIC_ALERT: no actual visual gates exist. |
| `POST /api/events/:id/reviews` | Append-only `{state,reason,notes?,reviewer_label,supersedes?}`. Review states new/under_review/confirmed/rejected/needs_better_footage. Never rewrites machine output. |
| `POST /api/events/:id/clips`, `GET /api/clips/:id` | Request `{required_start_us,required_end_us}` containing release, bounded to five minutes. New revision expands to 15s pre / >=45s post and required end. Poll queued/running/available/partial/failed and explicit requested/required/available/missing spans. |
| `POST /api/segments/:id/frames`, `GET /api/frames/:id` | Bounded async job `{source_us}`; returns an indexed at/after frame and its actual source timestamp. Requests with no qualifying frame in the segment are rejected with 400, never clamped backward. Native player seeking is not guaranteed frame-accurate. |
| `GET /api/artifacts/:id`, `POST /api/artifacts/:id/pins` | Class/status/MIME/hash/lineage/expiry/pins, no paths. Pins require `{purpose,seconds}`, 1 second to seven days, with an active-count bound. Not a legal-hold approval. |
| `GET/HEAD /media/:id` | Controlled catalogued media only; single/open/suffix byte ranges, 200/206/416, no-store and bounded 64 KiB asynchronous reads. Raw TS is source evidence; browser derivatives are H.264 MP4/JPEG. No arbitrary file or directory endpoint. |

Validation is 400; CSRF/nonlocal requests 403; unknown IDs 404; invalid method 405; conflict 409; known unavailable media 410; unsupported/unsatisfiable multi-range 416; DB/media/storage unavailable 503. Plain routing/host errors may be generic HTML, so check Content-Type before JSON parsing. Preserve drafts on failure; success must be acknowledged by the server.

Geometry is `{zones:[{name,points:[[x,y],...]}],exclusions:[...],boundary:0.01}` in normalized source coordinates [0,1]. Require simple finite non-degenerate polygons, 3-128 vertices, 1-32 zones, <=32 exclusions, unique names per kind, no same-kind interior overlaps; exclusions override zones. Boundary is 0..0.25. Settings allow segment_seconds 1..10 (default 2) and retention_seconds 120..86400 (default 3600). This validates configuration, not an observed physical landing.

## Time, failures and local retention

- Integer source microseconds always include epoch identity; original PTS/timebase are retained. Source time is not UTC or accelerated replay wall time. Reconnect/discontinuity starts a new epoch; missing spans are not non-retrieval evidence.
- Preview age uses sealed recording **host file mtime**, not catalog/publication time or trustworthy camera UTC. `age_basis` makes this explicit. The UI advances age between responses and marks the still stale after eight seconds even while refresh is pending; stale/transport/recording/processing state remain separate. Network/camera clock delay is unqualified. No five-minute latency or actual-camera capacity claim is made.
- Encoded recording does not depend on preview/inference; no inference exists. Preview may skip refreshes. Capture has bounded socket timeout, stall detection, at most five recorder launches per session with reconnect backoff, and explicit gaps/fail-closed health. Decoder/clip work is bounded; media jobs have finite admission. Full playable outputs are decoded/validated, not trusted from exit status alone.
- Clip extensions create new IDs/revisions. Missing/corrupt spans produce separate available parts, never a continuous splice. Use ordered `coverage.parts` with `coverage.available` for chronology; do not assume the related media-ID collection is ordered. Each artifact also records its source span. Retained inputs are content-hash checked before derivative/frame reuse. File existence alone does not prove coverage or truth.
- PostgreSQL guards immutable configuration/run/event/transition/review history. These are ordinary application-history safeguards, not authenticated/tamper-evident audit. Producing code/runtime/config versions and source lineage remain inspectable.
- On restart, only matching database/runtime-scoped registered recorder generations may be stopped; unknown/reused identities are never signaled and do not automatically resume. Unverified sessions/events become INCOMPLETE. Interrupted running media jobs become explicitly failed rather than silently duplicating publication; a new request creates a new clip revision.
- Metadata and file rename are not one atomic operation. Published but uncatalogued/staging files stay private and count toward quota; they are not automatically called valid evidence. Inspect/reconcile before deliberately reclaiming orphan data.
- Default media budget is 10 GiB with 256 MiB free reserve (`LITTERING_QUOTA_BYTES`, `LITTERING_RESERVE_BYTES`). Checks include staging and stop unsafe work; this is not an exact filesystem hard quota, so actual bitrate/reserve/overshoot still need camera testing. Rolling deletion removes only expired unpinned catalogued files. Required/evaluation evidence is never evicted to fake health. Pins/quotas are bounded, not indefinite governance exceptions. Backups need separate capacity/retention treatment.
- Reservation admission permits at most 1,000 active slots shared by individual pins and replay groups. A replay group protects every available input in its frozen manifest for one hour and consumes one slot; individual pins retain their existing seven-day maximum. The total catalogued byte size of distinct actively protected artifacts may not exceed `LITTERING_QUOTA_BYTES` (default 10 GiB). Admission fails atomically with a storage-pressure error when either limit is exhausted. Overlapping pins do not count the same artifact's bytes twice. Expiry ends protection, not retention; ordinary expiry sweeping remains separate.

## Verified checks

With an isolated project/database/runtime:

```sh
# Once only for this project's test DB; skip if it already exists.
docker compose --project-name littering-local exec -T db \
  createdb -U littering_admin -O littering_app test_littering
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python -m pip check
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/python -m pytest --reuse-db
# Optional faithful RTSP/reconnect/crash test; owns one pinned loopback fixture container.
LITTERING_RTSP_TEST=1 .venv/bin/python -m pytest --reuse-db -s
```

Do not run against another worker's DB or create/drop its databases. The app role intentionally cannot create test databases; bootstrap the isolated one explicitly as above. Tests create generated patterns/observation fixtures, not camera observations or accuracy samples. See the evidence note for actual results and limitations. Generated Django migrations are tool-owned; lint/format excludes them, while migration consistency is checked directly.

## Direct consistent backup/restore

Stop the app and wait for all its children/jobs to exit before taking this simple local backup; DB dump and files are not a coordinated live snapshot. Use a private backup directory, permissioned data and explicit capacity. Backups are **unencrypted sensitive data** under this MVP, not production backup security.

```sh
umask 077
BACKUP="$HOME/littering-private-backup"   # choose a new private destination
mkdir -m 700 "$BACKUP"
docker compose --project-name littering-local exec -T db \
  pg_dump -U littering_admin -d littering -Fc > "$BACKUP/catalog.dump"
tar -C "$LITTERING_RUNTIME" -czf "$BACKUP/media.tgz" media
```

Restore to a **different private runtime and isolated Compose project/port**, never overwrite a live database/volume. Provision its protected DB secrets deliberately, initialize the fresh DB volume, then create an empty restore database owned by littering_app and run:

```sh
# Against the NEW restore project only:
docker compose --project-name littering-restore exec -T db \
  createdb -U littering_admin -O littering_app littering_restored
docker compose --project-name littering-restore exec -T db \
  pg_restore -U littering_admin --role=littering_app --no-owner \
  --exit-on-error -d littering_restored < "$BACKUP/catalog.dump"
# LITTERING_RUNTIME must now name the NEW private restore runtime.
mkdir -m 700 "$LITTERING_RUNTIME/media"
tar -C "$LITTERING_RUNTIME" -xzf "$BACKUP/media.tgz"
chmod 700 "$LITTERING_RUNTIME/media"
export LITTERING_DB_NAME=littering_restored
# Also set the restore project's LITTERING_DB_PORT and matching protected credentials.
.venv/bin/python manage.py check
.venv/bin/python manage.py shell -c \
  'from workbench.models import Artifact; from workbench.storage import verified_path; print(sum(bool(verified_path(a)) for a in Artifact.objects.filter(status="available")))'
```

Verify matching media hashes, reference counts, pinned configuration, machine/review history, history guards and decoded representative media **offline before launch**. Keep capture disabled until the restored inputs/permissions/references are intentionally checked. Do not run original/restored databases against the same mutable media tree. Do not blindly copy credentials into a differently provisioned existing DB or assume a media archive alone restores metadata.

The tested path restored metadata through the non-superuser app role into a fresh separate container/volume, restored the matching media privately, verified hashes/decoding/history and retained the original volume. A permissive extracted media directory was rejected by the private-directory guard; restoration must retain 0700 containment, not relax the check. Later encryption/key custody, authenticated access, retention across backups and production restore governance remain separate approved work.
