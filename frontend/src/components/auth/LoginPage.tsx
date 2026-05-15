import { useState, type FormEvent } from 'react';
import { login } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await login(email, password);
      setAuth(token, user);
    } catch {
      setError('Invalid credentials. Try admin@doi-dash.com / password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 flex items-center justify-center mb-4 border border-accent-blue/60 text-accent-blue text-3xl"
            style={{ boxShadow: '0 0 18px rgba(56,189,248,0.35), inset 0 0 18px rgba(56,189,248,0.08)' }}
          >
            ◈
          </div>
          <h1
            className="font-pixel text-xl text-accent-blue tracking-widest"
            style={{ textShadow: '0 0 12px rgba(56,189,248,0.7)' }}
          >
            DOI DASH
          </h1>
          <p className="font-tech text-[11px] text-gray-500 tracking-[0.3em] uppercase mt-1">
            MT5 Trading Dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5" autoComplete="off">
          <div>
            <label className="font-pixel text-[8px] text-gray-400 tracking-widest uppercase block mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="off"
              placeholder="admin@doi-dash.com"
              className="w-full bg-bg-primary border border-border2 px-3 py-2.5 font-tech text-sm text-white placeholder-gray-700 focus:outline-none focus:border-accent-blue transition-colors"
              required
            />
          </div>
          <div>
            <label className="font-pixel text-[8px] text-gray-400 tracking-widest uppercase block mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
              className="w-full bg-bg-primary border border-border2 px-3 py-2.5 font-tech text-sm text-white placeholder-gray-700 focus:outline-none focus:border-accent-blue transition-colors"
              required
            />
          </div>

          {error && (
            <p className="font-tech text-xs text-danger bg-danger/10 border border-danger/30 px-3 py-2">
              ✗ {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
            {loading ? 'CONNECTING...' : 'SIGN IN'}
          </button>

          <p className="text-center font-tech text-[11px] text-gray-700">
            demo: admin@doi-dash.com / password
          </p>
        </form>
      </div>
    </div>
  );
};
