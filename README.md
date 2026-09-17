# ScoreTone - PWA Music Score Viewer

ScoreTone is a tablet-friendly Progressive Web App (PWA) for PDF, MusicXML (.xml and .musicxml), and compressed MusicXML (.mxl) scores. It provides display color adjustments, local file import, offline libraries, and selected-file Google Drive import via Google Picker.

Google Drive is optional. One deployment uses one shared Google Cloud/OAuth project; each user consents with their own Google account and accesses files that account can use. There is no deployment owner's personal Drive folder, ScoreTone account backend, managed sharing service, or cross-device library sync.

---

## Features

1. **High-Performance PDF.js Rendering**
   * Optimized rendering to avoid freezing the browser on large score files.
   * Single-page navigation and continuous vertical scroll modes.
   * Responsive Fit-to-Width and Fit-to-Height layout modes.
   * Two-Page Landscape mode that automatically displays two pages side-by-side on wide screens.
   * Lazy rendering of pages near the viewport using `IntersectionObserver`.

2. **Advanced Color Controls & Presets**
   * Adjust Sepia, Brightness, Contrast, and Background Colors.
   * Mathematical Ink Darkness stretching using custom SVG filter curves (stretches dark grey lines to pitch black without washing out white backgrounds).
   * Warm Paper overlay simulating high-grade cream/warm-yellow sheet music.
   * Built-in presets: Original, Sepia, Warm Paper, Ivory, Night Mode, High Contrast, and Stage Dim.
   * Save and manage custom user-defined presets.

3. **Offline-First & Local Storage**
   * Drag-and-drop or select PDF, MusicXML, or MXL files; local imports immediately save metadata and file blobs to your single library in IndexedDB (using Dexie).
   * The library includes score metadata, bookmarks, offline blobs, annotations, and custom presets, and is the same regardless of which Google account, if any, is connected.
   * Clear visual indicators showing whether a file is temporarily opened or fully cached offline.
   * Installable PWA shell with offline asset caching.

4. **Selected-File Google Drive Import**
   * **Select scores with Google Picker** is the prominent action for authorizing new files. The native **Previously authorized scores** list searches only files accessible under `drive.file`, not the whole Drive.
   * Requests `drive.file`, `openid`, `userinfo.email`, and `userinfo.profile`; Google's userinfo endpoint supplies the verified account `sub` used to identify the connected account.
   * Access tokens and expiry timestamps are kept in memory and in this browser tab's `sessionStorage`, never in `localStorage` or IndexedDB, so opening several files in the same tab doesn't require reconnecting each time. Legacy token/expiry keys are removed from `localStorage`; there is no silent or background authentication beyond reusing this tab's still-valid token.
   * A saved display profile remembers the connected account across reloads, independently of an online token. Reconnect explicitly once the token expires.
   * Pasting a link does not grant access. Some publicly accessible files may also download through public Google endpoints without Picker authorization.
   * If Google services are unavailable, import a device file instead. Disabling Brave Shields is not required to use ScoreTone.

Your library is **not an authentication lock or app-level encryption**. Someone using the same OS/browser profile can access browser storage. See [docs/drive-import-and-account-libraries.md](docs/drive-import-and-account-libraries.md) for workflows, limitations, and pending public-launch checks.

## Settings

The **+ Add Score** button opens the full source chooser. Its separate **down-arrow** opens a compact list with just **From this device** and **From Google Drive**, for direct import without the modal. Cloud availability checks apply to both paths; device import stays available offline.

Open the account icon in the library, then **Settings**:

- **General:** theme, PDF layout and fit, two-page landscape, auto-hide controls, screen-awake preference, MusicXML fingering, and page-turn tap-zone width. Changes save immediately to the same device preferences used by the viewer.
- **Account & cloud:** Google Drive connect/reconnect/import, account selection, disconnect, and the Google permissions link. The dropdown's **Account & cloud** shortcut opens this tab directly.
- A remembered account is not an active Drive connection. The status explicitly shows when reconnect is required and updates when the token becomes unusable; no background authentication occurs. **From Drive** counts imported files, not connections.
- Offline use keeps General preferences and device imports available. Online cloud actions are disabled. Google Drive is currently the only integrated cloud provider; files from other providers can be imported from the device.

The existing viewer preferences panel and quick theme toggle remain available. The Settings dialog supports Escape to close, keyboard tab navigation, focus containment, and arrow-key navigation between its tabs.

---

## Installation & Local Setup

