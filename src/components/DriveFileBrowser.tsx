import React, { useState, useEffect, useCallback } from 'react';
import { googleDriveService, GoogleDriveFileMetadata, DRIVE_FOLDER_ID } from '../services/googleDriveService';
import { FileText, X, CheckCircle2 } from 'lucide-react';

interface DriveFileBrowserProps {
  onSelect: (file: GoogleDriveFileMetadata) => void;
  onClose: () => void;
}

export const DriveFileBrowser: React.FC<DriveFileBrowserProps> = ({ onSelect, onClose }) => {
  const [files, setFiles] = useState<GoogleDriveFileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);

  const loadFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await googleDriveService.getAccessToken();
      const result = await googleDriveService.listPdfFiles(token);
      setFiles(result.files);
      setNextPageToken(result.nextPageToken);
    } catch (err: any) {
      setError(err.message || 'Failed to load Drive files.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = async () => {
    if (!nextPageToken) return;
    try {
      setLoadingMore(true);
      const token = await googleDriveService.getAccessToken();
      const result = await googleDriveService.listPdfFiles(token, nextPageToken);
      setFiles(prev => [...prev, ...result.files]);
      setNextPageToken(result.nextPageToken);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleConfirm = () => {
    const file = files.find(f => f.id === selected);
    if (file) onSelect(file);
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
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{
          width: 'min(520px, 95vw)',
          maxHeight: '80vh',
          background: 'var(--md-surface-3)',
          border: '1px solid var(--md-outline-variant)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--md-outline-variant)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--md-on-surface)', fontFamily: 'Outfit, sans-serif' }}>
              {DRIVE_FOLDER_ID ? 'Score Folder' : 'Google Drive'}
            </h2>
            {DRIVE_FOLDER_ID && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--md-on-surface-variant)' }}>Filtered to your scores folder</p>
            )}
          </div>
          <button onClick={onClose} className="md-icon-btn" style={{ width: 36, height: 36 }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3" style={{ minHeight: 0 }}>
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
                style={{ borderTopColor: 'var(--md-primary)' }} />
              <span className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>Loading scores…</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl p-4 mb-3 text-sm"
              style={{ background: 'var(--md-error-container)', color: 'var(--md-error)' }}>
              {error}
              <button onClick={loadFiles} className="ml-3 underline opacity-80 hover:opacity-100">Retry</button>
            </div>
          )}

          {!loading && !error && files.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2"
              style={{ color: 'var(--md-on-surface-variant)' }}>
              <FileText className="w-10 h-10 opacity-30" />
              <span className="text-sm">No PDF files found</span>
            </div>
          )}

          {!loading && files.length > 0 && (
            <div className="flex flex-col">
              {files.map(file => (
                <button
                  key={file.id}
                  onClick={() => setSelected(file.id)}
                  onDoubleClick={() => { setSelected(file.id); onSelect(file); }}
                  className="md-list-item"
                  style={{
                    background: selected === file.id ? 'var(--md-primary-container)' : 'transparent',
                    color: selected === file.id ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)',
                  }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: selected === file.id ? 'rgba(255,183,77,0.15)' : 'var(--md-surface-5)' }}>
                    <FileText className="w-4 h-4" style={{ color: selected === file.id ? 'var(--md-primary)' : 'var(--md-on-surface-variant)' }} />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs mt-0.5 opacity-60">
                      {[fmt.date(file.modifiedTime), fmt.size(file.size)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {selected === file.id && (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--md-primary)' }} />
                  )}
                </button>
              ))}
              {nextPageToken && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="md-btn-text w-full py-2 mt-2 text-sm"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3"
          style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
          <button onClick={onClose} className="md-btn-text px-4 py-2">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="md-btn-filled px-6 py-2"
          >
            Open Score
          </button>
        </div>
      </div>
    </div>
  );
};
