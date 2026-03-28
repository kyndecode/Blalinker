import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button }  from '../../components/common/Button';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';

export default function VerifyOTP() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { setTokens, setUser } = useAuthStore();

  const phone   = params.get('phone') || '';
  const email   = params.get('email') || '';

  const [codes, setCodes]       = useState(['', '', '', '', '', '']);
  const [error, setError]        = useState('');
  const [loading, setLoading]   = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown((v) => v - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...codes];
    next[index] = value;
    setCodes(next);
    if (value && index < 5) refs.current[index + 1]?.focus();
    if (!value && index > 0) refs.current[index - 1]?.focus();

    // Auto-submit quand les 6 chiffres sont saisis
    if (value && index === 5 && next.every((c) => c)) {
      submit(next.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !codes[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const next = pasted.split('');
      setCodes(next);
      refs.current[5]?.focus();
      submit(pasted);
    }
    e.preventDefault();
  };

  const submit = async (code: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', {
        phone:   phone || undefined,
        email:   email || undefined,
        code,
      });
      setTokens(res.data.accessToken, res.data.refreshToken);
      setUser(res.data.user);
      navigate('/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error || 'Code incorrect');
      setCodes(['', '', '', '', '', '']);
      refs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await api.post('/auth/resend-otp', { phone: phone || undefined, email: email || undefined });
      setResendCooldown(60);
    } catch {
      setError('Erreur lors du renvoi du code');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card max-w-sm w-full text-center">
        <span className="text-5xl" aria-hidden="true">📱</span>
        <h1 className="text-xl font-bold text-gray-900 mt-3 mb-1">Vérification</h1>
        <p className="text-sm text-gray-600 mb-6">
          Code envoyé au <strong>{phone || email}</strong>
        </p>

        {error && (
          <p className="text-red-600 text-sm mb-4 bg-red-50 p-2 rounded-lg" role="alert">{error}</p>
        )}

        {/* Inputs OTP */}
        <div
          className="flex gap-2 justify-center mb-6"
          onPaste={handlePaste}
          aria-label="Entrer le code OTP à 6 chiffres"
        >
          {codes.map((code, i) => (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={code}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-11 h-12 text-center text-lg font-bold border-2 border-gray-300 rounded-lg focus:border-primary-500 focus:outline-none transition-colors"
              aria-label={`Chiffre ${i + 1}`}
              disabled={loading}
            />
          ))}
        </div>

        <Button
          onClick={() => submit(codes.join(''))}
          loading={loading}
          disabled={codes.some((c) => !c)}
          className="w-full mb-3"
        >
          Vérifier
        </Button>

        <button
          onClick={handleResend}
          disabled={resendCooldown > 0}
          className="text-sm text-primary-600 hover:underline disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {resendCooldown > 0
            ? `Renvoyer dans ${resendCooldown}s`
            : 'Renvoyer le code'}
        </button>
      </div>
    </div>
  );
}
