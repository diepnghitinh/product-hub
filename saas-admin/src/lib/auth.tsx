import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, getToken, setToken } from './api';
import type { PlatformAdmin, PlatformAuthResponse } from './types';

interface AuthState {
  admin: PlatformAdmin | null;
  /** True until the stored token has been checked against the API. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  const clear = useCallback(() => {
    setToken(null);
    setAdmin(null);
    qc.clear();
  }, [qc]);

  // A stored token is only a claim. Verify it before showing the console —
  // an operator deactivated since their last visit must not see a shell of
  // pages that then 401 one by one.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    apiGet<PlatformAdmin>('/platform/auth/me')
      .then((me) => {
        if (!cancelled) setAdmin(me);
      })
      .catch(() => {
        if (!cancelled) clear();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clear]);

  // The axios interceptor already dropped the token; this unmounts the console.
  useEffect(() => {
    const onExpired = () => setAdmin(null);
    window.addEventListener('platform-auth-expired', onExpired);
    return () => window.removeEventListener('platform-auth-expired', onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiPost<PlatformAuthResponse>('/platform/auth/login', {
      email,
      password,
    });
    setToken(res.token);
    setAdmin(res.admin);
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await apiPost('/platform/auth/change-password', { currentPassword, newPassword });
    },
    [],
  );

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout: clear, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
