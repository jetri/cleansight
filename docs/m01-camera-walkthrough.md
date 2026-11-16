# M01 real-camera walkthrough on the development computer

Use the **same development computer**. M01 does not require a separate machine or a GPU. This is a preparation checklist, not evidence that a camera was connected or M01 accepted. [Progress](progress.md) owns current status; [M01-A1 through A5](milestones.md#m01---inspectable-local-camera-workbench) remain unchanged.

## Confirm before connecting

For each newly authorized walkthrough, confirm the specific camera and stream, RTSP/RTSPS support, codec, protected connection reference, permission to access it, scene boundaries, who may appear, recording duration, storage budget and stop/delete expectations before connection or recording. Do not scan the network, guess credentials or probe another camera. A webcam or proprietary cloud-only feed is not automatically an RTSP source; unsupported transport needs an explicit decision, not an unapproved bridge/service.

Keep camera addresses, passwords, connection strings and private permission records out of chat, source, screenshots, shell history and logs. Share only non-secret capability information and a permission-record reference. Public source delivery does not authorize uploading footage or exposing the app beyond loopback.

## Protected local configuration

1. Follow [backend prerequisites and isolated setup](backend.md#prerequisites-and-isolated-setup) using the runtime, Compose project and loopback ports authorized for that walkthrough. An initial setup needs a **new private runtime**, unique project and free ports; a retest must use its explicitly authorized runtime without creating a second owner. Do not reuse an unrelated synthetic runtime or another worker's DB/secrets. Build the [frontend](../frontend/README.md) before launching Django. Preserve DB volumes and history.
2. Once the specific stream and scope are confirmed, use a protected **local editor**, not a shell command containing the value, to create `$LITTERING_RUNTIME/secrets/camera_primary`. Put only the full approved RTSP/RTSPS connection value in that file. The runtime/secrets directories must be 0700 and the file 0600. Do not paste its value into the browser. The application has no secret-writing endpoint.
3. Use only the reference `camera_primary` in **Sources & zones > Register source**. Choose RTSP, record the actual provenance (natural or staged real, never synthetic), and enter a non-secret permission-evidence reference. Registering does not start recording. Keep recording OFF until the agreed interval begins.
4. Prepare a separately permission-safe synthetic RTSP second stream with its own protected reference and conspicuous synthetic provenance. A local file fixture alone does **not** establish the concurrent second-RTSP criterion. Do not loop the physical camera under two identities and call it two independent cameras.

The launcher binds only `127.0.0.1`; verify the actual app and DB listener bindings. This trusted-local MVP has no login, redaction, encryption or production original-access authorization. It never needs a public tunnel. Browser-visible media is catalogued by UUID, not camera URL or filesystem path. Do not record authentication setup or inspect FFmpeg process arguments in shared evidence: they may contain the connection value.

## Bounded user walkthrough

Record exact app commit, OS/browser/FFmpeg/PostgreSQL/Node versions, camera model/codec/resolution/frame rate, configured segment/retention/quota values, actual session lengths and source provenance in private evidence. Record failures as failures; do not lower criteria to fit the camera.

| Criterion | User steps and required observations |
| --- | --- |
| A1 | Build local assets, confirm DB health/migrations, launch Django, open `/`, and inspect the actual loopback bindings. Overview/detail must show local-development, unvalidated and unredacted warnings. Verify saved API/config/error output contains references only, not the connection value. |
| A2 | Add/edit the approved camera; save a conservative coordinate-only bootstrap revision if needed to enable first capture. At the agreed start, connect/start it and the labeled synthetic RTSP second source. Observe distinct IDs and independent transport/recording/preview/processing facts. Stop, await actual shutdown, then reconnect. Interrupt only the approved camera connection in the agreed way and verify stale stills, coverage gaps and recovery without a false live indication. |
| A3 | During permissioned capture, reopen the editor and reload the current reference to replace any bootstrap draft. Draw/save/reload ground and exclusion/bin polygons plus a boundary buffer on the **actual camera image**. Check source aspect, pointer/keyboard/coordinate alignment, rejection of invalid/overlapping geometry, and a new immutable revision. Existing runs must keep their original revision. A missing/expired reference is not an imagery pass: obtain a fresh permissioned preview. |
| A4 | Stop at the agreed end and await shutdown. Create a replay from that saved session; verify new run ID, original session/config/epochs/source times, actual indexed JPEG extraction and locally playable/seekable MP4 clips. Create explicitly labeled observation fixtures through the documented fixture API, never assert detector observations. Add feedback, correct it, reload and restart the app; verify camera/config/session/run/event IDs and separate machine/review history survive. |
| A5 | Inspect provisional and final fixture queue/detail, explicit unavailable clocks/gates, and loading/empty/error/stale states. Use isolated synthetic material for destructive missing-segment/quota/expiry scenarios, not unique real footage. Verify missing/partial media cannot imply a clean negative and bounded reservations preserve retained evidence. Include actual UI readback, not backend-only assertions. |

Check light/dark and comfortable/compact desktop layouts, visible keyboard focus, readable IDs/reasons, stable playback and retained drafts during refresh/save failures. Keep private evidence outside source control, crop/redact operational context only under the agreed evidence policy, and never label a generated pattern as real-camera evidence.

## Stop and present evidence

Stop recording and wait for actual stopped sessions. Shut down the owned app cleanly; optionally stop only its exact DB service while preserving its volume. Do not delete credentials, footage or history to hide a failed check. Apply the agreed private retention/disposal decision separately.

Present A1-A5 as pass/fail/not-run with exact evidence and missing inputs for explicit outcome acceptance. Synthetic automated checks supplement but cannot replace this walkthrough. No detector, achieved accuracy, production activation, M02 start or PR merge follows automatically.
