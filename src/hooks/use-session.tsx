'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/client-api';
import type { GarageDTO, MeResponse, SessionUserDTO } from '@/types';

interface SessionContextValue {
  user: SessionUserDTO;
  garage: GarageDTO;
  isAdmin: boolean;
  /** Convenience guard used to hide admin-only actions in the UI. */
  can: (action: 'delete' | 'manageSettings' | 'manageUsers') => boolean;
  refresh: () => void;
  logout: () => Promise<void>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({
  initial,
  children,
}: {
  initial: MeResponse;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<MeResponse>('/api/auth/me'),
    initialData: initial,
    staleTime: 60_000,
  });

  const user = data?.user ?? initial.user;
  const garage = data?.garage ?? initial.garage;
  const isAdmin = user.role === 'ADMIN';

  const logout = React.useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      queryClient.clear();
      router.replace('/login');
      router.refresh();
    }
  }, [queryClient, router]);

  /* ------------------------------------------------------------------ */
  /* Inactivity auto-logout (garage-configurable, default 2 hours).      */
  /* ------------------------------------------------------------------ */
  React.useEffect(() => {
    const timeoutMs = Math.max(5, garage.sessionTimeoutMin) * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void api.post('/api/auth/logout').finally(() => {
          window.location.href = '/login?reason=timeout';
        });
      }, timeoutMs);
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'visibilitychange'];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [garage.sessionTimeoutMin]);

  const value = React.useMemo<SessionContextValue>(
    () => ({
      user,
      garage,
      isAdmin,
      can: () => isAdmin,
      refresh: () => queryClient.invalidateQueries({ queryKey: ['session'] }),
      logout,
    }),
    [user, garage, isAdmin, queryClient, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/** Formats money using the garage's configured currency. */
export function useCurrency() {
  const { garage } = useSession();
  return garage.currency;
}
