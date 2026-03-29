import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, Send, Archive } from 'lucide-react';
import api from '../services/api';

type ContactStatus = 'new' | 'read' | 'answered' | 'done' | 'closed';

interface ContactRequestItem {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  countryCode: string;
  subject: string;
  subjectLabel?: string;
  message: string;
  status: ContactStatus;
  statusLabel?: string;
  adminResponse: string | null;
  handledBy: string | null;
  handledAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const STATUS_OPTIONS: Array<{ value: ContactStatus; label: string }> = [
  { value: 'new', label: 'Nouveau' },
  { value: 'read', label: 'Lu' },
  { value: 'answered', label: 'Repondu' },
  { value: 'done', label: 'Termine' },
  { value: 'closed', label: 'Cloture' },
];

const STATUS_STYLES: Record<ContactStatus, string> = {
  new: 'bg-blue-900/50 text-blue-300',
  read: 'bg-amber-900/50 text-amber-300',
  answered: 'bg-emerald-900/50 text-emerald-300',
  done: 'bg-purple-900/50 text-purple-300',
  closed: 'bg-white/10 text-gray-300',
};

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('fr-FR');
}

export default function Contacts() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<ContactStatus>('read');
  const [adminResponse, setAdminResponse] = useState('');

  const query = useQuery<PaginatedResponse<ContactRequestItem>>({
    queryKey: ['admin-contacts', page, search, status],
    queryFn: () =>
      api.get('/admin/contacts', {
        params: {
          page,
          limit: 20,
          search: search || undefined,
          status: status || undefined,
        },
      }).then((res) => res.data),
  });

  const selectedContact = useMemo(
    () => query.data?.data.find((row) => row.id === selectedId) ?? null,
    [query.data, selectedId]
  );

  const updateStatus = useMutation({
    mutationFn: (payload: { id: string; status: ContactStatus; adminResponse: string }) =>
      api.patch(`/admin/contacts/${payload.id}/status`, {
        status: payload.status,
        adminResponse: payload.adminResponse,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-contacts'] });
      if (selectedContact) {
        setNextStatus(selectedContact.status);
      }
    },
  });

  const handleSelect = (row: ContactRequestItem) => {
    setSelectedId(row.id);
    setNextStatus(row.status === 'new' ? 'read' : row.status);
    setAdminResponse(row.adminResponse ?? '');
  };

  const handleSubmitStatus = () => {
    if (!selectedContact) return;
    updateStatus.mutate({
      id: selectedContact.id,
      status: nextStatus,
      adminResponse: adminResponse.trim(),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Messages Contact</h1>
          <p className="text-sm text-gray-400 mt-1">
            Suivi client avec statuts, reponse admin et archivage.
          </p>
        </div>
        <div className="text-xs text-gray-400">
          {query.data?.meta.total ?? 0} demande(s)
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Rechercher nom, email, telephone, sujet..."
                className="w-full bg-[#1a2744] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white
                           focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="bg-[#1a2744] border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                         focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Tous les statuts</option>
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-[#1a2744] border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-white/10">
                  <th className="text-left font-medium px-4 py-3">Contact</th>
                  <th className="text-left font-medium px-4 py-3">Sujet</th>
                  <th className="text-left font-medium px-4 py-3">Statut</th>
                  <th className="text-left font-medium px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {query.isLoading && Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index} className="border-b border-white/10/60">
                    <td colSpan={4} className="px-4 py-3">
                      <div className="h-4 w-2/3 bg-white/10 rounded animate-pulse" />
                    </td>
                  </tr>
                ))}

                {!query.isLoading && query.data?.data.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-white/10/60 cursor-pointer transition-colors ${
                      selectedId === row.id ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                    onClick={() => handleSelect(row)}
                  >
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{row.firstName} {row.lastName}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{row.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{row.subjectLabel ?? row.subject}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[row.status]}`}>
                        {row.statusLabel ?? row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {query.data?.meta && (
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>
                Page {query.data.meta.page} / {query.data.meta.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="p-1 rounded hover:bg-white/10 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={page >= query.data.meta.totalPages}
                  className="p-1 rounded hover:bg-white/10 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#1a2744] border border-white/10 rounded-xl p-4">
          {!selectedContact ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center mb-3">
                <Archive className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-gray-300 font-medium">Selectionnez une demande</p>
              <p className="text-gray-500 text-xs mt-1">
                Le detail s'affiche ici pour traiter et notifier le client.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-400">Demande #{selectedContact.id.slice(0, 8)}</p>
                <h2 className="text-lg font-semibold text-white mt-1">
                  {selectedContact.subjectLabel ?? selectedContact.subject}
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {selectedContact.firstName} {selectedContact.lastName} - {selectedContact.email}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Telephone: {selectedContact.phone} ({selectedContact.countryCode})
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Message client</p>
                <p className="text-sm text-gray-200 whitespace-pre-line">{selectedContact.message}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-gray-400">Creee le</p>
                  <p className="text-gray-200 mt-0.5">{formatDate(selectedContact.createdAt)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Dernier traitement</p>
                  <p className="text-gray-200 mt-0.5">{formatDate(selectedContact.handledAt)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-400">Changer le statut</label>
                <select
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value as ContactStatus)}
                  className="w-full bg-[#0f1829] border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                             focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {STATUS_OPTIONS.filter((item) => item.value !== 'new').map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-400">Reponse admin (optionnelle)</label>
                <textarea
                  value={adminResponse}
                  onChange={(event) => setAdminResponse(event.target.value.slice(0, 3000))}
                  rows={6}
                  maxLength={3000}
                  className="w-full bg-[#0f1829] border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none
                             focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Message envoye au client (email + notification)..."
                />
                <p className="text-[11px] text-gray-500 text-right">{adminResponse.length}/3000</p>
              </div>

              <button
                onClick={handleSubmitStatus}
                disabled={updateStatus.isPending}
                className="w-full inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500
                           disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold
                           rounded-lg py-2.5 transition-colors"
              >
                <Send className="w-4 h-4" />
                {updateStatus.isPending ? 'Mise a jour...' : 'Mettre a jour et notifier'}
              </button>

              {nextStatus === 'closed' && (
                <div className="bg-amber-900/30 border border-amber-700/40 rounded-lg p-3">
                  <p className="text-xs text-amber-200">
                    Cette demande sera archivee (statut cloture). Le client sera notifie.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
