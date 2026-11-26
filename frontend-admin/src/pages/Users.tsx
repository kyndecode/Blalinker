import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import AccessDenied, { isForbidden } from '../components/AccessDenied';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import ExportButton from '../components/ui/ExportButton';
import { useToast } from '../components/ui/Toast';
import api from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

interface UserRow {
  id: string; phone: string | null; email: string | null;
  role: string; status: string; createdAt: string;
  profile: { firstName: string; lastName: string } | null;
}
interface UserDetail extends UserRow {
  lastLoginAt: string | null;
  profile: (NonNullable<UserRow['profile']> & {
    city?: string | null; country?: string | null; idVerified?: boolean; idVerifiedAt?: string | null;
    hasIdDocument?: boolean; dateOfBirth?: string | null; address?: string | null;
  }) | null;
  _count?: { clientBookings: number; providerBookings: number; receivedReviews: number };
}

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Actif', cls: 'bg-green-900/50 text-green-400' },
  pending: { label: 'En attente', cls: 'bg-yellow-900/50 text-yellow-400' },
  suspended: { label: 'Suspendu', cls: 'bg-orange-900/50 text-orange-400' },
  banned: { label: 'Banni', cls: 'bg-red-900/50 text-red-400' },
};
const ROLES: Record<string, string> = { client: 'Client', provider: 'Prestataire', admin: 'Équipe', super_admin: 'Super-admin' };
const STAFF = ['admin', 'super_admin'];

type StatusAction = { user: UserRow; next: 'active' | 'suspended' | 'banned' };
const STATUS_ACTIONS: Record<StatusAction['next'], { title: string; label: string; message: string; danger?: boolean }> = {
  active: { title: 'Réactiver le compte', label: 'Réactiver', message: 'Le compte pourra de nouveau se connecter.' },
  suspended: { title: 'Suspendre le compte', label: 'Suspendre', message: 'Toutes les sessions du compte sont fermées immédiatement. Réversible.', danger: true },
  banned: { title: 'Bannir le compte', label: 'Bannir', message: 'Toutes les sessions sont fermées et le compte ne peut plus se connecter. Aucune donnée n’est supprimée.', danger: true },
};

const fullName = (u: { profile: { firstName: string; lastName: string } | null }) =>
  (u.profile ? `${u.profile.firstName} ${u.profile.lastName}`.trim() : '') || '-';

interface Activity {
  lastLoginAt: string | null; failedAttempts: number; lockedUntil: string | null;
  logins: Array<{ success: boolean; at: string; ip: string | null; method: string | null }>;
  sessions: Array<{ id: string; createdAt: string; lastUsedAt: string; ipAddress: string | null }>;
}
const METHOD_LABELS: Record<string, string> = {
  password: 'mot de passe', mfa_email: 'code e-mail', mfa_totp: 'application', mfa_recovery: 'code de secours',
  google: 'Google', otp_registration: 'inscription',
};

