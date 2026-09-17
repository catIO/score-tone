# Drive Import and Account Libraries

Implementation reference for `score-i94r`, reviewed against the current source on September 17, 2026. This describes implemented behavior, not a browser-validation report. **The public-launch manual checks below are not yet browser verified.**

## Deployment and permission model

One ScoreTone deployment uses a shared Google Cloud project, OAuth web client, restricted browser API key, and numeric Picker app ID. Each user consents with their own Google account. Users do not need to create Cloud projects, and the deployment does not route them to its owner's personal Drive folder. `VITE_GOOGLE_DRIVE_FOLDER_ID` is unsupported.

The app requests:

| Scope | Purpose |
| --- | --- |
| `https://www.googleapis.com/auth/drive.file` | Access files authorized for this app, normally by selecting them with Google Picker. This is not whole-Drive access. |
| `openid` | Obtain the stable account identifier `sub`. |
| `https://www.googleapis.com/auth/userinfo.email` | Display the account and retain a login hint for explicit reconnect. |
| `https://www.googleapis.com/auth/userinfo.profile` | Display available name and profile picture. |

Google describes `drive.file` as permitting more than read-only access to authorized files. ScoreTone currently reads metadata and downloads content; it does not upload local edits, delete Drive originals, or manage Drive permissions. Do not switch to `drive.readonly` or full `drive` just to populate the native list.

