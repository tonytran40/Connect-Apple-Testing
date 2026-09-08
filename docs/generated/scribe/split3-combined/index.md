# Scribe-Style Test Documentation

- Run ID: split3-combined
- Source: summary.json
- Status: FAIL
- Started: 2026-09-01T18:53:17.463Z
- Updated: 2026-09-01T19:02:03.601Z
- Passed: 12
- Failed: 5
- Skipped: 0
- Blocked: 0
- Inconclusive: 0
- Total tests: 17

## Phase Timings

| Phase | Aggregate Duration |
| --- | --- |
| Session creation | 26s |
| Login/readiness | 2m 11s |
| Test body | 13m 29s |
| Screenshot capture | 19s |
| Recovery | 1m 25s |
| Report generation | 2s |
| Room creation (test-owned) | 39s |

## Tests

| Test | Category | Physical Lane | Status | Duration | Screenshots | Guide |
| --- | --- | --- | --- | --- | --- | --- |
| CreateRoom | main-suite | main-suite | PASS | 44s | 5 | [guide](CreateRoom.md) |
| PinnedMessageEditFlow | ConversationView | main-suite | PASS | 1m 3s | 4 | [guide](PinnedMessageEditFlow.md) |
| Reactions | ConversationView | main-suite | PASS | 1m 7s | 13 | [guide](Reactions.md) |
| newMessage | main-suite | main-suite | PASS | 35s | 4 | [guide](newMessage.md) |
| favoriteRoom | Conversation-List | Conversation-List | PASS | 38s | 4 | [guide](favoriteRoom.md) |
| markAsRead | Conversation-List | Conversation-List | FAIL | 1m 5s | 1 | [guide](markAsRead.md) |
| removeRoom | Conversation-List | Conversation-List | FAIL | 55s | 1 | [guide](removeRoom.md) |
| ComposerTypeahead | ConversationView | Conversation-List | FAIL | 38s | 2 | [guide](ComposerTypeahead.md) |
| MessageActions | ConversationView | Conversation-List | PASS | 33s | 5 | [guide](MessageActions.md) |
| RoomNotificationPreferences | ConversationView | Conversation-List | FAIL | 1m 10s | 5 | [guide](RoomNotificationPreferences.md) |
| markdowns | ConversationView | ConversationView | PASS | 1m 33s | 11 | [guide](markdowns.md) |
| LinkPreviews | ConversationView | ConversationView | PASS | 53s | 7 | [guide](LinkPreviews.md) |
| attachments | ConversationView | ConversationView | PASS | 1m 43s | 17 | [guide](attachments.md) |
| editRoom | ConversationView | ConversationView | PASS | 48s | 8 | [guide](editRoom.md) |
| membersRoom | ConversationView | ConversationView | FAIL | 44s | 6 | [guide](membersRoom.md) |
| ConversationSearch | ConversationView | ConversationView | PASS | 1m 5s | 8 | [guide](ConversationSearch.md) |
| ConversationList | Conversation-List | Conversation-List-settings | PASS | 36s | 15 | [guide](ConversationList.md) |

## Failures

- **markAsRead**: None of [A-00-M-MarkAsRead-gktxu7ze] became visible after 24 list scroll(s)
- **removeRoom**: None of [A-00-E-RemoveRoom-trffrnb4] became visible after 24 list scroll(s)
- **ComposerTypeahead**: Visible control with source label ":grinning_face:" did not appear
- **RoomNotificationPreferences**: element ("~notificationPreferencesButton") still not displayed after 20000ms
- **membersRoom**: membersRoom: could not find Add Individuals TextField
