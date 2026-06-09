# Connect Apple – iOS Automation Test Suite

End-to-end automation for **Connect Apple (iOS)** using **Appium + WebdriverIO**. Tests drive the real simulator UI via accessibility identifiers, iOS predicates, and XPath where needed—aimed at reducing repetitive manual regression for QA.

---

## What this repo covers

| Area | Tests / behavior |
|------|------------------|
| **Login** | Auto-login when `loginView` is shown (localhost server, credentials from `.env`) |
| **Rooms** | Create public/private rooms (`CreateRoom.js`); swipe-left remove on list rows (`removeRoom.js`) |
| **List actions** | Swipe-right favorite / unfavorite (`favoriteRoom.js`); mark unread/read (`markAsRead.js`); swipe-left remove (`removeRoom.js`) |
| **Messaging** | New DM (`newMessage.js`); markdown rendering (`markdowns.js`); pin/edit/unpin (`PinnedMessageEditFlow.js`) |
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

**Login flow:** If the app is already logged in (`loginView` absent), tests skip login. With `appium:noReset: true`, session state persists across runs.

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

1. `newMessage` — new direct message  
2. `CreateRoom` — public and private room creation  
3. `PinnedMessageEditFlow` — pin, edit, unpin  
4. `markdowns` — markdown / emoji in composer  
5. `ConversationList` — layout and sort in user settings  
6. `Login_Signout` — sign out  

Report: `reports/latest-suite-report.md` (pass/fail, durations, options).

### Faster suite (subset)

```bash
npm run test:suite:fast
```

Uses smoke room creation, one layout/sort, and a subset of markdown examples (see `package.json`).

### Single test files

Any test that exports `{ run }` can be run directly (creates its own session unless you pass a driver):

```bash
node Tests/CreateRoom.js
node Tests/favoriteRoom.js
node Tests/removeRoom.js
node Tests/newMessage.js
```

Wall-clock time is printed via `utils/cliTestTiming.js`.

### Suite options (environment)

| Variable | Effect |
|----------|--------|
| `CONNECT_SKIP_RESET_BETWEEN_TESTS=1` | Skip `resetToHome` before tests 2+ (faster; tests must tolerate shared state) |
| `CREATE_ROOM_MODE=smoke` | `CreateRoom`: public room only |
| `MARKDOWN_EXAMPLE_IDS` | Comma-separated markdown example ids |
| `CONVERSATION_LAYOUTS` / `CONVERSATION_SORTS` | Limit `ConversationList` matrix |
| `CONNECT_SCREENSHOTS=0` or `SKIP_SCREENSHOTS=1` | Disable screenshots |

---

## Standalone list-action tests (not in `runAll` yet)

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

---

## Project layout

```text
Connect-Apple-Testing/
├── Login_Flow/
│   ├── Open_App.js          # WebdriverIO session + capabilities
│   └── Login_User.js        # ensureLoggedIn (localhost + .env credentials)
├── Tests/
│   ├── runAll.js            # Suite runner + report
│   ├── CreateRoom.js
│   ├── newMessage.js
│   ├── favoriteRoom.js      # standalone
│   ├── markAsRead.js        # standalone (mark unread/read)
│   ├── removeRoom.js        # standalone
│   ├── markdowns.js
│   ├── PinnedMessageEditFlow.js
│   ├── ConversationList.js
│   ├── Login_Signout.js
│   └── …                    # EditMessage, PinnedMessages, User_Settings, etc.
├── utils/
│   ├── testSession.js       # resetToHome, scroll helpers, runWithOptionalDriver
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
| `npm run test:suite:fast` | Reduced suite |
| `npm run test:time` | Timing helper test |

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
