---
# score-xk1x
title: Modernize homescreen UI with Grid/List views, search & sort, and ambient styling
status: completed
type: feature
priority: normal
created_at: 2026-09-07T17:45:26Z
updated_at: 2026-09-07T17:49:01Z
---

Modernize the homescreen library UI with a Grid/List view toggle, instant search and sort bar, ambient card design, and polished empty/action states.

## Todo List
- [x] Add view mode (grid/list) toggle with persistent preference
- [x] Implement instant search filter and sort controls
- [x] Implement modern Grid Card view with stylized score cover and badges
- [x] Enhance List view with refined spacing, typography, and hover actions
- [x] Polish header and container with ambient glow and modern subtle borders
- [x] Verify build and typechecks

## Summary of Changes
- Added a persistent Grid/List view mode toggle backed by localStorage.
- Built an instant search bar with shortcut key listener ('/' or 'Cmd+K'), clear button, and real-time filtering across score titles and bookmarks.
- Added a sort dropdown with options for Recently Opened, Title (A-Z), File Size, and Most Bookmarks.
- Built a modern Grid Card layout with simulated sheet music cover, stave lines, musical watermark motif, format pills (PDF/MusicXML), storage status (Local/Drive/Offline), page badges, interactive bookmark/loop launch tags, and a quick-action hover overlay.
- Refined the List View with subtle borders, stave-accented thumbnail icons, and hover actions.
- Enhanced the header and hero container with subtle amber ambient radial glow and modern glass borders.
