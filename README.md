# Littering detection

A proposed local, evidence-first workbench for inspecting observable unretrieved object releases from fixed cameras. It does not infer intent, identity or a legal violation.

## Current status

**M01 backend implementation is in progress on a local branch.** The R3 plans were accepted, then M01 backend-first work was explicitly authorized. Evidence Desk D2 was subsequently accepted as the UI direction; frontend work has been separately routed in parallel. This branch implements backend resources only, not accepted UI flows or whole-M01 completion. Tests use generated synthetic media, not a physical camera, detector or accuracy evaluation.

See the single [progress record](docs/progress.md) for approval, execution, evidence and next actions, including the completed documentation landing and authority migration. Documentation-ready is not documentation-landed.

## Scope

- Single operator on the development/processing computer; loopback-only UI, API and media.
- One real RTSP camera and capacity for two sources. A labeled simulator can test second-source load, not second-camera accuracy.
- Bottle/cup experiments in human-inspectable outdoor daylight, clear-weather, moderate-crowding zones. No category or camera is validated yet.
- Inspectable provisional/final evidence, local recording/replay and separate human feedback. Fixtures are not detector evidence.
- No biometrics, enforcement, external notifications, hosted footage processing or LLM dependency. No LAN/public or multi-user service.

## Documentation

- [Requirements, event model and evaluation](docs/requirements.md): authoritative observable evidence, timing, coverage and accuracy semantics.
- [Proposed architecture](docs/architecture.md): current R3 recommendation and deferred security seams.
- [Design-reference contract](docs/design-reference.md): supplied export inventory, provenance and pending integration review.
- [Milestones and approval stops](docs/milestones.md): proposed M01-M04 scopes and acceptance criteria.

## Getting started and verification

Backend source is Django/ORM with local Docker/PostgreSQL, FFmpeg private media and a loopback ASGI API. React/TypeScript/Vite/D2 implementation is owned by the separate UI branch; no frontend/build success is claimed here. Backend setup, API and recovery instructions are being finalized against actual tests before this branch is offered for merge. Do not infer whole-M01 readiness from this API checkpoint.

Use only permissioned inputs. Keep footage and credentials out of version control, ordinary configuration, logs, errors and exports; configuration contains protected runtime secret references only. The eventual MVP must visibly warn **local development / unvalidated / unredacted footage**. Local safeguards are not delivered production security.

Each implementation milestone needs explicit start approval, evidence against its identified criteria, explicit outcome acceptance, then separate successor authorization. Neither these documents nor design delivery supplies that approval.
