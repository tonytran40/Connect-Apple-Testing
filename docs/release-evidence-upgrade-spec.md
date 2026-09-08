# Release Evidence Upgrade Spec

## Objective

Turn the Appium harness and browser report into reliable release evidence for a
specific Connect iOS build, while expanding QA-only coverage without changing
the Connect application repository.

## Test Registry

- Define every runnable test once in a machine-readable manifest.
- Record its logical feature, default lane, required environment, execution tier,
  timeout class, cleanup behavior, and whether it is required or opt-in.
- Generate default runner lists and report coverage from that manifest.
- Fail validation when a runnable `Tests/*.js` entry point is unclassified.
- Report required, executed, skipped, blocked, and inconclusive counts.

## Reliability Hardening

- `markAsRead` must assert both unread and read state transitions.
- Notifications must use the app's `room_id` payload contract and verify that a
  banner opens the intended room.
- Clipboard-unavailable Message Actions results must be inconclusive rather than
  silently treated as full coverage.
- Known typeahead instability must retain bounded polling and actionable failure
  evidence; retries may not convert the original failure into a hidden pass.

## QA-Only Coverage

- `BrowseRooms` and audience-filter coverage run only when the selected Connect
  server is QA.
- QA-only tests fail fast with a clear blocked reason on other environments.
- Audience filters cover create, edit, and delete behavior using deterministic
  territory, department, or title data configured through environment variables.
- Browse Rooms remains responsible for membership transfer, leave, search,
  rejoin, and adds source-backed sort and copy-link checks where iOS exposes them.

## Additional Feature Coverage

- Corporate Directory navigation and deterministic user lookup.
- User settings persistence across view dismissal or app relaunch, with isolated
  logout/login coverage kept out of parallel shared-account mutation.
- Appointment-card interaction after a known appointment message renders.
- System tests remain opt-in for draft persistence, attachment download/cancel,
  offline retry, notification routing, and share-extension flows.

## Report Contract

- App branch, commit, version, build, bundle ID, and server environment are
  distinct from automation branch and commit.
- A publishable report must never silently label automation metadata as app
  metadata.
- The top summary displays freshness, required-suite completeness, and a release
  evidence decision.
- Statuses include PASS, FAIL, SKIPPED, BLOCKED, and INCONCLUSIVE.
- Failed tests open first and show the failed step, last good evidence, failure
  evidence, concise error, and rerun command. Passing tests stay collapsed.
- A compact coverage matrix identifies required, partial, opt-in, and unautomated
  features without reintroducing trend charts.
- Previous runs can be distinguished by app build, branch, environment, status,
  timestamp, and immutable run ID.

## Report Storage

- Generated history is bounded by configurable retention.
- Normal automation commits do not stage historical screenshots or archives.
- Existing GitHub Pages publishing continues to work until a dedicated Pages
  branch or external artifact store is explicitly configured.

## Acceptance

```bash
npm run validate
npm run selectors:audit
PARALLEL_DRY_RUN=1 npm run test:parallel:split3
npm run docs:scribe
```

Simulator-backed acceptance requires a clean three-lane run on QA and isolated
runs for destructive, account-wide, and system-tier tests.
