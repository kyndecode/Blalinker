/**
 * Type RÉEL d'un fichier, d'après ses premiers octets (signature), et non d'après le type
 * déclaré par le navigateur (`Content-Type` du formulaire), qui se falsifie librement.
 * Seuls les formats utiles à BLA sont reconnus ; tout le reste est refusé.
 */
export type FileKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'pdf';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectFileKind(buf: Buffer | undefined | null): FileKind | null {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return 'gif';
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
  return null;
}

/** Photo de profil : JPEG, PNG ou WebP. */
export const AVATAR_KINDS: ReadonlySet<FileKind> = new Set(['jpeg', 'png', 'webp']);
/** Pièce d'identité : photo (JPEG, PNG, WebP) ou PDF. Jamais SVG/HTML/exécutable. */
export const ID_DOCUMENT_KINDS: ReadonlySet<FileKind> = new Set(['jpeg', 'png', 'webp', 'pdf']);
/** Images du site (administration) : JPEG, PNG, WebP ou GIF. */
export const SITE_IMAGE_KINDS: ReadonlySet<FileKind> = new Set(['jpeg', 'png', 'webp', 'gif']);

export function isAllowedFile(buf: Buffer | undefined | null, allowed: ReadonlySet<FileKind>): boolean {
  const kind = detectFileKind(buf);
  return kind !== null && allowed.has(kind);
}
