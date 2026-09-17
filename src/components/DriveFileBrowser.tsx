import React, { useState, useEffect, useCallback, useRef } from 'react';
import { googleDriveService, GoogleDriveFileMetadata, GOOGLE_ACCOUNT_CHANGED_EVENT } from '../services/googleDriveService';
import { FileText, X, CheckCircle2, Search, Music, Link, Loader2, AlertCircle } from 'lucide-react';

interface DriveFileBrowserProps {
  token: string; // already-acquired access token — avoids redundant getAccessToken() calls
  onSelect: (file: GoogleDriveFileMetadata) => void;
  onClose: () => void;
  onImportLocal?: () => void;
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

export const DriveFileBrowser: React.FC<DriveFileBrowserProps> = ({ token, onSelect, onClose, onImportLocal }) => {
  const [files, setFiles] = useState<GoogleDriveFileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [openingLink, setOpeningLink] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerNotice, setPickerNotice] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const mounted = useRef(false);
  const pickerController = useRef<AbortController | null>(null);
  const browserRevision = useRef(googleDriveService.getSessionRevision());

  // Search / Link input state
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const detectedFileId = parseDriveFileId(searchInput);
  const localImportHelp = onImportLocal
    ? 'Select a score with Google Picker or import a file from your device.'
    : 'Select a score with Google Picker, or close this dialog and import a device file from your library.';

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
    if (!nextPageToken || loadingMore || loading) return;
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
    loadFiles();
  }, [loadFiles]);

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
    setError(null);
    try {
      const meta = await googleDriveService.getFileMetadata(detectedFileId, token);
      if (canSelect()) onSelect(meta);
    } catch (err: any) {
      if (mounted.current) setError(err.message || 'Failed to resolve Google Drive link.');
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
      const picked = await googleDriveService.openPicker(token, controller.signal);
      if (picked && canSelect() && !controller.signal.aborted) {
        onSelect(picked);
      }
    } catch (err: any) {
      if (mounted.current && !controller.signal.aborted) setPickerNotice(
        err instanceof Error ? err.message : 'Google Picker could not open. Check your connection and try again.'
      );
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
          width: 'min(540px, 96vw)',
          maxHeight: '84vh',
          background: 'var(--md-surface-3)',
          border: '1px solid var(--md-outline-variant)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid var(--md-outline-variant)' }}>
          <div>
            <h2 id="drive-browser-title" className="text-base font-semibold" style={{ color: 'var(--md-on-surface)', fontFamily: 'Outfit, sans-serif' }}>
              Import from Google Drive
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--md-on-surface-variant)' }}>
              PDF, MusicXML, and compressed MusicXML (MXL)
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={onClose} aria-label="Close Drive import" className="md-icon-btn" style={{ width: 44, height: 44 }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-4 pt-3 pb-2">
          <button
            onClick={handleLaunchPicker}
            disabled={pickerLoading || openingLink}
            aria-busy={pickerLoading}
            className="md-btn-filled w-full min-h-11 px-4 py-3 flex items-center justify-center gap-2 text-sm font-semibold"
          >
            {pickerLoading && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}
            {pickerLoading ? 'Google Picker is open or loading…' : 'Select scores with Google Picker'}
          </button>
          <p className="text-xs mt-2" style={{ color: 'var(--md-on-surface-variant)' }}>
            Only files you select are authorized for this app. The list below is not your entire Drive.
          </p>
          {onImportLocal ? (
            <button onClick={() => { onClose(); onImportLocal(); }} className="md-btn-text min-h-11 w-full text-sm mt-1">
              Import a device file instead
            </button>
          ) : (
            <p className="text-xs mt-2" style={{ color: 'var(--md-on-surface-variant)' }}>
              To import a device file, close this dialog and use your library’s local import action.
            </p>
          )}
        </div>

        {/* Picker errors can have network, configuration, or browser causes. */}
        {pickerNotice && (
          <div role="alert" className="mx-4 mt-3 p-2.5 rounded-xl flex items-start gap-2 text-xs"
            style={{ background: 'var(--md-surface-2)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface-variant)' }}>
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
            <span className="flex-1">{pickerNotice} {localImportHelp}</span>
            <button aria-label="Dismiss Picker notice" onClick={() => setPickerNotice(null)} className="opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Search & Link Input Bar */}
        <form onSubmit={handleSearchSubmit} className="px-4 pt-3 pb-2">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--md-on-surface)' }}>Previously authorized scores</h3>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
            style={{ background: 'var(--md-surface-2)', border: '1px solid var(--md-outline-variant)' }}>
            {detectedFileId ? (
              <Link className="w-4 h-4 flex-shrink-0 text-amber-500" />
            ) : (
              <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--md-on-surface-variant)' }} />
            )}
            <input
              type="text"
              aria-label="Search previously authorized scores or paste a Drive link"
              placeholder="Search authorized scores or paste a link…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm focus:outline-none placeholder-[var(--md-on-surface-variant)]"
              style={{ color: 'var(--md-on-surface)' }}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); setActiveSearch(''); loadFiles(''); }}
                className="text-xs transition-colors hover:opacity-100 opacity-60"
                style={{ color: 'var(--md-on-surface-variant)' }}
              >
                Clear
              </button>
            )}
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--md-on-surface-variant)' }}>
            Pasting a link does not grant permission. Use Google Picker to authorize a new file.
          </p>

          {/* Quick Action when a Google Drive link is pasted */}
          {detectedFileId && (
            <div className="mt-2 p-2 rounded-xl flex items-center justify-between gap-2"
              style={{ background: 'rgba(255, 183, 77, 0.1)', border: '1px solid rgba(255, 183, 77, 0.3)' }}>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold text-amber-400 block truncate">Google Drive Link Detected</span>
                <span className="text-[10px] opacity-70 block truncate" style={{ color: 'var(--md-on-surface)' }}>ID: {detectedFileId}</span>
              </div>
              <button
                type="button"
                onClick={handleOpenLink}
                disabled={openingLink}
                className="md-btn-filled text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 shrink-0"
              >
                {openingLink && <Loader2 aria-hidden="true" className="w-3 h-3 animate-spin" />}
                <span>{openingLink ? 'Checking…' : 'Open Link'}</span>
              </button>
            </div>
          )}
        </form>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-1" style={{ minHeight: 0 }}>
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-7 h-7 rounded-full border-2 border-transparent animate-spin"
                style={{ borderTopColor: 'var(--md-primary)' }} />
              <span className="text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>
                {activeSearch ? 'Searching authorized scores…' : 'Loading previously authorized scores…'}
              </span>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl p-3.5 mb-2 text-xs"
              style={{ background: 'var(--md-error-container)', color: 'var(--md-error)' }}>
              <div className="font-medium mb-1">{error}</div>
              <div className="opacity-80">{localImportHelp}</div>
              <button onClick={() => loadFiles(activeSearch)} className="mt-2 underline font-semibold block">Retry loading files</button>
            </div>
          )}

          {!loading && !error && files.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center gap-2"
              style={{ color: 'var(--md-on-surface-variant)' }}>
              <FileText className="w-9 h-9 opacity-30" />
              <span className="text-sm font-medium">
                {activeSearch ? 'No matching authorized scores on this page' : 'No previously authorized scores on this page'}
              </span>
              <p className="text-xs max-w-xs opacity-70">
                {localImportHelp}
              </p>
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
                  className="md-list-item"
                  style={{
                    background: selected === file.id ? 'var(--md-primary-container)' : 'transparent',
                    color: selected === file.id ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)',
                  }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: selected === file.id ? 'rgba(255,183,77,0.15)' : 'var(--md-surface-5)' }}>
                    {/\.(xml|musicxml|mxl)$/i.test(file.name) ? (
                      <Music className="w-4 h-4 text-orange-400" />
                    ) : (
                      <FileText className="w-4 h-4" style={{ color: selected === file.id ? 'var(--md-primary)' : 'var(--md-on-surface-variant)' }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm font-medium truncate">{file.name}</p>
                      {/\.(xml|musicxml|mxl)$/i.test(file.name) && (
                        <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-orange-500/20 text-orange-300">
                          MusicXML
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5 opacity-60">
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
            <button onClick={loadMore} disabled={loadingMore} className="md-btn-text w-full min-h-11 py-2 mt-2 text-xs">
              {loadingMore ? 'Loading…' : 'Load more authorized scores'}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
          <span className="text-[11px] opacity-60 hidden sm:inline" style={{ color: 'var(--md-on-surface-variant)' }}>
            Double-click to open score
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className="md-btn-text px-3.5 py-1.5 text-xs">Cancel</button>
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className="md-btn-filled px-5 py-1.5 text-xs"
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
