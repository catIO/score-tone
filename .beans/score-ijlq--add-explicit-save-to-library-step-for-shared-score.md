---
# score-ijlq
title: Add explicit Save to Library step for shared scores
status: completed
type: feature
priority: normal
created_at: 2026-09-12T09:38:03Z
updated_at: 2026-09-12T09:39:45Z
---

Do not auto-save shared scores opened via links directly to the recipient's library. Keep them in memory preview mode and provide an explicit Save to Library action in the viewer.

## Summary of Changes
- Prevented auto-saving of shared link scores: When opening a score via a share link that is not already in the user library, it now opens in memory-backed preview mode (offline: false) instead of auto-caching to IndexedDB.
- Added explicit Save to Library step:
  - Viewer toolbar displays an amber "+ Save to Library" button when viewing an unsaved shared score, transitioning to an "In Library" checkmark chip once saved.
  - Added a floating bottom pill banner ("Shared score preview • [Save to Library] [✕]") allowing one-tap saving to library or dismissal.
  - Updated storageService.saveFileMetadata to not create entries in db.files for unsaved preview scores during page turns or playback adjustments until explicitly saved.
