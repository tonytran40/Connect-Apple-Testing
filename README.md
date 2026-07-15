# Connect Apple – iOS Automation Test Suite

End-to-end automation for **Connect Apple (iOS)** using **Appium + WebdriverIO**. Tests drive the real simulator UI via accessibility identifiers, iOS predicates, and XPath where needed—aimed at reducing repetitive manual regression for QA.

---

## What this repo covers

| Area | Tests / behavior |
|------|------------------|
| **Login** | Auto-login when `loginView` is shown (localhost server, credentials from `.env`) |
| **Rooms** | Create public/private rooms (`CreateRoom.js`); edit room settings (`editRoom.js`); remove room rows (`removeRoom.js`); manage room members (`membersRoom.js`) |
| **List actions** | Swipe-right favorite / unfavorite (`favoriteRoom.js`); mark unread/read (`markAsRead.js`); swipe-left remove (`removeRoom.js`) |
| **Messaging** | New DM (`newMessage.js`); markdown rendering (`markdowns.js`); pin/edit/unpin (`PinnedMessageEditFlow.js`); attachment entry points (`attachments.js`) |
| **Notifications** | Push a simulator notification and verify app re-entry (`notifications.js`) |
| **Settings** | Conversation layout & sort (`ConversationList.js`); sign out (`Login_Signout.js`) |
| **Suite** | One session, shared login, markdown report (`Tests/runAll.js`) |

**Not in scope:** unit tests, pixel-perfect visual diff, load/performance benchmarks.

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
- **Node.js** (LTS recommended) and **npm**
- **Appium** globally or via `npx`
- **Connect iOS** debug app installed on the simulator (`com.powerhrg.connect.v3.debug`)
- Local **localhost** backend available when login runs (tests select **localhost** in the server picker)

Check simulators:

```bash
xcrun simctl list devices available
```

The default driver targets **`iPhone 17 Pro`** (see `Login_Flow/Open_App.js`). Use a simulator that matches that name, or update `appium:deviceName` (and optionally `appium:udid`) in `Open_App.js`.

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
3. `markdowns` — markdown / emoji in composer  
4. `ConversationList` — layout and sort in user settings  
5. `newMessage` — new direct message, intentionally late because it can leave the app in a DM  
6. `Login_Signout` — sign out  

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
| `PARALLEL_UDIDS` | Simulator UDIDs, one per lane |
| `PARALLEL_APPIUM_PORTS` | Appium server ports, one per lane |
| `WDA_LOCAL_PORT` | Base WDA port; each worker increments from this |
| `PARALLEL_RUN_ID` | Report/screenshot run folder name |
| `PARALLEL_DRY_RUN=1` | Validate runner selection/reporting without launching tests |

Reports are written under `reports/runs/{runId}/summary.md` and `reports/runs/{runId}/summary.json`; worker logs are under `reports/runs/{runId}/logs/`. Screenshots for parallel runs are namespaced under `screenshots/{runId}/`.

The parallel report includes pass/fail status, completed count, a rerun command for failed tests, slowest tests, worker lane details, and links to each test's log, JSON result, and screenshot folder.

### Split parallel shortcut

Use this when you want the main suite and standalone tests running at the same time on two simulators.

Recommended terminal layout:

| Tab | Command | Purpose |
|-----|---------|---------|
| 1 | `appium --port 4723` | Appium server for the iPhone 17 Pro lane |
| 2 | `appium --port 4725` | Appium server for the iPhone 17 Pro Max lane |
| 3 | `npm run test:parallel:split` | Launch both test groups |

The shortcut uses these default lanes:

| Group | Simulator | UDID | Appium | WDA |
|-------|-----------|------|--------|-----|
| `main-suite` | iPhone 17 Pro | `A848480F-1933-47A5-B063-DB070BB3AC66` | `4723` | `8100` |
| `standalones` | iPhone 17 Pro Max | `B5A3CFF9-F618-411B-91FC-92C8FDD0D069` | `4725` | `8200` |

Run both groups with:

```bash
npm run test:parallel:split
```

This launches `main-suite` on the iPhone 17 Pro lane and `standalones` on the iPhone 17 Pro Max lane. The merged report is written to `reports/runs/split-combined/summary.md`, with the per-lane details still available at `reports/runs/main-suite/summary.md` and `reports/runs/standalones/summary.md`.

Set `SPLIT_COMBINED_RUN_ID=some-name` if you want the merged report written to a different `reports/runs/{runId}/` folder.

Important: each simulator has its own installed copy of the app. Appium launches the existing `com.powerhrg.connect.v3.debug` app because the driver uses `bundleId` with `noReset: true`; it does not automatically install the latest Xcode build. If one simulator looks like an older app version, update that simulator's installed app from a normal terminal tab, not from an Appium tab:

```bash
xcrun simctl install B5A3CFF9-F618-411B-91FC-92C8FDD0D069 \
"/Users/tony.tran/Library/Developer/Xcode/DerivedData/Connect-avitsdrqdscjvxbysyyzqofypfnh/Build/Products/Debug-iphonesimulator/Connect iOS.app"
```

