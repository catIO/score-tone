import React, { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, FileUp, HardDrive, X } from 'lucide-react';
import type { GoogleUserProfile } from '../services/googleDriveService';

export interface AddScoreDialogProps {
  onClose: () => void;
  onAddScore: () => void;
  onOpenDrive?: () => void;
  profile: GoogleUserProfile | null;
  connected: boolean;
  configured: boolean;
  online: boolean;
  cloudBusy?: boolean;
}

const focusStyle = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-primary)]';
const sourceStyle = `flex min-h-[44px] w-full items-start gap-4 rounded-2xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-2)] p-5 text-left transition-colors enabled:hover:bg-[var(--md-surface-3)] disabled:cursor-not-allowed disabled:opacity-60 ${focusStyle}`;

export const AddScoreDialog: React.FC<AddScoreDialogProps> = ({
  onClose, onAddScore, onOpenDrive, profile, connected, configured, online, cloudBusy = false,
}) => {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Match Settings' modal lifecycle without triggering any authentication.
  useLayoutEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current!;
    deviceRef.current?.focus();

    const focusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]',
    )).filter(element => {
      if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[hidden], [inert]')) return false;
      for (let node: HTMLElement | null = element; node && node !== dialog; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const elements = focusableElements();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          dialog.focus();
        } else if (!elements.includes(document.activeElement as HTMLElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const handleFocus = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) (focusableElements()[0] || dialog).focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocus);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const cloudDisabled = !online || !configured || !onOpenDrive || cloudBusy;
  const driveDescription = [
    !online ? 'You’re offline. Connect to the internet to import from Google Drive.'
      : connected ? 'Google Drive connected. Browse and select a score.'
        : profile ? 'Account remembered · Drive reconnect required. Reconnect to browse and select a score.'
          : 'Sign in with Google to browse and select a score. No account is needed for device imports.',
    !configured ? 'Google Drive is not configured for this installation.' : '',
    !onOpenDrive ? 'Google Drive import is unavailable in this view.' : '',
    cloudBusy ? 'Working… Please wait for the current cloud action to finish.' : '',
  ].filter(Boolean).join(' ');

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-sm"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        tabIndex={-1}
        className="flex max-h-[90dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-3xl border shadow-2xl"
        style={{ background: 'var(--md-surface-1)', color: 'var(--md-on-surface)', borderColor: 'var(--md-outline-variant)' }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }}>
              <FileUp size={22} aria-hidden="true" />
            </span>
            <h2 id={`${id}-title`} className="text-xl font-semibold" style={{ fontFamily: 'Outfit, sans-serif' }}>Add Score</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Add Score" className={`flex h-11 w-11 items-center justify-center rounded-full hover:bg-[var(--md-surface-2)] ${focusStyle}`}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-5 pb-6 pt-3 sm:px-6">
          <p id={`${id}-description`} className="text-sm text-[var(--md-on-surface-variant)]">Choose where to import a score from. Supports PDF, MusicXML (.xml, .musicxml), and compressed MusicXML (.mxl).</p>
          <button ref={deviceRef} type="button" onClick={onAddScore} aria-labelledby={`${id}-device-title`} aria-describedby={`${id}-device-description`} className={sourceStyle}>
            <HardDrive size={24} className="shrink-0 text-[var(--md-primary)]" aria-hidden="true" />
            <span>
              <span id={`${id}-device-title`} className="block text-base font-semibold">From this device</span>
              <span id={`${id}-device-description`} className="mt-2 block text-sm leading-relaxed text-[var(--md-on-surface-variant)]">Choose a PDF, XML, MusicXML, or MXL file. Works offline, no account needed. Files stay on this device and are not uploaded.</span>
            </span>
          </button>
          <button type="button" onClick={onOpenDrive} disabled={cloudDisabled} aria-busy={cloudBusy} aria-labelledby={`${id}-drive-title`} aria-describedby={`${id}-drive-description`} className={sourceStyle}>
            <Cloud size={24} className="shrink-0 text-[var(--md-primary)]" aria-hidden="true" />
            <span>
              <span id={`${id}-drive-title`} className="block text-base font-semibold">From Google Drive</span>
              <span id={`${id}-drive-description`} role="status" className="mt-2 block text-sm leading-relaxed text-[var(--md-on-surface-variant)]">{driveDescription}</span>
            </span>
          </button>
          <p className="text-xs leading-relaxed text-[var(--md-on-surface-variant)]">Google Drive is the only supported cloud provider. Other cloud services: download the file, then choose From this device.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AddScoreDialog;