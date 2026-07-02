import { Router } from 'express';
import multer from 'multer';
import { uploadsController } from './uploads.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

// Stockage en mémoire (le buffer est ensuite poussé vers Cloudinary), limite 6 Mo.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
});

const imageOnly = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

router.use(authenticate);

router.post('/avatar', imageOnly.single('file'), uploadsController.avatar);
router.post('/id-card', upload.single('file'), uploadsController.idCard); // image ou PDF

export default router;
