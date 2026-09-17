# OAuth Token Lifetime and Explicit Reconnect

Updated September 17, 2026 for `score-i94r`. This document **replaces the obsolete proactive/silent-refresh proposal**. Its existing filename is retained for old links; it is not an implementation plan for background authentication.

> **Update (score-fsfg, September 17, 2026):** Access tokens are now also persisted to this browser tab's
> `sessionStorage` (in addition to memory) so a page reload within the token's lifetime reuses it instead of forcing a
> reconnect for every file. The token is still never written to `localStorage` or IndexedDB, is cleared when the tab or
> browser closes, still expires on Google's normal schedule, and no refresh token is stored or silently renewed. The
> "memory only, never persisted" wording below describes the prior behavior.

## Current policy

**No silent or background OAuth is performed.** Google access tokens and their expiry timestamps exist in JavaScript memory and this tab's `sessionStorage`. They are not persisted in `localStorage` or IndexedDB, and are not restored after the tab/browser closes or the token expires. No refresh token is stored.

At startup and disconnect, the service removes the legacy `localStorage` keys `scoretone_google_token` and `scoretone_google_token_expires`. Do not restore these keys or reintroduce renewal timers.

The selected account's display profile and login hint are separate from credentials. They persist in `localStorage` so that the same account's offline library can remain selected after reload, without a live Google session. This is an offline selection hint, not an authentication lock or newly verified identity.

## Token acquisition and expiry

1. An explicit **Connect**, **Reconnect**, **Choose Google account**, or shared-score **Sign in with Google** action may start GIS OAuth. A usable in-memory token can be reused without another request.
2. The service requests `drive.file`, `openid`, `userinfo.email`, and `userinfo.profile`. It validates response state, the granted Drive scope, and a positive token lifetime. It then calls Google's userinfo endpoint with the returned token and requires a valid `sub` before accepting the online session and account selection.
3. `tokenExpiresAt` is derived from Google's `expires_in`, not a persisted timestamp or a hardcoded one-hour lifetime. `getCachedToken()` uses `isTokenExpiringSoon()` with a default **three-minute buffer**; a near-expiry token is treated as unavailable.
4. `getAccessToken({ allowInteractive: false })` returns a usable cached token or rejects with reconnect guidance. It never starts OAuth. The compatibility method `silentRefresh()` delegates to this cached-token-only path; its name does not mean it refreshes credentials.
5. An authenticated Drive `401` clears the matching in-memory token. A late failure from an older request must not clear a newer token. Network failures do not trigger an automatic authentication popup.

Preloading the GIS script loads code only. OAuth starts from an explicit action; a background timer, app startup, or an online download failure must not initiate it. An empty OAuth `prompt` value is not a guarantee of a popup-free or privacy-browser-compatible flow and is not a silent-refresh strategy for this app.

## Offline use and account changes

* Cached scores in the selected library can open without an online token, including after reload when the app shell has been cached. An absent/expired token alone does not remove the remembered account profile.
* Uncached private scores need an explicit reconnect and existing selected-file authorization. Reconnecting does not authorize a new private file; use Google Picker with an account that has Drive access.
* Downloads may also try public Google endpoints. Some publicly accessible scores can open without a token; these paths do not bypass private-file permissions and are not guaranteed to work for every public link.
* **Choose Google account** requests Google's account chooser and accepts the result only after server userinfo verification. A login hint is not used as proof of identity.
* Account switches and disconnects invalidate pending auth/session work. Cross-tab profile/session events invalidate the receiving tab's token and update library selection; access tokens are not shared across tabs.
* **Disconnect · use device library** clears the token and saved profile/login hint and returns to the original Device library. Account databases remain saved but hidden until that account is reconnected. Disconnect is neither Google grant revocation nor offline-data deletion.

The implementation is in [src/services/googleDriveService.ts](../src/services/googleDriveService.ts). See [the Drive and account-library guide](drive-import-and-account-libraries.md) for storage boundaries, deletion, and shared-device limitations.

## Verification guidance

Use mocked OAuth responses, token lifetimes, time, and `401` results in automated tests to exercise cache reuse, the three-minute buffer, explicit reconnect, and stale-session rejection. Writing an expiry value into `localStorage` is **not** a valid test of the current memory-only lifecycle. Never paste a real access token into persistent storage or documentation.

Run `npm test`, `npm run typecheck`, and `npm run build` for non-browser checks. Live consent, expiry/reconnect behavior, offline reloads, account changes, and Brave with Shields enabled still need the [public-launch manual checks](drive-import-and-account-libraries.md#public-launch-manual-checks). **These manual checks are not yet browser verified.**
