---
# score-pere
title: Support drive.readonly OAuth scope for direct link sharing of restricted files
status: todo
type: feature
priority: normal
created_at: 2026-09-12T11:12:26Z
updated_at: 2026-09-12T11:12:37Z
---

Evaluate and implement upgrading Google Drive OAuth scope from https://www.googleapis.com/auth/drive.file to https://www.googleapis.com/auth/drive.readonly.

## Background
Currently, ScoreTone uses the least-privilege `drive.file` scope. Under `drive.file`, Google restricts REST API file downloads to files created by the app or selected through the Google Picker. If a user shares a Google Drive file privately with a teacher or colleague (Restricted access rather than 'Anyone with the link') and sends a ScoreTone link (`?driveId=...`), Google rejects direct API download requests with HTTP 403 Forbidden.

## Proposed Change
1. In `src/services/googleDriveService.ts`, update the OAuth scope requested by `ensureTokenClient`:
   - Replace `https://www.googleapis.com/auth/drive.file` with `https://www.googleapis.com/auth/drive.readonly` (or request both).
2. With `drive.readonly`, an authenticated recipient can download any file shared directly with their Google account via the REST API, enabling seamless 1-click link opening for private/restricted files.

## Trade-offs & Considerations
- **Sensitive Scope**: Google Cloud considers `drive.readonly` a sensitive scope.
  - If the OAuth consent screen is in 'Testing' mode, recipients must be added as 'Test users' in the Google Cloud Console.
  - In production, requesting `drive.readonly` may trigger an 'Unverified App' warning unless Google App Verification is completed.
- **Privacy Perception**: Users will see a permission prompt asking to 'View your Google Drive files' rather than per-file access.
