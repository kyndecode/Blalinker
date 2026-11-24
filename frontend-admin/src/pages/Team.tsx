import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { getApiErrorMessage } from '../utils/apiError';

/** Règle identique au serveur : 10 caractères minimum, une majuscule, une minuscule, un chiffre. */
export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 10) issues.push('10 caractères minimum');
  if (!/[A-Z]/.test(pw)) issues.push('une majuscule');
  if (!/[a-z]/.test(pw)) issues.push('une minuscule');
  if (!/\d/.test(pw)) issues.push('un chiffre');
  return issues;
}

function ResetPasswordDialog({ member, busy, error, onClose, onSubmit }: { member: { email?: string | null } | null; busy: boolean; error: string | null; onClose: () => void; onSubmit: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  const issues = passwordIssues(pw);
  return (
    <Modal open={Boolean(member)} onClose={() => { setPw(''); onClose(); }} title="Réinitialiser le mot de passe" description={`Compte : ${member?.email ?? ''}. Toutes ses sessions seront fermées.`}>
      <form onSubmit={(e) => { e.preventDefault(); if (issues.length === 0) { onSubmit(pw); setPw(''); } }} className="space-y-3">
        <label htmlFor="reset-pw" className="block text-sm text-gray-200">Nouveau mot de passe</label>
        <input id="reset-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-describedby="reset-pw-rules"
          className="w-full rounded-lg border border-white/10 bg-[#0f1b33] px-3 py-2 text-sm text-white" />
        <p id="reset-pw-rules" className="text-xs text-gray-400">{issues.length ? `Manque : ${issues.join(', ')}.` : 'Mot de passe conforme.'}</p>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={() => { setPw(''); onClose(); }} className="flex-1 rounded-lg border border-white/15 py-2 text-sm">Annuler</button>
          <button type="submit" disabled={busy || issues.length > 0} className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Enregistrement…' : 'Réinitialiser'}</button>
        </div>
      </form>
    </Modal>
  );
}
import { UserPlus, Shield, Power, KeyRound, Trash2, LogOut, X } from 'lucide-react';

interface Member {
  id: string;
  email: string | null;
  role: 'admin' | 'super_admin';
  status: string;
  adminTitle: string | null;
  permissions: string[];
  lastLoginAt: string | null;
  createdAt: string;
  profile: { firstName: string; lastName: string } | null;
}

interface Preset { key: string; label: string; permissions: string[] }

const PERMISSION_LABELS: Record<string, string> = {
  'users.read': 'Voir utilisateurs',
  'users.suspend': 'Suspendre / bannir',
  'users.delete': 'Supprimer utilisateurs',
  'providers.read': 'Voir prestataires',
  'providers.verify': 'Valider KYC',
  'bookings.read': 'Voir réservations',
  'payments.read': 'Voir paiements',
  'payments.refund': 'Rembourser',
  'reviews.moderate': 'Modérer les avis',
  'reports.handle': 'Gérer signalements',
  'contacts.handle': 'Gérer contacts',
  'categories.manage': 'Gérer catégories',
  'stats.read': 'Voir statistiques',
  'exports.run': 'Exporter',
  'audit.read': "Journal d'audit",
  'admins.manage': 'Gérer les admins',
  'content.manage': 'Gérer les contenus du site',
  'settings.manage': 'Gérer paramètres et pays',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-900/50 text-green-400',
  suspended: 'bg-orange-900/50 text-orange-400',
};

const emptyForm = { firstName: '', lastName: '', email: '', password: '', preset: '', adminTitle: '', permissions: [] as string[] };

export default function Team() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; member: Member }>(null);
  const toast = useToast();
  const [pwTarget, setPwTarget] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);

  const { data: meta } = useQuery({
    queryKey: ['team-meta'],
    queryFn: () => api.get('/admin/team/meta').then((r) => r.data as { permissions: string[]; presets: Preset[] }),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get('/admin/team', { params: { limit: 100 } }).then((r) => r.data),
    retry: false,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['team'] });

  const createM = useMutation({
    mutationFn: (body: typeof emptyForm) => api.post('/admin/team', body),
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const updateM = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/admin/team/${id}`, body),
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/team/${id}`),
    onSuccess: invalidate,
  });
  const forceLogoutM = useMutation({
    mutationFn: (id: string) => api.post(`/admin/team/${id}/force-logout`),
  });
  const resetPwM = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/admin/team/${id}/reset-password`, { password, forceLogout: true }),
  });

  if ((error as { response?: { status?: number } })?.response?.status === 403) {
    return (
      <div className="text-center py-20 text-white/60">
        <Shield className="w-10 h-10 mx-auto mb-3 text-white/30" />
        Accès réservé au super administrateur (permission « Gérer les admins »).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Équipe & Rôles</h1>
          <p className="text-white/40 text-sm mt-0.5">Gérez les administrateurs et leurs permissions (RBAC).</p>
        </div>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Nouveau membre
        </button>
      </div>

      <div className="bg-[#1a2744] rounded-xl border border-white/10 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">Membre</th>
              <th className="text-left px-4 py-3 font-medium">Rôle / Titre</th>
              <th className="text-left px-4 py-3 font-medium">Droits</th>
              <th className="text-left px-4 py-3 font-medium">Statut</th>
              <th className="text-left px-4 py-3 font-medium">Dernière connexion</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-white/40">Chargement…</td></tr>
            ) : data?.data?.map((m: Member) => (
              <tr key={m.id} className="border-b border-white/10 hover:bg-white/5">
                <td className="px-4 py-3">
                  <div className="text-white">{m.profile ? `${m.profile.firstName} ${m.profile.lastName}`.trim() : '—'}</div>
                  <div className="text-white/40 text-xs">{m.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-gray-300">{m.adminTitle ?? (m.role === 'super_admin' ? 'Super Admin' : 'Administrateur')}</div>
                  <div className="text-white/40 text-xs capitalize">{m.role}</div>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {m.role === 'super_admin'
                    ? <span className="text-green-400">Tous les droits</span>
                    : `${m.permissions?.length ?? 0} permission(s)`}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[m.status] ?? 'bg-white/10 text-gray-400'}`}>{m.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString('fr-FR') : 'Jamais'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    {m.role !== 'super_admin' && (
                      <button title="Modifier les droits" onClick={() => setModal({ mode: 'edit', member: m })} className="text-blue-400 hover:text-blue-300"><Shield className="w-4 h-4" /></button>
                    )}
                    <button title="Forcer la déconnexion" aria-label={`Forcer la déconnexion de ${m.email ?? 'ce membre'}`} onClick={() => forceLogoutM.mutate(m.id, { onSuccess: () => toast.success('Sessions fermées'), onError: (e) => toast.error(getApiErrorMessage(e)) })} className="text-yellow-400 hover:text-yellow-300"><LogOut className="w-4 h-4" /></button>
                    <button title="Réinitialiser le mot de passe" aria-label={`Réinitialiser le mot de passe de ${m.email ?? 'ce membre'}`} onClick={() => { resetPwM.reset(); setPwTarget(m); }} className="text-cyan-400 hover:text-cyan-300"><KeyRound className="w-4 h-4" /></button>
                    {m.role !== 'super_admin' && (
                      <>
                        <button title={m.status === 'active' ? 'Suspendre' : 'Réactiver'} onClick={() => updateM.mutate({ id: m.id, body: { status: m.status === 'active' ? 'suspended' : 'active' } })} className="text-orange-400 hover:text-orange-300"><Power className="w-4 h-4" /></button>
                        <button title="Supprimer" aria-label={`Supprimer ${m.email ?? 'ce membre'}`} onClick={() => { deleteM.reset(); setDeleteTarget(m); }} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && meta && (
        <MemberModal
          presets={meta.presets}
          allPermissions={meta.permissions}
          initial={modal.mode === 'edit' ? modal.member : null}
          saving={createM.isPending || updateM.isPending}
          errorMsg={(createM.error || updateM.error) ? 'Vérifiez les champs (email unique, mot de passe fort).' : ''}
          onClose={() => setModal(null)}
          onSubmit={(form) => {
            if (modal.mode === 'edit') {
              updateM.mutate({ id: modal.member.id, body: { adminTitle: form.adminTitle, permissions: form.permissions } });
            } else {
              createM.mutate(form);
            }
          }}
        />
      )}
      <ResetPasswordDialog
        member={pwTarget}
        busy={resetPwM.isPending}
        error={resetPwM.isError ? getApiErrorMessage(resetPwM.error) : null}
        onClose={() => setPwTarget(null)}
        onSubmit={(password) => pwTarget && resetPwM.mutate({ id: pwTarget.id, password }, { onSuccess: () => { toast.success('Mot de passe réinitialisé'); setPwTarget(null); } })}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        danger
        title="Supprimer ce membre de l’équipe"
        message={`${deleteTarget?.email ?? ''} perdra immédiatement l’accès à l’administration. L’action est journalisée.`}
        confirmLabel="Supprimer"
        busy={deleteM.isPending}
        error={deleteM.isError ? getApiErrorMessage(deleteM.error) : null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteM.mutate(deleteTarget.id, { onSuccess: () => { toast.success('Membre supprimé'); setDeleteTarget(null); } })}
      />
    </div>
  );
}

