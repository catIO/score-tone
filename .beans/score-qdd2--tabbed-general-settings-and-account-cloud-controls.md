---
# score-qdd2
title: Tabbed general settings and account cloud controls
status: completed
type: feature
created_at: 2026-09-17T16:19:22Z
updated_at: 2026-09-17T16:19:22Z
---

Move settings out of mixed account dropdown into General and Account & cloud tabs. Reuse persisted viewer preferences, clarify remembered vs active Drive connection, preserve cloud import and local offline actions, accessible keyboard/focus handling, non-browser tests and documentation.

## Follow-up: Add Score source chooser

- [x] Add the same accessible device/Google Drive source chooser to desktop and mobile Add Score, with truthful connection/availability guidance and synchronous picker handoff.
- [x] Cover modal accessibility, source actions, live cloud states, and unchanged direct Settings imports; document Add Score.
- [x] Run tests, typecheck, build, and editor diagnostics; complete parent review.

## Summary of Changes

- Added General and Account & cloud settings with shared persisted viewer preferences and clear remembered-account/active-connection status.
- Added the full device/Drive source chooser and plus icon for Add Score. The separate down-arrow opens exactly two direct-import list items; the main button retains the modal.
- Added keyboard navigation, focus restoration, outside/Escape dismissal, cloud availability checks and regression tests. Direct device imports remain available offline.
- Final verification: 183 tests passed; typecheck, production build and whitespace checks passed. Build retains a chunk-size warning. No browser verification or commits performed.
