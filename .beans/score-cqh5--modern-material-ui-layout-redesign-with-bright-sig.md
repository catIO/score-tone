---
# score-cqh5
title: Modern Material UI layout redesign with Bright Sight menu and light/dark mode
status: completed
type: feature
priority: normal
created_at: 2026-09-11T13:56:48Z
updated_at: 2026-09-11T14:06:11Z
---

Redesign layout and UI with modern Material Design 3 patterns inspired by Bright Sight: top navigation menu, user pill/menu, responsive surface adaptivity, bookmark ribbon styling, and dark/light theme support with dark as default.

## Summary of Changes
- Integrated Material Design 3 theme tokens in index.css supporting Dark mode (default) and Light mode via [data-theme='light'] attribute.
- Created HeaderBar.tsx with brand lockup, segmented navigation pill menu ([All Scores | PDFs | MusicXML | Drive | Bookmarked]), theme toggle button, and [CA] Catherina avatar dropdown menu.
- Redesigned LibraryPage sub-header matching Bright Sight's layout: dynamic section title with count, sort dropdown pill, view mode toggle (grid/list), and Material filter chips.
- Enhanced cards in grid view with Bright Sight inspired golden bookmark ribbon in top-right corner, theme-adaptive surfaces, and touch targets.
- Enhanced list view with Material 3 cards, bookmark ribbons, and theme-adaptive text.
- Added theme persistence in settingsService and synced data-theme on root HTML element.
