import React, { useState, useRef, useEffect, useId } from 'react';
import { flushSync } from 'react-dom';
import {
  Plus, Sun, Moon, Cloud, HardDrive, Info, BookOpen,
  ChevronDown, Settings, User
} from 'lucide-react';
import { googleDriveService } from '../services/googleDriveService';
import type { AppSettings } from '../services/settingsService';
import { AppSettingsDialog, getAccountConnectionStatus, type AppSettingsTab } from './AppSettingsDialog';
import { AddScoreDialog } from './AddScoreDialog';

interface HeaderBarProps {
  theme: 'dark' | 'light';
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  cloudBusy?: boolean;
  cloudError?: string | null;
  onToggleTheme: () => void;
  onAddScore: () => void;
  onOpenDrive?: () => void;
  onOpenGuide: () => void;
  onOpenAbout: () => void;
  isGoogleConfigured: boolean;
  isOnline: boolean;
  driveToken: string | null;
  onDriveLogout?: () => void;
  onChooseAccount?: () => void;
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
  settings,
  onSettingsChange,
  cloudBusy = false,
  cloudError,
  onToggleTheme,
  onAddScore,
  onOpenDrive,
  onOpenGuide,
  onOpenAbout,
  isGoogleConfigured,
  isOnline,
  driveToken,
  onDriveLogout,
  onChooseAccount,
  stats,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAddScore, setShowAddScore] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sourcesRef = useRef<HTMLDivElement>(null);
  const sourcesButtonRef = useRef<HTMLButtonElement>(null);
  const sourcesId = useId();
  const [settingsTab, setSettingsTab] = useState<AppSettingsTab | null>(null);
  const [imgError, setImgError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // An offline library remains selected even after its online token expires.
  const userProfile = googleDriveService.getUserProfile();

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

  const connectionStatus = getAccountConnectionStatus(isOnline, Boolean(driveToken), userProfile);
  const closeMenu = () => {
    setMenuOpen(false);
    accountButtonRef.current?.focus();
  };
  const openSettings = (tab: AppSettingsTab) => {
    closeMenu();
    setSettingsTab(tab);
  };
  // The importer may open a picker immediately: unmount the modal before invoking
  // it, without yielding the original user gesture to an effect or a timer.
  const leaveSettings = (action: () => void) => {
    flushSync(() => setSettingsTab(null));
    action();
  };
  const leaveAddScore = (action: () => void) => {
    flushSync(() => setShowAddScore(false));
    action();
  };
  const chooseSource = (action: () => void) => {
    flushSync(() => setSourcesOpen(false));
    sourcesButtonRef.current?.focus();
    action();
  };
  const cloudDisabled = !isOnline || !isGoogleConfigured || !onOpenDrive || cloudBusy;
  const cloudHint = !isGoogleConfigured || !onOpenDrive ? 'Google Drive is not configured'
    : !isOnline ? 'Connect to the internet to use Google Drive'
      : cloudBusy ? 'A cloud action is in progress'
        : driveToken ? 'Browse and select a score'
          : userProfile ? 'Reconnect Google Drive to select a score' : 'Sign in with Google to select a score';
  const menuButtonClass = 'w-full min-h-[44px] flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors hover:bg-[var(--md-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--md-primary)]';

  useEffect(() => {
    if (!sourcesOpen) return;
    document.getElementById(sourcesId)?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: Event) => {
      if (!sourcesRef.current?.contains(event.target as Node)) setSourcesOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSourcesOpen(false);
        sourcesButtonRef.current?.focus();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const buttons = Array.from(document.getElementById(sourcesId)?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        if (!buttons.length) return;
        event.preventDefault();
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', keydown);
    };
  }, [sourcesOpen, sourcesId]);

  // Native buttons use normal Tab navigation; this disclosure is not an ARIA menu.
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        accountButtonRef.current?.focus();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(false);
        accountButtonRef.current?.focus();
      }
    };
    const handleFocusOutside = (event: FocusEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusOutside);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusOutside);
    };
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
          <div ref={sourcesRef} className="relative hidden sm:inline-flex rounded-full shadow-sm" style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)' }}>
            <button
              type="button"
              onClick={event => { setSourcesOpen(false); setMenuOpen(false); event.currentTarget.focus(); setShowAddScore(true); }}
              className="md-btn-filled hidden sm:inline-flex min-h-[44px] items-center gap-1.5 text-xs py-2 px-3.5 rounded-l-full active:scale-95"
              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
              title="Choose where to import a score from"
              aria-haspopup="dialog"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Score</span>
            </button>
            <button
              ref={sourcesButtonRef}
              type="button"
              aria-label="Quick add score sources"
              aria-expanded={sourcesOpen}
              aria-controls={sourcesOpen ? sourcesId : undefined}
              title="Quick import from device or Google Drive"
              onClick={() => { setMenuOpen(false); setSourcesOpen(open => !open); }}
              onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSourcesOpen(true); } }}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-r-full border-l border-current/20 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-primary)]"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${sourcesOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {sourcesOpen && (
              <ul id={sourcesId} aria-label="Score sources" className="absolute right-0 top-full z-50 mt-2 w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border py-1 shadow-xl" style={{ background: 'var(--md-surface-1)', color: 'var(--md-on-surface)', borderColor: 'var(--md-outline-variant)' }}>
                <li><button type="button" onClick={() => chooseSource(onAddScore)} className={menuButtonClass}>
                  <HardDrive className="w-4 h-4 text-[var(--md-primary)]" aria-hidden="true" />From this device
                </button></li>
                <li title={cloudHint}><button type="button" disabled={cloudDisabled} aria-describedby={`${sourcesId}-cloud-help`} onClick={() => { if (onOpenDrive) chooseSource(onOpenDrive); }} className={`${menuButtonClass} disabled:opacity-50 disabled:cursor-not-allowed`}>
                  <Cloud className="w-4 h-4 text-[var(--md-primary)]" aria-hidden="true" />From Google Drive
                </button><span id={`${sourcesId}-cloud-help`} className="sr-only">{cloudHint}</span></li>
              </ul>
            )}
          </div>

          {/* Quick Theme Toggle Button */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="md-icon-btn text-inherit"
            style={{ minWidth: 44, minHeight: 44 }}
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
              ref={accountButtonRef}
              type="button"
              onClick={() => { setSourcesOpen(false); setMenuOpen(open => !open); }}
              className="min-h-[44px] flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full transition-all border select-none active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-primary)]"
              style={{
                background: menuOpen ? 'var(--md-surface-3)' : 'var(--md-surface-2)',
                borderColor: menuOpen ? 'var(--md-primary)' : 'var(--md-outline-variant)',
                color: 'var(--md-on-surface)',
              }}
              title="Account & settings"
              aria-label="Account and settings"
              aria-controls={menuOpen ? menuId : undefined}
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
                className={`w-3.5 h-3.5 transition-transform duration-200 ${menuOpen ? 'rotate-180 text-[var(--md-primary)]' : 'text-[var(--md-on-surface-variant)]'
                  }`}
              />
            </button>

            {/* Menu Dropdown */}
            {menuOpen && (
              <div
                id={menuId}
                className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl shadow-2xl py-2 z-50 border animate-fade"
                style={{
                  background: 'var(--md-surface-1)',
                  borderColor: 'var(--md-outline-variant)',
                  boxShadow: 'var(--md-card-shadow-hover)',
                }}
              >
                <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--md-outline-variant)' }}>
                  <p className="break-words text-sm font-semibold" style={{ color: 'var(--md-on-surface)' }}>
                    {userProfile?.name || userProfile?.email || (driveToken ? 'Google account' : 'Not connected')}
                  </p>
                  <p role="status" className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--md-on-surface-variant)' }}>{connectionStatus}</p>
                </div>
                <div className="py-1" style={{ color: 'var(--md-on-surface)' }}>
                  <button type="button" onClick={() => openSettings('general')} className={menuButtonClass}>
                    <Settings className="w-4 h-4 text-[var(--md-primary)]" aria-hidden="true" />Settings
                  </button>
                  <button type="button" onClick={() => openSettings('account')} className={menuButtonClass}>
                    <Cloud className="w-4 h-4 text-[var(--md-primary)]" aria-hidden="true" />Account &amp; cloud
                  </button>
                  <button type="button" onClick={() => { closeMenu(); setShowAddScore(true); }} title="Choose where to import a score from" aria-haspopup="dialog" className={`${menuButtonClass} sm:hidden`}>
                    <Plus className="w-4 h-4 text-[var(--md-primary)]" aria-hidden="true" />Add Score
                    <ChevronDown className="ml-auto w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => { closeMenu(); onOpenGuide(); }} className={menuButtonClass}>
                    <BookOpen className="w-4 h-4" aria-hidden="true" />How to Use Guide
                  </button>
                  <button type="button" onClick={() => { closeMenu(); onOpenAbout(); }} className={menuButtonClass}>
                    <Info className="w-4 h-4" aria-hidden="true" />About Score Tone
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {showAddScore && (
        <AddScoreDialog
          onClose={() => setShowAddScore(false)}
          onAddScore={() => leaveAddScore(onAddScore)}
          onOpenDrive={onOpenDrive ? () => leaveAddScore(onOpenDrive) : undefined}
          profile={userProfile}
          connected={Boolean(driveToken)}
          configured={isGoogleConfigured}
          online={isOnline}
          cloudBusy={cloudBusy}
        />
      )}
      {settingsTab !== null && (
        <AppSettingsDialog
          tab={settingsTab}
          onTabChange={setSettingsTab}
          onClose={() => setSettingsTab(null)}
          settings={settings}
          onSettingsChange={onSettingsChange}
          profile={userProfile}
          connected={Boolean(driveToken)}
          configured={isGoogleConfigured}
          online={isOnline}
          cloudBusy={cloudBusy}
          cloudError={cloudError}
          onOpenDrive={onOpenDrive ? () => leaveSettings(onOpenDrive) : undefined}
          onChooseAccount={onChooseAccount}
          onDriveLogout={onDriveLogout}
          stats={stats}
        />
      )}
    </header>
  );
};

export default HeaderBar;
