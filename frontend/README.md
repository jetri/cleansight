# Evidence Desk frontend

React/TypeScript workspace for the authorized M01 slice. The accepted D2 [token authority](src/styles/tokens.css) and domain anatomy are described in [design provenance](../docs/design-reference.md). [Project progress](../docs/progress.md) separates actual evidence from milestone acceptance.

## Build

Use Node 26.x (tested 26.13.0) and npm 11.20.0. Dependencies and the reviewed minimatch security override are pinned in `package-lock.json`.

```sh
npm --prefix frontend ci --ignore-scripts --no-fund
npm --prefix frontend run build
```

`dist/` is generated, ignored output. `npm --prefix frontend run dev` watches production asset builds; it does not start a second data server. No remote fonts or CDN are required.

## Django assembly

The delivery branch combines this source slice with the prepared M01 backend. `litterwatch/urls.py` includes the shell and asset routes from `workbench/ui_urls.py`:

```python
path("", include("workbench.ui_urls")),
```

Use the ordinary `django.urls.include` import. The shell is `/`, assets are `/ui-assets/`, and existing `/api/` and catalogued `/media/<uuid>` remain Django-owned and same-origin. Build before launching the backend. Missing/invalid built assets produce an honest 503, not a successful placeholder page. The shell uses the Vite manifest, local assets and self-only CSP; only GET/HEAD and bounded supported assets are served. It is not a general raw-directory mount.

Keep the actual backend's loopback listener/host/CSRF/media configuration and isolated DB/runtime. Do not run a Vite data server, add broad CORS/CSRF exemptions, publish footage, or reuse another worker's DB/secrets. See [backend setup and launch](../docs/backend.md) for the combined application's prerequisites and protected runtime.

## Checks

```sh
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend audit --audit-level=moderate
```

The browser suite requires an already installed Chromium executable plus FFmpeg/FFprobe on PATH. It generates permission-safe color-pattern media and runs an isolated loopback Vite preview on port 5187. No camera, person, downloaded browser or detector is needed.

```sh
UI_TEST_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium npm --prefix frontend run test:browser
UI_TEST_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium npm --prefix frontend run test:browser -- --repeat-each=2
```

These run the real bundle, HTTP client, DOM/dialog and native codec against explicit API/media HTTP doubles. Fixtures and simulated commit/lost-response faults are test-only and excluded from the production entry. Reload readback in those tests is **not PostgreSQL persistence/restart evidence**. The suite covers 1024/1280/1440/1920px, both themes/densities, source/replay/review/geometry writes, media gaps/failures, source-indexed JPEGs and retained drafts/player/focus.

Standalone shell checks use Python 3.12+, Django 5.2.19 and pytest 9.2.0. From the repository root, with those dependencies installed in a project-private environment:

```sh
PYTHONPATH=. python -m pytest -q frontend/tests/test_ui_shell.py
```

The repository's [`pyproject.toml`](../pyproject.toml) owns Python/Ruff configuration. Use the [backend check commands](../docs/backend.md#verified-checks) from the repository root; they also cover the Django shell and its Python checks.

## Truth and write safety

Normal use always calls relative Django endpoints; there is no normal product fixture wall. Django validates domain state and controlled media. Missing typed object/gate/clock/overlay facts stay unavailable. The 3s/30s policy reference is not a run-pinned deadline; the D2 illustrative 10s early-removal interval is not a default. M01 cannot create positive detector records or activate production.

Writes have explicit pending/failed/acknowledged/unknown states. A lost acknowledgement is not a definite rejection: unsafe resubmission remains disabled. Exact stored feedback/source/revision reads or explicitly discovered replay IDs can be inspected/adopted without inventing server idempotency. Drafts are local memory, not durable browser storage; closing a dialog or changing selection retains them, while leaving/reloading with an unsaved or unresolved draft warns where supported.

[Progress](../docs/progress.md) owns combined Django/PostgreSQL/capture/media and permissioned camera evidence, including limitations, separately from these source-slice checks. No model, accuracy or production-security qualification is supplied by frontend checks.
