import React, { useState, useEffect, useCallback, useRef } from 'react';
import { googleDriveService, GoogleDriveFileMetadata, GOOGLE_ACCOUNT_CHANGED_EVENT } from '../services/googleDriveService';
import { FileText, X, CheckCircle2, Music, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface DriveFileBrowserProps {
  token: string | null; // already-acquired access token if available
  fallbackError?: string | null;
  onSelect: (file: GoogleDriveFileMetadata) => void;
  onClose: () => void;
  onImportLocal?: () => void;
}

type BrowserTab = 'brave' | 'firefox' | 'safari' | 'chrome';

function detectBrowser(): BrowserTab {
  if (typeof window === 'undefined') return 'brave';
  const ua = navigator.userAgent;
  if ((navigator as any).brave && typeof (navigator as any).brave.isBrave === 'function') return 'brave';
  if (ua.includes('Firefox')) return 'firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')) return 'safari';
  return 'chrome';
}

function parseDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const matchFile = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFile) return matchFile[1];
  const matchIdParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchIdParam) return matchIdParam[1];
  const matchD = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (matchD) return matchD[1];
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(trimmed)) return trimmed;
  return null;
}

export const DriveFileBrowser: React.FC<DriveFileBrowserProps> = ({
  token,
  fallbackError: _fallbackError,
  onSelect,
  onClose,
  onImportLocal: _onImportLocal,
}) => {
  const [files, setFiles] = useState<GoogleDriveFileMetadata[]>([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [openingLink, setOpeningLink] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerNotice, setPickerNotice] = useState<string | null>(null);
  const [activeBrowserTab, setActiveBrowserTab] = useState<BrowserTab>(() => detectBrowser());
  const [showAuthorizedList, setShowAuthorizedList] = useState(false);

  const requestVersion = useRef(0);
  const mounted = useRef(false);
  const pickerController = useRef<AbortController | null>(null);
  const browserRevision = useRef(googleDriveService.getSessionRevision());

  // Search / Link input state
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const detectedFileId = parseDriveFileId(searchInput);

  useEffect(() => {
    mounted.current = true;
    browserRevision.current = googleDriveService.getSessionRevision();
    const handleAccountChange = () => {
      if (browserRevision.current !== googleDriveService.getSessionRevision()) {
        requestVersion.current++;
        setFiles([]);
        setSelected(null);
        setNextPageToken(undefined);
        setLoading(false);
        setLoadingMore(false);
        setError('Google account changed. Close this dialog and reconnect before selecting a score.');
      }
    };
    window.addEventListener(GOOGLE_ACCOUNT_CHANGED_EVENT, handleAccountChange);
    return () => {
      mounted.current = false;
      requestVersion.current++;
      pickerController.current?.abort();
      window.removeEventListener(GOOGLE_ACCOUNT_CHANGED_EVENT, handleAccountChange);
    };
  }, [token]);

  const canSelect = () => mounted.current && browserRevision.current === googleDriveService.getSessionRevision();

  const loadFiles = useCallback(async (searchQuery?: string) => {
    if (!token) {
      setLoading(false);
      setFiles([]);
      return;
    }
    const version = ++requestVersion.current;
    try {
      setLoading(true);
      setLoadingMore(false);
      setError(null);
      setSelected(null);
      setFiles([]);
      setNextPageToken(undefined);
      const result = await googleDriveService.listPdfFiles(token, undefined, searchQuery);
      if (!mounted.current || version !== requestVersion.current) return;
      setFiles(result.files);
      setNextPageToken(result.nextPageToken);
    } catch (err: any) {
      if (!mounted.current || version !== requestVersion.current) return;
      setError(err.message || 'Failed to load Drive files.');
    } finally {
      if (mounted.current && version === requestVersion.current) setLoading(false);
    }
  }, [token]);

  const loadMore = async () => {
    if (!token || !nextPageToken || loadingMore || loading) return;
    const version = requestVersion.current;
    try {
      setLoadingMore(true);
      setError(null);
      const result = await googleDriveService.listPdfFiles(token, nextPageToken, activeSearch);
      if (!mounted.current || version !== requestVersion.current) return;
      setFiles(prev => [...new Map([...prev, ...result.files].map(file => [file.id, file])).values()]);
      setNextPageToken(result.nextPageToken);
    } catch (err: any) {
      if (!mounted.current || version !== requestVersion.current) return;
      setError(err.message);
    } finally {
      if (mounted.current && version === requestVersion.current) setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadFiles();
    } else {
      setLoading(false);
    }
  }, [loadFiles, token]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (detectedFileId) {
      handleOpenLink();
      return;
    }
    setActiveSearch(searchInput);
    loadFiles(searchInput);
  };

  const handleConfirm = () => {
    const file = files.find(f => f.id === selected);
    if (file && canSelect()) onSelect(file);
  };

  const handleOpenLink = async () => {
    if (!detectedFileId || openingLink || !canSelect()) return;
    setOpeningLink(true);
    setLinkError(null);
    try {
      const meta = await googleDriveService.getFileMetadata(detectedFileId, token);
      if (canSelect()) onSelect(meta);
    } catch (err: any) {
      if (mounted.current) setLinkError(err.message || 'Failed to resolve Google Drive link.');
    } finally {
      if (mounted.current) setOpeningLink(false);
    }
  };

  const handleLaunchPicker = async () => {
    if (pickerController.current || !canSelect()) return;
    const controller = new AbortController();
    pickerController.current = controller;
    setPickerNotice(null);
    setPickerLoading(true);
    try {
      const activeToken = token || (await googleDriveService.getAccessToken());
      const picked = await googleDriveService.openPicker(activeToken, controller.signal);
      if (picked && canSelect() && !controller.signal.aborted) {
        try { localStorage.setItem('score_picker_verified', 'true'); } catch { /* ignore */ }
        onSelect(picked);
      }
    } catch (err: any) {
      if (mounted.current && !controller.signal.aborted) {
        setPickerNotice(
          err instanceof Error ? err.message : 'Google Picker could not open. Check your connection and try again.'
        );
      }
    } finally {
      if (pickerController.current === controller) pickerController.current = null;
      if (mounted.current) setPickerLoading(false);
    }
  };

  const fmt = {
    size: (b: number) => {
      if (!b) return '';
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
      return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    },
    date: (iso?: string) => iso
      ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : ''
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-browser-title"
        className="flex flex-col rounded-2xl overflow-hidden animate-fade-in"
        style={{
          width: 'min(700px, 96vw)',
          maxHeight: '88vh',
          background: 'var(--md-surface-3)',
          border: '1px solid var(--md-outline-variant)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4"
          style={{ borderBottom: '1px solid var(--md-outline-variant)' }}>
          <div>
            <h2 id="drive-browser-title" className="text-lg font-semibold" style={{ color: 'var(--md-on-surface)', fontFamily: 'Outfit, sans-serif' }}>
              Import from Google Drive
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--md-on-surface-variant)' }}>
              Paste a share link or browse directly
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={onClose} aria-label="Close Drive import" className="md-icon-btn" style={{ width: 44, height: 44 }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4" style={{ minHeight: 0 }}>
          
          {/* ── 1. PROMINENT SHARE LINK IMPORT FIRST ── */}
          <section className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--md-surface-2)', border: '1px solid var(--md-outline-variant)' }}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Paste Google Drive Share Link
              </label>
            </div>
            
            <form onSubmit={handleSearchSubmit} className="space-y-3">
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all shadow-inner focus-within:ring-2 focus-within:ring-amber-400/40"
                style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline)' }}>
                <input
                  type="text"
                  autoFocus
                  aria-label="Search previously authorized scores or paste a Drive link"
                  placeholder="Paste Google Drive share link (e.g. drive.google.com/file/d/...)"
                  value={searchInput}
                  onChange={e => { setSearchInput(e.target.value); setLinkError(null); }}
                  className="flex-1 min-w-0 bg-transparent text-sm sm:text-base focus:outline-none placeholder-[var(--md-on-surface-variant)]"
                  style={{ color: 'var(--md-on-surface)' }}
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => { setSearchInput(''); setActiveSearch(''); setLinkError(null); if (token) loadFiles(''); }}
                    className="text-xs font-medium transition-colors hover:opacity-100 opacity-70 px-1.5 py-0.5 rounded"
                    style={{ color: 'var(--md-on-surface-variant)' }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Detected Link Quick Action */}
              {detectedFileId && (
                <div className="p-3 rounded-xl flex items-center justify-between gap-3 animate-fade-in"
                  style={{ background: 'rgba(255, 183, 77, 0.15)', border: '1px solid rgba(255, 183, 77, 0.4)' }}>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-amber-400 block truncate">Google Drive Score Link Detected</span>
                    <span className="text-xs opacity-90 block truncate font-mono mt-0.5" style={{ color: 'var(--md-on-surface)' }}>ID: {detectedFileId}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenLink}
                    disabled={openingLink}
                    className="md-btn-filled text-sm py-2 px-4 rounded-xl flex items-center gap-1.5 shrink-0 shadow-sm"
                  >
                    {openingLink && <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" />}
                    <span className="font-semibold">{openingLink ? 'Opening…' : 'Open Link'}</span>
                  </button>
                </div>
              )}

              {/* Link error display */}
              {linkError && (
                <div role="alert" className="p-3 rounded-xl text-xs flex items-start justify-between gap-2 animate-fade-in"
                  style={{ background: 'var(--md-error-container)', color: 'var(--md-error)' }}>
                  <span className="flex-1 leading-relaxed">{linkError}</span>
                  <button type="button" onClick={() => setLinkError(null)} aria-label="Dismiss error" className="opacity-70 hover:opacity-100 font-bold ml-1">✕</button>
                </div>
              )}

              {/* Step-by-step instructions for link sharing */}
              <div className="p-4 rounded-xl space-y-2 leading-relaxed" style={{ background: 'rgba(0,0,0,0.18)', color: 'var(--md-on-surface-variant)' }}>
                <p className="text-sm font-semibold text-amber-300">How to share from Google Drive:</p>
                <ol className="list-decimal pl-5 space-y-1.5 text-xs leading-relaxed">
                  <li>In Google Drive, right-click the score (.pdf, .musicxml, or .mxl) &gt; <strong>Share</strong> &gt; <strong>Copy link</strong>.</li>
                  <li>Ensure General access is set to <strong>"Anyone with the link can view"</strong>.</li>
                  <li>Paste the link above and click <strong>Open Link</strong>.</li>
                </ol>
              </div>
            </form>
          </section>

          {/* ── 2. UNDER THE IMPORT FIELD: DIRECT BROWSING & BROWSER SHIELDS ── */}
          <section className="rounded-xl p-3.5" style={{ background: 'var(--md-surface-2)', border: '1px solid var(--md-outline-variant)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Want to browse your Google Drive directly?
              </h3>
            </div>
            <p className="text-xs mb-2.5 leading-relaxed" style={{ color: 'var(--md-on-surface-variant)' }}>
              Browser privacy protections (like Brave Shields or tracking protection) block direct Drive browsing by default. You can browse your Drive directly by following these steps:
            </p>

            {/* Browser Tabs */}
            <div className="flex rounded-lg p-1 gap-1 mb-3" style={{ background: 'var(--md-surface-1)' }}>
              {(['brave', 'firefox', 'safari', 'chrome'] as BrowserTab[]).map(tab => {
                const labels: Record<BrowserTab, string> = {
                  brave: 'Brave',
                  firefox: 'Firefox',
                  safari: 'Safari',
                  chrome: 'Chrome / Edge'
                };
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveBrowserTab(tab)}
                    className="flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-all text-center"
                    style={{
                      background: activeBrowserTab === tab ? 'var(--md-primary)' : 'transparent',
                      color: activeBrowserTab === tab ? 'var(--md-on-primary)' : 'var(--md-on-surface-variant)',
                      fontWeight: activeBrowserTab === tab ? 600 : 500
                    }}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="p-3.5 rounded-lg text-xs leading-relaxed" style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--md-on-surface)' }}>
              {activeBrowserTab === 'brave' && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-amber-400">For Brave Browser:</p>
                  <ol className="list-decimal pl-5 space-y-1.5 text-xs leading-relaxed">
                    <li>Click the <strong>Brave Lion icon</strong> in the address bar (to the right of the URL).</li>
                    <li>Toggle the main shield switch to <strong>DOWN / OFF</strong> for this site.</li>
                    <li>Click <strong>Browse Google Drive directly</strong> below.</li>
                  </ol>
                </div>
              )}
              {activeBrowserTab === 'firefox' && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-amber-400">For Mozilla Firefox:</p>
                  <ol className="list-decimal pl-5 space-y-1.5 text-xs leading-relaxed">
                    <li>Click the <strong>Shield icon</strong> on the left side of the address bar.</li>
                    <li>Toggle <strong>Enhanced Tracking Protection OFF</strong> for this site.</li>
                    <li>Click <strong>Browse Google Drive directly</strong> below.</li>
                  </ol>
                </div>
              )}
              {activeBrowserTab === 'safari' && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-amber-400">For Apple Safari (macOS / iOS):</p>
                  <ol className="list-decimal pl-5 space-y-1.5 text-xs leading-relaxed">
                    <li>Open <strong>Safari Settings &gt; Privacy</strong> (or Settings &gt; Safari on iOS).</li>
                    <li>Uncheck <strong>"Prevent cross-site tracking"</strong> (or allow cross-site cookies if prompted).</li>
                    <li>Click <strong>Browse Google Drive directly</strong> below.</li>
                  </ol>
                </div>
              )}
              {activeBrowserTab === 'chrome' && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-amber-400">For Google Chrome & Microsoft Edge:</p>
                  <ol className="list-decimal pl-5 space-y-1.5 text-xs leading-relaxed">
                    <li>Click the <strong>Site settings icon</strong> (tune/sliders) on the left of the URL bar.</li>
                    <li>Under <strong>Third-party cookies</strong>, select <strong>Allow third-party cookies</strong>.</li>
                    <li>Click <strong>Browse Google Drive directly</strong> below.</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Launch Picker Retry Button */}
            <div className="mt-3">
              <button
                type="button"
                onClick={handleLaunchPicker}
                disabled={pickerLoading || openingLink}
                aria-busy={pickerLoading}
                aria-label="Select scores with Google Picker"
                className="md-btn-filled w-full min-h-11 px-4 py-3 flex items-center justify-center gap-2 text-sm font-semibold"
              >
                {pickerLoading && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}
                {pickerLoading ? 'Opening Google Drive…' : 'Browse Google Drive directly'}
              </button>
            </div>

            {/* Notice if launch picker reports an error */}
            {pickerNotice && (
              <div role="alert" className="mt-2.5 p-2.5 rounded-xl flex items-start gap-2 text-xs"
                style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface-variant)' }}>
                <span className="flex-1">{pickerNotice}</span>
                <button aria-label="Dismiss Picker notice" onClick={() => setPickerNotice(null)} className="opacity-60 hover:opacity-100">✕</button>
              </div>
            )}
          </section>

          {/* Previously Authorized Scores Section */}
          <section className="pt-2" style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--md-on-surface)' }}>
                Previously authorized scores
              </h3>
              <button
                type="button"
                onClick={() => setShowAuthorizedList(prev => !prev)}
                className="text-xs flex items-center gap-1 opacity-70 hover:opacity-100 py-1 px-2 rounded"
                style={{ color: 'var(--md-on-surface-variant)' }}
              >
                <span>{showAuthorizedList ? 'Hide' : 'Show'} ({files.length})</span>
                {showAuthorizedList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--md-on-surface-variant)' }}>
              Only files you select are authorized for this app. The list below is not your entire Drive.
            </p>

            {/* List Body */}
            {(showAuthorizedList || files.length > 0 || loading || error) && (
              <div className="max-h-48 overflow-y-auto px-1 py-1 rounded-xl"
                style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
                {loading && (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <div className="w-5 h-5 rounded-full border-2 border-transparent animate-spin"
                      style={{ borderTopColor: 'var(--md-primary)' }} />
                    <span className="text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>
                      {activeSearch ? 'Searching authorized scores…' : 'Loading previously authorized scores…'}
                    </span>
                  </div>
                )}

                {error && (
                  <div role="alert" className="rounded-xl p-3 text-xs"
                    style={{ background: 'var(--md-error-container)', color: 'var(--md-error)' }}>
                    <div className="font-medium mb-1">{error}</div>
                    <button onClick={() => loadFiles(activeSearch)} className="mt-2 underline font-semibold block">Retry loading files</button>
                  </div>
                )}

                {!loading && !error && files.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-6 px-4 text-center gap-1.5"
                    style={{ color: 'var(--md-on-surface-variant)' }}>
                    <FileText className="w-7 h-7 opacity-30" />
                    <span className="text-xs font-medium">
                      {activeSearch ? 'No matching authorized scores on this page' : 'No previously authorized scores on this page'}
                    </span>
                  </div>
                )}

                {!loading && files.length > 0 && (
                  <div className="flex flex-col">
                    {files.map(file => (
                      <button
                        key={file.id}
                        onClick={() => setSelected(file.id)}
                        onDoubleClick={() => { if (canSelect()) { setSelected(file.id); onSelect(file); } }}
                        aria-pressed={selected === file.id}
                        className="md-list-item py-2"
                        style={{
                          background: selected === file.id ? 'var(--md-primary-container)' : 'transparent',
                          color: selected === file.id ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)',
                        }}
                      >
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: selected === file.id ? 'rgba(255,183,77,0.15)' : 'var(--md-surface-5)' }}>
                          {/\.(xml|musicxml|mxl)$/i.test(file.name) ? (
                            <Music className="w-3.5 h-3.5 text-orange-400" />
                          ) : (
                            <FileText className="w-3.5 h-3.5" style={{ color: selected === file.id ? 'var(--md-primary)' : 'var(--md-on-surface-variant)' }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            {/\.(xml|musicxml|mxl)$/i.test(file.name) && (
                              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">
                                MusicXML
                              </span>
                            )}
                          </div>
                          <p className="text-xs opacity-75 mt-0.5">
                            {[fmt.date(file.modifiedTime), fmt.size(file.size)].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        {selected === file.id && (
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--md-primary)' }} />
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {!loading && nextPageToken && (
                  <button onClick={loadMore} disabled={loadingMore} className="md-btn-text w-full py-2 text-sm">
                    {loadingMore ? 'Loading…' : 'Load more authorized scores'}
                  </button>
                )}
              </div>
            )}
          </section>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5"
          style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
          <span className="text-xs opacity-75 hidden sm:inline" style={{ color: 'var(--md-on-surface-variant)' }}>
            Double-click to open score
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className="md-btn-text px-4 py-2 text-sm">Cancel</button>
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className="md-btn-filled px-5 py-2 text-sm"
            >
              Open Score
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default DriveFileBrowser;
