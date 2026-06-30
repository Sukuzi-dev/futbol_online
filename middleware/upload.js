const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Intentar cargar multer-s3 para R2
let multerS3, r2Client;
try {
    multerS3 = require('multer-s3');
    r2Client = require('../config/r2').r2Client;
} catch (e) {
    console.log('⚠️ R2 no configurado, usando almacenamiento local');
}

let storage;

// Si R2 está configurado, usar multer-s3
if (multerS3 && r2Client && process.env.R2_ACCOUNT_ID) {
    console.log('✅ Usando R2 para almacenamiento');
    storage = multerS3({
        s3: r2Client,
        bucket: process.env.R2_BUCKET_NAME || 'futbol-online-uploads',
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            const uniqueId = crypto.randomBytes(8).toString('hex');
            const ext = path.extname(file.originalname);
            cb(null, `avatars/${req.session.user.id}-${uniqueId}${ext}`);
        },
        contentType: multerS3.AUTO_CONTENT_TYPE
    });
} else {
    // Fallback: almacenamiento local
    console.log('⚠️ Usando almacenamiento local');
    storage = multer.diskStorage({
        destination: function (req, file, cb) {
            const dir = path.join(__dirname, '../public/uploads/avatars');
            cb(null, dir);
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = crypto.randomBytes(8).toString('hex');
            const ext = path.extname(file.originalname);
            cb(null, 'avatar-' + req.session.user.id + '-' + uniqueSuffix + ext);
        }
    });
}

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Solo imágenes JPG, PNG, GIF, WebP'));
    }
});

module.exports = { upload };
