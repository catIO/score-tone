import React, { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, ExternalLink, Settings, User, X } from 'lucide-react';
import type { AppSettings } from '../services/settingsService';
import type { GoogleUserProfile } from '../services/googleDriveService';

export type AppSettingsTab = 'general' | 'account';

export interface AppSettingsDialogProps {
    tab: AppSettingsTab;
    onTabChange: (tab: AppSettingsTab) => void;
    onClose: () => void;
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    profile: GoogleUserProfile | null;
    connected: boolean;
    configured: boolean;
    online: boolean;
    cloudBusy?: boolean;
    cloudError?: string | null;
    onOpenDrive?: () => void;
    onChooseAccount?: () => void;
    onDriveLogout?: () => void;
    onAddScore: () => void;
    stats?: { totalScores: number; offlineCount: number; driveCount: number };
}

export function getAccountConnectionStatus(online: boolean, connected: boolean, profile: GoogleUserProfile | null): string {
    if (!online) return profile ? 'Offline · Account remembered' : 'Offline · Device library';
    if (connected) return 'Google Drive connected';
    if (profile) return 'Account remembered · Drive reconnect required';
    return 'No account connected · Device library';
}

const focusStyle = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-primary)]';
const secondaryButton = `min-h-[44px] px-4 py-2 rounded-xl border border-[var(--md-outline-variant)] text-sm font-medium hover:bg-[var(--md-surface-2)] disabled:opacity-50 disabled:cursor-not-allowed ${focusStyle}`;
const cardStyle: React.CSSProperties = {
    background: 'var(--md-surface-2)',
    borderColor: 'var(--md-outline-variant)',
};

