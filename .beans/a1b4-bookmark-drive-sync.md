---
id: a1b4
title: Identify root cause of bookmarks disappearing when re-opening file from Google Drive
status: completed
type: bug
priority: high
tags: [bookmarks, google-drive]
created_at: 2026-07-21T17:50:00Z
updated_at: 2026-07-21T17:56:00Z
---

## Root Cause Analysis

1. **`importSharedScore` in `App.tsx` (Lines 169-180)**:
   When re-opening a Google Drive score that is not cached offline (`cachedBlob` is null), `importSharedScore` creates a new `ScoreFile` object without preserving existing `bookmarks` or `lastPage` from IndexedDB, then calls `storageService.saveFileMetadata(newFile)`, completely overwriting the entry in IndexedDB.

2. **`handleDriveFileSelected` in `LibraryPage.tsx` (Lines 149-165)**:
   When selecting a file via Google Drive Picker, `LibraryPage` uses `existing` from its local React state `files`. If `files` state was loaded on mount prior to adding bookmarks, saving `existing` back to IndexedDB overwrites the database entry with stale state missing the new bookmarks.

3. **`syncMetadata` in `ViewerPage.tsx` (Lines 125-152)**:
   `syncMetadata` closure captures the initial `file` object on component mount. If Google Drive metadata sync resolves after bookmarks are added, `saveFileMetadata(updatedFile)` overwrites IndexedDB using the stale `file` reference.

4. **Dexie `db.files.put(file)` behavior in `storageService.ts`**:
   `saveFileMetadata` performs a full Dexie `put` replacement rather than a property-preserving merge. Any `ScoreFile` payload missing `bookmarks` deletes existing bookmarks.

5. **Local-only persistence**:
   Bookmarks are stored exclusively in local IndexedDB and are not synced to Google Drive file metadata (`appProperties`). Opening the file on another browser/device results in empty bookmarks.

## Summary of Changes

- **[storageService.ts](file:///Users/catherina/Documents/apps/score/src/services/storageService.ts)**: Updated `saveFileMetadata` to merge with existing DB record so `bookmarks` and `lastPage` are never erased by partial metadata updates.
- **[App.tsx](file:///Users/catherina/Documents/apps/score/src/App.tsx)**: Preserved existing `bookmarks` and `lastPage` in `importSharedScore` when opening or re-downloading Drive scores.
- **[LibraryPage.tsx](file:///Users/catherina/Documents/apps/score/src/components/LibraryPage.tsx)**: Re-fetched fresh file metadata from `storageService.getFiles()` in `handleDriveFileSelected` instead of referencing stale React state.
- **[ViewerPage.tsx](file:///Users/catherina/Documents/apps/score/src/components/ViewerPage.tsx)**: Re-fetched latest file record from DB in `syncMetadata` before saving Drive metadata updates.
