---
# score-3kh3
title: Remove bookmarks as primary library filter and card ribbon
status: completed
type: task
priority: normal
created_at: 2026-09-11T14:25:38Z
updated_at: 2026-09-11T14:27:25Z
---

Bookmarks belong within a piece (pages/measures), not at the whole-piece library level. Remove bookmarks from primary nav tabs, library filter chips, sorting, and remove card bookmark ribbons.

## Summary of Changes

- Removed 'Bookmarked' from primary navigation tabs and NavTab type in HeaderBar.
- Replaced bookmarks count in HeaderBar profile stats widget with Drive/Cloud count.
- Removed 'With Bookmarks' and 'Practice Loops' from primary library filter chips; replaced with 'Recently Practiced'.
- Removed 'Bookmarks' from sort options (pieces are sorted by Recent, Title A–Z, or Size).
- Removed golden bookmark ribbon from library grid cards and list rows, as whole pieces are not bookmarks.
- Cleaned grid card subtitle to display file size and last opened date rather than bookmark count.
- Cleaned unused card-bookmark-ribbon styles from index.css.
