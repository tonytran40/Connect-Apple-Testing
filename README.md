# Connect Apple – iOS Automation Test Suite

End-to-end automation for **Connect Apple (iOS)** using **Appium + WebdriverIO**. Tests drive the real simulator UI via accessibility identifiers, iOS predicates, and XPath where needed—aimed at reducing repetitive manual regression for QA.

---

## What this repo covers

| Area | Tests / behavior |
|------|------------------|
| **Login** | Auto-login when `loginView` is shown (localhost server, credentials from `.env`) |
| **Rooms** | Create public/private rooms (`CreateRoom.js`); edit room settings (`editRoom.js`); remove room rows (`removeRoom.js`); manage room members (`membersRoom.js`) |
| **List actions** | Swipe-right favorite / unfavorite (`favoriteRoom.js`); mark unread/read (`markAsRead.js`); swipe-left remove (`removeRoom.js`) |
| **Messaging** | New DM; reactions; emoji typeahead; Copy/Delete actions; markdown rendering; pin/edit/unpin; attachment entry points |
| **Notifications** | Push a simulator notification and verify app re-entry (`notifications.js`) |
| **Settings** | Room notification preferences; conversation layout & sort; sign out |
| **System flows** | Opt-in draft persistence across app background/foreground (`DraftPersistence.js`) |
| **Suite** | One session, shared login, markdown report (`Tests/runAll.js`) |

**Not in scope:** Connect app unit tests, pixel-perfect visual diff, load/performance benchmarks. This automation framework does include lightweight unit and syntax checks for its own runner/reporting code.

---

## Tech stack

| Layer | Tool |
|-------|------|
| Language | Node.js (JavaScript) |
| Client | WebdriverIO 9 |
| Server | Appium 2+ with **XCUITest** |
| App | SwiftUI (debug build on simulator) |

---

## Prerequisites

- **macOS** with **Xcode** and an iOS **Simulator** installed
- **Node.js 20+** and **npm**
- **Appium** globally or via `npx`
- **Connect iOS** debug app installed on the simulator (`com.powerhrg.connect.v3.debug`)
- Local **localhost** backend available when login runs (tests select **localhost** in the server picker)

Check simulators:

```bash
xcrun simctl list devices available
```

The default driver targets **`iPhone 17 Pro`** (see `Login_Flow/Open_App.js`). Split runs discover distinct available simulators by their configured device names, preferring already-booted devices. Explicit UDIDs remain available as overrides but are no longer required for each machine.

---

## Setup

### 1. Install Node dependencies

From the project root:

```bash
npm install
```

### 2. Install Appium and XCUITest driver

```bash
npm install -g appium
appium driver install xcuitest
appium driver list
```

### 3. Xcode command-line tools

In **Xcode → Settings → Locations**, set **Command Line Tools**.

Boot the simulator you intend to use before or during the first test run.

### 4. Environment variables

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
Connect_username=your@email
Connect_password=yourpassword
```

Other variables tune suite speed, room names, screenshots, etc. See `.env.example` for comments.

After the three Appium servers are running, validate the local setup with:

```bash
npm run doctor
```

The doctor reports the simulator selected for each lane, whether Connect is installed, Appium port health, and login credential availability.

**Login flow:** If the app is already logged in (`loginView` absent), tests skip login. With `appium:noReset: true`, session state persists across runs. After submitting login, the helper waits for the conversation list and fails fast if the app shows a login error like `There was an issue logging in`.

### 5. Start Appium (separate terminal)

```bash
appium
```

Default URL: `http://127.0.0.1:4723` (used by `Login_Flow/Open_App.js`).

### 6. Verify launch (optional)

```bash
npm run test:ios
```

Writes `connect-launch.png` after activating the app—confirms driver + bundle ID work.

---

## Running tests

### Full regression suite

One Appium session, login once, `resetToHome` between tests (unless skipped via env):

```bash
npm run test:suite
```

**Order in `runAll.js`:**

1. `CreateRoom` — public and private room creation  
2. `PinnedMessageEditFlow` — pin, edit, unpin  
3. `Reactions` — add and remove message reactions
4. `ComposerTypeahead` — emoji suggestions
5. `MessageActions` — copy and delete a sent message
6. `RoomNotificationPreferences` — persist and restore a room preference
7. `markdowns` — markdown / emoji in composer
8. `ConversationList` — layout and sort in user settings
9. `newMessage` — new direct message, intentionally late because it can leave the app in a DM
10. `Login_Signout` — sign out

