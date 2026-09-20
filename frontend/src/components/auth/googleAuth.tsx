import type { ReactNode } from 'react';
import { useGoogleLogin } from '@react-oauth/google';

/** Google sign-in only exists when the build was given a client id. */
export const googleEnabled = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

/**
 * Holds the useGoogleLogin hook, so it only runs where Google sign-in is
 * actually offered. Hooks cannot be called conditionally, so a component that
 * calls useGoogleLogin directly still initialises Google's client with an
 * empty id when VITE_GOOGLE_CLIENT_ID is unset — and the moment Google's GSI
 * script finishes loading, that throws and takes the whole page down with it.
 *
 * Render-prop so each caller keeps its own button markup.
 */
export const GoogleAuth = ({ onToken, onError, children }: {
  onToken: (accessToken: string) => void;
  onError: () => void;
  children: (signIn: () => void) => ReactNode;
}) => {
  const signIn = useGoogleLogin({
    onSuccess: tokenResp => onToken(tokenResp.access_token),
    onError,
  });

  return <>{children(() => signIn())}</>;
};
