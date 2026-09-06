---
# score-fvcs
title: Score Menu and Viewer Layout Redesign
status: completed
type: feature
priority: normal
created_at: 2026-09-06T19:38:17Z
updated_at: 2026-09-06T19:41:58Z
---

Redesign score viewer menu layout:
- [x] Add explicit back to library button with clear label
- [x] Add 1-click current-page bookmark toggle in toolbar and visual indicator on bookmarked pages
- [x] Group side panel triggers (Bookmarks, Display/Tone, Settings) into a dedicated right-side rail/dock
- [x] Reorganize score toolbar right section for score-specific actions (zoom, share, fullscreen)
- [x] Update BookmarksPanel with current page quick action and active page highlighting
- [x] Verify functionality via non-browser methods

## Summary of Changes
1. **Back Navigation**: Added explicit  navigation button in ViewerToolbar.
2. **Side Rail Dock**: Created  component docked along the right edge for Bookmarks, Tone & Display, and Settings, sliding smoothly alongside open panels.
3. **1-Click Bookmarking**: Added score-level bookmark toggle in ViewerToolbar (filled amber icon when bookmarked) and discreet visual bookmark ribbon on bookmarked pages.
4. **BookmarksPanel Enhancements**: Added 1-click quick bookmarking for current page and highlighted active page bookmark in the list.
5. **Score Toolbar Reorganization**: Kept top toolbar purely focused on score reading and viewing (navigation, page/playback controls, 1-click bookmark, zoom, share, fullscreen).