### 1. Install Dependencies
Run the following command to download NPM packages:
```bash
npm install
```

### 2. Configure Environment Variables
For optional Google Drive integration, create a root-level .env.local file with the deployment's public browser configuration:
```env
VITE_GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-restricted-api-key
VITE_GOOGLE_APP_ID=your-google-project-number
```

Use the OAuth client ID, restricted browser API key, and **numeric project number** from the same Google Cloud project. `VITE_GOOGLE_APP_ID` is neither the project name/string ID nor the OAuth client ID. Vite exposes these values in the client bundle; never put an OAuth client secret or access token in a `VITE_` variable. Restart the dev server or rebuild after changing configuration.

`VITE_GOOGLE_DRIVE_FOLDER_ID` is unsupported and must be removed from older deployment configuration. There is no global personal-folder filter. Users do not need their own Cloud project or environment variables. Without Google configuration, local import and saved offline scores remain usable.

### 3. Run Locally
Start the local development server:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for Production
Generate optimized static production assets and the service worker shell:
```bash
npm run build
```
Verify the production build locally:
```bash
npm run preview
```

### 5. Non-Browser Verification
Run the scripts defined in [package.json](package.json):
```bash
npm test
npm run typecheck
npm run build
```

Tests and builds do not verify live Google consent, Picker, browser privacy settings, or offline PWA behavior. The [public-launch manual checks](docs/drive-import-and-account-libraries.md#public-launch-manual-checks) are **not yet browser verified**.

---

## Google Cloud Console Configuration

To enable Google Drive Picker loading, follow these steps in your [Google Cloud Console](https://console.cloud.google.com/):

### 1. Enable APIs
1. Navigate to **APIs & Services > Library**.
2. Enable **Google Drive API** (service ID `drive.googleapis.com`).
3. Enable **Google Picker API** (service ID `picker.googleapis.com`).

### 2. Configure OAuth Consent Screen
1. Navigate to **APIs & Services > OAuth consent screen**.
2. Select **External** user type and configure app details.
3. Configure these scopes to match the implementation:
   * `https://www.googleapis.com/auth/drive.file` — selected-file Drive access, not whole-Drive listing. Although Google's scope permits modification of authorized files, ScoreTone currently uses it to read metadata and download scores, not upload edits or change permissions.
   * `openid` — stable account identity (`sub`).
   * `https://www.googleapis.com/auth/userinfo.email` — account email for display and an explicit reconnect login hint.
   * `https://www.googleapis.com/auth/userinfo.profile` — available display name and profile picture.
4. In **Testing** status, add every intended tester, including a fresh non-owner account, to **Test Users**. A public launch requires the appropriate production audience/publishing status and any Google-required branding, domain, or consent review; a successful owner login is not proof that new users can consent.
5. Set the app home page, deployed privacy policy, terms, and authorized domains. Do not add `drive.readonly` or full `drive` as a workaround for missing files: this implementation requests selected-file access.

### 3. Create OAuth Client Credentials
1. Navigate to **APIs & Services > Credentials**.
2. Click **Create Credentials** and choose **OAuth client ID**.
3. Set application type to **Web application**.
4. In **Authorized JavaScript origins**, add:
   * `http://localhost:5173` (for local development)
   * The exact production HTTPS origin, and any preview origin used for testing (scheme, hostname, and port; no path).
5. Save the configuration and copy the resulting **Client ID**.
6. Keep this client in the same project as the API key and Picker app ID. The app uses the GIS browser token/popup flow, not a ScoreTone server-side OAuth callback.

### 4. Create API Key
1. In the **Credentials** tab, click **Create Credentials** and select **API key**.
2. Edit the API key to add restrictions:
   * Under **Application restrictions**, choose **Websites / HTTP referrers**. Allow only the deployment's actual sites, such as `http://localhost:5173/*` and `https://your-deployment.example/*`; add preview sites only when needed.
   * Under **API restrictions**, restrict the key to **Google Picker API** and **Google Drive API**.
3. Save the key and use it as `VITE_GOOGLE_API_KEY`. Keep the restrictions in place when diagnosing errors.
4. Set `VITE_GOOGLE_APP_ID` to this project's numeric **Project number** from project settings. All three values must align with the project where both APIs are enabled.

An API key identifies the app; it does not grant access to private files. For failures, check project alignment, enabled APIs, origin/referrer restrictions, consent audience, popup permissions, and network availability. Offer device-file import rather than requiring users to disable privacy protections.

---

## Architecture and Technical Design

* [src/services/googleDriveService.ts](src/services/googleDriveService.ts): GIS OAuth, server userinfo verification, per-tab session tokens, selected-file API access, and Picker lifecycle.
* [src/services/storageService.ts](src/services/storageService.ts): a single shared Dexie database for the whole library, independent of the connected Google account.
* [src/App.tsx](src/App.tsx) and [src/hooks/useLibraryStorage.ts](src/hooks/useLibraryStorage.ts): provide that shared storage and remount the account UI on switches/disconnects.
* [src/components/HeaderBar.tsx](src/components/HeaderBar.tsx): account display, reconnect, choose account, and disconnect actions.
* [src/components/LibraryPage.tsx](src/components/LibraryPage.tsx) and [src/components/DriveFileBrowser.tsx](src/components/DriveFileBrowser.tsx): local imports, Picker entry point, previously authorized list, and link handling.
* [src/services/settingsService.ts](src/services/settingsService.ts): device-wide display preferences in `localStorage`; these are distinct from account-scoped saved custom presets.

---

## Core Workflows

### 1. Local File Loading
1. Your library is the same whether or not a Google account is connected, shown below the library heading.
2. Use **Add Score → From this device** for a PDF, MusicXML (.xml or .musicxml), or MXL file. On mobile, find **Add Score** in the account menu. **Browse Files**, drag-and-drop, and Settings’ **Import from device** remain direct device imports.
3. The app saves its metadata and blob immediately to your library with `offline: true`, then opens the viewer. Local import does not upload the file to Google Drive.

### 2. Google Drive Loading
1. Choose **Add Score → From Google Drive** on desktop or mobile, or use the direct Drive action in **Settings → Account & cloud**. Opening Add Score does not sign in. Selecting Drive reuses a usable in-memory token or explicitly asks you to sign in/reconnect. It verifies the returned account through Google's userinfo endpoint before accepting the online session. Cloud import requires internet access and configured Google integration; **From this device** works offline without an account and never uploads your file. For other cloud services, download the file first and choose **From this device**.
2. Click **Select scores with Google Picker** to authorize a new file, or choose from **Previously authorized scores**. An empty native list is normal for a fresh account; it is not an inventory of the user's Drive.
3. Selected files are opened from an existing local copy when available; otherwise the app downloads and caches them in your library. Supported formats are PDF, MusicXML, and MXL.
4. A pasted Drive link checks access; it never grants permission. For a private file, use an account that has Drive access and authorize it with Picker. Public-link downloads are best-effort and may fail because of Google restrictions or browser/network behavior.
5. A newly opened shared deep link can remain an in-memory preview until saved to the library. Copying a score/page/loop link shares a reference, not a file or access grant. A local score link requires that score to exist in the recipient's selected library on that browser/device.

### 3. Account Selection and Disconnect
* All Google accounts (and no account at all) share the same single Dexie database, containing files, bookmarks, blobs, annotations, and custom presets. Connecting, switching, or disconnecting a Google account never changes, hides, or reassigns this library.
* The selected display profile persists across reload, even without a token. **Choose Google account** requires an explicit online Google flow and verifies the resulting `sub`; it is not an offline account chooser.
* **Disconnect Google account** clears the token and saved profile/login hint. Your library, bookmarks, annotations, and custom presets are unaffected. Disconnecting neither revokes Google's grant nor deletes data.
* To revoke Google access, use [Google account permissions](https://myaccount.google.com/permissions). To delete a score's local record, bookmarks, blob, and annotations, use the library trash action. Remove custom presets separately; clearing all site data removes your library and preferences. Google revocation does not erase offline copies.

### 4. PWA Offline Caching
* **Static assets:** the service worker caches the app shell. Offline startup depends on assets having been cached successfully beforehand; first-ever offline visits are not supported.
* **Scores:** saved document blobs live in IndexedDB, not a Drive synchronization service. Cached scores in your library can open without Google authentication. Browser eviction, private browsing, or clearing site data can remove local copies; retain original files elsewhere.
* **Session expiry:** a three-minute buffer prevents reuse of near-expiry tokens, and the token is kept in this tab's `sessionStorage` so a reload doesn't force a reconnect. There is no proactive renewal or background OAuth beyond reusing that still-valid token. See [docs/proactive-token-refresh.md](docs/proactive-token-refresh.md) for the current explicit-reconnect policy that replaces the old silent-refresh proposal.
