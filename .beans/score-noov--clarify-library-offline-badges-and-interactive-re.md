---
# score-noov
title: Clarify library offline badges and interactive re-auth for Google Drive files
status: completed
type: bug
priority: high
created_at: 2026-09-01T12:38:12Z
updated_at: 2026-09-01T12:45:13Z
---

Fix confusing Online/Offline badges in LibraryPage and allow interactive re-auth when downloading uncached Google Drive files that return 403

## Summary of Changes
- Clarified library and viewer cache status badges: replaced ambiguous 'Offline' and 'Online' chips with 'Saved Offline' (green with checkmark) and 'Cloud Only' (amber with cloud icon), complete with helpful tooltips.
- Added interactive OAuth re-authentication fallback in LibraryPage when clicking uncached Google Drive scores or toggling offline cache, preventing HTTP 403 failures when tokens expire.

- Swapped action button icon for downloaded Google Drive files to `CloudOff` with tooltip 'Remove offline copy (keep in cloud)', and only show `Download` icon for uncached cloud scores.


- Holistically updated badge logic: local files (which are always on-device) no longer show any redundant 'Saved Offline' badges or toolbar buttons. Only Google Drive files display 'Saved Offline' / 'Cloud Only' indicators.
- Fixed vertical alignment across library cards by aligning right-side badges and action buttons to the top header line.
- Fixed duplicate measure range labels on practice loop bookmark chips.
