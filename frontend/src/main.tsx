import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import App from './App.tsx';

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