function MemberModal({ presets, allPermissions, initial, saving, errorMsg, onClose, onSubmit }: {
  presets: Preset[];
  allPermissions: string[];
  initial: Member | null;
  saving: boolean;
  errorMsg: string;
  onClose: () => void;
  onSubmit: (form: typeof emptyForm) => void;
}) {
  const [form, setForm] = useState<typeof emptyForm>(
    initial
      ? { ...emptyForm, firstName: initial.profile?.firstName ?? '', lastName: initial.profile?.lastName ?? '', email: initial.email ?? '', adminTitle: initial.adminTitle ?? '', permissions: initial.permissions ?? [] }
      : emptyForm
  );
  const isEdit = Boolean(initial);

  const applyPreset = (key: string) => {
    const preset = presets.find((p) => p.key === key);
    setForm((f) => ({ ...f, preset: key, permissions: preset ? [...preset.permissions] : f.permissions, adminTitle: f.adminTitle || (preset?.label ?? '') }));
  };
  const toggle = (perm: string) => setForm((f) => ({
    ...f,
    permissions: f.permissions.includes(perm) ? f.permissions.filter((p) => p !== perm) : [...f.permissions, perm],
  }));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-[#1a2744] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{isEdit ? 'Modifier les droits' : 'Nouveau membre admin'}</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {errorMsg && <div className="mb-3 text-sm text-red-400 bg-red-900/20 rounded-lg p-2">{errorMsg}</div>}

        {!isEdit && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input placeholder="Prénom" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="input" />
            <input placeholder="Nom" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="input" />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input col-span-2" />
            <input placeholder="Mot de passe (≥10 car.)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input col-span-2" />
          </div>
        )}

        <label className="block text-xs text-white/50 mb-1">Rôle prédéfini</label>
        <select value={form.preset} onChange={(e) => applyPreset(e.target.value)} className="input w-full mb-3">
          <option value="">— Personnalisé —</option>
          {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>

        <input placeholder="Titre affiché (ex: Responsable KYC)" value={form.adminTitle} onChange={(e) => setForm({ ...form, adminTitle: e.target.value })} className="input w-full mb-3" />

        <label className="block text-xs text-white/50 mb-2">Permissions</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {allPermissions.map((perm) => (
            <label key={perm} className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
              <input type="checkbox" checked={form.permissions.includes(perm)} onChange={() => toggle(perm)} className="accent-green-500" />
              {PERMISSION_LABELS[perm] ?? perm}
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/60 hover:text-white">Annuler</button>
          <button disabled={saving} onClick={() => onSubmit(form)} className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
            {saving ? 'Enregistrement…' : (isEdit ? 'Enregistrer' : 'Créer le membre')}
          </button>
        </div>
      </div>
    </div>
  );
}
