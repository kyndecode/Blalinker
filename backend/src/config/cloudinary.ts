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

/** Envoie un buffer vers Cloudinary et retourne l'URL sécurisée. */
export function uploadBuffer(
  buffer: Buffer,
  folder: string,
  resourceType: 'image' | 'auto' | 'raw' = 'auto'
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType, overwrite: true },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload échoué'));
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
}
