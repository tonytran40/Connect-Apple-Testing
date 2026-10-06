# Scribe-Style Test Documentation

- Run ID: split3-combined
- Source: summary.json
- Status: FAIL
- Started: 2026-10-06T15:46:42.671Z
- Updated: 2026-10-06T15:56:46.162Z
- Passed: 15
- Failed: 2
- Skipped: 0
- Blocked: 0
- Inconclusive: 0
- Total tests: 17

## Phase Timings

| Phase | Aggregate Duration |
| --- | --- |
| Session creation | 31s |
| Login/readiness | 5m 46s |
| Test body | 18m 16s |
| Screenshot capture | 20s |
| Recovery | 706ms |
| Report generation | 712ms |
| Room creation (test-owned) | 1m 9s |

## Tests

| Test | Category | Physical Lane | Status | Duration | Screenshots | Guide |
| --- | --- | --- | --- | --- | --- | --- |
| CreateRoom | main-suite | main-suite | PASS | 1m 17s | 5 | [guide](CreateRoom.md) |
| PinnedMessageEditFlow | ConversationView | main-suite | PASS | 1m 21s | 4 | [guide](PinnedMessageEditFlow.md) |
| markdowns | ConversationView | main-suite | PASS | 2m 14s | 11 | [guide](markdowns.md) |
| ComposerTypeahead | ConversationView | main-suite | PASS | 1m 4s | 3 | [guide](ComposerTypeahead.md) |
| MessageActions | ConversationView | main-suite | PASS | 57s | 5 | [guide](MessageActions.md) |
| newMessage | main-suite | main-suite | PASS | 38s | 4 | [guide](newMessage.md) |
| favoriteRoom | Conversation-List | Conversation-List | PASS | 1m 4s | 4 | [guide](favoriteRoom.md) |
| markAsRead | Conversation-List | Conversation-List | PASS | 59s | 4 | [guide](markAsRead.md) |
| removeRoom | Conversation-List | Conversation-List | PASS | 53s | 4 | [guide](removeRoom.md) |
| Reactions | ConversationView | Conversation-List | PASS | 1m 46s | 13 | [guide](Reactions.md) |
| editRoom | ConversationView | Conversation-List | PASS | 1m 9s | 8 | [guide](editRoom.md) |
| RoomNotificationPreferences | ConversationView | Conversation-List | PASS | 1m 23s | 5 | [guide](RoomNotificationPreferences.md) |
| LinkPreviews | ConversationView | ConversationView | PASS | 56s | 7 | [guide](LinkPreviews.md) |
| attachments | ConversationView | ConversationView | FAIL | 2m 9s | 10 | [guide](attachments.md) |
| membersRoom | ConversationView | ConversationView | FAIL | 2m 4s | 4 | [guide](membersRoom.md) |
| ConversationSearch | ConversationView | ConversationView | PASS | 2m 18s | 8 | [guide](ConversationSearch.md) |
| ConversationList | Conversation-List | Conversation-List-settings | PASS | 1m 38s | 15 | [guide](ConversationList.md) |

## Failures

- **attachments**: attachments: Files picker item "Connect iOS" did not appear
- **membersRoom**: membersRoom: Add Individuals field did not appear
