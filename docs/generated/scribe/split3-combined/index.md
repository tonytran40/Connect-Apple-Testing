# Scribe-Style Test Documentation

- Run ID: split3-combined
- Source: summary.json
- Status: FAIL
- Started: 2026-08-19T15:09:11.139Z
- Updated: 2026-08-19T15:19:24.512Z
- Passed: 14
- Failed: 2
- Total tests: 16

## Phase Timings

| Phase | Aggregate Duration |
| --- | --- |
| Session creation | 1m 5s |
| Login/readiness | 4m 36s |
| Test body | 16m 47s |
| Screenshot capture | 53s |
| Recovery | 37s |
| Report generation | 707ms |
| Room creation (test-owned) | 14s |

## Tests

| Test | Category | Physical Lane | Status | Duration | Screenshots | Guide |
| --- | --- | --- | --- | --- | --- | --- |
| CreateRoom | main-suite | main-suite | FAIL | 1m 56s | 4 | [guide](CreateRoom.md) |
| PinnedMessageEditFlow | ConversationView | main-suite | PASS | 1m 21s | 4 | [guide](PinnedMessageEditFlow.md) |
| Reactions | ConversationView | main-suite | PASS | 1m 54s | 13 | [guide](Reactions.md) |
| newMessage | main-suite | main-suite | PASS | 41s | 4 | [guide](newMessage.md) |
| favoriteRoom | Conversation-List | Conversation-List | PASS | 1m 6s | 4 | [guide](favoriteRoom.md) |
| markAsRead | Conversation-List | Conversation-List | PASS | 51s | 4 | [guide](markAsRead.md) |
| notifications | Conversation-List | Conversation-List | PASS | 27s | 4 | [guide](notifications.md) |
| removeRoom | Conversation-List | Conversation-List | PASS | 1m 4s | 4 | [guide](removeRoom.md) |
| ComposerTypeahead | ConversationView | Conversation-List | FAIL | 59s | 2 | [guide](ComposerTypeahead.md) |
| MessageActions | ConversationView | Conversation-List | PASS | 53s | 5 | [guide](MessageActions.md) |
| RoomNotificationPreferences | ConversationView | Conversation-List | PASS | 1m 42s | 5 | [guide](RoomNotificationPreferences.md) |
| markdowns | ConversationView | ConversationView | PASS | 1m 50s | 11 | [guide](markdowns.md) |
| attachments | ConversationView | ConversationView | PASS | 2m 8s | 9 | [guide](attachments.md) |
| editRoom | ConversationView | ConversationView | PASS | 1m 24s | 8 | [guide](editRoom.md) |
| membersRoom | ConversationView | ConversationView | PASS | 1m 57s | 11 | [guide](membersRoom.md) |
| ConversationList | Conversation-List | Conversation-List-settings | PASS | 1m 9s | 15 | [guide](ConversationList.md) |

## Failures

- **CreateRoom**: element ("~createRoomButton") still not displayed after 20000ms
- **ComposerTypeahead**: Visible control with source label ":grinning_face:" did not appear
