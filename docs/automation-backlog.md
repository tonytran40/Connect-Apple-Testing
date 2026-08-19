# Automation Backlog

The automation expansion in `docs/automation-expansion-spec.md` is implemented. These follow-ups are intentionally deferred.

## Full-Suite Stability

- Retry and verify the Rooms plus menu before waiting for `createRoomButton`. `CreateRoom` passed its earlier flow but failed once under three-lane load because the menu did not open.
- Stabilize emoji typeahead under three-lane load. `ComposerTypeahead` passes alone and in a reused targeted lane, but one full run did not render `:grinning_face:` within the timeout.
- Reach a clean 16/16 split run and regenerate the checked-in browser report.

## List Actions

- Add deterministic two-direction room lookup for non-alphabetical sort modes.
- Select revealed row actions by nearest row Y coordinate instead of global XPath proximity.
- Assert the unread/read state transitions in `markAsRead`, not only the completed taps and screenshots.
- Validate advisory and strict post-suite cleanup modes on a disposable test account.

## Feature Hardening

- Add a strict clipboard-verification mode for `MessageActions`; report unsupported clipboard endpoints as inconclusive instead of silently weakening coverage.
- Record and restore the room's actual initial notification preference if tests later support existing rooms.
- Expand the selector audit beyond centralized selectors to optional hardcoded labels and predicates in test files.
- Align default suite membership across runners, including `notifications` where appropriate.

## Deferred Coverage

- Add `@` mention typeahead only after the environment provides deterministic real users.
- Keep Browse Rooms excluded until requested.
