# Test Harness Engineering Hardening Spec

## Objective

Make the Connect iOS Appium harness faster, deterministic across three simulators,
easier to maintain, and safe to run locally or in CI without growing the Git
history with generated reports.

## Scope

### 1. Isolate test data and shared state

- Tests that create, edit, or delete rooms use unique run-scoped names.
- Tests do not depend on rooms left behind by a previous run unless explicitly
  configured through an environment variable.
- Account-wide settings tests run in an exclusive phase so parallel lanes do not
  mutate the same state at the same time.

### 2. Control generated report growth

- Archived HTML reports are ignored by Git by default.
- Publishing stages only the current report and required Pages entry files.
- Report generation clears stale files from the current report directory.
- Archiving remains opt-in for workflows that intentionally retain history.

### 3. Resolve simulators dynamically

- The default three-lane setup resolves unique simulators by device name.
- Explicit UDID overrides remain supported and are validated.
- Duplicate, unavailable, or uninstalled simulator assignments fail early with a
  useful error.
- A doctor command reports Appium, simulator, app-install, and credential health.

### 4. Reuse Appium sessions within a lane

- A one-worker lane creates one driver, logs in once, and reuses that session.
- Each test resets to a known home state before running.
- A failed or invalid session is recovered or recreated without hiding the test
  failure.
- Multi-worker behavior remains isolated per worker.

### 5. Add automated quality gates

- JavaScript syntax, ESLint, and deterministic unit tests run through one
  `npm run validate` command.
- CI runs the same validation command without requiring an iOS simulator.
- Unit coverage includes simulator selection, report history, failure analysis,
  duration formatting, and report publication safety.

### 6. Centralize repeated UI operations

- Common element lookup, adaptive waits, text tapping, and rectangle access live
  in shared helpers.
- Active tests prefer accessibility identifiers over coordinates.
- Coordinate fallbacks are localized, documented by behavior, and used only when
  the native control is not exposed to XCTest.

### 7. Aggregate suite failures

- Sequential suite execution continues after recoverable test failures.
- Every failure is recorded with its test name and error.
- The process exits nonzero after all runnable tests finish if any test failed.

### 8. Keep operator documentation current

- README setup covers one-, two-, and three-simulator workflows.
- Environment examples document timeouts, ports, session reuse, simulator
  overrides, reporting, and startup staggering.
- The shortest recommended local, diagnostic, split, and publish commands are
  easy to find.

### 9. Modularize report generation

- Generic formatting and filesystem helpers are separate from analysis logic.
- The generator composes those modules rather than duplicating their behavior.
- Each test has a focused detail page so the main report remains scannable.
- Current-report generation and archive generation can be controlled separately.

## Reliability Requirements

- Cold login and app-entry waits are polling ceilings, not unconditional sleeps.
- Initial WebDriverAgent session creation is staggered across lanes to avoid
  overwhelming CoreSimulator on 16 GB development machines.
- Notification tests tap the native short-look control when available and verify
  the app root accessibility identifier after foregrounding.
- The harness must never tap arbitrary coordinates while a login screen is
  visible.

## Acceptance Commands

```bash
npm run validate
npm run doctor
SIMULATOR_BOOT_DRY_RUN=1 npm run sims:ready
PARALLEL_DRY_RUN=1 npm run test:parallel:split3
```

Simulator-backed acceptance should include:

```bash
PARALLEL_TESTS=CreateRoom,newMessage npm run test:parallel
npm run test:parallel:split3
```

## Completion Evidence

- `npm run validate` passes.
- `npm run doctor` identifies three unique, app-ready simulator lanes.
- A shared-session smoke test passes at least two tests in one lane.
- All Conversation View tests pass in one reused session.
- The complete split run produces a combined report even when a test fails.
- Any final isolated rerun for a previously failing test passes before release.

## Parallel Review Ownership

- Runner agent: items 1, 3, 4, and 7. Read-only audit unless a fix is confined to
  runner, session, or simulator files.
- Test agent: items 5 and 6 plus test determinism. Read-only audit unless a fix is
  confined to test/helper files.
- Reporting agent: items 2, 8, and 9. Read-only audit unless a fix is confined to
  reporting, workflow, or documentation files.
- Orchestrator: resolves cross-cutting changes, runs simulator-backed validation,
  and owns the final acceptance decision.

## Completion Status

Completed on August 18, 2026.

- All nine scope items are implemented.
- Three parallel audit agents reviewed runner/session logic, test helpers, and
  reporting/documentation; their high- and medium-priority findings were folded
  into the implementation.
- `npm run validate` passes with syntax checks, ESLint, and 16 unit tests.
- `npm audit --omit=dev` reports zero vulnerabilities.
- `npm run doctor` resolves three unique, app-installed simulator lanes.
- Simulator-backed acceptance passed all 13 split-suite tests across the main,
  Conversation-List, ConversationView, and exclusive settings groups.
