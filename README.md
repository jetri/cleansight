# Littering detection

A proposed local, evidence-first workbench for inspecting observable unretrieved object releases from fixed cameras. It does not infer intent, identity or a legal violation.

## Current status

**Planning/design only. No application exists yet.** No camera, recording, model or accuracy run has been performed for this repository. Implementation, technical-plan acceptance and UI/design-system acceptance are not recorded. Documentation preparation does not authorize M01.

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

Not available: no application exists yet, so there are no verified application launch, build, lint or test commands. Django + React/TypeScript/Vite and Docker/PostgreSQL are **proposed, not installed or accepted**. Runtime versions, compatibility and licenses remain to be checked during approved implementation. Verified commands belong here only after that work exists and has been exercised.

Use only permissioned inputs. Keep footage and credentials out of version control, ordinary configuration, logs, errors and exports; configuration contains protected runtime secret references only. The eventual MVP must visibly warn **local development / unvalidated / unredacted footage**. Local safeguards are not delivered production security.

Each implementation milestone needs explicit start approval, evidence against its identified criteria, explicit outcome acceptance, then separate successor authorization. Neither these documents nor design delivery supplies that approval.
