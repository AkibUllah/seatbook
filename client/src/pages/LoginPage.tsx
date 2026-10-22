import { useState, FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import GradientButton from '../components/GradientButton';
import { api, errorMessage } from '../api';
import { saveSession, SessionUser } from '../session';

// Where to go after login, but only somewhere on this site, so a crafted link can't
// send people to another one. Resolve it like the browser will: string checks
// miss tricks such as "/\evil.com", which browsers treat as "//evil.com".
function sameSitePath(next: string | null) {
  if (!next) return '/';
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}

export default function LoginPage() {
  const [params] = useSearchParams();
  const returnTo = sameSitePath(params.get('next'));
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<SessionUser['role']>('ATTENDEE');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const data = await api<{ token: string; user: SessionUser }>(`/auth/${isLogin ? 'login' : 'register'}`, {
        method: 'POST',
        body: isLogin ? { email, password } : { email, password, name, role },
      });
      saveSession(data.token, data.user);
      window.location.href = returnTo;
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex justify-center py-10">
      <div className="glass rounded-3xl p-10 w-[440px] glow">
        <div className="text-center mb-8">
          <div className="text-6xl animate-float">🎟️</div>
          <h1 className="mt-4 text-4xl font-extrabold">
            {isLogin ? 'Welcome ' : 'Join '}
            <span className="gradient-text">{isLogin ? 'Back!' : 'Seatbook!'}</span>
          </h1>
          <p className="mt-2 text-white/50">
            {isLogin ? 'Sign in to continue your journey ✨' : 'Start booking amazing events today 🚀'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <input
                placeholder="👤 Full name"
                aria-label="Full name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all duration-300"
              />
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-white/5 border border-white/10" role="radiogroup">
                {(
                  [
                    ['ATTENDEE', '🎟️ Book seats'],
                    ['ORGANIZER', '🎤 Host events'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={role === value}
                    onClick={() => setRole(value)}
                    className={`py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                      role === value ? 'bg-gradient-to-r from-[#a855f7] to-[#ec4899]' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          <input
            type="email"
            placeholder="📧 Email address"
            aria-label="Email address"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all duration-300"
          />
          <input
            type="password"
            placeholder={isLogin ? '🔒 Password' : '🔒 Password (8+ characters)'}
            aria-label="Password"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            required
            minLength={isLogin ? undefined : 8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all duration-300"
          />
          {error && <p className="text-[#fca5a5] text-sm">⚠️ {error}</p>}
          <GradientButton type="submit" disabled={submitting}>
            {isLogin ? 'Sign In 🚀' : 'Create Account ✨'}
          </GradientButton>
        </form>
        <p className="mt-6 text-center text-white/50">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-[#a855f7] cursor-pointer hover:underline"
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
