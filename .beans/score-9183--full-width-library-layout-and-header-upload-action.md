---
# score-9183
title: Full-Width Library Layout and Header Upload Actions
status: completed
type: feature
priority: normal
created_at: 2026-09-06T20:41:35Z
updated_at: 2026-09-06T20:42:21Z
---

Redesign LibraryPage layout:
- [x] Move upload action and Google Drive button to library header action bar
- [x] Make library list full-width with responsive score cards
- [x] Add whole-page drag-and-drop overlay for dropping scores
- [x] Show prominent centered drop-zone only when library is empty
- [x] Verify non-browser validation

## Summary of Changes
- Converted LibraryPage from rigid 2-column layout (with 280px static upload box) to a full-width library view.
- Added '+ Add Score' and 'Google Drive' buttons to the library header action bar.
- Implemented full-window drag-and-drop with glowing drop overlay.
- Added centered onboarding drop-zone displayed only when library has 0 scores.
