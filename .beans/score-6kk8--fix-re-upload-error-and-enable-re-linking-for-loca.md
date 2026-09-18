---
# score-6kk8
title: Fix re-upload error and enable re-linking for local MusicXML and PDF files
status: completed
type: bug
priority: normal
created_at: 2026-09-18T12:02:23Z
updated_at: 2026-09-18T12:04:24Z
---

Prevent premature re-upload errors by checking IndexedDB blob cache first, provide accurate format labels (MusicXML/PDF), and allow re-linking local files to existing score records without creating duplicates.

## Implementation Checklist
- [x] Check IndexedDB fileData cache before triggering re-upload error in handleFileClick
- [x] Update error messaging to accurately identify MusicXML vs PDF files
- [x] Implement re-linking in processLocalFile to attach uploaded blob to existing un-cached score
- [x] Add explicit re-link file input and button on un-cached local score cards
- [x] Verify with unit tests and typecheck

## Summary of Changes
- Fixed premature re-upload error in `handleFileClick` by checking IndexedDB blob cache first, allowing scores to auto-recover if their blob is stored.
- Corrected error messaging to specify "MusicXML" instead of hardcoded "PDF" when a file is missing.
- Enhanced `processLocalFile` to detect and reconnect uploaded files to existing un-cached scores matching by name or explicit ID, preserving existing loops, bookmarks, and annotations.
- Added explicit re-link buttons on un-cached local cards in both Grid and List views with dedicated file picker triggers.
- Verified with TypeScript typecheck and Vitest suite.
