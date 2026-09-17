---
# score-tpcz
title: SaaS Cloud Storage & Sharing Architecture for All Users
status: in-progress
type: feature
priority: high
created_at: 2026-09-17T12:27:00Z
updated_at: 2026-09-17T12:27:10Z
---

Plan and architecture for scaling ScoreTone's Google Drive and cloud score sharing to a production-grade SaaS product across all browsers and user types.

## 1. Problem Summary & Root Cause Analysis

### The Issue
When connecting to Google Drive in privacy-focused browsers (Brave with Shields, Safari with ITP, Firefox with ETP), users encountered:
> *"There was an error! The API developer key is invalid."*

Behind the error modal, Google displayed:
> *"Sign in to your Google Account. You must sign in to access this content."*

### Why It Happened
1. **Google Picker Architecture**: The Google Picker API operates inside an `<iframe>` hosted on `docs.google.com`.
2. **Third-Party Cookie Dependency**: Inside that cross-origin iframe, Google requires third-party session cookies to authenticate the Google user session and validate the API key against the calling origin.
3. **Browser Privacy Shielding**: Brave, Safari, and Firefox block third-party cookies and partitioned iframe storage by default. This severed the iframe's authentication context, causing Google's server to reject the API developer key as invalid.
4. **Single Failure Point**: ScoreTone previously relied solely on the Google Picker widget with no fallback, leaving users locked in the error state.

---

## 2. Immediate Changes Made

1. **Origin Handshake Added (`src/services/googleDriveService.ts`)**:
   - Added `.setOrigin(window.location.protocol + '//' + window.location.host)` to `PickerBuilder` for explicit `postMessage` origin validation.
2. **Native In-App Drive Browser (`src/components/DriveFileBrowser.tsx`)**:
   - Replaced the mandatory iframe picker with a native Material Design dialog.
   - Communicates directly with Google Drive REST API (`files.list`) via standard OAuth Bearer token acquired from Google's popup flow (which succeeds across all browsers).
   - Zero iframe dependencies, zero third-party cookies needed.
3. **Direct Drive Link & File ID Resolver**:
   - Users and teachers can paste any Google Drive share link directly into the search bar.
   - Automatically extracts the file ID and imports the score without browsing.
4. **Resilient Dual Strategy**:
   - Kept a "Google Picker" button inside the browser header for Chrome/Edge users who prefer Google's native picker, with inline error catching if blocked.
5. **Wired into Library (`src/components/LibraryPage.tsx`)**:
   - Integrated `DriveFileBrowser` into the "Connect Google Drive" and "Add Score" flows.

---

## 3. SaaS Plan: Production-Grade Cloud & Sharing Architecture

To evolve ScoreTone into a seamless, multi-tenant commercial SaaS product serving teachers, students, and musicians:

### Phase 1: Zero-Friction Multi-User Cloud Storage
- [ ] **Google Cloud App Verification**: Submit the OAuth consent screen to Google for verification. Eliminates the *"Google hasn't verified this app"* warning for all external users.
- [ ] **Tenant-Neutral Configuration**: Ensure `VITE_GOOGLE_DRIVE_FOLDER_ID` is purely an optional user-level setting rather than a deployment global. Default to searching the authenticated user's entire Drive.
- [ ] **Multi-Provider Storage Abstraction**: Abstract cloud storage under a unified `CloudProvider` interface (`list()`, `download()`, `search()`) to support Google Drive, Dropbox, OneDrive, and Apple iCloud/Files.

### Phase 2: Bulletproof Score Sharing for Teachers & Students
- [ ] **The "Google Permissions" Problem**: Currently, sharing requires the student to manually set Google Drive permissions to *"Anyone with the link can view"*. If forgotten, the teacher gets a 403 error.
- [ ] **Managed Cloud Snapshot Tier**:
  - Implement a managed storage backend (Cloudflare R2 / AWS S3 / Supabase).
  - When sharing a score, allow the user to generate a ScoreTone Share Link (`score.practice-mate.app/s/:shareId`).
  - ScoreTone stores a cached snapshot of the score and its practice metadata (loops, bookmarks, tempo, annotations).
  - Teachers open the link instantly with zero authentication requirements, zero Google Drive permission hurdles, and zero browser cookie conflicts.

### Phase 3: Collaborative Teacher-Student Workflows
- [ ] **Shared Rehearsal Markers**: Sync teacher annotations, fingering notes, and A-B practice loops directly to student score copies.
- [ ] **One-Click "Save to My Library"**: Let teachers and students clone any shared score directly into their local Dexie IndexedDB cache or cloud drive.

### Phase 4: Browser Observability & Auto-Adaptation
- [ ] **Client Capability Detection**: Programmatically detect third-party cookie restrictions or Brave Shields upon initial interaction.
- [ ] **Adaptive Routing**: Automatically direct users to the native in-app browser when privacy restrictions are detected, completely eliminating iframe errors before they occur.
