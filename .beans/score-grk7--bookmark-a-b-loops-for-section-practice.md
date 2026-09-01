---
# score-grk7
title: Bookmark A-B loops for section practice
status: completed
type: feature
priority: normal
created_at: 2026-09-01T12:23:29Z
updated_at: 2026-09-01T12:27:35Z
---

Allow users to bookmark and name loop sections, manage them in the Bookmarks panel, and jump/activate practice sections directly from the viewer and library

## Summary of Changes
- Extended `Bookmark` interface in `storageService.ts` to support `type: 'loop'`, `loopRange: LoopRange`, and `bpm`.
- Added `applyLoopRange` to `AudioPlaybackService` to activate loops, seek to start beats, and restore tempo presets.
- Enhanced `BookmarksPanel.tsx` with active loop detection, dedicated loop bookmark creation, filtering tabs (All/Loops/Pages), measure range badges, quick loop activation play button, and shareable loop deep-links.
- Added 1-click Bookmark Loop button to `PlaybackWidget.tsx` when a loop range is active, plus `b`/`B` keyboard shortcut to toggle bookmarks.
- Integrated loop bookmark chips into `LibraryPage.tsx` with repeat badge styling, launching directly into loop practice sessions.
- Added URL deep-link parameter handling in `App.tsx` and `ViewerPage.tsx` (`loopStartBeat`, `loopEndBeat`, `loopStartM`, `loopEndM`, `bpm`).
