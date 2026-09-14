---
# score-ceyb
title: Fix MusicXML black screen by decoupling OSMD DOM from React annotation overlay
status: completed
type: bug
priority: high
created_at: 2026-09-14T17:27:38Z
updated_at: 2026-09-14T17:33:53Z
---

Decouple OSMD canvas container from React annotation overlays to prevent innerHTML clearing from unmounting React children and crashing the viewer.

## Summary of Changes
- Decoupled OSMD canvas container (`containerRef`) from React annotation overlay elements.
- Created an outer wrapper (`wrapperRef`) that hosts the OSMD container and renders the annotation canvas overlays as absolute sibling elements rather than direct children of the OSMD node.
- Prevented `containerRef.current.innerHTML = ''` from destroying React virtual DOM nodes, eliminating the DOM reconciliation crash (`removeChild` error) that caused the black screen.
- Updated `updatePageBounds` with equality checking to avoid redundant state updates and re-renders during resize observation.
