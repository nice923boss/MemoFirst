import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { get } from '../api/client';

export interface Identity {
  email: string;
  displayName: string;
  role: 'admin' | 'member';
  isAdmin: boolean;
  isHost: boolean;
}

interface AuthContextValue {
  identity: Identity | null;
  isAdmin: boolean;
  displayName: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await get<Identity>('/auth/me');
    setIdentity(result.success && result.data ? result.data : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{
        identity,
        isAdmin: identity?.isAdmin ?? false,
        displayName: identity?.displayName ?? null,
        loading,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
