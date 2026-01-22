# Connect Apple – iOS Automation Test Suite

This repository contains **end-to-end (E2E) automation tests** for the **Connect Apple (iOS)** application, built using **Appium + WebdriverIO**.  
The goal of this project is to validate critical user workflows against the real iOS UI using accessibility identifiers and resilient selector strategies designed for SwiftUI, **while significantly reducing the amount of manual and regression testing required by our QA ninjas**.

This is **not** a demo repo — these tests are intended to be:
- Reliable
- Maintainable
- CI-ready
- Resistant to SwiftUI quirks
- A practical replacement for repetitive manual regression testing

---

## 📌 Scope & Goals

### What this test suite is for
- Validating **core user flows** end-to-end in the Connect Apple iOS app
- Catching regressions related to:
  - Room creation
  - Privacy toggles
  - Messaging
  - Navigation
  - Future Connect features as they are introduced
- Exercising **real UI behavior** against production-like builds (no mocks or stubs)
- Reducing repetitive **manual and regression testing** for QA ninjas

### What this test suite is NOT for
- Unit testing (handled at the app layer)
- Snapshot or visual regression testing
- Pixel-perfect UI validation
- Performance or load benchmarking

---

## 🧱 Tech Stack

| Layer | Tool |
|-----|-----|
| Language | JavaScript (Node.js) |
| Automation Framework | WebdriverIO |
| Mobile Automation | Appium |
| iOS Driver | XCUITest |
| UI Framework Under Test | SwiftUI |
| Platform | iOS Simulator |

---

## 🧩 Test Coverage

### Rooms
- Opening the **Rooms `+` menu**
- Creating **public rooms**
- Creating **private rooms**
- Verifying newly created rooms appear in the list

### Messaging
- Entering the message composer
- Sending messages in newly created rooms
- Handling SwiftUI text input behavior

### Stability Features
- Unique test data per run (random room names)
- Explicit waits for async SwiftUI rendering
- Defensive selectors for menus, toggles, and navigation bars

---

## ✅ System Requirements

### Operating System
- macOS (required for iOS automation)

### Xcode
- Latest stable Xcode
- iOS Simulator installed (recommended: latest iOS)

Verify simulators:
```bash
xcrun simctl list
```
### Node.js
```bash
node -v
npm -v
```

## 🔧 Project Setup

### 1. Install dependencies
From project root:
```bash 
npm install
```
2. Install Appium
```bash
npm install -g appium
```
Verify
```bash
appium -v
```
3. Install XCUITest Driver
```bash
appium driver install xcuitest
```
Confirm installation:
```bash
appium driver list
```
## Xcode configuration
1. Open **Xcode**
2. Go to **Settings** -> **Locations**
3. Ensure **Command Line Tools** is set
    PS: Appium will reuse the simulator once it's booted

### Running Appium
Start Appium on a separate terminal:
```bash
appium
```
Leave it running.


### Running Tests
Run a single test file
```bash
Connect-Apple-Testing node Tests/CreateRoom.js
```
## Expected behavior:
1. App launches in simulator
2. User is logged in (or login flow executes)
3. Test steps run sequentially
4. Simulator remains open until test completes or fails

##  Test Lifecycle (High-Level)
Each test follows this general lifecycle:
1. Create Appium session
2. Launch app
3. Ensure authenticated state
4. Navigate to required screen
5. Perform user actions
6. Validate UI responses
7. Cleanly exit or return to a known state

## 🧠 Key Design Decisions

## Accessibility-First Selectors
Primary Strategy:
* ```accessibilityIdentifier```
* ```accessibilityLabel```
Fallbacks:
* iOS predicate strings
* XPath

## SwiftUI-Safe Menu Handling
SwiftUI Menu components do not exist in the UI tree until tapped.
Because of this:
* We first tap the Rooms + button
* Only then does createRoomButton appear
* Tests explicitly wait for this condition

## Robust Toggle Interaction
SwiftUI toggles may:
* Have no label
* Be wrapped in multiple containers
* Render as ```XCUIElementTypeSwitch```
The toggle helper:
* Looks for labeled switch
* Falls back to the first visible switch
* Fails loudly if nothing is found

## Unique Test Data Per Run
To prevent collisions:
```js
function generateRoomName(prefix = 'Room') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}
```
This ensures:
* Parallel test safety
* Repeatability
* No manual cleanup

## 🗂 Folder Structure
```text
Connect-Apple-Testing/
├─ Tests/
│  ├─ CreateRoom.js
│  ├─ Messaging.js
│  └─ SmokeTests.js
├─ Login_Flow/
│  ├─ Open_App.js
│  └─ Login_User.js
├─ screenshots/
├─ package.json
└─ README.md
```
## 🧯 Debugging & Diagnostics
Save page source:
```js
const xml = await driver.getPageSource();
fs.writeFileSync('debug.xml', xml);
```
Capture Screenshot
```js
await driver.saveScreenshot('Error.png')
```
Reasons:
* SwiftUI layouts are opaque
* Page source is the source of truth
* If Appium can’t see it, automation can’t tap it

Recommended ```.gitignore```
```gitignore
node_modules/
screenshots/
*.png
*.xml
.env
```
Why screenshots & XML are ignored
* Generated per run
* Not deterministic
* Useful locally, noisy in PRs

## ⚙️ CI / Headless Execution
**Local**
* One simulator
* One test session at a time

**CI (Planned)**
* Tests typically run sequentially
* Simulator runs headlessly
* Appium session reused per job

## ✅ Best Practices
* Always navigate back to a known screen between tests
* Try to not reuse stale element references
* Re-query elements after navigation
* Prefer explicit waits over sleeps
* Dump page source immediately when stuck

## 🧭 Future Plans
Potential next steps:
* Smoke test suite
* Login state caching
* CI integration (GitHub Actions)
* Parallel execution
* Reporting (JUnit / Allure)

## 🏁 Final Notes
This test suite is built to survive:

* SwiftUI refactors
* Accessibility changes
* Real production data
* CI environments

## 🧑‍💻 Ownership & Contributions

- Tests should be added alongside new Connect features when possible
- Prefer extending existing helpers over creating new one-off selectors
- If a test becomes flaky, treat it as a bug and fix it — do not disable it

**If a test fails here, it’s probably a real bug, not flaky automation.**

Thanks for reading! Happy automating!