If it still looks stale, uninstall and reinstall:

```bash
xcrun simctl uninstall B5A3CFF9-F618-411B-91FC-92C8FDD0D069 com.powerhrg.connect.v3.debug

xcrun simctl install B5A3CFF9-F618-411B-91FC-92C8FDD0D069 \
"/Users/tony.tran/Library/Developer/Xcode/DerivedData/Connect-avitsdrqdscjvxbysyyzqofypfnh/Build/Products/Debug-iphonesimulator/Connect iOS.app"
```

You can verify which app bundle is installed on a simulator with:

```bash
xcrun simctl get_app_container B5A3CFF9-F618-411B-91FC-92C8FDD0D069 com.powerhrg.connect.v3.debug app
```

Each parallel test is launched through `Tests/runSingle.js`, which creates its own driver session, logs in if needed, resets back to the conversation list, and then runs the requested test. True simultaneous execution still needs separate simulator/Appium lanes; one simulator should only be driven by one worker at a time.

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
```

Wall-clock time is printed via `utils/cliTestTiming.js`.

### Handy npm scripts

```bash
npm run test:ios
npm run test:suite
npm run test:suite:fast
npm run test:notifications
npm run test:members-room
npm run test:attachments
npm run test:remove-all-rooms
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

---

## Standalone scenario tests (not in `runAll` yet)

These follow the same login + home pattern but are run individually today.

### `favoriteRoom.js`

- Finds a row whose title contains `FAVORITE_ROOM_NAME` (default **Favorite Room**), scrolls the list if needed.
- **Swipe right** → tap `favoritesButton` (heart) → swipe again → tap to **unfavorite**.
- Screenshots under `screenshots/favoriteRoom/`.

### `markAsRead.js`

- Finds a row whose title **contains** any of `MARK_AS_READ_CANDIDATES` (default **Message Room**, **Markdown room**).
- **Swipe right** → tap `markAsUnreadButton` (`label` **message-dot**) via XPath anchored to the full row title.
- Swipes and taps again to toggle back to read.
- Screenshots under `screenshots/markAsRead/`.

### `removeRoom.js`

- Finds the first visible row whose title **contains** `A-Public` or `B-Private` (`REMOVE_ROOM_CANDIDATES`, comma-separated).
- Resolves the **full** row title (e.g. `A-Public Room-abc123`) for reliable XPath.
- **Swipe left** → tap clear button (`name` / `label` ****) → waits until that title disappears.
- Uses `getLocation` + `getSize` for swipe Y (WebdriverIO `getRect` is unreliable on some elements).
- Screenshots under `screenshots/removeRoom/`.

**Typical manual flow:** run `CreateRoom` (or have `A-Public` / `B-Private` rooms on screen) → `removeRoom` to clean up.

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
│   ├── runSplitParallel.js  # Two-simulator split runner + combined report
│   ├── runSingle.js         # Runs one test inside a parallel worker
│   ├── CreateRoom.js
│   ├── newMessage.js
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
│   ├── ConversationList.js
│   ├── Login_Signout.js
│   └── …                    # EditMessage, PinnedMessages, User_Settings, etc.
├── utils/
│   ├── testSession.js       # resetToHome, scroll helpers, runWithOptionalDriver
│   ├── selectors.js         # shared accessibility IDs and common predicates
│   ├── attachmentPhotoPicker.js
│   ├── screenshots.js
│   ├── reportWriter.js
│   └── cliTestTiming.js
├── screenshots/             # per-test artifacts (gitignored)
├── reports/                 # suite markdown reports
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
| `npm run test:ios` | Launch app + `connect-launch.png` |
| `npm run test:suite` | Full `runAll.js` suite |
| `npm run test:suite:full` | Alias for full `runAll.js` suite |
| `npm run test:suite:fast` | Reduced suite |
| `npm run test:suite:turbo` | Reduced suite with screenshots disabled |
| `npm run test:parallel` | Parallel runner for one or more simulator lanes |
| `npm run test:parallel:split` | Run main suite and standalone group on two simulator lanes |
| `npm run test:time` | Timing helper test |
| `npm run test:notifications` | Push simulator notification and verify app re-entry |
| `npm run test:members-room` | Create room and exercise Members edit flow |
| `npm run test:attachments` | Create room and validate attachment entry points |
| `npm run test:remove-all-rooms` | Cleanup rooms starting with configured prefixes |

---

## CI / future work

- Today: local simulator, sequential tests, one session per suite run.
- Planned: GitHub Actions, parallel jobs, JUnit/Allure export if needed.

---

## Contributing

- Add tests next to new Connect features when possible.
- Reuse `utils/testSession.js` and shared login instead of one-off drivers.
- Treat flaky tests as bugs—fix selectors or waits rather than disabling coverage.

If a test fails here after a stable run, it is often a real product or environment issue—not “automation noise.”
