# Littering detection

An experimental local, evidence-first workbench for inspecting observable unretrieved object releases from fixed cameras. It does not infer intent, identity or a legal violation.

## Current status

The M01 workbench combines a Django backend with the Evidence Desk D2 UI. No detector or accuracy qualification is claimed.

See the single [progress record](docs/progress.md) for approval, execution, synthetic and permissioned camera evidence, limitations and next actions. Evidence does not itself establish whole-M01 outcome acceptance.

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
- [Milestones and approval stops](docs/milestones.md): M01-M04 scopes and acceptance criteria.

## Getting started and verification

Django serves the React/TypeScript workspace, Vite-built local assets, API and private catalogued media from **one loopback origin**. Node is a build tool, not a second data server. Follow [backend setup, launch, API and private recovery](docs/backend.md) and [frontend build instructions](frontend/README.md). Build the frontend before starting `python -m litterwatch`, then open `http://127.0.0.1:8000/`.

Verification commands and prerequisites live in the [frontend checks](frontend/README.md#checks) and [backend checks](docs/backend.md#verified-checks). The [progress record](docs/progress.md) distinguishes source-slice checks from combined application and physical-camera evidence. Built `frontend/dist/` is generated and not committed.

Use only permissioned inputs. Keep footage and credentials out of version control, ordinary configuration, logs, errors and exports; configuration contains protected runtime secret references only. The workbench visibly warns **local development / unvalidated / unredacted footage**. Local safeguards are not delivered production security.

Each implementation milestone needs explicit start approval, evidence against its identified criteria, explicit outcome acceptance, then separate successor authorization. Neither these documents nor design delivery supplies that approval.