/** Historique des connexions et sessions ouvertes (IP masquée sans la permission « audit »). */
function UserActivity({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuery<Activity>({
    queryKey: ['admin-user-activity', userId],
    queryFn: () => api.get(`/admin/users/${userId}/activity`).then((r) => r.data),
  });
  return (
    <section aria-labelledby="activity-title" className="rounded-xl border border-white/10 p-4">
      <h3 id="activity-title" className="mb-2 font-semibold">Connexions</h3>
      {isLoading && <p className="text-gray-400">Chargement…</p>}
      {error && <p role="alert" className="text-red-400">{getApiErrorMessage(error)}</p>}
      {data && (
        <>
          <p className="text-gray-300">
            {data.sessions.length} session(s) ouverte(s){data.failedAttempts > 0 ? ` · ${data.failedAttempts} échec(s) récent(s)` : ''}
            {data.lockedUntil && new Date(data.lockedUntil) > new Date() ? ` · verrouillé jusqu’au ${new Date(data.lockedUntil).toLocaleString('fr-FR')}` : ''}
          </p>
          {data.logins.length === 0
            ? <p className="mt-1 text-gray-400">Aucune connexion enregistrée depuis la mise en place de l’historique.</p>
            : (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                {data.logins.map((l, i) => (
                  <li key={i} className="flex flex-wrap gap-x-3">
                    <span className={l.success ? 'text-green-400' : 'text-red-400'}>{l.success ? 'Réussie' : 'Échec'}</span>
                    <span className="text-gray-300">{new Date(l.at).toLocaleString('fr-FR')}</span>
                    {l.method && <span className="text-gray-400">{METHOD_LABELS[l.method] ?? l.method}</span>}
                    {l.ip && <span className="text-gray-500">{l.ip}</span>}
                  </li>
                ))}
              </ul>
            )}
        </>
      )}
    </section>
  );
}

function UserPanel({ userId, onClose, onStatus }: { userId: string | null; onClose: () => void; onStatus: (a: StatusAction) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [approving, setApproving] = useState(false);

  const { data: user, isLoading, error } = useQuery<UserDetail>({
    queryKey: ['admin-user', userId],
    queryFn: () => api.get(`/admin/users/${userId}`).then((r) => r.data),
    enabled: Boolean(userId),
  });

  const viewDocument = useMutation({
    mutationFn: () => api.get(`/admin/users/${userId}/id-document`).then((r) => r.data as { url: string; protectedDelivery: boolean }),
    onSuccess: (doc) => {
      if (!/^https:\/\//.test(doc.url)) {
        toast.error('Adresse du document invalide.');
        return;
      }
      window.open(doc.url, '_blank', 'noopener,noreferrer');
      if (!doc.protectedDelivery) toast.info('Document déposé avant la protection : à migrer (script kyc:protect-documents).');
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const verify = useMutation({
    mutationFn: (body: { approved: boolean; comment?: string }) => api.post(`/admin/users/${userId}/verify-id`, body).then((r) => r.data),
    onSuccess: (res) => {
      toast.success(res?.activated ? `${res.message} (compte activé)` : res?.message ?? 'Décision enregistrée');
      setRejecting(false);
      setApproving(false);
      qc.invalidateQueries({ queryKey: ['admin-user', userId] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const isStaff = user ? STAFF.includes(user.role) : false;
  const p = user?.profile;

  return (
    <Modal open={Boolean(userId)} onClose={onClose} title={user ? fullName(user) : 'Utilisateur'} size="lg">
      {isLoading && <p className="text-sm text-gray-400">Chargement…</p>}
      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}
      {user && (
        <div className="space-y-5 text-sm">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <div><dt className="text-gray-400">Rôle</dt><dd>{ROLES[user.role] ?? user.role}</dd></div>
            <div><dt className="text-gray-400">Statut</dt><dd><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[user.status]?.cls ?? ''}`}>{STATUS[user.status]?.label ?? user.status}</span></dd></div>
            <div><dt className="text-gray-400">E-mail</dt><dd className="break-all">{user.email ?? 'Non renseigné'}</dd></div>
            <div><dt className="text-gray-400">Téléphone</dt><dd>{user.phone ?? 'Non renseigné'}</dd></div>
            <div><dt className="text-gray-400">Ville</dt><dd>{[p?.city, p?.country].filter(Boolean).join(', ') || 'Non renseignée'}</dd></div>
            <div><dt className="text-gray-400">Dernière connexion</dt><dd>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('fr-FR') : 'Jamais'}</dd></div>
            {user._count && (
              <div className="sm:col-span-2"><dt className="text-gray-400">Activité</dt>
                <dd>{user._count.clientBookings} réservation(s) client · {user._count.providerBookings} mission(s) · {user._count.receivedReviews} avis reçu(s)</dd></div>
            )}
          </dl>

          {!isStaff && (
            <section aria-labelledby="kyc-title" className="rounded-xl border border-white/10 p-4">
              <h3 id="kyc-title" className="mb-2 font-semibold">Vérification d’identité</h3>
              <p className="text-gray-300">
                {p?.idVerified
                  ? `Identité vérifiée${p.idVerifiedAt ? ` le ${new Date(p.idVerifiedAt).toLocaleDateString('fr-FR')}` : ''}.`
                  : p?.hasIdDocument ? 'Pièce déposée, en attente de vérification.' : 'Aucune pièce déposée.'}
              </p>
              {p?.dateOfBirth !== undefined && (
                <p className="mt-1 text-gray-400">Date de naissance : {p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('fr-FR') : 'non renseignée'}</p>
              )}
              {p?.hasIdDocument && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => viewDocument.mutate()} disabled={viewDocument.isPending} className="rounded-lg border border-blue-500/40 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/10 disabled:opacity-50">
                    {viewDocument.isPending ? 'Ouverture…' : 'Voir la pièce (lien temporaire)'}
                  </button>
                  {!p.idVerified && (
                    <button onClick={() => { verify.reset(); setApproving(true); }} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">Valider l’identité</button>
                  )}
                  <button onClick={() => { verify.reset(); setRejecting(true); }} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10">Refuser la pièce</button>
                </div>
              )}
            </section>
          )}

          {!isStaff && (
            <div className="flex flex-wrap gap-2">
              {user.status !== 'active' && <button onClick={() => onStatus({ user, next: 'active' })} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">Réactiver</button>}
              {user.status !== 'suspended' && <button onClick={() => onStatus({ user, next: 'suspended' })} className="rounded-lg border border-orange-500/40 px-3 py-1.5 text-xs font-semibold text-orange-300">Suspendre</button>}
              {user.status !== 'banned' && <button onClick={() => onStatus({ user, next: 'banned' })} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300">Bannir</button>}
            </div>
          )}
          {isStaff && <p className="text-gray-400">Compte de l’équipe : géré depuis la page « Équipe ».</p>}
          <UserActivity userId={user.id} />
        </div>
      )}

      <ConfirmDialog
        open={approving}
        title="Valider l’identité"
        message="Confirmez avoir consulté la pièce et vérifié sa conformité. Un compte en attente sera activé ; un compte suspendu ou banni reste inchangé."
        confirmLabel="Valider"
        busy={verify.isPending}
        error={verify.isError ? getApiErrorMessage(verify.error) : null}
        onClose={() => setApproving(false)}
        onConfirm={() => verify.mutate({ approved: true })}
      />
      <ConfirmDialog
        open={rejecting}
        danger
        title="Refuser la pièce d’identité"
        message="La personne est prévenue avec le motif et pourra déposer un nouveau document."
        confirmLabel="Refuser"
        reason={{ label: 'Motif communiqué à la personne', required: true, minLength: 5, placeholder: 'Ex. : document illisible, pièce expirée…' }}
        busy={verify.isPending}
        error={verify.isError ? getApiErrorMessage(verify.error) : null}
        onClose={() => setRejecting(false)}
        onConfirm={(comment) => verify.mutate({ approved: false, comment })}
      />
    </Modal>
  );
}

export default function Users() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);

  const { data, isLoading, error } = useQuery<{ data: UserRow[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['admin-users', page, search, status, role],
    queryFn: () => api.get('/admin/users', {
      params: { page, limit: 20, search: search || undefined, status: status || undefined, role: role || undefined },
    }).then((r) => r.data),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, next, reason }: { id: string; next: string; reason?: string }) =>
      api.put(`/admin/users/${id}/status`, { status: next, ...(reason ? { reason } : {}) }).then((r) => r.data),
    onSuccess: () => {
      toast.success('Statut mis à jour');
      setStatusAction(null);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-user'] });
    },
  });

  if (isForbidden(error)) return <AccessDenied permission="Voir utilisateurs" />;

  const cfg = statusAction ? STATUS_ACTIONS[statusAction.next] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Utilisateurs</h1>
        <ExportButton dataset="users" params={{ search, status, role }} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <label htmlFor="users-search" className="sr-only">Rechercher</label>
          <input
            id="users-search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher e-mail / téléphone…"
            className="w-full rounded-lg border border-white/10 bg-[#1a2744] py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <select aria-label="Filtrer par rôle" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="rounded-lg border border-white/10 bg-[#1a2744] px-3 py-2 text-sm text-white">
          <option value="">Tous les rôles</option>
          <option value="client">Clients</option>
          <option value="provider">Prestataires</option>
        </select>
        <select aria-label="Filtrer par statut" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-white/10 bg-[#1a2744] px-3 py-2 text-sm text-white">
          <option value="">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="active">Actifs</option>
          <option value="suspended">Suspendus</option>
          <option value="banned">Bannis</option>
        </select>
      </div>

      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}

      <div role="region" aria-label="Tableau : Utilisateurs" tabIndex={0} className="relative overflow-x-auto rounded-xl border border-white/10 bg-[#1a2744] focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th scope="col" className="px-4 py-3 text-left font-medium">Utilisateur</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Contact</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Rôle</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Statut</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Inscription</th>
              <th scope="col" className="px-4 py-3 text-left font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-white/10"><td colSpan={6} className="px-4 py-3"><div className="h-4 w-3/4 animate-pulse rounded bg-white/10" /></td></tr>
              ))
              : (data?.data ?? []).map((u) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-white">{fullName(u)}</td>
                  <td className="px-4 py-3 text-gray-300">{u.email ?? u.phone ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-300">{ROLES[u.role] ?? u.role}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[u.status]?.cls ?? ''}`}>{STATUS[u.status]?.label ?? u.status}</span></td>
                  <td className="px-4 py-3 text-gray-400">{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setSelected(u.id)} aria-label={`Ouvrir la fiche de ${fullName(u)}`} className="rounded-lg border border-white/15 px-3 py-1 text-xs text-gray-200 hover:bg-white/10">Ouvrir</button>
                  </td>
                </tr>
              ))}
            {!isLoading && (data?.data?.length ?? 0) === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucun utilisateur ne correspond.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.meta && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} label="utilisateurs" onChange={setPage} />}

      <UserPanel userId={selected} onClose={() => setSelected(null)} onStatus={(a) => { updateStatus.reset(); setStatusAction(a); }} />

      <ConfirmDialog
        open={Boolean(statusAction)}
        title={cfg?.title ?? ''}
        message={<>{statusAction ? fullName(statusAction.user) : ''} : {cfg?.message}</>}
        confirmLabel={cfg?.label ?? ''}
        danger={cfg?.danger}
        reason={statusAction?.next === 'active' ? undefined : { label: 'Motif (journalisé)', required: true, minLength: 5 }}
        busy={updateStatus.isPending}
        error={updateStatus.isError ? getApiErrorMessage(updateStatus.error) : null}
        onClose={() => setStatusAction(null)}
        onConfirm={(reason) => statusAction && updateStatus.mutate({ id: statusAction.user.id, next: statusAction.next, reason })}
      />
    </div>
  );
}
