---
# score-65n6
title: Edit saved loops with overflow menu for delete and share
status: completed
type: feature
priority: normal
created_at: 2026-09-19T09:36:54Z
updated_at: 2026-09-19T09:40:39Z
---

Support editing existing loops (changing BPM, in/out points, and name). Move delete and share actions into an overflow menu.

## Todo
- [x] Implement overflow menu (Delete and Share) for bookmark items
- [x] Implement loop editing UI (BPM, in and out measures/beats, name, quick-set from active loop)
- [x] Connect bookmark update flow across BookmarksPanel, ViewerPage, and storageService
- [x] Write unit tests for loop editing and overflow actions in BookmarksPanel
- [x] Verify with typecheck, build, and tests

## Summary of Changes
- Added overflow menu (`MoreVertical`) to saved practice sections and bookmarks, consolidating Share Link and Delete actions.
- Implemented inline loop editor supporting:
  - Editing BPM with numerical input, steppers (-5, -1, +1, +5), and quick "Use score BPM" button.
  - Editing IN and OUT points (measures and beat calculation) with plus/minus steppers.
  - Quick-capture "Use active selection" button to grab score playback range and tempo.
  - Editing label/name with automatic sync when using default measure patterns.
  - Live "Preview" playback button to audition the modified loop range.
- Added `onUpdateBookmark` flow in `ViewerPage` saving to metadata and updating live playback if the edited loop is currently active.
- Added `getBeatRangeForMeasures` and `getTotalMeasures` helpers in `audioPlaybackService`.
- Added unit test suite in `BookmarksPanel.test.tsx` (8 passed) and verified with `npm run typecheck` and `npm run build`.
