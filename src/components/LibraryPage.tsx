import React, { useState, useEffect, useRef } from 'react';
import { FileUp, HardDrive, Chrome, Trash2, CloudLightning, FileText, CheckCircle2, Download, AlertCircle } from 'lucide-react';
import { storageService, type ScoreFile } from '../services/storageService';
import { googleDriveService } from '../services/googleDriveService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface LibraryPageProps {
  onOpenFile: (file: ScoreFile, inMemoryBlob?: Blob) => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({ onOpenFile }) => {
  const [files, setFiles] = useState<ScoreFile[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'local' | 'drive'>('all');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOnline = useNetworkStatus();

  // Check if Google Drive environment vars are configured
  const isGoogleConfigured = googleDriveService.isConfigured();

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const allFiles = await storageService.getFiles();
      setFiles(allFiles);
    } catch (e) {
      console.error('Failed to load files from db', e);
      setErrorMsg('Failed to initialize database.');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const processLocalFile = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Only PDF files are supported.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      // Create metadata
      const fileId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newFile: ScoreFile = {
        id: fileId,
        name: file.name.replace(/\.pdf$/i, ''),
        source: 'local',
        lastOpened: Date.now(),
        lastPage: 1,
        offline: false, // temporarily opened, not yet cached in db
        size: file.size
      };

      // Add temporarily to library view (metadata saved but blob not cached yet)
      await storageService.saveFileMetadata(newFile);
      
      // Auto refresh files list
      await loadFiles();
      setLoading(false);
      
      // Open immediately in viewer
      onOpenFile(newFile, file);
    } catch (e: any) {
      console.error(e);
      setErrorMsg('Failed to parse and load PDF.');
      setLoading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processLocalFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processLocalFile(e.target.files[0]);
    }
  };

  const handleGoogleDrivePick = async () => {
    if (!isGoogleConfigured) {
      setErrorMsg('Google Drive integration is not configured. Please add VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY, and VITE_GOOGLE_APP_ID to your environment variables.');
      return;
    }
    if (!isOnline) {
      setErrorMsg('You must be online to open files from Google Drive.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    googleDriveService.pickPdf(
      async (metadata) => {
        try {
          // Check if file is already in library
          const existing = files.find(f => f.id === metadata.id);
          
          if (existing) {
            // Already opened, just update time and open
            existing.lastOpened = Date.now();
            await storageService.saveFileMetadata(existing);
            await loadFiles();
            setLoading(false);
            
            // If already cached offline, open it, otherwise download in-memory first
            if (existing.offline) {
              onOpenFile(existing);
            } else {
              const blob = await googleDriveService.downloadFile(existing.id);
              onOpenFile(existing, blob);
            }
            return;
          }

          // New file metadata
          const newFile: ScoreFile = {
            id: metadata.id,
            name: metadata.name.replace(/\.pdf$/i, ''),
            source: 'google-drive',
            lastOpened: Date.now(),
            lastPage: 1,
            offline: false, // download to memory first
            size: metadata.size,
            thumbnail: metadata.thumbnailLink
          };

          await storageService.saveFileMetadata(newFile);
          await loadFiles();

          // Download file bytes
          const blob = await googleDriveService.downloadFile(newFile.id);
          setLoading(false);
          onOpenFile(newFile, blob);
        } catch (e: any) {
          console.error(e);
          setErrorMsg('Failed to load file from Google Drive: ' + e.message);
          setLoading(false);
        }
      },
      (err) => {
        console.error(err);
        setErrorMsg(err.message || 'Google Drive picker failed.');
        setLoading(false);
      }
    );
  };

  // Toggle offline cache for a file
  const toggleOfflineCache = async (file: ScoreFile, e: React.MouseEvent) => {
    e.stopPropagation();
    setErrorMsg(null);

    if (file.offline) {
      // Remove from cache
      try {
        await storageService.removeFileFromOffline(file.id);
        await loadFiles();
      } catch (err) {
        console.error(err);
        setErrorMsg('Failed to remove file from cache.');
      }
    } else {
      // Cache offline
      setLoading(true);
      try {
        let blob: Blob | null = null;
        if (file.source === 'local') {
          // For local files, we prompt them to pick the file again to cache it,
          // or if they are currently viewing we save it.
          // Since they are inside LibraryPage and want to toggle offline, they must pick the local file to save it.
          setErrorMsg('To save a local file for offline use, open the file and click "Save for Offline" inside the reader view.');
          setLoading(false);
          return;
        } else {
          // Google Drive file
          if (!isOnline) {
            setErrorMsg('You must be online to cache Google Drive files.');
            setLoading(false);
            return;
          }
          blob = await googleDriveService.downloadFile(file.id);
        }

        if (blob) {
          await storageService.cacheFileOffline(file, blob);
          await loadFiles();
        }
      } catch (err: any) {
        console.error(err);
        setErrorMsg('Failed to cache file: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const deleteFileRecord = async (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to remove this file from your library?')) {
      try {
        await storageService.deleteFile(fileId);
        await loadFiles();
      } catch (err) {
        console.error(err);
        setErrorMsg('Failed to delete file.');
      }
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredFiles = files.filter(f => {
    if (activeTab === 'local') return f.source === 'local';
    if (activeTab === 'drive') return f.source === 'google-drive';
    return true;
  });

  return (
    <div className="page-container bg-[#0a0a0c] text-white p-6 md:p-10 overflow-y-auto max-w-7xl mx-auto w-full">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-bold font-display tracking-tight text-white mb-2">ScoreTone</h1>
          <p className="text-slate-400 text-sm">Offline-first digital music stand for musicians</p>
        </div>

        {/* Network Status Badge */}
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span className="text-xs font-semibold text-slate-400">
            {isOnline ? 'Online mode' : 'Offline mode'}
          </span>
        </div>
      </header>

      {/* Error & Config Warning Display */}
      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-sm flex items-start gap-3 animate-fade">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div>{errorMsg}</div>
        </div>
      )}

      {!isGoogleConfigured && (
        <div className="mb-6 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-slate-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0" />
          <div>
            <p className="font-semibold text-indigo-300 mb-1">Google Integration Available</p>
            To connect with Google Drive, create a `.env.local` file with:
            <code className="block mt-1 bg-slate-950 p-2 rounded text-xs select-all text-indigo-200">
              VITE_GOOGLE_CLIENT_ID=your_id<br/>
              VITE_GOOGLE_API_KEY=your_key<br/>
              VITE_GOOGLE_APP_ID=your_project_number
            </code>
          </div>
        </div>
      )}

      {/* Drop Zone Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Upload Panel */}
        <div className="lg:col-span-1 space-y-6">
          <h3 className="text-lg font-bold font-display text-slate-300">Add Music Scores</h3>
          
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/10 hover:border-indigo-500/50 rounded-2xl p-8 text-center cursor-pointer transition-all bg-white/5 flex flex-col items-center justify-center gap-4 group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="application/pdf"
              className="hidden"
            />
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-indigo-600/10 group-hover:scale-110 transition-all">
              <FileUp className="w-6 h-6 text-slate-400 group-hover:text-indigo-400" />
            </div>
            <div>
              <p className="font-semibold text-sm text-slate-200">Drag & Drop PDF Score</p>
              <p className="text-xs text-slate-500 mt-1">or click to browse local files</p>
            </div>
          </div>

          <button
            onClick={handleGoogleDrivePick}
            disabled={loading || (!isOnline && isGoogleConfigured)}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-xl border border-white/10 bg-[#121212] hover:bg-white/5 disabled:opacity-50 text-slate-200 font-semibold text-sm transition-all"
          >
            <Chrome className="w-5 h-5 text-indigo-400" />
            Open from Google Drive
          </button>

          {loading && (
            <div className="flex items-center justify-center gap-3 py-2 text-xs text-indigo-400 font-semibold">
              <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              Processing score files...
            </div>
          )}
        </div>

        {/* Library List Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <h3 className="text-lg font-bold font-display text-slate-300">My Score Library</h3>

            {/* Filter Tabs */}
            <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/5">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'all' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setActiveTab('local')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'local' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Local
              </button>
              <button
                onClick={() => setActiveTab('drive')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeTab === 'drive' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Google Drive
              </button>
            </div>
          </div>

          {filteredFiles.length === 0 ? (
            <div className="py-16 text-center text-slate-500 bg-white/5 border border-white/5 rounded-2xl flex flex-col items-center gap-3">
              <FileText className="w-10 h-10 text-slate-600" />
              <p className="text-sm font-semibold">Your music catalog is empty</p>
              <p className="text-xs">Drag in local PDFs or import from Google Drive to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  onClick={() => onOpenFile(file)}
                  className="glass-card p-4 flex gap-4 cursor-pointer relative items-start group select-none"
                >
                  {/* Thumbnail / Source representation */}
                  <div className="w-16 h-20 rounded bg-slate-900 border border-white/10 shrink-0 flex items-center justify-center relative overflow-hidden">
                    {file.thumbnail ? (
                      <img src={file.thumbnail} alt={file.name} className="w-full h-full object-cover" />
                    ) : (
                      <FileText className="w-8 h-8 text-slate-600" />
                    )}
                    
                    {/* Badge representing Source */}
                    <div
                      className="absolute top-1 right-1 p-0.5 rounded bg-slate-950/80 border border-white/10"
                      title={file.source === 'google-drive' ? 'Google Drive' : 'Local file'}
                    >
                      {file.source === 'google-drive' ? (
                        <Chrome className="w-3.5 h-3.5 text-indigo-400" />
                      ) : (
                        <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0 pr-8">
                    <h4 className="font-semibold text-sm text-slate-100 truncate group-hover:text-indigo-400 transition-colors">
                      {file.name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <span>{formatSize(file.size)}</span>
                      <span>•</span>
                      <span>Page {file.lastPage}</span>
                    </p>
                    <p className="text-[10px] text-slate-600 mt-2">
                      Opened {formatDate(file.lastOpened)}
                    </p>

                    {/* Cache & Offline Status Indicator */}
                    <div className="flex items-center gap-1.5 mt-3">
                      {file.offline ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/15">
                          <CheckCircle2 className="w-3 h-3" /> Saved Offline
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/15">
                          <CloudLightning className="w-3 h-3" /> Temporary (Online)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions overlay */}
                  <div className="absolute right-3 top-3 flex flex-col gap-1">
                    {/* Cache offline control */}
                    <button
                      onClick={(e) => toggleOfflineCache(file, e)}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        file.offline
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-400'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                      title={file.offline ? "Remove from offline cache" : "Save for offline use"}
                    >
                      {file.offline ? <Trash2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                    </button>

                    {/* Delete record control */}
                    <button
                      onClick={(e) => deleteFileRecord(file.id, e)}
                      className="p-1.5 rounded-lg border border-white/5 bg-white/5 text-slate-400 hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-400 transition-colors"
                      title="Remove from library"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default LibraryPage;
