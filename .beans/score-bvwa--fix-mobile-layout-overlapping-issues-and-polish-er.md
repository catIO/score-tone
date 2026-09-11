---
# score-bvwa
title: Fix mobile layout overlapping issues and polish error snackbar
status: completed
type: bug
priority: normal
created_at: 2026-09-11T20:59:58Z
updated_at: 2026-09-11T21:01:50Z
---

Fix CSS specificity conflict causing Add Score button to show on mobile, redesign translucent error banner into a solid Material 3 snackbar anchored at bottom, and improve mobile spacing and header navigation.

## Summary of Changes
- **Fixed CSS specificity bug**: Wrapped custom MD3 component classes (.md-btn-*, .md-card, .md-segmented-pill*, .md-filter-chip) inside @layer components in src/index.css so Tailwind utility classes like hidden and sm:inline-flex take precedence, ensuring the desktop 'Add Score' button properly hides on mobile rather than crowding the top header.
- **Redesigned error notification**: Replaced the 10% opacity translucent absolute top banner in src/App.tsx with a solid Material 3 floating snackbar anchored cleanly at the bottom (fixed bottom-6 inset-x-4 sm:inset-x-auto sm:right-6 sm:w-[440px]) with high-contrast background, clear typography, proper shadow, close button (X), and dismiss action.
- **Mobile header and search polish**: Made the 'All Scores' tab label responsive ('All' on mobile), added an 'Add Score' shortcut to the profile dropdown menu for mobile devices, hid desktop keyboard shortcut badge on mobile, and improved padding/wrapping on the empty library hero card.
