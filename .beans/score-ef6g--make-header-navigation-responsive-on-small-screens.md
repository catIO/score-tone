---
# score-ef6g
title: Make header navigation responsive on small screens and fix no-scrollbar
status: completed
type: bug
priority: normal
created_at: 2026-09-11T21:12:36Z
updated_at: 2026-09-11T21:13:38Z
---

Separate segmented navigation into dedicated sub-row on small/tablet screens (< md) so tabs are not squished or cut off, and implement missing no-scrollbar CSS utility.

## Summary of Changes
- **Responsive 2-tier header on mobile/tablet (< md)**: Moved the segmented navigation pill into a dedicated full-width sub-row on screens under 768px (), while keeping it seamlessly integrated in the center of the top bar on desktop (). This eliminates the squishing and clipping where the pill was confined to a narrow flex space between the brand lockup and the account menu.
- **Implemented .no-scrollbar utility**: Added missing  CSS rules in  ( for WebKit scrollbars and ), completely removing the horizontal scrollbar line underneath the pill.
- **Enhanced tab responsiveness**: Added  to segmented pill buttons and balanced header height ( on mobile,  on desktop).

## Summary of Changes
- Responsive 2-tier header on mobile/tablet (< md): Moved the segmented navigation pill into a dedicated full-width sub-row on screens under 768px, while keeping it seamlessly integrated in the center of the top bar on desktop. This eliminates the squishing and clipping where the pill was confined to a narrow flex space between the brand lockup and the account menu.
- Implemented .no-scrollbar utility: Added missing .no-scrollbar CSS rules in src/index.css (display: none for WebKit scrollbars and scrollbar-width: none), completely removing the horizontal scrollbar line underneath the pill.
- Enhanced tab responsiveness: Added shrink-0 to segmented pill buttons and balanced header height (h-14 on mobile, 68px on desktop).