function SegmentedChoice<T extends string>({ label, value, options, onChange }: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-semibold">{label}</legend>
            <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--md-surface-2)' }}>
                {options.map(option => (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={value === option.value}
                        onClick={() => onChange(option.value)}
                        className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${focusStyle}`}
                        style={{
                            background: value === option.value ? 'var(--md-primary-container)' : 'transparent',
                            color: value === option.value ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
                        }}
                    >{option.label}</button>
                ))}
            </div>
        </fieldset>
    );
}

function PreferenceToggle({ label, description, checked, onChange }: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    const id = useId();
    return (
        <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4 py-3">
            <span>
                <span className="block text-sm font-medium">{label}</span>
                <span id={id} className="mt-1 block text-xs leading-relaxed text-[var(--md-on-surface-variant)]">{description}</span>
            </span>
            <input
                type="checkbox"
                checked={checked}
                onChange={event => onChange(event.target.checked)}
                aria-label={label}
                aria-describedby={id}
                className={`h-5 w-5 shrink-0 cursor-pointer accent-[var(--md-primary)] ${focusStyle}`}
            />
        </label>
    );
}

export const AppSettingsDialog: React.FC<AppSettingsDialogProps> = ({
    tab, onTabChange, onClose, settings, onSettingsChange, profile, connected,
    configured, online, cloudBusy = false, cloudError, onOpenDrive, onChooseAccount,
    onDriveLogout, onAddScore, stats,
}) => {
    const id = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const tabRefs = useRef<Partial<Record<AppSettingsTab, HTMLButtonElement | null>>>({});
    const initialTab = useRef(tab);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useLayoutEffect(() => {
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const dialog = dialogRef.current!;
        tabRefs.current[initialTab.current]?.focus();

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

    const updateSettings = (patch: Partial<AppSettings>) => onSettingsChange({ ...settings, ...patch });
    const cloudDisabled = !online || !configured || cloudBusy;
    const status = getAccountConnectionStatus(online, connected, profile);
    const tabs: AppSettingsTab[] = ['general', 'account'];

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
                tabIndex={-1}
                className="flex max-h-[90dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-3xl border shadow-2xl"
                style={{ background: 'var(--md-surface-1)', color: 'var(--md-on-surface)', borderColor: 'var(--md-outline-variant)' }}
            >
                <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }}>
                            <Settings size={22} aria-hidden="true" />
                        </span>
                        <h2 id={`${id}-title`} className="text-xl font-semibold" style={{ fontFamily: 'Outfit, sans-serif' }}>Settings</h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close settings" className={`flex h-11 w-11 items-center justify-center rounded-full hover:bg-[var(--md-surface-2)] ${focusStyle}`}>
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                <div role="tablist" aria-label="Settings categories" className="mx-5 mb-2 flex shrink-0 gap-1 rounded-xl p-1 sm:mx-6" style={{ background: 'var(--md-surface-2)' }}>
                    {tabs.map((value, index) => (
                        <button
                            key={value}
                            ref={element => { tabRefs.current[value] = element; }}
                            type="button"
                            role="tab"
                            id={`${id}-${value}-tab`}
                            aria-controls={`${id}-${value}-panel`}
                            aria-selected={tab === value}
                            tabIndex={tab === value ? 0 : -1}
                            onClick={() => onTabChange(value)}
                            onKeyDown={event => {
                                let next: AppSettingsTab;
                                if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
                                else if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length];
                                else if (event.key === 'Home') next = tabs[0];
                                else if (event.key === 'End') next = tabs[tabs.length - 1];
                                else return;
                                event.preventDefault();
                                onTabChange(next);
                                tabRefs.current[next]?.focus();
                            }}
                            className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${focusStyle}`}
                            style={{ background: tab === value ? 'var(--md-primary-container)' : 'transparent', color: tab === value ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)' }}
                        >{value === 'general' ? 'General' : 'Account & cloud'}</button>
                    ))}
                </div>

                <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-6 pt-3 sm:px-6">
                    <section role="tabpanel" id={`${id}-general-panel`} aria-labelledby={`${id}-general-tab`} hidden={tab !== 'general'}>
                        <p className="mb-5 text-xs leading-relaxed text-[var(--md-on-surface-variant)]">Preferences are saved immediately on this device and apply to your score viewer.</p>
                        <div className="space-y-5">
                            <SegmentedChoice label="Theme" value={settings.theme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} onChange={theme => updateSettings({ theme })} />
                            <div className="grid gap-5 sm:grid-cols-2">
                                <SegmentedChoice label="PDF layout" value={settings.scrollMode} options={[{ value: 'single', label: 'Single page' }, { value: 'continuous', label: 'Continuous' }]} onChange={scrollMode => updateSettings({ scrollMode })} />
                                <SegmentedChoice label="PDF fit" value={settings.fitMode} options={[{ value: 'width', label: 'Width' }, { value: 'height', label: 'Height' }]} onChange={fitMode => updateSettings({ fitMode })} />
                            </div>
                            <div className="divide-y divide-[var(--md-outline-variant)]">
                                <PreferenceToggle label="Two-page landscape" description="Show facing PDF pages in landscape, in single-page layout." checked={settings.twoPageLandscape} onChange={twoPageLandscape => updateSettings({ twoPageLandscape })} />
                                <PreferenceToggle label="Auto-hide controls" description="Keep controls out of the way while viewing a score." checked={settings.autoHideControls} onChange={autoHideControls => updateSettings({ autoHideControls })} />
                                <PreferenceToggle label="Keep screen awake" description="Applies while viewing a score on supported devices; does not keep the screen awake in Settings." checked={settings.keepScreenAwake} onChange={keepScreenAwake => updateSettings({ keepScreenAwake })} />
                                <PreferenceToggle label="Right-hand fingering" description="Show guitar fingering (p, i, m, a) in MusicXML scores." checked={settings.showRightHandFingering} onChange={showRightHandFingering => updateSettings({ showRightHandFingering })} />
                            </div>
                            <div>
                                <label htmlFor={`${id}-tap-width`} className="flex justify-between gap-3 text-sm font-medium">
                                    <span>Tap zone width</span><span className="text-[var(--md-primary)]">{settings.tapZoneWidth}%</span>
                                </label>
                                <input id={`${id}-tap-width`} type="range" min={10} max={40} step={5} value={settings.tapZoneWidth} aria-valuetext={`${settings.tapZoneWidth}%`} aria-describedby={`${id}-tap-help`} onChange={event => updateSettings({ tapZoneWidth: Number(event.target.value) })} className={`min-h-[44px] w-full accent-[var(--md-primary)] ${focusStyle}`} />
                                <p id={`${id}-tap-help`} className="text-xs text-[var(--md-on-surface-variant)]">Width of each page-turn area along the edges of the viewer.</p>
                            </div>
                        </div>
                    </section>

                    <section role="tabpanel" id={`${id}-account-panel`} aria-labelledby={`${id}-account-tab`} hidden={tab !== 'account'} className="space-y-4">
                        <div className="flex items-start gap-3">
                            <User className="mt-1 shrink-0 text-[var(--md-primary)]" size={22} aria-hidden="true" />
                            <div className="min-w-0">
                                <h3 className="break-words text-base font-semibold">{profile?.name || profile?.email || (profile ? 'Google account' : 'Device library')}</h3>
                                {profile?.email && profile.name && <p className="break-all text-sm text-[var(--md-on-surface-variant)]">{profile.email}</p>}
                                <p role="status" className="mt-1 text-xs leading-relaxed text-[var(--md-on-surface-variant)]">{status}</p>
                            </div>
                        </div>

                        <div className="rounded-2xl border p-4" style={cardStyle} aria-busy={cloudBusy}>
                            <h3 className="flex items-center gap-2 text-sm font-semibold"><Cloud size={20} className="text-[var(--md-primary)]" aria-hidden="true" />Google Drive</h3>
                            <p className="mb-4 mt-2 text-xs leading-relaxed text-[var(--md-on-surface-variant)]">Import PDF and MusicXML scores from Google Drive. Google Drive is the only supported cloud provider.</p>
                            {!online && <p className="mb-3 text-xs text-[var(--md-warning-text)]">You’re offline. Connect to the internet to use cloud actions.</p>}
                            {!configured && <p className="mb-3 text-xs text-[var(--md-on-surface-variant)]">Google Drive is not configured for this installation.</p>}
                            {cloudError && <p role="alert" className="mb-3 rounded-xl p-3 text-sm" style={{ background: 'var(--md-error-container)', color: 'var(--md-error)' }}>{cloudError}</p>}
                            <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={cloudDisabled || !onOpenDrive} onClick={onOpenDrive} className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${focusStyle}`} style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)' }}>
                                    {cloudBusy ? 'Working…' : connected ? 'Import from Google Drive' : profile ? 'Reconnect Google Drive' : 'Connect Google Drive'}
                                </button>
                                <button type="button" disabled={cloudDisabled || !onChooseAccount} onClick={onChooseAccount} className={secondaryButton}>Choose Google account</button>
                            </div>
                        </div>

                        {stats && <dl className="grid grid-cols-3 gap-2 rounded-2xl p-4 text-center" style={cardStyle}>
                            {[['Scores', stats.totalScores], ['Offline', stats.offlineCount], ['From Drive', stats.driveCount]].map(([label, count]) => (
                                <div key={label}><dt className="text-xs text-[var(--md-on-surface-variant)]">{label}</dt><dd className="mt-1 text-lg font-semibold">{count}</dd></div>
                            ))}
                        </dl>}

                        <div className="space-y-3 text-xs leading-relaxed text-[var(--md-on-surface-variant)]">
                            <p>Drive access tokens are kept in memory and lost on reload. Your account is remembered, but Drive may need reconnecting.</p>
                            <p>Disconnecting switches to the device library. Account scores stay saved on this device, hidden until that account is selected again. It does not delete scores or revoke Google access.</p>
                            {profile && <button type="button" disabled={!onDriveLogout} onClick={onDriveLogout} className={`${secondaryButton} w-full text-[var(--md-on-surface)] sm:w-auto`}>Disconnect · use device library</button>}
                            <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg text-[var(--md-primary)] underline underline-offset-4 ${focusStyle}`}>Manage Google permissions<span className="sr-only"> (opens in a new tab)</span><ExternalLink size={14} aria-hidden="true" /></a>
                        </div>

                        <div className="border-t pt-4" style={{ borderColor: 'var(--md-outline-variant)' }}>
                            <p className="mb-3 text-xs leading-relaxed text-[var(--md-on-surface-variant)]">Other cloud providers are not yet supported. Use device import for files downloaded from another provider.</p>
                            <button type="button" onClick={onAddScore} className={secondaryButton}>Import from device</button>
                        </div>
                    </section>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default AppSettingsDialog;