import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '../types';
import { useUIStore } from './uiStore';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setAuth: (token, user) => {
        // Somebody else signing in on this device must not inherit the last
        // person's conversation with the assistant. It is held in memory,
        // not on the server, so nothing else would clear it.
        const previous = useAuthStore.getState().user;
        if (previous && previous.id !== user.id) useUIStore.getState().clearAiMessages();

        localStorage.setItem('onlyfunds_token', token);
        set({ token, user, isAuthenticated: true });
      },
      logout: () => {
        // The conversation can hold screenshots of this account and answers
        // about its money. Signing out has to take it with it — the next
        // person at this phone is not necessarily the same person.
        useUIStore.getState().clearAiMessages();
        useUIStore.getState().setAiOpen(false);

        localStorage.removeItem('onlyfunds_token');
        set({ token: null, user: null, isAuthenticated: false });
      },
    }),
    { name: 'onlyfunds_auth' }
  )
);
