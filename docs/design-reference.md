# Design-reference contract

## Status and authority

A supplied **Evidence Desk (proposed)** design export is available. Product-fit/token review and integration acceptance are **not recorded**. Availability of an export is not accepted UI direction, an installed style library, completed application screens or permission to start M01. No assets are vendored by this documentation change; no export script was executed or generated file modified. A separate product-fit review is responsible for design/token recommendations; this document does not duplicate that audit or independently select/rework tokens.

Project [requirements](requirements.md), [architecture](architecture.md) and [milestone gates](milestones.md) take precedence over generic export instructions. Later adoption needs an explicitly reviewed mapping from export evidence to the approved product slice. This contract remains usable without the archive; the filenames below identify optional future input, not repository links or runtime prerequisites.

## Inventory of the supplied snapshot

The archive's declared title is `brand-evidence-desk-proposed-bee59c`; manifest schema is `open-design.design-manifest.v1`. The following files were read as documentation input, not executed:

| Archive-relative file | What actually exists / what it establishes |
| --- | --- |
| `DESIGN.md` | Proposed evidence-first brand source: seven palette entries, Inter UI/system fallbacks and monospace stack, restrained desktop evidence posture, spacing/radius guidance, independent health and outcome language. It does not establish an accepted complete semantic token system or app behavior. |
| `DESIGN-HANDOFF.md` | Generic implementation handoff; identifies `system/index.html` as entry, 11 HTML files, two stylesheets, one script and 16 supporting files. Claims about production fidelity, all screens/mobile viewports and stripping preview labels are not project authority. |
| `DESIGN-MANIFEST.json` | Machine-readable inventory and generic screen/token/interaction/viewport guidance. Marks index as launcher, kits/brand/artifacts as screens and landing as a landing page. Those classifications are not an approved route map. |
| `evidence-desk-verification.md` | Supplier's **partial static verification**, explicitly not a browser/interaction test. Says generated component system is not ready for approval and remediation is open. No independent verification of its counts or rendering was performed here. |

Inventory confirms `brand.html`, `evidence-desk-kit.html`, `system/index.html`, `system/kit.html`, `system/kit.dark.html` and six `system/artifacts/` HTML examples: deck, email, form, landing, newsletter and poster. They are export previews/examples, not eleven completed product screens. Supporting inputs include `brand-spec.md`, `brand.json`, its seed, `guide.md`, context/source files, an illustrative PNG/brief, `system/BRAND-SYSTEM.md`, seed/theme/token JSON variants and light/dark variable CSS. `system/scripts/apply-design-tokens.mjs` exists but was not run. The export was inventoried read-only, not bulk-copied.

Snapshot fingerprints (SHA-256) make later comparison possible without a private filesystem path:

| File | Digest |
| --- | --- |
| `DESIGN.md` | `e9f49f9009f0a6c580245775c671e3006b541bebbfae1a1174b2aaa1cd4acb8d` |
| `DESIGN-HANDOFF.md` | `2e7d1a85c2c9b58ac1db024841124730d0dbfff2073cb9e037d1c74c7c57825f` |
| `DESIGN-MANIFEST.json` | `5e9212bcb37b292cd9022bf2f3a9df5ce73c62d7a2a496b7bf5b0aaaf5473aa4` |
| `evidence-desk-verification.md` | `b2d38c8e87812871c42663774e62e04911b9c41b35deecf74453607cc3fd1ef5` |

The supplier verification reports generic marketing/pricing/analytics content, an untimestamped live badge and unsupported sample metrics/testimonial; palette/token inconsistencies including light-theme link concerns; monospace-stack mismatch; and focus/semantic keyboard/target-size issues. These are reported limitations, not new browser findings or an accepted remediation design. Its phrase “approved direction” is the supplier's wording, **not evidence of project design acceptance**. Generated files are identified as generated; persistent remediation must respect their source/generation ownership, not hand-edit them under this task.

## Portable adoption contract

1. Adopt only assets/components needed for the separately approved local desktop workbench: sources, zone/exclusion editor, event queue/detail, evidence timeline/transition history, review and local capture/replay. Generic marketing, email, deck, mobile-native, widgets, Figma and multi-user surfaces do not expand scope. No requirement to implement every exported HTML file or follow the generic mobile matrix.
2. Before implementation, record the reviewed archive revision, authoritative semantic token sources/mappings, light/dark variants and component states. Do not silently resolve disagreements among brand/CSS/JSON/generated kits or promote a generic default palette. Token authority and integration acceptance remain pending.
3. Preserve [all FSM stages and timestamped history](requirements.md#complete-state-machine), source-time timer origins/deadlines, evidence links/gaps and observed-vs-predicted provenance. Keep provisional/final, fixture/model/data provenance, machine outcome, production qualification/activation, object state, human review and write status independent.
4. Maintain conspicuous fixture/illustrative/unvalidated provenance. Static illustrations must say **DESIGN PREVIEW / illustrative data / no camera connected**. Eventual fixture runs retain fixture labels; actual local development footage retains **local development / unvalidated / unredacted footage** warnings. Removing tool chrome later cannot remove truth-bearing provenance. Never copy unsupported metrics/testimonials or imply a successful live feed.
5. Give evidence the majority of detail width; use wide and compact desktop layouts (for example 1440px and 1024px), not a new mobile product. Preserve aspect ratio/source coordinates, legible overlays, wrapped IDs/reasons, contained table overflow and accessible source-indexed inspection. Target WCAG AA contrast, visible keyboard focus, labeled controls and non-color status meaning; a palette alone is not certification.
6. Show independent source/recording/processing/preview health, stale frame age, partial/unavailable playback and save failure/retry. Updates must not remount media, lose selection/filters, erase polygon drafts/notes or move focus/scroll. Do not show saved before acknowledgement or let stale requests overwrite another event.
7. Later approved work may adopt selected assets after license/compatibility review and product-fit/token resolution, with actual browser/keyboard/visual evidence. No export “production ready” claim substitutes for application E2E, natural-footage qualification, security work or explicit milestone acceptance.
