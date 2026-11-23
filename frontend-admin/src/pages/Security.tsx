import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck, ShieldAlert, Copy, Download } from 'lucide-react';
import api from '../services/api';
import { getFriendlyError } from './Login';

type MfaStatus = {
  totpEnabled: boolean;
  totpEnabledAt: string | null;
  recoveryCodesRemaining: number;
  setupRequired: boolean;
  enforced: boolean;
};

type SetupData = {
  issuer: string;
  account: string | null;
  qrCodeDataUrl: string;
  manualEntryKey: string;
  expiresInSeconds: number;
};

const card = 'bg-white rounded-xl border border-gray-200 p-6 shadow-sm';
const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500';
const primary = 'px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-lg';

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = `BLA Services — codes de récupération (usage unique)\n\n${codes.join('\n')}\n`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // presse-papiers indisponible : l'utilisateur peut télécharger le fichier
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bla-codes-recuperation.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={card}>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Vos codes de récupération</h2>
      <p className="text-sm text-gray-600 mb-4">
        Chaque code ne fonctionne qu'une fois. Conservez-les hors de votre téléphone (gestionnaire de mots de passe,
        papier). <strong>Ils ne seront plus jamais affichés.</strong>
      </p>
      <ul aria-label="Codes de récupération" className="grid grid-cols-2 gap-2 font-mono text-sm mb-4">
        {codes.map((c) => (
          <li key={c} className="bg-gray-100 rounded px-3 py-2 text-center tracking-wider">{c}</li>
        ))}
      </ul>
      <div className="flex gap-2 mb-4">
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 px-3 py-2 border rounded-lg text-sm">
          <Copy className="w-4 h-4" /> Copier
        </button>
        <button type="button" onClick={download} className="inline-flex items-center gap-1 px-3 py-2 border rounded-lg text-sm">
          <Download className="w-4 h-4" /> Télécharger (.txt)
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        J'ai conservé mes codes de récupération
      </label>
      <button type="button" disabled={!saved} onClick={onDone} className={primary}>Terminer</button>
    </div>
  );
}

export default function Security() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await api.get<MfaStatus>('/auth/mfa/status');
      setStatus(res.data);
    } catch (err) {
      setError(getFriendlyError(err));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const startSetup = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post<SetupData>('/auth/mfa/totp/setup', { password });
      setSetup(res.data);
      setPassword('');
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const activate = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ recoveryCodes: string[] }>('/auth/mfa/totp/activate', { code });
      setSetup(null); // le secret disparaît de l'écran dès l'activation
      setCode('');
      setRecoveryCodes(res.data.recoveryCodes);
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const regenerate = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ recoveryCodes: string[] }>('/auth/mfa/recovery-codes', { code });
      setCode('');
      setRecoveryCodes(res.data.recoveryCodes);
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    setRecoveryCodes(null);
    await loadStatus();
    navigate('/securite', { replace: true });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <KeyRound className="w-7 h-7 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sécurité du compte</h1>
          <p className="text-gray-500 text-sm">Validation en deux étapes par application d'authentification</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {recoveryCodes ? (
        <RecoveryCodes codes={recoveryCodes} onDone={finish} />
      ) : !status ? (
        <p className="text-gray-500">Chargement…</p>
      ) : status.totpEnabled ? (
        <>
          <div className={card}>
            <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
              <ShieldCheck className="w-5 h-5" /> Application d'authentification activée
            </div>
            <p className="text-sm text-gray-600">
              Depuis le {status.totpEnabledAt ? new Date(status.totpEnabledAt).toLocaleDateString('fr-FR') : '—'}.
              Codes de récupération restants : <strong>{status.recoveryCodesRemaining}</strong>.
            </p>
          </div>
          <form onSubmit={regenerate} className={card}>
            <h2 className="font-semibold text-gray-900 mb-1">Nouveaux codes de récupération</h2>
            <p className="text-sm text-gray-600 mb-3">Les anciens codes cesseront de fonctionner.</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              aria-label="Code de l'application"
              placeholder="Code de l'application (6 chiffres)"
              className={`${input} mb-3`}
            />
            <button type="submit" disabled={loading || code.length !== 6} className={primary}>Générer de nouveaux codes</button>
          </form>
        </>
      ) : setup ? (
        <form onSubmit={activate} className={card}>
          <h2 className="font-semibold text-gray-900 mb-3">2. Scannez le QR code</h2>
          <p className="text-sm text-gray-600 mb-4">
            Avec Google Authenticator ou Microsoft Authenticator, ajoutez un compte puis scannez ce code
            (compte « {setup.account} », émetteur « {setup.issuer} »).
          </p>
          <img src={setup.qrCodeDataUrl} alt="QR code de configuration" className="w-48 h-48 mx-auto mb-4 border rounded" />
          <p className="text-xs text-gray-500 mb-1">Impossible de scanner ? Saisissez cette clé :</p>
          <p className="font-mono text-sm bg-gray-100 rounded px-3 py-2 mb-4 break-all" aria-label="Clé de configuration">{setup.manualEntryKey}</p>
          <label className="block text-sm font-medium text-gray-700 mb-1">3. Code affiché par l'application</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Premier code de l'application"
            placeholder="000000"
            className={`${input} mb-3 tracking-[0.5em] text-center`}
          />
          <button type="submit" disabled={loading || code.length !== 6} className={primary}>Activer</button>
          <p className="text-xs text-gray-500 mt-3">Cette configuration expire dans {Math.round(setup.expiresInSeconds / 60)} minutes.</p>
        </form>
      ) : (
        <form onSubmit={startSetup} className={card}>
          {status.setupRequired && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-sm mb-4">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>
                Configurez votre application d'authentification : elle remplacera le code reçu par e-mail à chaque
                connexion (le code par e-mail restera disponible en secours).
              </span>
            </div>
          )}
          <h2 className="font-semibold text-gray-900 mb-3">1. Confirmez votre mot de passe</h2>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Mot de passe"
            placeholder="Mot de passe"
            className={`${input} mb-3`}
          />
          <button type="submit" disabled={loading || !password} className={primary}>Configurer l'application</button>
        </form>
      )}
    </div>
  );
}
