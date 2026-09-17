---
# score-fsfg
title: Unify local library across Drive accounts and reduce reconnect frequency
status: completed
type: bug
priority: normal
created_at: 2026-09-17T21:12:09Z
updated_at: 2026-09-17T21:39:21Z
---

User feedback: switching/reconnecting a Google account changes the visible local library (per-account IndexedDB partitioning from score-i94r), which looks like data loss. Also, Drive OAuth tokens are memory-only and wiped on every reload, forcing reconnect very often. Fix: (1) always use a single local library (device DB) regardless of which Google account is connected, migrating any existing per-account DB contents into it once; (2) persist the Drive access token/expiry across reloads (sessionStorage) so a reconnect isn't needed every time a Drive file is opened within the token's lifetime.

## Summary of Changes

- App.tsx now always creates a single shared storage instance (`createStorageService(null)`), never keyed by the connected Google account; the library is identical regardless of which account is connected or disconnected.
- Added `migrateLegacyAccountLibraries()` in storageService.ts: a one-time (flagged via localStorage), best-effort merge of any existing `ScoreToneDatabase:google:*` databases into the single device database, so previously 'hidden' scores reappear. Guarded for browsers without `indexedDB.databases()`.
- Kept the per-account isCurrentLibrary staleness guard (App.tsx/LibraryPage.tsx) by capturing the account id a mount/tree instance represents, decoupled from storage selection, so stale async callbacks are still rejected correctly.
- googleDriveService.ts: access token + expiry are now persisted to this tab's sessionStorage (never localStorage/IndexedDB), so a reload within the token's lifetime reuses it instead of forcing reconnect for every Drive file open. Still cleared on logout/expiry; no refresh token, no background renewal.
- Updated UI copy in LibraryPage.tsx, AppSettingsDialog.tsx, HeaderBar.tsx removing 'device library vs account library' language; updated privacy.html, README.md, and the two drive-import/token-refresh docs (with an update note, not a full rewrite).
- Rewrote src/App.test.tsx's account-transition describe block, storageService.test.ts (added migration tests), googleDriveService.test.ts (token persistence test), AppSettingsDialog.test.tsx and HeaderBar.test.tsx copy assertions.
- Verified: 187 tests passing, typecheck clean, production build succeeds (pre-existing chunk-size warning only). No browser verification performed (workspace rule); no commits made.
