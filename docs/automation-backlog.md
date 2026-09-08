# Automation Backlog

The active release-evidence work is defined in
`docs/release-evidence-upgrade-spec.md`. Keep only externally blocked or
simulator-backed follow-ups here; completed feature modules belong in the test
manifest instead of this list.

## Full-Suite Stability

- Stabilize emoji typeahead under three-lane load. `ComposerTypeahead` passes alone and in a reused targeted lane, but one full run did not render `:grinning_face:` within the timeout.
- Reach a clean required-suite split run on QA and regenerate the shared browser report with exact Connect build metadata.

## List Actions

- Add deterministic two-direction room lookup for non-alphabetical sort modes.
- Select revealed row actions by nearest row Y coordinate instead of global XPath proximity.
- Validate advisory and strict post-suite cleanup modes on a disposable test account.

## Feature Hardening

- Record and restore the room's actual initial notification preference if tests later support existing rooms.
- Expand the selector audit beyond centralized selectors to optional hardcoded labels and predicates in test files.
- Validate the central test manifest against a simulator-backed QA run whenever a new required test is added.

## Deferred Coverage

- Add `@` mention typeahead only after the environment provides deterministic real users.
- Notification deep links require a deterministic QA room ID and matching `room_id` push payload.
- Attachment download/cancel requires a controlled slow media endpoint.
- Offline retry requires lane-scoped network fault injection that cannot disrupt the other two simulators.
- Share-extension coverage requires a host fixture app and deterministic app-group state.
