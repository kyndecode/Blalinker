import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

export function isCloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

interface UploadResult { secure_url: string; public_id: string }

/**
 * Envoie un buffer vers Cloudinary et retourne l'URL sécurisée.
 * `deliveryType: 'authenticated'` : le fichier n'est lisible qu'au moyen d'une URL
 * signée générée par le serveur (pièces d'identité).
 */
export function uploadBuffer(
  buffer: Buffer,
  folder: string,
  resourceType: 'image' | 'auto' | 'raw' = 'auto',
  deliveryType: 'upload' | 'authenticated' = 'upload',
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType, type: deliveryType, overwrite: true },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload échoué'));
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

export interface CloudinaryAssetRef {
  resourceType: 'image' | 'raw' | 'video';
  deliveryType: 'upload' | 'authenticated' | 'private';
  publicId: string;
  format: string | null;
}

/**
 * Décompose une URL de livraison Cloudinary :
 * https://res.cloudinary.com/<cloud>/<resource>/<type>/[s--sig--/][v123/]<public_id>.<ext>
 * Retourne null si l'URL n'appartient pas au compte Cloudinary configuré.
 */
export function parseCloudinaryUrl(url: string, cloudName = env.CLOUDINARY_CLOUD_NAME): CloudinaryAssetRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length < 4 || (cloudName && parts[0] !== cloudName)) return null;
  const [, resourceType, deliveryType, ...rest] = parts;
  if (!['image', 'raw', 'video'].includes(resourceType)) return null;
  if (!['upload', 'authenticated', 'private'].includes(deliveryType)) return null;
  let segments = rest;
  if (segments[0]?.startsWith('s--')) segments = segments.slice(1);
  if (/^v\d+$/.test(segments[0] ?? '')) segments = segments.slice(1);
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  const dot = resourceType === 'raw' ? -1 : last.lastIndexOf('.');
  const format = dot > 0 ? last.slice(dot + 1) : null;
  const publicId = [...segments.slice(0, -1), dot > 0 ? last.slice(0, dot) : last].join('/');
  return {
    resourceType: resourceType as CloudinaryAssetRef['resourceType'],
    deliveryType: deliveryType as CloudinaryAssetRef['deliveryType'],
    publicId,
    format,
  };
}

/**
 * URL de téléchargement signée et limitée dans le temps (API Cloudinary), valable
 * pour les fichiers « authenticated » ou « private ».
 */
export function signedDownloadUrl(ref: CloudinaryAssetRef, ttlSeconds: number): { url: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const url = cloudinary.utils.private_download_url(ref.publicId, ref.format ?? '', {
    resource_type: ref.resourceType,
    type: ref.deliveryType,
    expires_at: Math.floor(expiresAt.getTime() / 1000),
    attachment: false,
  });
  return { url, expiresAt };
}
