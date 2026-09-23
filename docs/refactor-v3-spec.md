# Automation Refactor V3

## Goal

Finish the structural cleanup started in V2 by reducing runner duplication,
standardizing scenario entry points, removing avoidable fixed waits, and
decomposing the report generator without changing test coverage or report URLs.

## Baseline

- `Tests/runParallel.js`: 846 lines.
- `Tests/runSplitParallel.js`: 911 lines.
- `scripts/generateScribeDocs.js`: 2,636 lines.
- 6 scenario files use `utils/testHarness.defineTest`.
- 185 fixed pauses remain across 31 test and utility files.

## Workstreams

### Runner lifecycle

- Extract lifecycle, result, timing, and aggregate-report behavior shared by the
  parallel and split runners.
- Preserve runner exports, environment variables, JSON schemas, Markdown
  reports, and failure-recovery behavior.

### Scenario harness

- Migrate standalone scenario entry points to `defineTest`.
- Preserve every existing exported `run*` function so manifests and direct
  imports remain compatible.
- Keep suite runners and orchestration entry points outside the scenario
  harness.

### UI synchronization

- Replace expensive fixed sleeps with bounded waits for visible, enabled,
  hidden, stale, or otherwise observable UI state.
- Retain short gesture and animation settling delays when XCTest exposes no
  reliable state transition.

### Report rendering

- Move report data preparation and rendering responsibilities into focused
  modules under `scripts/report/`.
- Preserve latest and archived report paths, navigation, assets, Markdown, and
  browser behavior.

## Guardrails

- Do not modify the Connect iOS source repository.
- Do not remove tests or reduce assertions to make validation pass.
- Do not alter QA-only or opt-in classifications.
- Do not require a live simulator for framework validation.
- Do not commit generated reports as part of this refactor.

## Acceptance criteria

- `npm run validate` passes.
- All scenario files with direct CLI execution use the shared harness, excluding
  suite, runner, and orchestration entry points.
- Existing test exports and npm commands remain compatible.
- LOCAL and QA three-lane dry runs select every expected test exactly once.
- Report generation succeeds against fixture data in a temporary output root.
- `git diff --check` passes and no generated HTML is introduced.

## Completion snapshot

Validated on September 23, 2026:

- Shared runner lifecycle, artifact, timing, and report helpers live under
  `utils/runnerLifecycle.js`, `utils/runnerArtifacts.js`, and
  `utils/runnerReport.js`.
- Standalone scenarios use `utils/testHarness.defineTest`; the adoption guard
  covers the scenario inventory while excluding runners and orchestrators.
- Explicit `driver.pause` calls fell from the 185-pause baseline to 63 calls
  across 29 test and utility files. The file count reflects the new focused
  navigation modules; remaining pauses are short gesture,
  animation, or XCTest-settling delays.
- `scripts/generateScribeDocs.js` is a 14-line compatibility entry point.
  Summary modeling, assets, Markdown, navigation, orchestration, and HTML
  rendering are separated under `scripts/report/`. `reportRendering.js` is an
  11-line facade over overview, test-detail, metadata, and archive page modules.
- `utils/testSession.js` is a 32-line compatibility facade over connectivity,
  session navigation, gestures, and conversation-list navigation.
- Split scheduling and historical duration balancing live in
  `utils/splitSchedule.js`; `Tests/runSplitParallel.js` is reduced to 714 lines.
- The overview page delegates data preparation, components, inline styles, and
  browser behavior to focused modules; `reportOverviewPage.js` is 196 lines.
- The photo picker is a 17-line compatibility facade over state, navigation,
  and selection modules.
- Typed environment helpers and shared QA-environment validation remove
  scenario-to-scenario configuration dependencies. Parallel runner config and
  session health are also isolated behind focused utility modules. Aggregate
  parallel report serialization lives in `Tests/parallelReport.js`, reducing
  `Tests/runParallel.js` to 551 lines.
- LOCAL and QA three-lane dry runs selected 17 and 20 tests respectively,
  with no duplicate assignments.
- `npm run validate` passes with 215 unit tests, and `git diff --check` passes.