Report: `reports/latest-suite-report.md` (pass/fail, durations, options).

### Faster suite (subset)

```bash
npm run test:suite:fast
```

Uses smoke room creation, one layout/sort, and a subset of markdown examples (see `package.json`).

### Turbo suite (fast subset, no screenshots)

```bash
npm run test:suite:turbo
```

Uses the same subset as `test:suite:fast`, with `CONNECT_SCREENSHOTS=0` to skip screenshot capture overhead.

### Parallel runner (experimental)

```bash
npm run test:parallel
```

By default this runner is conservative and uses one worker so it does not collide on a single simulator. To run true parallel lanes, boot multiple simulators, start Appium servers for each lane, then provide lane env:

```bash
PARALLEL_WORKERS=2 \
PARALLEL_DEVICE_NAMES='iPhone 17 Pro,iPhone 17 Pro Max' \
PARALLEL_UDIDS=sim-udid-1,sim-udid-2 \
PARALLEL_APPIUM_PORTS=4723,4725 \
npm run test:parallel
```

Useful knobs:

| Variable | Effect |
|----------|--------|
| `PARALLEL_TESTS` | Comma-separated test names, or `all` for standalone candidates |
| `PARALLEL_WORKERS` | Number of worker lanes to use |
| `PARALLEL_DEVICE_NAMES` | Simulator names, one per lane |
| `PARALLEL_UDIDS` | Optional simulator UDID overrides; split runs discover devices by name when omitted |
| `PARALLEL_APPIUM_PORTS` | Appium server ports, one per lane |
| `WDA_LOCAL_PORT` | Base WDA port; each worker increments from this |
| `PARALLEL_RUN_ID` | Report/screenshot run folder name |
| `PARALLEL_DRY_RUN=1` | Validate runner selection/reporting without launching tests |
| `PARALLEL_LOGIN_ONCE_PER_WORKER=1` | Legacy child-process mode checks login once per worker |
| `PARALLEL_REUSE_DRIVER=1` | Reuse one Appium session and login across all tests in a one-worker lane (default) |

Reports are written under `reports/runs/{runId}/summary.md` and `reports/runs/{runId}/summary.json`; worker logs are under `reports/runs/{runId}/logs/`. Screenshots for parallel runs are namespaced under `screenshots/{runId}/`.

Dry split runs automatically use `*-dry-run` lane and combined report IDs, so scheduler validation cannot overwrite the latest real suite summaries.

The parallel runner also generates the Scribe-style browser report automatically at `docs/generated/scribe/parallel-latest/`. It includes pass/fail status, completed count, a rerun command for failed tests, slowest tests, worker lane details, and links to each test's log, JSON result, and screenshot folder.

### Split parallel shortcut

Use this when you want the main suite and standalone tests running at the same time on two simulators.

Recommended terminal layout:

| Tab | Command | Purpose |
|-----|---------|---------|
| 1 | `appium --port 4723` | Appium server for the iPhone 17 Pro lane |
| 2 | `appium --port 4725` | Appium server for the iPhone 17 Pro Max lane |
| 3 | `npm run test:parallel:split` | Launch both test groups |

The shortcut uses these default lanes:

| Group | Simulator | Appium | WDA |
|-------|-----------|--------|-----|
| `main-suite` | iPhone 17 Pro | `4723` | `8100` |
| `standalones` | iPhone 17 Pro Max | `4725` | `8200` |

Run both groups with:

```bash
npm run test:parallel:split
```

This launches `main-suite` on the iPhone 17 Pro lane and `standalones` on the iPhone 17 Pro Max lane. The merged report is written to `reports/runs/split-combined/summary.md`, and its browser report is generated automatically at `docs/generated/scribe/split-combined/`. Per-lane details remain available at `reports/runs/main-suite/summary.md` and `reports/runs/standalones/summary.md`.

Set `SPLIT_COMBINED_RUN_ID=some-name` if you want the merged report written to a different `reports/runs/{runId}/` folder.

