---
# score-uoxb
title: MusicXML A-B Loop Playback and Selection
status: completed
type: feature
priority: normal
created_at: 2026-08-16T19:14:37Z
updated_at: 2026-08-16T19:17:46Z
---


- [x] Update audioPlaybackService.ts with A-B loop state, scheduler bounds, and seek
- [x] Update PlaybackWidget.tsx with loop toggle, A/B range controls, and indicators
- [x] Update MusicXmlViewer.tsx with click selection, visual highlight overlay, and cursor loop repositioning
- [x] Update ViewerPage.tsx with L keyboard shortcut
- [x] Verify with typecheck, build, and test suite

## Summary of Changes

- Added A-B practice loop state and scheduler bounds in `audioPlaybackService.ts` with sub-millisecond loop wrap-around.
- Added Loop toggle button and Set [A] / Set [B] / Clear Loop controls in `PlaybackWidget.tsx`.
- Added click seeking and Shift-click A-B range selection in `MusicXmlViewer.tsx` along with floating active loop range badge.
- Added `L` keyboard shortcut in `ViewerPage.tsx` to toggle looping.
