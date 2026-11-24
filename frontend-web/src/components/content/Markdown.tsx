import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Rendu d'un Markdown RESTREINT, sans jamais interpréter de HTML :
 * titres (#, ##, ###), paragraphes, listes (-, *, 1.), **gras**, *italique*,
 * liens [texte](url) et images ![alt](https://…).
 * Liens acceptés : https://, mailto:, tel: et chemins internes « /… ». Tout le reste
 * est affiché comme du texte. Le même rendu est utilisé pour l'aperçu administrateur.
 */

export function safeHref(url: string): { href: string; internal: boolean } | null {
  const u = url.trim();
  if (/^\/(?!\/)[^\s]*$/.test(u)) return { href: u, internal: true };
  if (/^https:\/\/[^\s]+$/i.test(u) || /^mailto:[^\s@]+@[^\s@]+$/i.test(u) || /^tel:\+?[0-9 ().-]{4,30}$/i.test(u)) {
    return { href: u, internal: false };
  }
  return null;
}

const INLINE = /(!?\[([^\]]{0,300})\]\(([^)\s]{1,500})\))|(\*\*([^*]{1,500})\*\*)|(\*([^*\s][^*]{0,500})\*)/;

export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const key = `${keyPrefix}-${n++}`;
    if (m[1]) {
      const isImage = m[1].startsWith('!');
      const label = m[2];
      const link = safeHref(m[3]);
      if (isImage) {
        out.push(link && !link.internal && link.href.startsWith('https://')
          ? <img key={key} src={link.href} alt={label} loading="lazy" className="my-3 max-w-full rounded-lg" />
          : label);
      } else if (!link) {
        out.push(label);
      } else if (link.internal) {
        out.push(<Link key={key} to={link.href} className="text-green-700 dark:text-green-400 underline">{label}</Link>);
      } else {
        out.push(<a key={key} href={link.href} target={link.href.startsWith('https://') ? '_blank' : undefined} rel="noopener noreferrer" className="text-green-700 dark:text-green-400 underline">{label}</a>);
      }
    } else if (m[4]) {
      out.push(<strong key={key}>{renderInline(m[5], key)}</strong>);
    } else if (m[6]) {
      out.push(<em key={key}>{renderInline(m[7], key)}</em>);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

type Block =
  | { kind: 'h'; level: 2 | 3 | 4; text: string }
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul' | 'ol'; items: string[] };

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', lines: para });
    if (list) blocks.push(list);
    para = [];
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const ul = /^\s*[-*]\s+(.+)$/.exec(line);
    const ol = /^\s*\d{1,3}[.)]\s+(.+)$/.exec(line);
    if (!line.trim()) { flush(); continue; }
    if (heading) {
      flush();
      // Le titre de la page est le h1 : « # » et « ## » → h2, « ### » → h3.
      blocks.push({ kind: 'h', level: (heading[1].length === 3 ? 3 : 2) as 2 | 3 | 4, text: heading[2] });
    } else if (ul || ol) {
      const kind = ul ? 'ul' : 'ol';
      if (para.length) { blocks.push({ kind: 'p', lines: para }); para = []; }
      if (!list || list.kind !== kind) { if (list) blocks.push(list); list = { kind, items: [] }; }
      list.items.push((ul ?? ol)![1]);
    } else {
      if (list) { blocks.push(list); list = null; }
      para.push(line);
    }
  }
  flush();
  return blocks;
}

const H_CLASS = { 2: 'text-xl font-semibold mt-6', 3: 'text-lg font-semibold mt-5', 4: 'text-base font-semibold mt-4' } as const;

export default function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className={`space-y-3 text-gray-700 dark:text-gray-300 leading-relaxed ${className}`}>
      {blocks.map((b, i) => {
        if (b.kind === 'h') {
          const Tag = `h${b.level}` as 'h2' | 'h3' | 'h4';
          return <Tag key={i} className={`${H_CLASS[b.level]} text-gray-900 dark:text-white`}>{renderInline(b.text, `h${i}`)}</Tag>;
        }
        if (b.kind === 'p') {
          return (
            <p key={i}>
              {b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{renderInline(l, `p${i}-${j}`)}</Fragment>)}
            </p>
          );
        }
        const ListTag = b.kind;
        return (
          <ListTag key={i} className={`${b.kind === 'ul' ? 'list-disc' : 'list-decimal'} pl-6 space-y-1`}>
            {b.items.map((item, j) => <li key={j}>{renderInline(item, `l${i}-${j}`)}</li>)}
          </ListTag>
        );
      })}
    </div>
  );
}