Split parallel creates one Appium session per lane, logs in once, and reuses that driver for the lane's tests. Each test still resets to the conversation list first. If a failure damages the session, the runner recreates and logs in that lane before continuing, preventing one failure from automatically failing everything after it. Set `PARALLEL_REUSE_DRIVER=0` only when debugging the older child-process-per-test behavior. The split runner staggers initial WDA session requests by 6 seconds per lane (`SPLIT_SESSION_STAGGER_MS=6000`) to avoid three simultaneous WDA startups overwhelming a 16 GB Mac; set it to `0` on a runner proven to handle concurrent startup.

`SPLIT_LOGIN_PREFLIGHT=1` is an optional extra diagnostic that verifies login in separate sessions before the lane sessions start. It is off by default because lane startup already performs the same login check. Lane startup polls for Connect for up to `APP_ENTRY_TIMEOUT_MS` (30 seconds by default), so warm launches proceed immediately while slower CI machines can raise the ceiling without adding fixed sleeps to each test. A submitted login can hydrate for up to `LOGIN_SUCCESS_TIMEOUT_MS` (60 seconds by default). If Connect restores an unfinished modal or room-creation flow, startup recovery begins after `APP_ENTRY_RECOVERY_MS` (4 seconds by default) and returns the lane to the conversation list.

### Three-simulator split experiment

Use this when you want to spread the suite across three simulators. The grouping separates conversation list tests from conversation view tests so each lane has a clearer purpose.

Before a cold run, prepare all three simulators:

```bash
npm run sims:ready
```

This boots one simulator at a time and opens Connect before starting the next lane. It is slower than overlapping cold boots but is the most stable option for CoreSimulator on this machine. The script checks CoreSimulatorService before it starts and stops after a 90-second per-lane boot timeout instead of waiting forever. Connect launch is retried for up to 45 seconds because CoreSimulator can briefly reject an app immediately after boot. It leaves the simulators running and does not start the three Appium servers. Set `SIMULATOR_BOOT_CONCURRENCY=2` only on a machine with enough memory to overlap two boots, `SIMULATOR_BOOT_TIMEOUT_MS` to change the 90-second boot window, `SIMULATOR_BOOT_LAUNCH_APP=0` to skip opening Connect, `SIMULATOR_BOOT_OPEN_UI=1` to bring the Simulator windows forward, `SIMULATOR_APP_LAUNCH_TIMEOUT_MS` to change the 45-second launch window, or `SIMULATOR_APP_LAUNCH_RETRY_MS` to change the 1.5-second retry interval.

Recommended terminal layout:

| Tab | Command | Purpose |
|-----|---------|---------|
| 1 | `appium --port 4723` | Appium server for `main-suite` |
| 2 | `appium --port 4725` | Appium server for `Conversation-List` |
| 3 | `appium --port 4727` | Appium server for `ConversationView` |
| 4 | `npm run test:parallel:split3` | Launch all three test groups |

Default three-lane split:

| Group | Simulator | Appium | WDA | Tests |
|-------|-----------|--------|-----|-------|
| `main-suite` | iPhone 17 Pro | `4723` | `8100` | `CreateRoom`, `PinnedMessageEditFlow`, `Reactions`, `newMessage` |
| `Conversation-List` | iPhone 17 Pro Max | `4725` | `8200` | List tests plus `ComposerTypeahead`, `MessageActions`, `RoomNotificationPreferences` |
| `ConversationView` | iPhone 17 | `4727` | `8300` | `markdowns`, `attachments`, `editRoom`, `membersRoom` |
| Exclusive settings phase | iPhone 17 Pro Max | `4725` | `8200` | `ConversationList` after all concurrent feature lanes finish |

Run all three groups with:

```bash
npm run test:parallel:split3
```

Raw Node equivalent:

```bash
SPLIT_THIRD_ENABLED=1 node Tests/runSplitParallel.js
```

Before running either command, keep these three Appium servers open in separate terminal tabs:

```bash
appium --port 4723
appium --port 4725
appium --port 4727
```

The runner resolves each simulator UDID from these names. To verify the mapping, app installation, credentials, and Appium ports before a run:

```bash
npm run doctor
```

If a simulator was just created or has an older app build, install the same debug app on it before running. Find its UDID with `xcrun simctl list devices available`, then run:

