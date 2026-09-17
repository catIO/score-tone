---
# score-i94r
title: Implement tenant-neutral selected-file Drive import and account libraries
status: completed
type: feature
created_at: 2026-09-17T14:49:18Z
updated_at: 2026-09-17T14:49:18Z
---

Implement selected-file import with drive.file, remove deployment folder filtering, truthful authorized-file fallback and local import, stable-sub account-specific offline libraries preserving legacy device data, memory-only OAuth tokens and explicit reconnect, tests and documentation. Full-Drive scopes and managed sharing are deferred.

## Summary of Changes

- Removed deployment-global folder filtering; retained drive.file with prominent Google Picker, a truthful previously-authorized list, and local import fallback.
- Added OAuth state/scope/userinfo-sub validation, memory-only credentials, explicit reconnect, bounded cancellation and cross-tab invalidation.
- Bound offline databases and annotation saves to stable account identities; preserved the original database as the device library without reassignment/deletion. Added account selection and disconnect UI.
- Fixed MusicXML import metadata and clarified private links cannot grant access.
- Added 92 passing regression tests across auth, import UI, storage and account transitions. TypeScript, production build and whitespace checks passed; build retains large-chunk warning.
- Updated README, privacy policy, token guidance and release checklist.

## Deferred release work

- Real-browser Brave/Google consent/Picker verification was not performed (workspace rule). Checklist: docs/drive-import-and-account-libraries.md.
- Public OAuth configuration/verification requires Google Cloud owner action. Full-Drive restricted scope, optional folder preference, provider abstraction, cloud sharing and sync remain separate work in score-tpcz / score-pere.
