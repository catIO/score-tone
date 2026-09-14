---
# score-k7h0
title: Freehand annotations tool with local persistence and cloud-ready data model
status: completed
type: feature
priority: normal
created_at: 2026-09-14T14:56:44Z
updated_at: 2026-09-14T17:00:30Z
---

Add freehand annotation capabilities (Pen, Highlighter, Eraser) with size and color palette controls, canvas overlays for PDF and MusicXML pages, vector-normalized stroke coordinates, IndexedDB storage, and Supabase cloud sync-ready schema.


## Implementation Checklist
- [x] Design cloud-ready annotation types & Dexie IndexedDB table
- [x] Create annotationService with local persistence and Supabase sync stubs
- [x] Implement useAnnotationState hook with undo/redo and tool settings
- [x] Create PageAnnotationCanvas overlay component with normalized coordinates
- [x] Build AnnotationDrawer panel matching reference UI (tools, sizes, 20-color palette)
- [x] Add Annotation mode toggle to toolbar and side rail
- [x] Integrate canvas overlay into PdfPageCanvas and MusicXmlViewer
- [x] Verify build, typecheck, and non-browser validation

## Summary of Changes
- Added PageAnnotationRecord, AnnotationStroke, and StrokePoint interfaces in storageService.ts with Dexie version 2 schema migration.
- Built annotationService.ts with debounced IndexedDB persistence and cloud sync stubs for Supabase integration.
- Implemented useAnnotationState hook for pen, highlighter, eraser, 5 size presets, 20-color palette, and per-page undo/redo stacks.
- Created PageAnnotationCanvas.tsx with normalized vector coordinates (0..1), quadratic Bézier curve smoothing, highlighter multiply blending, and stroke hit-testing for the eraser.
- Created AnnotationDrawer.tsx matching the user screenshot layout with tool selector, size presets, 4x5 color grid, and history controls.
- Integrated annotation overlays into PdfPageCanvas, PdfViewer, and MusicXmlViewer.
- Added annotation toggle buttons to ViewerToolbar and ViewerSideRail.
