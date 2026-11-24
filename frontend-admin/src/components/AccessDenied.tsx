import { Lock } from 'lucide-react';

/** Le serveur a refusé l'accès faute de permission (403). */
export function isForbidden(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 403;
}

/** Message affiché à un membre de l'équipe qui n'a pas la permission requise. */
export default function AccessDenied({ permission }: { permission: string }) {
  return (
    <div role="status" className="text-center py-20 text-white/60">
      <Lock className="w-10 h-10 mx-auto mb-3 text-white/30" aria-hidden="true" />
      Accès réservé (permission « {permission} »). Demandez-la à un administrateur habilité.
    </div>
  );
}