See [deployment setup](../README.md#google-cloud-console-configuration) for API service IDs, exact JavaScript origins, HTTP-referrer and API-key restrictions, project alignment, and consent audience requirements.

## Importing a score

### New private Drive files: use Google Picker

1. Open the library account icon → **Account & cloud** (or **Settings** → **Account & cloud**) and explicitly connect or reconnect Google Drive if needed. The library's Drive import shortcut remains available.
2. Use the prominent **Select scores with Google Picker** button. Picker is the grant path for new files under `drive.file`.
3. Select a PDF, MusicXML (.xml or .musicxml), or MXL file with an account that already has access in Google Drive. Picker authorization does not override the owner's sharing restrictions.
4. The app uses an existing cached copy when available; otherwise it downloads the score and saves metadata and the blob to the selected account library before opening it.

Picker permits folder navigation but not folder selection. Generic upload MIME types are included so MusicXML/MXL files remain discoverable; selected files are checked for a supported extension or score MIME type.

### Previously authorized scores: a limited native list

The native **Previously authorized scores** list uses Drive REST requests under the same `drive.file` token. Search and pagination operate within that scope. It is not an alternative whole-Drive browser, and an empty list is expected for an account that has never authorized files for this app. Use Picker for new grants. This list can remain useful when Picker is unavailable, but cannot grant access to additional private files.

### Pasted links and shared deep links

* Pasting a Drive link or file ID checks metadata/access; it does **not** grant permission. A file shared with your Google account may still need to be selected with Picker before this app can open it.
* Download paths first use an available token and may also try public Google endpoints. Some publicly accessible files can therefore open without Picker authorization or an online token. This is best-effort, not a promise that every public link works; browser/CORS behavior and Google's download restrictions still apply.
* A private file cannot be made accessible by pasting its ID, using an API key, or reconnecting alone. Use an account with Drive access, select the file with Picker, or obtain a local copy from its owner.
* A shared deep link checks only the selected library for an offline copy. A newly downloaded shared score can remain a temporary in-memory preview until saved; an existing library score can have its cache refreshed.
* Score/page/loop URLs contain references and navigation details, not file bytes or permission grants. Drive recipients need their own access/authorization or a publicly accessible download. Local file links work only where the referenced file is already in the selected library on that browser/device.
* Switching accounts or disconnecting clears the previous account's active view and deep-link state rather than automatically replaying its link in another library.

There is **no managed sharing backend, team library, upload/sync service, cross-device synchronization, or annotation collaboration**. Drive access and copied links do not create any of these features.

### Device-file fallback

Use **Import a device file instead**, or close the Drive dialog and choose **Add Score** / **Browse Files**. Drag-and-drop also works. Local import immediately saves the file and metadata into the **currently selected library**, including a remembered account library while offline; it does not always go to Device library and does not upload to Drive.

Disabling Brave Shields is **not required** to use ScoreTone. If sign-in or Picker fails, retry an explicit action, check network and popup availability, or use local import with privacy protections unchanged. A blocked or cancelled popup, failed Google script, missing Picker configuration, or timeout must not be interpreted as permission to access more files. Maintainers should check project IDs, API enablement, consent audience, and origin/referrer restrictions before attributing a failure to browser settings.

## Identity, tokens, and offline selection

During explicit sign-in, the service validates OAuth response state, a granted `drive.file` scope, and token lifetime. It sends the returned access token to **Google's server-side userinfo endpoint**, `https://www.googleapis.com/oauth2/v3/userinfo`, and requires a nonempty `sub` before accepting the online session. The account ID comes from that response, not a typed email, login hint, or Picker label. There is no ScoreTone identity-verification backend.

| State | Storage and behavior |
| --- | --- |
| Access token and expiry | JavaScript memory only; not `localStorage`, `sessionStorage`, IndexedDB, or a shared cross-tab credential. Lost on reload. |
| Legacy token keys | `scoretone_google_token` and `scoretone_google_token_expires` are removed from `localStorage` at startup and disconnect, not restored. |
| Selected display profile | `scoretone_google_user_profile` stores `sub` and available name, given name, email, and picture URL in `localStorage`. Restores the selected offline library without online authentication. |
| Login hint | `scoretone_google_login_hint` supports a later explicit reconnect; it is not proof of identity or an access credential. |
| Cross-tab notifications | Profile/session storage events invalidate the other tab's online token and update its selected account. Tokens are not copied between tabs. |

There is **no silent or background authentication**, no refresh-token storage, and no scheduled OAuth renewal. A usable in-memory token may be reused; the default expiry buffer is three minutes. When it is unavailable, non-interactive access reports that a reconnect is needed. Loading the GIS script in advance is code preloading, not authentication. The compatibility method named `silentRefresh()` only checks the cached token; it does not initiate OAuth. See [the current token policy](proactive-token-refresh.md).

An expired or absent online token does not by itself remove the remembered library selection. Cached scores can be used without a live Google session, subject to browser storage and previously cached app assets. **Choose Google account** is an explicit online Google account-selection flow; a new selection is accepted only after userinfo verification. There is no offline menu for switching among all previously used accounts.

## Library boundaries and legacy data

Each account uses a separate Dexie/IndexedDB database named `ScoreToneDatabase:google:${encodeURIComponent(sub)}`. The original database name, `ScoreToneDatabase`, remains the **Device library**.

| Data | Library boundary |
| --- | --- |
| Score metadata, last page, zoom, tempo, bookmarks and loop bookmarks | Stored in the selected database's `files` table. |
| Offline file blobs | Stored in that database's `fileData` table. |
| Page annotations | Stored in that database's `annotations` table. |
| Saved custom presets | Stored in that database's `customPresets` table. |
| General display settings, theme, and library view preference | Device/browser-wide `localStorage`, not fully account-isolated preferences. |

Connecting an account leaves the original database and its contents untouched by account assignment. **No automatic reassignment, merge, or migration into the first connected account occurs.** Old scores, including previously saved Drive copies, remain in Device library. They are not proof of ownership by whichever Google account is currently connected. Use **Disconnect · use device library** to return to them.

The selected account's profile survives reloads and offline startup, so the app can reopen that account's local database without Google authentication. This is organizational separation, **not an authentication lock or app-level encryption**. The persisted profile is an offline selection hint, not newly verified identity. A person sharing the same OS user/browser profile can inspect or alter browser storage and access local copies. Use separate OS/browser profiles for device privacy; do not treat disconnect as secure erasure.

## Disconnect, revoke, and delete are different

* **Disconnect · use device library:** clears the online token, saved profile, and login hint; hides the account library and returns to Device library. It retains account files, blobs, bookmarks, annotations, and custom presets. Reconnect the same verified account to show them again. After disconnect, this requires an online account-selection/sign-in flow rather than an offline unlock.
* **Revoke Google access:** remove ScoreTone from [Google account permissions](https://myaccount.google.com/permissions). Disconnect does not do this. Revocation affects Google's grant, not existing offline copies or local library selection.
* **Delete a score:** the library trash action removes its metadata (including bookmarks), blob, and annotations from the selected library, not from Drive or another account's library. Remove custom presets separately.
* **Remove offline copy:** removes the blob while retaining the metadata; this is not complete score deletion. A local file without its blob needs re-importing.
* **Delete all local app data:** clear ScoreTone's site data in browser settings, including IndexedDB, local storage, and caches. This removes Device and account libraries and preferences on that browser profile; it does not delete Google Drive originals or revoke Google permissions. Close other ScoreTone tabs as part of clearing data.

Browser eviction, private browsing, or user deletion can remove offline copies. They are not a cloud backup; keep original scores elsewhere. See [public/privacy.html](../public/privacy.html) for the privacy policy.

## Public-launch manual checks

**Status: not yet browser verified.** These are required manual release checks, not claims of passing coverage. Record browser/version, deployed origin, consent publishing status, account history, privacy settings, and results without recording tokens or private score content. Use disposable test files; never clear a user's real library for testing.

1. **Fresh non-owner account:** use a clean browser profile and a Google account that has never consented to this OAuth project. Verify intended public audience access (or explicitly note Testing-only access), identity/profile display, an initially empty authorized list, and successful Picker authorization/import. Confirm unrelated Drive files are not presented as already authorized.
2. **Formats and list behavior:** select PDF, XML, MusicXML, and MXL, including generic upload MIME types; verify opening, caching, native search, and pagination. Confirm the UI explains an empty or failed list and still offers Picker/local import.
3. **Brave with Shields enabled:** test fresh consent and Picker with default protections unchanged. If blocked, confirm bounded error/cancel recovery and successful device-file import without disabling Shields. Also check Chrome, Firefox, Safari, and a target tablet/installed PWA; do not generalize one browser's result to others.
4. **Auth and Picker recovery:** close/block the OAuth popup, deny permission, cancel Picker, interrupt the network, and test missing/misaligned Picker configuration on a test deployment. Confirm retry/local fallback and no automatic or delayed authentication popup.
5. **Account A/B separation:** save local and Drive scores, bookmarks, annotations, and custom presets as A. Choose B and confirm A's library/view is not shown. Import the same Drive file ID under B and confirm its local records remain independent. Choose A again and verify its saved data remains.
6. **Offline reload:** cache the app and scores with A selected, reload offline, and confirm A's library and saved content remain accessible without a token or OAuth attempt. Confirm uncached private files require online reconnect rather than a background sign-in.
7. **Token lifecycle:** reload online and check that access tokens/expiry are absent from persistent browser storage; confirm old token keys are removed. Exercise expiry/401 recovery with a controlled test session, checking explicit reconnect and no proactive OAuth. Editing an old localStorage expiry key is not a valid expiry simulation.
8. **Disconnect and legacy library:** seed a disposable legacy Device library before connecting A. Confirm it is not reassigned. Disconnect A, verify Device library returns and the saved profile is removed, then reconnect A and verify retained offline data. Separately verify revocation and deletion behave as documented.
9. **Cross-tab and in-flight work:** switch/disconnect in one tab while another has Picker, a download, a viewer, or annotation saves active. Verify the old UI and results do not populate the newly selected library and credentials are not shared.
10. **Links:** test an authorized private file, a private file the account cannot access, an accessible-but-not-yet-authorized private file, a public file, and a local-file link on another browser/library. Confirm links never create grants, public access is best-effort, and unsaved shared previews are not automatically added to the library.

Run `npm test`, `npm run typecheck`, and `npm run build` as separate non-browser checks. Automated checks do not replace live consent/Picker and offline/privacy-browser validation.