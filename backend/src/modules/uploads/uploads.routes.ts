import { Router } from 'express';
import multer from 'multer';
import { uploadsController } from './uploads.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

// Stockage en mémoire (le buffer est ensuite poussé vers Cloudinary), limite 6 Mo, un seul fichier.
// Le type est vérifié dans le contrôleur d'après le CONTENU du fichier (signature), pas d'après
// le type déclaré par le navigateur : photo JPEG/PNG/WebP, pièce d'identité JPEG/PNG/WebP/PDF.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
});

router.use(authenticate);

router.post('/avatar', upload.single('file'), uploadsController.avatar);
router.post('/id-card', upload.single('file'), uploadsController.idCard); // image ou PDF

export default router;
