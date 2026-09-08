# RoomNotificationPreferences

- Status: FAIL
- Duration: 1m 10s
- Lane: Conversation-List
- Logical category: ConversationView
- Device: iPhone 17 Pro Max
- Appium port: 4725
- Started: 2026-09-01T18:57:44.845Z
- Finished: 2026-09-01T18:58:54.428Z

## Failure

```text
element ("~notificationPreferencesButton") still not displayed after 20000ms
```

## Phase Timings

| Phase | Duration |
| --- | --- |
| Session creation | 0ms |
| Login/readiness | 10s |
| Test body | 59s |
| Screenshot capture | 675ms |
| Recovery | 15s |
| Report generation | 0ms |

## Steps

### Step 1: Room Opened

![Room Opened](assets/Conversation-List/RoomNotificationPreferences/01_room_opened.png)

### Step 2: Preferences Open

![Preferences Open](assets/Conversation-List/RoomNotificationPreferences/02_preferences_open.png)

### Step 3: Preference Selected

![Preference Selected](assets/Conversation-List/RoomNotificationPreferences/03_preference_selected.png)

### Step 4: Restore Persisted

![Restore Persisted](assets/Conversation-List/RoomNotificationPreferences/05_restore_persisted.png)

### Step 5: ERROR - Failed here

![ERROR](assets/Conversation-List/RoomNotificationPreferences/ERROR.png)

**Failure at this step:**

```text
element ("~notificationPreferencesButton") still not displayed after 20000ms
```
