import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import App from './App.tsx';

/**
 * Drive the app shell's height from window.innerHeight.
 *
 * iOS resolves dvh lazily: installed to the home screen, the first paint can
 * come back short, so the bottom nav sat floating above the screen edge until
 * a scroll nudged Safari into recalculating. window.innerHeight is the real
 * number at every point, and unlike visualViewport it does not shrink when the
 * keyboard opens — so the layout stays put while typing.
 */
const syncAppHeight = () => {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
};
syncAppHeight();
window.addEventListener('resize', syncAppHeight);
window.addEventListener('orientationchange', syncAppHeight);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10000,
    },
  },
});

// Empty string disables Google login — useful for local dev without OAuth
// credentials; the button simply doesn't render until VITE_GOOGLE_CLIENT_ID
// is set in the deploy environment.
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const app = (
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);

// Mounting the provider with an empty client id makes Google's script throw
// once it loads, which blanks the page — so only mount it when configured.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {googleClientId
      ? <GoogleOAuthProvider clientId={googleClientId}>{app}</GoogleOAuthProvider>
      : app}
  </StrictMode>,
);