```bash
xcrun simctl install <simulator-udid> \
"/Users/tony.tran/Library/Developer/Xcode/DerivedData/Connect-avitsdrqdscjvxbysyyzqofypfnh/Build/Products/Debug-iphonesimulator/Connect iOS.app"
```

For fresh simulators or CI, you can have the split runner install the app on every lane before tests start:

```bash
SPLIT_INSTALL_APP=1 \
CONNECT_APP_PATH="/path/to/Connect iOS.app" \
npm run test:parallel:split3
```

Important: each simulator has its own installed copy of the app. Appium launches the existing `com.powerhrg.connect.v3.debug` app because the driver uses `bundleId` with `noReset: true`; it does not automatically install the latest Xcode build. If one simulator looks like an older app version, update that simulator's installed app from a normal terminal tab, not from an Appium tab:

```bash
xcrun simctl install <simulator-udid> \
"/Users/tony.tran/Library/Developer/Xcode/DerivedData/Connect-avitsdrqdscjvxbysyyzqofypfnh/Build/Products/Debug-iphonesimulator/Connect iOS.app"
```

If it still looks stale, uninstall and reinstall:

```bash
xcrun simctl uninstall <simulator-udid> com.powerhrg.connect.v3.debug

xcrun simctl install <simulator-udid> \
"/Users/tony.tran/Library/Developer/Xcode/DerivedData/Connect-avitsdrqdscjvxbysyyzqofypfnh/Build/Products/Debug-iphonesimulator/Connect iOS.app"
```

You can verify which app bundle is installed on a simulator with:

```bash
xcrun simctl get_app_container <simulator-udid> com.powerhrg.connect.v3.debug app
```

Each split lane normally holds one reusable driver session for its whole test list. True simultaneous execution still needs separate simulator/Appium lanes; one simulator should only be driven by one lane at a time. The layout/sort test runs afterward as an exclusive phase because those account-wide settings can reorder another simulator's list while it is trying to locate test data.

The table shows physical execution lanes. Moved tests retain their logical `ConversationView` category in reports. Set `SPLIT_BALANCE_CONVERSATION_VIEW=0` to disable balancing, or customize the main/list destinations with `SPLIT_BALANCED_CONVERSATION_VIEW_TESTS` and `SPLIT_LIST_BALANCED_CONVERSATION_VIEW_TESTS`. `attachments` always remains on the configured photo-ready lane.

Reports include aggregate phase timing for session creation, login/readiness, test bodies, screenshots, recovery, report generation, and test-owned room creation. Optional generated-room cleanup runs only after product tests:

```bash
SPLIT_POST_RUN_CLEANUP=1 npm run test:parallel:split3
```

Cleanup is advisory by default. Add `SPLIT_POST_RUN_CLEANUP_STRICT=1` only when cleanup failure should fail the command.

### Scribe-style documentation

Every report-aware test command generates its browser report and Markdown automatically when it finishes, even if a test fails. This includes `test:parallel`, `test:parallel:split`, `test:parallel:split3`, and the single-test shortcut below. Timestamped local history is opt-in with `SCRIBE_ARCHIVE_ENABLED=1`; archived output is ignored by Git so repeated runs do not inflate repository history.

Use one command for any individual test:

```bash
npm run test:one -- favoriteRoom
```

That writes the latest report to `docs/generated/scribe/favoriteRoom-latest/`. Existing shortcuts such as `npm run test:attachments`, `npm run test:members-room`, and `npm run test:reactions` use the same behavior.

The report contains status cards, search/filter controls, lane/device health, slow-test callouts, latest-vs-previous run comparison, failure categories, rerun commands, copyable share links, Connect build metadata, run environment details, per-test history, failure timelines, screenshot compare panels, failure snippets, and step-by-step screenshots.

The report shows the current git branch and commit in the header and report history cards. If the Connect app build came from a different branch than this automation repo, set `TEST_REPORT_BRANCH=feature/my-branch` and optionally `TEST_REPORT_COMMIT=abc1234` before running `npm run docs:scribe`.

For the normal three-simulator run, one command runs the tests and creates the report:

```bash
npm run test:parallel:split3
```

The homepage opens the latest report automatically. Use the **Previous runs** dropdown in the report header to jump back into older archived runs. The stable latest report still lives at `docs/generated/scribe/split3-combined/index.html`.

For local live preview without pushing to GitHub Pages, run this in a separate terminal:

