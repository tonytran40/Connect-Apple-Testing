# Scribe-Style Test Documentation

- Run ID: split3-combined
- Source: summary.json
- Status: FAIL
- Started: 2026-09-30T15:02:24.118Z
- Updated: 2026-09-30T15:12:07.043Z
- Passed: 10
- Failed: 7
- Skipped: 0
- Blocked: 0
- Inconclusive: 0
- Total tests: 17

## Phase Timings

| Phase | Aggregate Duration |
| --- | --- |
| Session creation | 3m 57s |
| Login/readiness | 5m 1s |
| Test body | 14m 38s |
| Screenshot capture | 16s |
| Recovery | 4s |
| Report generation | 2s |
| Room creation (test-owned) | 16s |

## Tests

| Test | Category | Physical Lane | Status | Duration | Screenshots | Guide |
| --- | --- | --- | --- | --- | --- | --- |
| CreateRoom | main-suite | main-suite | FAIL | 36s | 1 | [guide](CreateRoom.md) |
| markdowns | ConversationView | main-suite | PASS | 1m 41s | 11 | [guide](markdowns.md) |
| membersRoom | ConversationView | main-suite | FAIL | 1m 14s | 1 | [guide](membersRoom.md) |
| MessageActions | ConversationView | main-suite | PASS | 1m 17s | 5 | [guide](MessageActions.md) |
| ConversationSearch | ConversationView | main-suite | PASS | 1m 24s | 8 | [guide](ConversationSearch.md) |
| newMessage | main-suite | main-suite | PASS | 46s | 4 | [guide](newMessage.md) |
| favoriteRoom | Conversation-List | Conversation-List | FAIL | 43s | 1 | [guide](favoriteRoom.md) |
| markAsRead | Conversation-List | Conversation-List | FAIL | 1m 33s | 1 | [guide](markAsRead.md) |
| removeRoom | Conversation-List | Conversation-List | PASS | 53s | 4 | [guide](removeRoom.md) |
| PinnedMessageEditFlow | ConversationView | Conversation-List | FAIL | 55s | 2 | [guide](PinnedMessageEditFlow.md) |
| Reactions | ConversationView | Conversation-List | PASS | 1m 14s | 13 | [guide](Reactions.md) |
| LinkPreviews | ConversationView | ConversationView | FAIL | 41s | 1 | [guide](LinkPreviews.md) |
| attachments | ConversationView | ConversationView | PASS | 2m 11s | 17 | [guide](attachments.md) |
| editRoom | ConversationView | ConversationView | PASS | 1m 2s | 8 | [guide](editRoom.md) |
| ComposerTypeahead | ConversationView | ConversationView | FAIL | 1m 8s | 2 | [guide](ComposerTypeahead.md) |
| RoomNotificationPreferences | ConversationView | ConversationView | PASS | 59s | 5 | [guide](RoomNotificationPreferences.md) |
| ConversationList | Conversation-List | Conversation-List-settings | PASS | 1m 8s | 15 | [guide](ConversationList.md) |

## Failures

- **CreateRoom**: element ("~createRoomButton") still not displayed after 20000ms
- **membersRoom**: element ("-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (label == "Skip for now" OR name == "Skip for now")") still not displayed after 20000ms
- **favoriteRoom**: element ("-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (label == "Skip for now" OR name == "Skip for now")") still not displayed after 20000ms
- **markAsRead**: WebDriverError: Request with GET/HEAD method cannot have body. when running "element/70020000-0000-0000-5579-000000000000/screenshot" with method "GET" and args "{"scroll":true}"
- **PinnedMessageEditFlow**: Pinned messages panel did not open
- **LinkPreviews**: element ("-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (label == "Skip for now" OR name == "Skip for now")") still not displayed after 20000ms
- **ComposerTypeahead**: Visible control with source label ":grinning_face:" did not appear
