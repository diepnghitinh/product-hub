import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, setToken } from './api';
import type { AuthResponse, UserDto } from '@/types/dto';
import { Role } from '@/types/enums';

interface AuthState {
  user: UserDto | null;
  loading: boolean;
  /** Workspace admin: people, settings, and deleting Roadmaps/OKRs. [admin] */
  isAdmin: boolean;
  /** Create/edit Planning content — projects, Roadmaps & OKRs.
   *  [admin, tester, product] */
  canWrite: boolean;
  /** Edit Delivery work items — test cases, bugs, tasks.
   *  [admin, tester, product, developer] */
  canEditDelivery: boolean;
  /** Delivery management — archive/delete/share projects, delete bugs, assign
   *  work (needs the people list). [admin, product] */
  canManageDelivery: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    tenantName: string,
    name: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate the session from a stored token on first load.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/me')
      .then((res) => {
        if (!cancelled) setUser(res.data.data as UserDto);
      })
      .catch(() => {
        setToken(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    const data = res.data.data as AuthResponse;
    setToken(data.token);
    setUser(data.user);
  }

  async function register(
    tenantName: string,
    name: string,
    email: string,
    password: string,
  ) {
    const res = await api.post('/auth/register', {
      tenantName,
      name,
      email,
      password,
    });
    const data = res.data.data as AuthResponse;
    setToken(data.token);
    setUser(data.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  // Derived role gates — single source of truth for the whole app, so components
  // never re-implement `user?.role === Role.ADMIN`. Mirrors the backend @Roles matrix.
  const role = user?.role;
  const isAdmin = role === Role.ADMIN;
  const canWrite = isAdmin || role === Role.TESTER || role === Role.PRODUCT;
  const canEditDelivery = canWrite || role === Role.DEVELOPER;
  const canManageDelivery = isAdmin || role === Role.PRODUCT;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        canWrite,
        canEditDelivery,
        canManageDelivery,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