```bash
npm run docs:serve
```

Then open:

```text
http://localhost:5500/
```

In VS Code, you can do the same thing with the **Live Server** extension: right-click `index.html`, choose **Open with Live Server**, and leave that browser tab open. After each report-aware test finishes, the local page will show the regenerated report without needing a push.

Use `npm run docs:scribe -- --run <runId>` only when you want to regenerate an older report without rerunning its tests.

To preview failure highlighting without publishing fake failures, generate a local-only report in `/tmp`:

```bash
npm run docs:scribe -- --run split3-combined --preview-failures=2 --out /tmp/connect-report-preview
open /tmp/connect-report-preview/split3-combined/index.html
```

That marks the first two passing tests as preview failures and highlights the likely failed step. Real failed tests highlight `ERROR.png` when it exists; otherwise the report highlights the final screenshot captured for that test.

To run the three-simulator split and publish the GitHub Pages report in one command:

```bash
npm run test:parallel:split3:publish
```

That command runs the tests, generates the latest report, stages only the current Pages report, commits it, and pushes to GitHub. It still publishes when tests fail so the shared page shows the failure details. It refuses to start when unrelated changes are staged or when a Pages target already has local edits, preventing user work from entering the automated report commit. Use `PUBLISH_REPORT_SKIP_PUSH=1 npm run test:parallel:split3:publish` to exercise the flow locally without pushing.

`markdowns` creates a unique `A-Markdown Room-*` by default so repeated and parallel runs do not share timeline data. Set `MARKDOWN_ROOM_NAME` only when you intentionally want to exercise an existing fixture room.

To share the report with coworkers through GitHub Pages, commit and push the generated `docs/` output. GitHub Pages can publish that folder directly from `main`.

One-time GitHub setup:

1. Open the repo on GitHub.
2. Go to **Settings** > **Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Set **Branch** to `main` and the folder to `/docs`.
5. Click **Save**.

After GitHub Pages rebuilds, the report archive URL should be:

```text
https://tonytran40.github.io/Connect-Apple-Testing/
```

If Pages is set to `main` / `/docs`, the direct report URL is `https://tonytran40.github.io/Connect-Apple-Testing/generated/scribe/split3-combined/`. If Pages is set to `main` / `/(root)`, the direct report URL is `https://tonytran40.github.io/Connect-Apple-Testing/docs/generated/scribe/split3-combined/`.

If the repo is private, coworkers may need access to the repo or your organization's Pages access policy before they can view it.

For a single lane, pass that lane's run ID instead, such as `ConversationView`:

```bash
npm run docs:scribe -- --run ConversationView
```

Real Scribe Desktop capture is not part of this repo anymore. Appium/XCUITest taps are injected into the simulator instead of coming from the mouse, so Desktop capture was unreliable without an official Scribe API.

### Single test files

Any test that exports `{ run }` can be run directly (creates its own session unless you pass a driver):

```bash
node Tests/CreateRoom.js
node Tests/editRoom.js
node Tests/favoriteRoom.js
node Tests/markAsRead.js
node Tests/membersRoom.js
node Tests/notifications.js
node Tests/removeRoom.js
node Tests/removeAllrooms.js
node Tests/newMessage.js
node Tests/ComposerTypeahead.js
node Tests/MessageActions.js
node Tests/RoomNotificationPreferences.js
node Tests/DraftPersistence.js
```

Wall-clock time is printed via `utils/cliTestTiming.js`.

For a shareable browser report, prefer the one-command wrapper instead:

```bash
npm run test:one -- CreateRoom
npm run test:one -- favoriteRoom
npm run test:one -- attachments
```

### Handy npm scripts

```bash
npm run test:ios
npm run test:suite
npm run test:suite:fast
npm run test:notifications
npm run test:members-room
npm run test:attachments
npm run test:composer-typeahead
npm run test:message-actions
npm run test:room-notification-preferences
npm run test:draft-persistence
npm run test:remove-all-rooms
npm run selectors:audit
```

### Suite options (environment)

