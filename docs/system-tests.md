# Opt-in System Tests

System tests exercise iOS or simulator behavior outside the normal in-app UI path. They are intentionally excluded from `Tests/runAll.js`, the parallel and split runners, and the default npm scripts. Run them only on a prepared simulator lane.

## Draft persistence

`Tests/DraftPersistence.js` is the currently implemented deterministic system flow. It:

1. Ensures the account is logged in and the Rooms list is ready.
2. Creates a unique public room whose name begins with `A-`.
3. Enters unique text in `roomComposerTextView` without sending it.
4. Uses Appium to press Home, waits for app state 2 or 3, activates Connect, and waits for app state 4.
5. Reacquires the composer and requires its value to exactly equal the unsent text.
6. Clears the composer, verifies its value is empty, and returns to the Rooms list.

Cleanup runs from `finally`. If the assertion fails while Connect is backgrounded or while a draft may exist, cleanup reactivates the app, clears the composer, and restores the Rooms list. A cleanup error is reported without replacing the original test error. The generated `A-` room remains available for the repository's separate opt-in generated-room cleanup.

Run through the existing single-test path:

```sh
npm run test:one -- DraftPersistence
```

Or run the file directly:

```sh
node Tests/DraftPersistence.js
```

The usual login and Appium configuration still applies. `CONNECT_BUNDLE_ID` defaults to `com.powerhrg.connect.v3.debug`; `SYSTEM_FLOW_TIMEOUT_MS` defaults to 20000. The simulator must have the debug app installed, an Appium/XCUITest server available, valid `Connect_username` and `Connect_password` values when it is logged out, and a reachable configured Matrix server.

The flow has no fixed sleeps. It waits on Appium application states, the exact native composer value, and existing Rooms-list readiness signals. Screenshots are written through the normal artifact helper.

## Deferred candidates

The base app at `/Users/tony.tran/GitHub/connect-apple` was inspected as read-only. The candidates below remain unimplemented rather than providing coverage that can pass without proving the intended behavior.

| Candidate | Prerequisites for deterministic coverage | Current blocker |
| --- | --- | --- |
| Notification deep link | A provisioning helper that creates or resolves a named room and returns its Matrix `room_id`; a simulator with notification permission in a known state; an APNs payload using the app's `room_id` key; and an exact destination assertion. | `Tests/fixtures/connect-notification.apns` uses `roomId` with a placeholder value, while `HandleNotification+Response.swift` requires `room_id`. The existing notification test can prove banner delivery and app foregrounding, but not routing to a real room. |
| Share extension | A deterministic host item to share, an installed/enabled Connect share extension, seeded app-group/keychain credentials, a known text or file fixture, and observable identifiers across the extension-to-host handoff. | The iOS extension extracts host content, writes `PendingSharedContentStore`, and immediately opens the host URL. The repository has no fixture setup for the host share sheet or app-group state, and the handoff UI has no dedicated automation identifiers. |
| Attachment download/cancellation | A named room containing a unique attachment event, a resettable download cache, a fixture endpoint whose transfer can be held in progress deterministically, and assertions for cancellation cleanup and completed content. | Existing attachment automation covers photo upload. Download timing depends on Matrix media/network speed; a normal fixture may finish before the `Cancel download` control is observable, so cancellation cannot currently be forced safely. |
| Offline retry | Per-lane fault injection that blocks only the tested Matrix server, guaranteed network restoration in cleanup, a dedicated account/server lane, stable identifiers for failed-event and retry state, and a server-side assertion that the message is delivered exactly once. | The current harness has no scoped network controller. Stopping localhost or changing simulator networking can affect other lanes, and the iOS retry state is not exposed with dedicated accessibility identifiers. |
| Server picker | An isolated logged-out app-data snapshot or launch hook, stable identifiers for server rows/current selection, and a tested rollback that restores both the selected server and authenticated session. | `serversButton` is only revealed from `loginView`; the single-test runner starts from an authenticated Rooms list. Logging out or choosing a server mutates persistent session state, so the flow cannot currently restore its pre-test state reliably. |

These candidates should stay opt-in even after implementation because they depend on simulator services, extension state, network control, media fixtures, or destructive authentication state. None should be registered in a default runner until its prerequisites are provisioned per lane and cleanup has been demonstrated independently.
