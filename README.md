# ScoreTone - PWA PDF Music Score Viewer

ScoreTone is a high-performance, tablet-friendly Progressive Web App (PWA) designed for musicians to view PDF music scores. It provides advanced display color adjustments, instant local file loading, offline caching, and Google Drive integration via Google Picker.

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
   * Drag-and-drop or select local PDFs for instant in-browser rendering.
   * Store metadata and selected PDF binaries locally inside IndexedDB (using Dexie).
   * Clear visual indicators showing whether a file is temporarily opened or fully cached offline.
   * Installable PWA shell with offline asset caching.

4. **Secure Google Drive Loader**
   * Connect and select files from Google Drive using the secure Google Picker API.
   * OAuth access tokens are kept purely in-memory and are never written to `localStorage`.
   * Requests only the narrowest possible permission scope (`drive.file`).

---

## Installation & Local Setup

### 1. Install Dependencies
Run the following command to download NPM packages:
```bash
npm install
```

### 2. Configure Environment Variables
Create a file named `.env.local` in the root of the project and define your Google credentials:
```env
VITE_GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-restricted-api-key
VITE_GOOGLE_APP_ID=your-google-project-number
```

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

---

## Google Cloud Console Configuration

To enable Google Drive Picker loading, follow these steps in your [Google Cloud Console](https://console.cloud.google.com/):

### 1. Enable APIs
1. Navigate to **APIs & Services > Library**.
2. Search for and enable the **Google Drive API**.
3. Search for and enable the **Google Picker API**.

### 2. Configure OAuth Consent Screen
1. Navigate to **APIs & Services > OAuth consent screen**.
2. Select **External** user type and configure app details.
3. In the **Scopes** page, add the scope `https://www.googleapis.com/auth/drive.file` (this scope restricts authorization only to files selected by the user via the Picker, ensuring privacy).
4. If your app is in "Testing" publishing status, add your Google account email to the **Test Users** list.

### 3. Create OAuth Client Credentials
1. Navigate to **APIs & Services > Credentials**.
2. Click **Create Credentials** and choose **OAuth client ID**.
3. Set application type to **Web application**.
4. In **Authorized JavaScript origins**, add:
   * `http://localhost:5173` (for local development)
   * Your production deployment URL (if hosted)
5. Save the configuration and copy the resulting **Client ID**.

### 4. Create API Key
1. In the **Credentials** tab, click **Create Credentials** and select **API key**.
2. Edit the API key to add restrictions:
   * Select **API restrictions**.
   * Under select APIs, choose **Google Picker API** and **Google Drive API**.
3. Save the key.

---

## Architecture and Technical Design

### File & Folder Structure
```
├── public/
│   ├── favicon.svg          # Responsive SVG app icon
│   └── masked-icon.svg       # Maskable PWA SVG app icon
├── src/
│   ├── components/
│   │   ├── DisplayControls.tsx  # Sliders for visual overrides
│   │   ├── LibraryPage.tsx      # Dashboard score manager
│   │   ├── PdfPageCanvas.tsx    # Single page PDF.js renderer
│   │   ├── PdfViewer.tsx        # Viewport layout and lazy loader
│   │   ├── PresetSelector.tsx   # Visual presets selector
│   │   ├── SettingsPanel.tsx    # Layout and navigation toggles
│   │   ├── SvgFilters.tsx       # Ink-darkness mathematical filter
│   │   ├── ViewerPage.tsx       # Primary sheet music viewer page
│   │   └── ViewerToolbar.tsx    # Responsive reader overlays
│   ├── hooks/
│   │   └── useNetworkStatus.ts  # Online status hook
│   ├── services/
│   │   ├── googleDriveService.ts # GIS token & Picker loader
│   │   ├── pdfService.ts        # PDF.js document loader wrapper
│   │   ├── settingsService.ts   # localStorage helper
│   │   └── storageService.ts    # Dexie IndexedDB interface
│   ├── App.tsx                  # Global state coordinator
│   ├── index.css                # Global stylesheet and token variables
│   └── main.tsx                 # App bootstrapping
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Core Workflows

### 1. Local File Loading
1. The user drags a PDF score into the upload area or browses files.
2. The app parses the file using PDF.js and renders pages instantly in-memory.
3. A metadata record is created in IndexedDB with `offline: false`. The PDF Blob is **not** written to the database yet. This represents a **temporary local file**.
4. Inside the viewer, the user can click **Save for Offline**. The app then writes the raw PDF Blob to the `fileData` table inside IndexedDB and sets `offline: true` in the metadata, making the file fully cached and permanent.

### 2. Google Drive Loading
1. The user clicks **Open from Google Drive**.
2. The app checks if a Google OAuth access token is in memory. If not, Google Identity Services client triggers an auth popup.
3. Upon approval, the access token is returned. The app initializes the Google Picker, filtering only for `application/pdf` files.
4. When the user selects a file, the Picker returns the ID, name, size, and thumbnail.
5. The app fetches the binary contents of the PDF using the Google Drive REST API media endpoint (`alt=media`) with the OAuth token in the `Authorization` header.
6. The PDF renders in the viewport.
7. To access this file offline, the user can toggle **Save Offline** in the Library or click the button in the Viewer. This downloads the file and stores it securely inside IndexedDB.

### 3. PWA Offline Caching
* **Static Assets:** `vite-plugin-pwa` bundles all static assets (HTML, CSS, JS, SVG icons, and the local PDF.js worker module) and registers a Service Worker via Workbox. If offline, the app shell loads immediately.
* **Document Assets:** The PDF documents themselves are **not** cached in the Service Worker cache. Instead, they are persisted directly in **IndexedDB**. If offline, the app reads the PDF Blob from the database and loads it locally in PDF.js, providing robust, database-backed document persistence.