| Variable | Effect |
|----------|--------|
| `CONNECT_SKIP_RESET_BETWEEN_TESTS=1` | Skip `resetToHome` before tests 2+ (faster; tests must tolerate shared state) |
| `CREATE_ROOM_MODE=smoke` | `CreateRoom`: public room only |
| `CREATE_ROOM_SEND_MESSAGES=1` | `CreateRoom`: send starter messages after room creation (off by default for speed) |
| `MARKDOWN_EXAMPLE_IDS` | Comma-separated markdown example ids |
| `CONVERSATION_LAYOUTS` / `CONVERSATION_SORTS` | Limit `ConversationList` matrix |
| `CONNECT_SCREENSHOTS=0` or `SKIP_SCREENSHOTS=1` | Disable screenshots |
| `USER_SETTINGS_DUMP_SOURCE=1` | Save User Settings page source XML while debugging |

### New conversation and system coverage

- `ComposerTypeahead.js` creates an isolated room, selects the `:grinning_face:` suggestion, sends the result, and verifies the rendered message. Mention suggestions are intentionally excluded until test environments provide deterministic room members.
- `MessageActions.js` verifies Copy through the simulator clipboard when supported, then confirms Delete removes the unique message.
- `RoomNotificationPreferences.js` changes a room preference, verifies it after reopening, and restores `ROOM_NOTIFICATION_RESTORE_LABEL` in cleanup.
- `DraftPersistence.js` is opt-in: it backgrounds Connect with an unsent draft, reactivates the app, verifies the exact draft, clears it, and restores the Rooms list.
- Later system flows and their deterministic prerequisites are documented in [`docs/system-tests.md`](docs/system-tests.md).
- `npm run selectors:audit` compares exact selectors with the read-only `connect-apple` source checkout and flags stale identifiers.
- Notification Preferences renders an unlabeled Font Awesome back chevron instead of `backButton`. The shared helper therefore uses a bounded top-left navigation lookup and never a generic first-button fallback.

---

## Standalone scenario tests (not in `runAll` yet)

These follow the same login + home pattern but are run individually today.

### `favoriteRoom.js`

- Creates a unique `A-Favorite Room-*` by default, or uses the existing room supplied through `FAVORITE_ROOM_NAME`, then scrolls to its row if needed.
- **Swipe right** → tap `favoritesButton` (heart) → swipe again → tap to **unfavorite**.
- Screenshots under `screenshots/favoriteRoom/`.

### `markAsRead.js`

- Creates and targets its own unique `M-MarkAsRead-*` room by default, avoiding shared-room interference with other lanes. Set `MARK_AS_READ_CANDIDATES` only when intentionally targeting existing data.
- **Swipe right** → tap `markAsUnreadButton` (`label` **message-dot**) via XPath anchored to the full row title.
- Swipes and taps again to toggle back to read.
- Screenshots under `screenshots/markAsRead/`.

### `removeRoom.js`

- Creates and removes its own unique `E-RemoveRoom-*` room by default, avoiding deletion of rooms created by concurrent lanes. Set `REMOVE_ROOM_CANDIDATES` only to target existing data intentionally.
- Resolves the **full** row title (e.g. `A-Public Room-abc123`) for reliable XPath.
- **Swipe left** → tap clear button (`name` / `label` ****) → waits until that title disappears.
- Uses `getLocation` + `getSize` for swipe Y (WebdriverIO `getRect` is unreliable on some elements).
- Screenshots under `screenshots/removeRoom/`.

Set `REMOVE_ROOM_CANDIDATES` only for a deliberate cleanup check against pre-existing data; the normal test is self-contained.

### `removeAllrooms.js`

- Cleanup utility for test data: removes every visible/scrolled room whose title starts with `A-`, `B-`, `M-`, or `E-`.
- Override prefixes with `REMOVE_ALL_ROOMS_PREFIXES=A-,B-,M-,E-`.
- Safety limits: `REMOVE_ALL_ROOMS_MAX_REMOVALS` and `REMOVE_ALL_ROOMS_MAX_SCROLLS`.
- Set `REMOVE_ALL_ROOMS_SCREENSHOTS=1` if you want a screenshot after every removal.
- Run with `npm run test:remove-all-rooms`.

### `editRoom.js`

- Creates a public room, opens the room settings modal, toggles the private switch, updates the room name, and fills the topic field.
- Saves the modal, closes it, and reopens settings to verify the saved room name can be found again.
- Useful for validating the edit modal selectors and save flow without bundling it into the main suite yet.

### `membersRoom.js`

