---
# score-1p8v
title: Track in-a-row loop repetitions and display count in place of repeat icon
status: completed
type: feature
priority: normal
created_at: 2026-09-19T11:52:13Z
updated_at: 2026-09-19T13:16:37Z
---

Track consecutive loop repetitions in audioPlaybackService and display the repetition count in place of the repeat icon across the player widget, score active loop pill, and loop bookmarks. Resets on manual restart or seek.

## Todo
- [x] Add loopRepetitions to PlaybackState and AudioPlaybackService
- [x] Increment repetition count when a loop finishes (after countdown if pause enabled, or immediately if 0s pause)
- [x] Reset repetition count on manual restart actions (seek, rewind, stop, loop range change, toggle loop)
- [x] Update PlaybackWidget to render repetition count in place of repeat icon
- [x] Update ViewerPage active loop banner to render repetition count in place of repeat icon
- [x] Update BookmarksPanel to render repetition count on the active loop
- [x] Write unit tests for repetition counting, countdown integration, and reset behavior
- [x] Verify with tests, typecheck, and build
