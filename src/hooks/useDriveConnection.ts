import { useEffect, useState } from 'react';
import { googleDriveService, GOOGLE_ACCOUNT_CHANGED_EVENT, GOOGLE_CONNECTION_CHANGED_EVENT } from '../services/googleDriveService';

/** Observe credentials, not just remembered identity. Never initiates OAuth. */
export function useDriveConnection(): string | null {
  const [token, setToken] = useState(() => googleDriveService.getCachedToken());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      const current = googleDriveService.getCachedToken();
      setToken(current);
      if (current) timer = setTimeout(update, Math.max(1, googleDriveService.getTokenValidityRemainingMs()));
    };
    update();
    window.addEventListener(GOOGLE_ACCOUNT_CHANGED_EVENT, update);
    window.addEventListener(GOOGLE_CONNECTION_CHANGED_EVENT, update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(GOOGLE_ACCOUNT_CHANGED_EVENT, update);
      window.removeEventListener(GOOGLE_CONNECTION_CHANGED_EVENT, update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return token;
}