- Creates a public room, opens **Members**, switches into **Edit**, optionally removes one member, then uses the add-individuals typeahead to invite a user.
- Defaults to inviting `greg.blake` (or `RECIPIENT`) and supports `MEMBERS_ROOM_REMOVE_MEMBER` if you want to target a specific existing member.
- Screenshots under `screenshots/membersRoom/`.

### `notifications.js`

- Backgrounds the app, pushes an APNS payload into the booted simulator via `xcrun simctl push`, taps the notification banner, and verifies the app comes back into a usable in-app state.
- Payload comes from `Tests/fixtures/connect-notification.apns` by default, or can be generated from env values.
- Screenshots under `screenshots/notifications/`.

### Shared permission prompts

- Fresh simulators and CI runs can show iOS permission prompts, especially notifications after login and Photos when the attachment picker opens.
- Notification permission is handled in the shared login flow, not in `notifications.js`, because the prompt can appear before any test.
- Photos permission is handled through the same shared helper and called from the attachment photo picker.
- The default behavior taps **Allow** / **Allow Full Access** when the prompt is visible, then skips future checks after the first no-prompt miss.
- Set `IOS_NOTIFICATION_PERMISSION_CHECKS=0` or `IOS_PHOTO_PERMISSION_CHECKS=0` only if your CI pre-grants those permissions another way.

### `attachments.js`

- Creates a public attachment room, opens the share options sheet, enters **Attach Photos**, selects the first visible row’s first 3 photos, confirms they appear in the composer, and sends them.
- Includes photo-picker probing logic so you can validate the picker is reachable and tap visible photos on the simulator.
- Tuned by the `ATTACHMENT_*` env vars documented in `.env.example`; screenshots under `screenshots/attachments/`.

---

## Project layout

```text
Connect-Apple-Testing/
├── Login_Flow/
│   ├── Open_App.js          # WebdriverIO session + capabilities
│   └── Login_User.js        # ensureLoggedIn (localhost + .env credentials)
├── Tests/
│   ├── runAll.js            # Suite runner + report
│   ├── runParallel.js       # Parallel lane runner + per-run reports
│   ├── runSplitParallel.js  # Two/three-simulator split runner + combined report
│   ├── runSingle.js         # Runs one test inside a parallel worker
│   ├── CreateRoom.js
│   ├── newMessage.js
│   ├── ComposerTypeahead.js
│   ├── MessageActions.js
│   ├── RoomNotificationPreferences.js
│   ├── DraftPersistence.js       # opt-in system flow
│   ├── editRoom.js          # standalone room settings flow
│   ├── favoriteRoom.js      # standalone
│   ├── markAsRead.js        # standalone (mark unread/read)
│   ├── membersRoom.js       # standalone room members flow
│   ├── notifications.js     # standalone simctl push flow
│   ├── removeRoom.js        # standalone
│   ├── removeAllrooms.js    # cleanup utility for generated test rooms
│   ├── attachments.js       # standalone attachment entry flow
│   ├── markdowns.js
│   ├── PinnedMessageEditFlow.js
│   ├── Reactions.js         # add/remove a message reaction through the long-press picker
│   ├── ConversationList.js
│   ├── Login_Signout.js
│   └── …                    # EditMessage, PinnedMessages, User_Settings, etc.
├── utils/
│   ├── testSession.js       # resetToHome, scroll helpers, runWithOptionalDriver
│   ├── selectors.js         # shared accessibility IDs and common predicates
│   ├── simulatorConfig.js   # simulator discovery and lane assignment
│   ├── uiActions.js         # shared text taps, room menu, composer actions
│   ├── attachmentPhotoPicker.js
│   ├── screenshots.js
│   ├── reportWriter.js
│   └── cliTestTiming.js
├── screenshots/             # per-test artifacts (gitignored)
├── reports/                 # suite markdown reports
├── scripts/
│   ├── doctor.js            # environment and lane diagnostics
│   ├── checkSyntax.js       # framework JavaScript syntax check
│   └── report/              # report formatting and analysis modules
├── unit/                    # runner/reporting unit tests
├── .env.example
├── test.js                  # npm run test:ios — launch smoke
└── package.json
```

---

## Design notes

