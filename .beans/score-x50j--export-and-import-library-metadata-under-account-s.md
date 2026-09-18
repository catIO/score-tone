---
# score-x50j
title: Export and import library metadata under Account settings
status: completed
type: feature
priority: normal
created_at: 2026-09-18T11:27:22Z
updated_at: 2026-09-18T11:35:33Z
---

Allow users to export and import library metadata (loops, bookmarks, annotations, custom presets, viewer preferences) as a JSON backup under Account & Cloud settings.

## Implementation Checklist
- [x] Create backupService.ts with export, import, validation, and merge logic
- [x] Create backupService.test.ts testing export, validation, and merge operations
- [x] Add Data Backup & Transfer section to AppSettingsDialog under Account & cloud tab
- [x] Wire up callbacks and library refresh in HeaderBar and LibraryPage
- [x] Update AppSettingsDialog tests for export/import UI and accessibility
- [x] Run typecheck and test suite to verify implementation

## Summary of Changes
- Created `backupService.ts` with `exportLibraryBackup`, `importLibraryBackup`, `validateBackupPackage`, `parseBackupFile`, and `triggerBackupDownload`.
- Implemented non-destructive merge logic for scores (deduplicating loop and page bookmarks, preserving device offline blob state) and annotations (merging vector strokes by ID per page).
- Added "Library Data & Backup" section inside `AppSettingsDialog.tsx` under the Account & cloud tab with accessible status notifications, error alerts, and busy states.
- Hooked up export and import handlers in `HeaderBar.tsx` and `LibraryPage.tsx`, reloading the library on successful import.
- Added comprehensive unit tests in `backupService.test.ts` and `AppSettingsDialog.test.tsx`. Verified with TypeScript typecheck and Vitest test suite.
