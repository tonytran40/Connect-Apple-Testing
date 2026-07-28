# Scribe-Style Test Documentation

- Run ID: split3-combined
- Source: combined summary.md
- Status: FAIL
- Started: 2026-07-28T13:56:27.130Z
- Updated: 2026-07-28T15:47:33.636Z
- Passed: 11
- Failed: 1
- Total tests: 12

## Tests

| Test | Lane | Status | Duration | Screenshots | Guide |
| --- | --- | --- | --- | --- | --- |
| CreateRoom | main-suite | PASS | 1m 6s | 5 | [guide](CreateRoom.md) |
| newMessage | main-suite | PASS | 36s | 4 | [guide](newMessage.md) |
| ConversationList | Conversation-List | PASS | 1m 1s | 15 | [guide](ConversationList.md) |
| favoriteRoom | Conversation-List | PASS | 18s | 4 | [guide](favoriteRoom.md) |
| markAsRead | Conversation-List | PASS | 17s | 4 | [guide](markAsRead.md) |
| notifications | Conversation-List | FAIL | 32s | 4 | [guide](notifications.md) |
| removeRoom | Conversation-List | PASS | 15s | 4 | [guide](removeRoom.md) |
| PinnedMessageEditFlow | ConversationView | PASS | 1m 7s | 4 | [guide](PinnedMessageEditFlow.md) |
| markdowns | ConversationView | PASS | 1m 27s | 11 | [guide](markdowns.md) |
| attachments | ConversationView | PASS | 1m 19s | 9 | [guide](attachments.md) |
| editRoom | ConversationView | PASS | 53s | 8 | [guide](editRoom.md) |
| membersRoom | ConversationView | PASS | 1m 4s | 11 | [guide](membersRoom.md) |

## Failures

- **notifications**: notifications: expected in-app UI after tapping notification within 15000ms
