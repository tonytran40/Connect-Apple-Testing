# Scribe-Style Test Documentation

- Run ID: split3-combined
- Source: summary.json
- Status: FAIL
- Started: 2026-08-19T15:25:40.421Z
- Updated: 2026-08-19T15:32:38.708Z
- Passed: 15
- Failed: 1
- Total tests: 16

## Phase Timings

| Phase | Aggregate Duration |
| --- | --- |
| Session creation | 18s |
| Login/readiness | 3m 20s |
| Test body | 11m 41s |
| Screenshot capture | 18s |
| Recovery | 21s |
| Report generation | 420ms |
| Room creation (test-owned) | 21s |

## Tests

| Test | Category | Physical Lane | Status | Duration | Screenshots | Guide |
| --- | --- | --- | --- | --- | --- | --- |
| CreateRoom | main-suite | main-suite | PASS | 55s | 5 | [guide](CreateRoom.md) |
| PinnedMessageEditFlow | ConversationView | main-suite | PASS | 1m 17s | 4 | [guide](PinnedMessageEditFlow.md) |
| Reactions | ConversationView | main-suite | PASS | 1m 7s | 13 | [guide](Reactions.md) |
| newMessage | main-suite | main-suite | PASS | 47s | 4 | [guide](newMessage.md) |
| favoriteRoom | Conversation-List | Conversation-List | PASS | 46s | 4 | [guide](favoriteRoom.md) |
| markAsRead | Conversation-List | Conversation-List | PASS | 38s | 4 | [guide](markAsRead.md) |
| notifications | Conversation-List | Conversation-List | PASS | 17s | 4 | [guide](notifications.md) |
| removeRoom | Conversation-List | Conversation-List | PASS | 37s | 4 | [guide](removeRoom.md) |
| ComposerTypeahead | ConversationView | Conversation-List | FAIL | 44s | 2 | [guide](ComposerTypeahead.md) |
| MessageActions | ConversationView | Conversation-List | PASS | 37s | 5 | [guide](MessageActions.md) |
| RoomNotificationPreferences | ConversationView | Conversation-List | PASS | 1m 8s | 5 | [guide](RoomNotificationPreferences.md) |
| markdowns | ConversationView | ConversationView | PASS | 1m 32s | 11 | [guide](markdowns.md) |
| attachments | ConversationView | ConversationView | PASS | 1m 21s | 9 | [guide](attachments.md) |
| editRoom | ConversationView | ConversationView | PASS | 49s | 8 | [guide](editRoom.md) |
| membersRoom | ConversationView | ConversationView | PASS | 1m 6s | 11 | [guide](membersRoom.md) |
| ConversationList | Conversation-List | Conversation-List-settings | PASS | 1m 10s | 15 | [guide](ConversationList.md) |

## Failures

- **ComposerTypeahead**: Visible control with source label ":grinning_face:" did not appear
