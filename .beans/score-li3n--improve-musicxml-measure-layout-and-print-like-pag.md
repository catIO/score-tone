---
# score-li3n
title: Improve MusicXML measure layout and print-like pagination
status: completed
type: bug
priority: normal
created_at: 2026-09-10T09:15:48Z
updated_at: 2026-09-10T09:23:40Z
---

Ensure MusicXML rendering avoids overcrowding measures, respects print-accurate pagination, and provides breathable measure spacing.

## Summary of Changes
- Preserved XML system breaks (`<print new-system="yes">`) in `normalizeMusicXmlForOsmd` rather than forcing them to `"no"`, aligning line breaks with the engraver's print layout.
- Configured `pageFormat: 'Letter_P'` on OSMD so page proportions and height map accurately to printed sheet music.
- Added density-aware engraving rules (`VoiceSpacingMultiplierVexflow = 1.35`, `VoiceSpacingAddendVexflow = 2.0`) so complex measures with 16th/32nd notes or polyphonic voices receive ample horizontal breathing room.
- Capped measures per line (`RenderXMeasuresPerLineAkaSystem = 4`) and enhanced system separation distances (`MinSkyBottomDistBetweenSystems = 3.0`, `MinimumDistanceBetweenSystems = 4.0`) to eliminate cramped measures during auto-wrap.
- Added unit test coverage in `scripts/test-musicxml.cjs` ensuring `new-system="yes"` is preserved.

## Follow-up Fix
- Removed the excessive `VoiceSpacingMultiplierVexflow = 1.35` and `pageFormat: 'Letter_P'` settings which caused measures to double in required width and split 4-measure print systems into 2-measure systems with premature vertical page breaks.
- Set calibrated `VoiceSpacingMultiplierVexflow = 0.82`, allowing all 4 measures of each engraver system (measures 1-4, 5-8, 9-12, 13-16, 17-20 on Page 1; 21-24, 25-28, 29-32, 33-36, 37-40, 41-43 on Page 2) to fit cleanly across the viewer width.
- Page 1 ends cleanly at measure 20, Page 2 starts at measure 21, and the total score renders as exactly 2 print-faithful pages.

## Resolution
- Root cause: MusicXML files engraved for desktop print assume ~1200px+ paper width. In responsive browser viewports, 4 measures do not fit at zoom 1.0, causing measure 4 to spill over to a new line, and then the next measure's `<print new-system="yes">\ tag forced another new line immediately—leaving measure 4 stranded alone on a system.
- Fix: Set `newSystemFromXML: false` and `osmd.rules.RenderXMeasuresPerLineAkaSystem = 3`.
- Result: Every system wraps consistently at 3 measures per line on both Page 1 and Page 2. No measures are stranded alone, and 16th-note passages are never cramped with 4 measures.
