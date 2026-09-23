# Automation Refactor V2

## Goal

Make the Connect iOS automation suite faster to run, easier to extend, and
simpler to operate without reducing test isolation or failure evidence.

## Guardrails

- Do not modify the Connect iOS application repository.
- Preserve existing test names, selectors, report paths, and npm commands.
- Keep one reusable Appium session per lane.
- Continue running later tests after a product assertion failure.
- Recreate a session only when a health probe shows that Appium or Connect is
  no longer usable.
- Prefer observable UI conditions over fixed sleeps.
- Keep QA-only and opt-in classification explicit.
- Do not require a live simulator for unit or dry-run validation.

## Workstreams

### Runtime and scheduling

- Add failure-aware session recovery.
- Balance movable tests using recent duration data while honoring lane
  constraints such as photo readiness and exclusive account settings.
- Avoid redundant navigation when the app is already at the required state.

### Test authoring

- Centralize optional driver ownership, error screenshots, CLI timing, and
  consistent result handling in a shared test harness.
- Add reusable state-based wait actions and remove high-cost fixed sleeps from
  the first set of slow tests.
- Keep domain-specific UI actions outside scenario files where practical.

### Reporting and artifacts

- Split report rendering responsibilities into focused modules.
- Avoid rendering the same report more times than necessary.
- Add bounded local artifact retention without deleting the current run.

### Operation

- Provide one command that can prepare simulators, start Appium servers, run a
  selected profile, generate its report, and optionally publish it.
- Keep existing commands as compatible shortcuts.

## Acceptance criteria

- `npm run validate` passes.
- Three-lane dry-run scheduling selects every expected test exactly once.
- A normal product assertion failure does not automatically recreate Appium.
- An unhealthy session still triggers recovery or replacement.
- Existing report URLs and result JSON remain compatible.
- Existing direct test entry points continue to work.
- The new orchestration command supports a no-simulator help and dry-run path.
