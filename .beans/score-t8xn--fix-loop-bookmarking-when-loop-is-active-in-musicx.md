---
# score-t8xn
title: Fix loop bookmarking when loop is active in MusicXML viewer
status: completed
type: bug
priority: normal
created_at: 2026-09-08T10:15:09Z
updated_at: 2026-09-08T10:17:57Z
---

Restore and enhance ability to bookmark active loops in BookmarksPanel and ViewerToolbar when a loop is active.

Todo:
- [x] Connect onAddLoopBookmark in BookmarksPanel and restore Active Loop card
- [x] Handle already-bookmarked active loop state in BookmarksPanel
- [x] Add 1-click active loop bookmarking in ViewerToolbar
- [x] Verify non-browser tests and type checks

## Summary of Changes
- Connected `onAddLoopBookmark` in `BookmarksPanel.tsx` and restored the Active Loop card with support for 1-click quick adding, custom naming, and measure range badge.
- Added visual state in `BookmarksPanel.tsx` when the active loop is already bookmarked, allowing 1-click removal.
- Added a 1-click `Bookmark Loop` / `Loop Saved` toggle button directly in `ViewerToolbar.tsx` beside the playback controls whenever a loop is active.
- Integrated loop bookmark indicator into `ViewerSideRail.tsx` and score viewport ribbon in `ViewerPage.tsx`.
- Validated with TypeScript typecheck and full production build.
