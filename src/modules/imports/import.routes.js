import multer from 'multer';
import { Router } from 'express';
import { validate } from '../../middlewares/validation.middleware.js';
import { importDetailParamSchema } from './import.validation.js';
import * as controller from './import.controller.js';
import { ValidationError } from '../../utils/errors.js';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB limit
  },
  fileFilter: (req, file, cb) => {
    const isCsv = file.mimetype === 'text/csv' || 
                  file.originalname.endsWith('.csv') || 
                  file.mimetype === 'application/vnd.ms-excel';
    if (isCsv) {
      cb(null, true);
    } else {
      cb(new ValidationError('Only CSV files are allowed.'));
    }
  }
});

const router = Router({ mergeParams: true });

// Helper middleware to handle multer errors (like file too large)
function handleMulterUpload(field) {
  const uploadMiddleware = upload.single(field);
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new ValidationError('File size exceeds 10 MB limit.'));
          }
          return next(new ValidationError(`Upload error: ${err.message}`));
        }
        return next(err);
      }
      if (!req.file) {
        return next(new ValidationError('No file uploaded.'));
      }
      next();
    });
  };
}

// POST /workspaces/:workspaceId/imports/customers
router.post(
  '/customers',
  handleMulterUpload('file'),
  controller.importCustomers
);

// POST /workspaces/:workspaceId/imports/orders
router.post(
  '/orders',
  handleMulterUpload('file'),
  controller.importOrders
);

// GET /workspaces/:workspaceId/imports
router.get(
  '/',
  controller.getImportHistory
);

// GET /workspaces/:workspaceId/imports/:importId
router.get(
  '/:importId',
  validate(importDetailParamSchema),
  controller.getImportDetails
);

export default router;
