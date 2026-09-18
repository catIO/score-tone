---
# score-rdpq
title: Fix Google Picker compatibility in Firefox and Brave
status: completed
type: bug
priority: normal
created_at: 2026-09-17T22:26:50Z
updated_at: 2026-09-17T22:28:21Z
---

Restore Google Picker functionality in Firefox and Brave by removing setOrigin mismatch, cleaning MIME types, and smoothing the user-gesture sequence while preserving all unified library features.

## Summary of Changes

- Removed .setOrigin(window.location.origin) from PickerBuilder in googleDriveService.ts to prevent API key origin mismatch in Firefox and Brave.
- Restored multi-view Drive navigation in Picker (DOCS view + Google Drive view with folder inclusion) so users can navigate folders.
- Cleaned up PICKER_MIME_TYPES to focus on supported sheet music and zip archive formats without malformed container queries.
- Made loadScript resilient against timing differences and removed destructive script removal from the DOM.
- Preloaded Picker API alongside GSI to keep picker execution inside the trusted browser user-gesture window.
- Guarded storage event session invalidation against false positives when the Google account identity has not changed.
