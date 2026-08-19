# Automation Expansion Spec

## Objective

Expand Connect iOS automation coverage while reducing avoidable suite time and preserving reliable, reviewable reports. All implementation changes belong in `Connect-Apple-Testing`; `/Users/tony.tran/GitHub/connect-apple` is a read-only source of UI behavior and accessibility identifiers.

## Scope

### Runner and reporting

1. Record phase timing for Appium session creation, login/readiness, test execution, screenshot capture, recovery, report generation, and room creation where the test owns that phase.
2. Allow safe ConversationView tests to run on an available physical lane without changing their logical report category.
3. Keep one persistent Appium session per lane and preserve the existing exclusive settings phase.
4. Add opt-in post-suite cleanup for generated rooms whose names begin with `A-`, `B-`, `M-`, or `E-`.
5. Cleanup failures must be visible but must not hide the original product-test result. Strict cleanup failure behavior is opt-in.

### Navigation and selectors

1. Scope conversation-list swipes to the app's `bookmarksScrollView` when it is available.
2. Fall back to the current viewport gesture only when the scoped container is unavailable.
3. Correct selector values to match the base app source, including `conversationSearchField` and `bookmarksScrollView`.
4. Document selectors that are platform-specific, dynamic, or intentionally based on visible text because the app does not expose a dedicated identifier.
5. Add a source-audit command that can compare known literal identifiers with the read-only app checkout.

### New default-suite candidates

- `ComposerTypeahead.js`: verify emoji typeahead behavior from the room composer. Mention suggestions remain deferred until the environment has deterministic room members.
- `MessageActions.js`: verify Copy and Delete from the message action sheet with unique test data.
- `RoomNotificationPreferences.js`: verify room-level notification preference selection and restore the configured default.

These tests report under ConversationView even if the workload scheduler runs them on another simulator.

### System coverage

- Add deterministic system flows, such as draft persistence across app background/foreground, as opt-in tests first.
- Notification deep links, share extension, attachment cancellation/download, offline retry, and destructive server-picker coverage must remain opt-in or documented until their external prerequisites can be controlled reliably.
- Browse Rooms is explicitly excluded from this change.

## Reliability Rules

- Every test creates unique data or targets a named fixture and leaves the app in a known state.
- Prefer accessibility identifiers from the base app. Use exact visible labels only when no identifier exists.
- Do not add fixed sleeps when an observable UI state can be awaited.
- Screenshots remain enabled, but timing data must make their cost visible.
- Tests that change persistent settings must restore them in `finally` cleanup.
- Workload balancing must honor capability constraints such as seeded photo libraries and simulator permissions.

## Acceptance Criteria

- `npm run validate` passes.
- Split-three dry-run lists every default test exactly once and preserves its logical category.
- Existing split-three commands continue to work without new required environment variables.
- New tests can run independently through `npm run test:one -- <name>`.
- Optional cleanup is disabled by default and can be enabled with a documented environment variable.
- Timing data is written to machine-readable report JSON and surfaced in the generated report.
- No files under `/Users/tony.tran/GitHub/connect-apple` are modified.

## Validation Plan

1. Run syntax, lint, and unit validation.
2. Run selector-source audit against the base app checkout.
3. Run split-three dry-run and verify assignment/category metadata.
4. Run each new deterministic test independently on the iPhone 17 simulator.
5. Run the full three-lane suite when all Appium servers and simulators are available.
6. Regenerate the local report and confirm timing, categories, artifacts, and cleanup diagnostics.
