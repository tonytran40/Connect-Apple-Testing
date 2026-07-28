# Scribe-Style Test Documentation

- Run ID: split3-combined
- Source: combined summary.md
- Status: FAIL
- Started: 2026-07-28T13:06:15.342Z
- Updated: 2026-07-28T13:40:51.026Z
- Passed: 10
- Failed: 2
- Total tests: 12

## Tests

| Test | Lane | Status | Duration | Screenshots | Guide |
| --- | --- | --- | --- | --- | --- |
| CreateRoom | main-suite | PASS | 58s | 5 | [guide](CreateRoom.md) |
| newMessage | main-suite | PASS | 44s | 4 | [guide](newMessage.md) |
| ConversationList | Conversation-List | PASS | 1m 6s | 15 | [guide](ConversationList.md) |
| favoriteRoom | Conversation-List | FAIL | 52s | 1 | [guide](favoriteRoom.md) |
| markAsRead | Conversation-List | PASS | 23s | 4 | [guide](markAsRead.md) |
| notifications | Conversation-List | FAIL | 40s | 4 | [guide](notifications.md) |
| removeRoom | Conversation-List | PASS | 22s | 4 | [guide](removeRoom.md) |
| PinnedMessageEditFlow | ConversationView | PASS | 1m 14s | 4 | [guide](PinnedMessageEditFlow.md) |
| markdowns | ConversationView | PASS | 2m 6s | 11 | [guide](markdowns.md) |
| attachments | ConversationView | PASS | 1m 20s | 9 | [guide](attachments.md) |
| editRoom | ConversationView | PASS | 46s | 8 | [guide](editRoom.md) |
| membersRoom | ConversationView | PASS | 1m 0s | 11 | [guide](membersRoom.md) |

## Failures

- **favoriteRoom**: Room "Favorite Room" was not found after 30000ms. Create the room or set FAVORITE_ROOM_NAME. Increase FAVORITE_ROOM_MAX_SCROLLS if it is below the fold.
- **notifications**: notifications: expected in-app UI after tapping notification within 15000ms
