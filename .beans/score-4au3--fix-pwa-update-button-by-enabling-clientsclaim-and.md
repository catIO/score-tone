---
# score-4au3
title: Fix PWA Update button by enabling clientsClaim and bulletproof reload fallback
status: completed
type: bug
priority: high
created_at: 2026-09-06T21:46:52Z
updated_at: 2026-09-06T21:52:41Z
---

The 'Reload & Update' button in UpdatePrompt did not trigger a reload or update the service worker because Workbox was missing clientsClaim: true (causing controlling event to never fire), and UpdatePrompt lacked direct postMessage skipWaiting, controllerchange listener, and reload fallback.

## Summary of Changes
- Configured Workbox in `vite.config.ts` with `clientsClaim: true`, `skipWaiting: false`, and `cleanupOutdatedCaches: true` so that the activated service worker takes immediate client control and dispatches the `controllerchange` / `controlling` event.
- Enhanced `UpdatePrompt.tsx` with `handleReloadAndUpdate` that:
  - Posts `SKIP_WAITING` directly to `registration.waiting`.
  - Attaches a `controllerchange` one-time listener to reload immediately upon activation.
  - Calls `updateServiceWorker(true)`.
  - Sets an 800ms fallback timeout to reload even if the browser event is delayed.
  - Adds an updating spinner state and disables double clicks.

- Added preemptive fallback timer and `getRegistrations()` loop to guarantee reload within 600ms even if individual promises stall.
