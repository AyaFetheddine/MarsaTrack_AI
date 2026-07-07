const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadRoot = path.join(process.cwd(), 'uploads', 'containers');
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadRoot);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeBaseName = path
      .basename(file.originalname, extension)
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 40);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    cb(null, `${safeBaseName || 'container'}-${uniqueSuffix}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error('INVALID_IMAGE_TYPE'));
  }

  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const uploadContainerImage = (req, res, next) => {
  upload.single('image')(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        status  : 'error',
        message : 'Image trop lourde. Taille maximale autorisee : 5 MB.',
      });
    }

    if (error.message === 'INVALID_IMAGE_TYPE') {
      return res.status(400).json({
        status  : 'error',
        message : 'Format image invalide. Formats acceptes : JPEG, PNG ou WebP.',
      });
    }

    console.error('[uploadMiddleware] Erreur upload image :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de l upload image.',
    });
  });
};

module.exports = { uploadContainerImage };
