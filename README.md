# Littering detection

An experimental local, evidence-first workbench for inspecting observable unretrieved object releases from fixed cameras. It does not infer intent, identity or a legal violation.

## Current status

**M01 implementation is authorized and underway; combined delivery and milestone acceptance are pending.** The backend slice is locally prepared; the accepted Evidence Desk D2 UI is implemented and independently tested in `frontend/`, with a minimal Django shell/assets seam. Separate source checks do not establish a combined application or whole-M01 acceptance. No physical camera, detector or accuracy qualification is claimed.

See the single [progress record](docs/progress.md) for approval, execution, evidence and next actions, including the completed documentation landing and authority migration. Documentation-ready is not documentation-landed.

## Scope

- Single operator on the development/processing computer; loopback-only UI, API and media.
- One real RTSP camera and capacity for two sources. A labeled simulator can test second-source load, not second-camera accuracy.
- Bottle/cup experiments in human-inspectable outdoor daylight, clear-weather, moderate-crowding zones. No category or camera is validated yet.
- Inspectable provisional/final evidence, local recording/replay and separate human feedback. Fixtures are not detector evidence.
- No biometrics, enforcement, external notifications, hosted footage processing or LLM dependency. No LAN/public or multi-user service.

## Documentation

- [Requirements, event model and evaluation](docs/requirements.md): authoritative observable evidence, timing, coverage and accuracy semantics.
- [Architecture](docs/architecture.md): accepted R3 implementation direction and deferred security seams.
- [Design-reference contract](docs/design-reference.md): accepted D2 provenance, project token authority and original export inventory.
- [Milestones and approval stops](docs/milestones.md): proposed M01-M04 scopes and acceptance criteria.

## Getting started and verification

The UI source uses React/TypeScript and Vite-built local assets for a **Django-served same-origin shell**. Node is a build tool, not a second data server. Backend setup/combined launch is supplied by the separate stable backend/delivery slice; this UI preparation branch does not claim that assembly has run.

See [frontend build, Django assembly and test instructions](frontend/README.md). Checks exercised from the repository root on Node 26.13.0 / npm 11.20.0:

```sh
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend test
npm --prefix frontend audit --audit-level=moderate
```

Build/type/lint, unit tests and separate Chromium/native-media HTTP-fixture journeys pass; the dependency audit reports zero vulnerabilities. Standalone Django shell tests are separate from real Django/PostgreSQL/capture/media integration. Exact scope, counts and missing combined/physical-camera evidence are in the [progress record](docs/progress.md). Dependencies are pinned by `frontend/package-lock.json`; built `frontend/dist/` is generated and not committed.

Use only permissioned inputs. Keep footage and credentials out of version control, ordinary configuration, logs, errors and exports; configuration contains protected runtime secret references only. The eventual MVP must visibly warn **local development / unvalidated / unredacted footage**. Local safeguards are not delivered production security.

Each implementation milestone needs explicit start approval, evidence against its identified criteria, explicit outcome acceptance, then separate successor authorization. Neither these documents nor design delivery supplies that approval.
