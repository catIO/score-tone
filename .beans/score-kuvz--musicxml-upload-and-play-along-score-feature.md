---
# score-kuvz
title: MusicXML upload and play-along score feature
status: completed
type: feature
priority: normal
created_at: 2026-08-16T18:51:27Z
updated_at: 2026-08-16T18:55:41Z
---

Enable users to upload MusicXML files (.xml, .musicxml) and view them with interactive sheet music rendering, Web Audio playback, synchronized cursor, and BPM/volume controls.

- [x] Add MusicXML CDN script in index.html
- [x] Update storageService.ts data model and helpers for MusicXML
- [x] Implement musicXmlService.ts for XML parsing, normalization, and metadata
- [x] Implement audioPlaybackService.ts for Web Audio synth, count-in, and cursor sync
- [x] Create PlaybackWidget.tsx for play-along toolbar controls
- [x] Create MusicXmlViewer.tsx with OSMD integration and visual theming
- [x] Update ViewerToolbar.tsx and ViewerPage.tsx to support MusicXML & playback
- [x] Update LibraryPage.tsx and DriveFileBrowser.tsx to support MusicXML uploads
- [x] Run typecheck, build, and test verification

## Summary of Changes

- Added OpenSheetMusicDisplay (OSMD) integration in `index.html` and created `MusicXmlViewer.tsx` supporting score rendering, zoom, and dynamic theme filter adaptation.
- Implemented `musicXmlService.ts` for sanitizing XML, normalizing polyphonic voices, and extracting musical metadata.
- Built `audioPlaybackService.ts` providing Web Audio polyphonic acoustic synthesis, 1-bar count-in metronome clicks, real-time BPM/volume adjustments, and note-synced cursor callbacks.
- Created `PlaybackWidget.tsx` featuring rewind, play/pause, tempo step buttons (−/+), BPM slider, speed multipliers (0.5x, 0.75x, 1x, 1.25x), volume control, and count-in toggle.
- Updated `ViewerToolbar.tsx` and `ViewerPage.tsx` with play-along controls and keyboard shortcuts (Space for Play/Pause, R for Rewind).
- Updated `LibraryPage.tsx`, `DriveFileBrowser.tsx`, `storageService.ts`, and `App.tsx` to support uploading, storing, and browsing MusicXML files with dedicated badge chips.
