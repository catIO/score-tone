---
# score-ac2m
title: Implement Google Drive fallback dialog with link pasting and browser shield instructions
status: completed
type: feature
priority: normal
created_at: 2026-09-17T22:44:57Z
updated_at: 2026-09-17T23:53:38Z
---

Ensure Google Picker is the primary direct flow and only present the fallback dialog when Picker fails or is blocked. Fallback provides link pasting, per-browser shield/tracking protection instructions, retry Picker, and local import.


## Todo List
- [x] Make Google Picker the direct primary flow when clicking Google Drive
- [x] Only open fallback dialog when Google Picker throws an error or is blocked
- [x] Add explicit link paste input with clear explanation and URL parser
- [x] Add per-browser instructions (Brave, Firefox, Safari, Chrome/Edge) to disable shields or tracking protection
- [x] Add retry Picker and local import actions in fallback dialog
- [x] Verify with typecheck and build

## Summary of Changes

- **Direct Primary Flow**: Clicking Google Drive in the header or library now immediately calls `googleDriveService.openPicker(token)` without opening any upfront modal.
- **Fallback Dialog Only**: When Google Picker throws an error or is blocked by browser third-party cookie restrictions, `LibraryPage` catches the error and displays the fallback dialog with the error reason.
- **Share Link Pasting with Guidance**: Added prominent Google Drive link paste input with auto-detection for share links, view links, and IDs, paired with clear 3-step instructions on copying share links with 'Anyone with the link can view'.
- **Per-Browser Shield & Tracking Protection Guides**: Interactive tabs for Brave, Firefox, Safari, and Chrome/Edge automatically detect the user's browser and provide step-by-step instructions on lowering shields or tracking protection for this domain.
- **Resilient Fallback Link Metadata**: Enhanced `googleDriveService.getFileMetadata` to fall back to unauthenticated public API key queries when `drive.file` OAuth tokens return 404/403 on shared links.
- **Retry & Local Import**: The fallback dialog provides one-click 'Select scores with Google Picker' retry once shields are lowered, plus an option to import local files from the device.

## Proactive Compatibility Check & Origin Fix

- **Proactive Referrer / Shield Check**: Added `checkPickerCompatibility()` to probe whether Brave Shields or browser tracking protection is stripping HTTP referrers or blocking the API key (`API_KEY_HTTP_REFERRER_BLOCKED`). If blocked, `openPicker` throws before opening the broken Google Picker iframe, immediately presenting the fallback dialog instead.
- **Restored setOrigin**: Restored `.setOrigin(window.location.protocol + '//' + window.location.host)` on `PickerBuilder` so Google Picker associates the origin with the allowed HTTP referrer rather than `docs.google.com` (which Google blocks as invalid developer key).
- **Smooth Shield Recovery**: When users lower shields in Brave, the compatibility check succeeds and Google Picker opens properly.

## Brave & Firefox Pre-emptive Fallback Routing

- **Intercept Broken Picker Window in Brave/Firefox**: Brave Shields (orange Lion icon) blocks third-party cookies for `docs.google.com/picker`, causing the embedded iframe to display 'Sign in to your Google Account' and popup 'The API developer key is invalid'.
- **Direct Fallback Activation**: `handleGoogleDrivePick` in `LibraryPage.tsx` now checks for Brave (`navigator.brave.isBrave()`) and Firefox before attempting to open the iframe. If shields haven't been verified, it immediately displays the Fallback Dialog rather than opening the broken Google Picker window.
- **Persistent Verification**: Once a user follows the instructions to toggle Shields OFF and successfully picks a file via the fallback's 'Select scores with Google Picker' button, `score_picker_verified` is stored so future clicks open Picker directly.

## Removed Warning Banner & User-Facing Jargon

- **Removed Warning Banner**: Removed the top error banner completely so the modal opens directly onto the clean share link input.
- **Plain User-Facing Language**: Replaced all mentions of technical jargon like 'Google Picker' with 'Browse Google Drive directly'.
- **Clear Guidance Under Input**: Positioned the 'Want to browse your Google Drive directly?' section with per-browser shield instructions and the 'Browse Google Drive directly' button neatly beneath the import field.
