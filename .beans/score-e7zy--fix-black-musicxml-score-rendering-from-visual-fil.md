---
# score-e7zy
title: Fix black MusicXML score rendering from visual filters
status: completed
type: bug
priority: high
created_at: 2026-09-16T10:28:43Z
updated_at: 2026-09-16T10:30:12Z
---

Resolve issue where MusicXML scores render with a solid black page background after display filters were scoped to the score.

## Summary of Changes
- Fixed MusicXML rendering solid black by introducing `getScorePageBackgroundColor(filters)`, which guarantees paper background is white (`#ffffff`) whenever dark colors (`#1e1e24`, `#121212`) or invert (Night Mode) are active.
- Corrected default `SEPIA_FILTERS.backgroundColor` in `settingsService.ts` from legacy viewer background `#1e1e24` to `#ffffff`.
- Added automatic migration in `settingsService.getSettings()` to sanitize legacy cached `#1e1e24` and `#121212` values in stored custom sliders.
- Applied `getScorePageBackgroundColor` across `MusicXmlViewer.tsx` (OSMD initialization, rendered SVGs, zoom re-renders, and dynamic style properties) and `PdfPageCanvas.tsx`.
- Guarded `buildTintStyle` against inverted Night Mode and removed premature fallback tint overlay in `MusicXmlViewer.tsx`.
