import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  label?: string;
  onChange: (page: number) => void;
}

/** Pagination côté serveur (page courante / total). */
export default function Pagination({ page, totalPages, total, label = 'éléments', onChange }: PaginationProps) {
  const pages = Math.max(1, totalPages || 1);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-400" aria-label="Pagination">
      <span>{total !== undefined ? `${total.toLocaleString('fr-FR')} ${label}` : ''}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Page précédente" className="rounded p-1.5 hover:bg-white/10 disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span aria-current="page">Page {page} / {pages}</span>
        <button onClick={() => onChange(Math.min(pages, page + 1))} disabled={page >= pages} aria-label="Page suivante" className="rounded p-1.5 hover:bg-white/10 disabled:opacity-40">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
