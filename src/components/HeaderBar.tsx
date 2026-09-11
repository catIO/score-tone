import React, { useState, useRef, useEffect } from 'react';
import {
  FileUp, Sun, Moon, Cloud, Info, BookOpen,
  ChevronDown, LogOut, CheckCircle2, User
} from 'lucide-react';
import { googleDriveService } from '../services/googleDriveService';

interface HeaderBarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onAddScore: () => void;
  onOpenDrive?: () => void;
  onOpenGuide: () => void;
  onOpenAbout: () => void;
  isGoogleConfigured: boolean;
  isOnline: boolean;
  driveToken: string | null;
  onDriveLogout?: () => void;
  stats: {
    totalScores: number;
    pdfCount: number;
    xmlCount: number;
    driveCount: number;
    offlineCount: number;
  };
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  theme,
  onToggleTheme,
  onAddScore,
  onOpenDrive,
  onOpenGuide,
  onOpenAbout,
  isGoogleConfigured,
  isOnline,
  driveToken,
  onDriveLogout,
  stats,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const userProfile = driveToken ? googleDriveService.getUserProfile() : null;

  // Reset img error if user profile changes
  useEffect(() => {
    setImgError(false);
  }, [userProfile?.picture]);

  const showPicture = Boolean(userProfile?.picture && !imgError);

  const initials = (() => {
    if (!userProfile) return null;
    if (userProfile.given_name) return userProfile.given_name.slice(0, 2).toUpperCase();
    if (userProfile.name) {
      const parts = userProfile.name.trim().split(/\s+/);
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return userProfile.name.slice(0, 2).toUpperCase();
    }
    if (userProfile.email) return userProfile.email.slice(0, 2).toUpperCase();
    return 'GD';
  })();

  const displayName = userProfile?.name || (userProfile?.email ? userProfile.email.split('@')[0] : (driveToken ? 'Connected' : 'Account'));

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <header
      className="sticky top-0 z-40 w-full transition-colors duration-200 border-b safe-top"
      style={{
        background: 'var(--md-surface)',
        borderColor: 'var(--md-outline-variant)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-[68px] flex items-center justify-between gap-4">
        {/* ── Brand Lockup ── */}
        <div className="flex items-center gap-3.5 shrink-0 select-none">
          <div className="relative flex items-center justify-center">
            <svg viewBox="0 -960 960 960" className="w-10 h-10 sm:w-11 sm:h-11 drop-shadow-sm transition-transform hover:scale-105">
              {/* Outer folder frames */}
              <path
                d="M320-240q-33 0-56.5-23.5T240-320v-480q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H320Zm0-80h480v-480H320v480ZM160-80q-33 0-56.5-23.5T80-160v-560h80v560h560v80H160Zm160-720v480-480Z"
                fill="currentColor"
                style={{ color: 'var(--md-on-surface-variant)' }}
              />
              {/* The note (amber yellow tint) */}
              <path
                d="M500-360q42 0 71-29t29-71v-220h120v-80H560v220q-13-10-28-15t-32-5q-42 0-71 29t-29 71q0 42 29 71t71 29Z"
                fill="var(--md-primary)"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className="text-lg sm:text-xl font-bold tracking-tight leading-tight"
                style={{ color: 'var(--md-on-surface)', fontFamily: 'Outfit, sans-serif' }}
              >
                Score Tone
              </span>
            </div>
            <p className="hidden sm:block text-xs sm:text-[13px] leading-tight mt-0.5" style={{ color: 'var(--md-on-surface-variant)' }}>
              Your sheet music, in perfect light
            </p>
          </div>
        </div>

        {/* ── Right Action Cluster ── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Add Score button (prominent filled action) */}
          <button
            onClick={onAddScore}
            className="md-btn-filled hidden sm:inline-flex items-center gap-1.5 text-xs py-2 px-3.5 rounded-full shadow-sm active:scale-95"
            title="Upload PDF or MusicXML score"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>Add Score</span>
          </button>

          {/* Quick Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className="md-icon-btn text-inherit"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-300 transition-transform duration-300 hover:rotate-45" />
            ) : (
              <Moon className="w-4 h-4 text-amber-900 transition-transform duration-300 hover:-rotate-12" />
            )}
          </button>

          {/* User Profile / Account Menu Pill */}
          <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full transition-all border select-none active:scale-95"
                  style={{
                    background: menuOpen ? 'var(--md-surface-3)' : 'var(--md-surface-2)',
                    borderColor: menuOpen ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                    color: 'var(--md-on-surface)',
                  }}
                  title="Account & settings"
                  aria-expanded={menuOpen}
                >
                  {/* Avatar / Profile image / Initials */}
                  {showPicture ? (
                    <img
                      src={userProfile!.picture}
                      alt={displayName}
                      referrerPolicy="no-referrer"
                      onError={() => setImgError(true)}
                      className="w-7 h-7 rounded-full object-cover shadow-sm border"
                      style={{ borderColor: 'var(--md-outline-variant)' }}
                    />
                  ) : initials ? (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-sm"
                      style={{
                        background: 'var(--md-primary)',
                        color: 'var(--md-on-primary)',
                        fontFamily: 'Outfit, sans-serif',
                      }}
                    >
                      {initials}
                    </div>
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center border"
                      style={{
                        background: 'var(--md-surface-3)',
                        borderColor: 'var(--md-outline-variant)',
                        color: 'var(--md-on-surface-variant)',
                      }}
                    >
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <span className="hidden md:inline text-xs font-semibold max-w-[110px] truncate">
                    {displayName}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      menuOpen ? 'rotate-180 text-[var(--md-primary)]' : 'text-[var(--md-on-surface-variant)]'
                    }`}
                  />
                </button>

                {/* Menu Dropdown */}
                {menuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-64 rounded-2xl shadow-2xl py-2 z-50 border animate-fade overflow-hidden"
                    style={{
                      background: 'var(--md-surface-1)',
                      borderColor: 'var(--md-outline-variant)',
                      boxShadow: 'var(--md-card-shadow-hover)',
                    }}
                  >
                    {/* Profile Header */}
                    <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--md-outline-variant)' }}>
                      <div className="flex items-center gap-3">
                        {showPicture ? (
                          <img
                            src={userProfile!.picture}
                            alt=""
                            referrerPolicy="no-referrer"
                            onError={() => setImgError(true)}
                            className="w-9 h-9 rounded-full object-cover shrink-0 border"
                            style={{ borderColor: 'var(--md-outline-variant)' }}
                          />
                        ) : initials ? (
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                            style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)' }}
                          >
                            {initials}
                          </div>
                        ) : (
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center border shrink-0"
                            style={{ background: 'var(--md-surface-2)', borderColor: 'var(--md-outline-variant)', color: 'var(--md-on-surface-variant)' }}
                          >
                            <User className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold truncate" style={{ color: 'var(--md-on-surface)' }}>
                            {userProfile?.name || (driveToken ? 'Google Drive Account' : 'Local Library')}
                          </div>
                          <div className="text-[11px] truncate flex items-center gap-1.5" style={{ color: 'var(--md-on-surface-variant)' }}>
                            {driveToken ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span className="truncate">{userProfile?.email || 'Drive Connected'}</span>
                              </>
                            ) : (
                              <span>This device only</span>
                            )}
                            {!isOnline && (
                              <span className="text-amber-500 font-semibold">• Offline</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Connect Drive prompt if not connected */}
                      {!driveToken && isGoogleConfigured && onOpenDrive && (
                        <button
                          onClick={() => { setMenuOpen(false); onOpenDrive(); }}
                          className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full text-xs font-semibold transition-all active:scale-95"
                          style={{
                            background: 'var(--md-primary-container)',
                            color: 'var(--md-on-primary-container)',
                          }}
                        >
                          <Cloud className="w-3.5 h-3.5" />
                          <span>Connect Google Drive</span>
                        </button>
                      )}
                    </div>

                {/* Storage / Library Quick Stats */}
                <div
                  className="mx-3 my-2 p-2.5 rounded-xl flex items-center justify-between text-[11px]"
                  style={{ background: 'var(--md-surface-2)', color: 'var(--md-on-surface-variant)' }}
                >
                  <div className="text-center flex-1">
                    <div className="font-bold text-xs" style={{ color: 'var(--md-on-surface)' }}>{stats.totalScores}</div>
                    <div className="text-[10px]">Scores</div>
                  </div>
                  <div className="w-[1px] h-6 bg-current opacity-20" />
                  <div className="text-center flex-1">
                    <div className="font-bold text-xs" style={{ color: 'var(--md-on-surface)' }}>{stats.offlineCount}</div>
                    <div className="text-[10px]">Offline</div>
                  </div>
                  <div className="w-[1px] h-6 bg-current opacity-20" />
                  <div className="text-center flex-1">
                    <div className="font-bold text-xs" style={{ color: 'var(--md-on-surface)' }}>{stats.driveCount}</div>
                    <div className="text-[10px]">Drive</div>
                  </div>
                </div>

                {/* Actions List */}
                <div className="py-1">
                  {/* Add Score Option (Mobile shortcut) */}
                  <div
                    onClick={() => { setMenuOpen(false); onAddScore(); }}
                    className="flex items-center justify-between px-4 py-2.5 text-xs cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5 sm:hidden"
                    style={{ color: 'var(--md-on-surface)' }}
                  >
                    <div className="flex items-center gap-2.5">
                      <FileUp className="w-4 h-4 text-amber-500" />
                      <span>Add Score</span>
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--md-on-surface-variant)' }}>
                      PDF / XML
                    </span>
                  </div>

                  {/* Theme Switcher Row */}
                  <div
                    onClick={onToggleTheme}
                    className="flex items-center justify-between px-4 py-2.5 text-xs cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ color: 'var(--md-on-surface)' }}
                  >
                    <div className="flex items-center gap-2.5">
                      {theme === 'dark' ? <Moon className="w-4 h-4 text-amber-400" /> : <Sun className="w-4 h-4 text-amber-600" />}
                      <span>Appearance</span>
                    </div>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize"
                      style={{ background: 'var(--md-surface-3)', color: 'var(--md-primary)' }}
                    >
                      {theme} Mode
                    </span>
                  </div>

                  {/* Google Drive Option */}
                  {isGoogleConfigured && onOpenDrive && (
                    <div
                      onClick={() => { setMenuOpen(false); onOpenDrive(); }}
                      className="flex items-center justify-between px-4 py-2.5 text-xs cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                      style={{ color: 'var(--md-on-surface)' }}
                    >
                      <div className="flex items-center gap-2.5">
                        <Cloud className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span>Google Drive</span>
                      </div>
                      <span className="text-[10px]" style={{ color: 'var(--md-on-surface-variant)' }}>
                        {driveToken ? 'Active' : 'Connect'}
                      </span>
                    </div>
                  )}

                  {/* How to Use Guide */}
                  <div
                    onClick={() => { setMenuOpen(false); onOpenGuide(); }}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-xs cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ color: 'var(--md-on-surface)' }}
                  >
                    <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>How to Use Guide</span>
                  </div>

                  {/* About Modal */}
                  <div
                    onClick={() => { setMenuOpen(false); onOpenAbout(); }}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-xs cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ color: 'var(--md-on-surface)' }}
                  >
                    <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>About Score Tone</span>
                  </div>
                </div>

                {/* Google Drive Logout / Disconnect if active */}
                {driveToken && onDriveLogout && (
                  <div className="pt-1 border-t" style={{ borderColor: 'var(--md-outline-variant)' }}>
                    <div
                      onClick={() => { setMenuOpen(false); onDriveLogout(); }}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs cursor-pointer transition-colors text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Disconnect Google Drive</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default HeaderBar;