- **Accessibility-first:** prefer `~accessibilityId`, then predicates, then XPath anchored to row titles.
- **Shared selectors:** use `const { SELECTORS } = require('../utils/selectors')` and call `driver.$(SELECTORS.settingsButton)` instead of hardcoding `~settingsButton` in new tests.
- **SwiftUI menus:** e.g. room creation—tap **Rooms +** before `createRoomButton` exists in the tree.
- **Swipe actions:** favorite (right) and remove (left) buttons often sit off-screen until swiped; XPath is tied to the **full** `StaticText` title next to the action.
- **Unique room names:** `CreateRoom` uses random suffixes to avoid collisions.
- **Screenshots:** saved per test under `screenshots/<testName>/`; disable with env when iterating quickly.
- **Screenshot timing:** if a report image catches a transition too early, add a targeted delay with `SCREENSHOT_DELAYS_MS='CreateRoom/rooms_list_after_public.png=2000'` instead of slowing the whole test.

### Debugging

```js
const xml = await driver.getPageSource();
fs.writeFileSync('debug.xml', xml);
```

```js
await driver.saveScreenshot('error.png');
```

If Appium cannot see a control in the page source, automation cannot tap it.

### Recommended `.gitignore` (already in repo)

- `node_modules/`, `.env`, `screenshots/`, `*.png`, `*.xml`, `*.log`

---

## npm scripts

| Script | Command |
|--------|---------|
| `npm run appium` | Start Appium via local `node_modules` binary |
| `npm run doctor` | Check simulator discovery, app installs, credentials, and Appium ports |
| `npm run check` | Syntax-check framework JavaScript |
| `npm run lint` | Run focused ESLint correctness checks and unused-code warnings |
| `npm test` | Run framework unit tests |
| `npm run validate` | Run syntax checks, ESLint, and framework unit tests |
| `npm run test:ios` | Launch app + `connect-launch.png` |
| `npm run test:suite` | Full `runAll.js` suite |
| `npm run test:suite:full` | Alias for full `runAll.js` suite |
| `npm run test:suite:fast` | Reduced suite |
| `npm run test:suite:turbo` | Reduced suite with screenshots disabled |
| `npm run sims:ready` | Discover and boot the three split simulators one at a time, pre-opening Connect |
| `npm run test:one -- <testName>` | Run one test and generate its browser report |
| `npm run test:parallel` | Parallel runner for one or more simulator lanes, then generate its report |
| `npm run test:parallel:split` | Run main suite and standalone group on two simulator lanes, then generate its report |
| `npm run test:parallel:split3` | Run the three-simulator split, then generate its report |
| `npm run test:parallel:split3:publish` | Run the three-simulator split, commit only the current Pages report, and push |
| `npm run test:time` | Timing helper test |
| `npm run test:notifications` | Push simulator notification, verify app re-entry, and generate a report |
| `npm run test:members-room` | Create room, exercise Members edit flow, and generate a report |
| `npm run test:attachments` | Create room, validate attachment entry points, and generate a report |
| `npm run test:composer-typeahead` | Verify emoji composer suggestions |
| `npm run test:message-actions` | Verify message Copy and Delete actions |
| `npm run test:room-notification-preferences` | Persist and restore a room notification setting |
| `npm run test:draft-persistence` | Run the opt-in background/foreground draft test |
| `npm run test:remove-all-rooms` | Clean up matching rooms and generate a report |
| `npm run selectors:audit` | Compare automation selectors with the local app source |
| `npm run docs:scribe` | Generate Scribe-style web and Markdown docs from reports and screenshots |
| `npm run docs:serve` | Serve the local report at `http://localhost:5500/` |

---

## CI / future work

- GitHub Actions runs `npm run validate` on pushes and pull requests, covering framework syntax and unit-tested runner/report helpers without requiring a macOS simulator.
- Full UI CI still requires macOS runners with Xcode, the Connect app artifact, three simulator definitions, Appium/XCUITest, credentials, and access to the localhost test backend.
- Split execution reuses one Appium session per lane and emits Markdown/JSON/browser reports. JUnit or Allure export remains a future option if CI consumers need native test-result ingestion.

---

## Contributing

- Add tests next to new Connect features when possible.
- Reuse `utils/testSession.js` and shared login instead of one-off drivers.
- Treat flaky tests as bugs—fix selectors or waits rather than disabling coverage.

If a test fails here after a stable run, it is often a real product or environment issue—not “automation noise.”
