const multer = require('multer');
const multerS3 = require('multer-s3');
const { r2Client } = require('../config/r2');
const crypto = require('crypto');

const upload = multer({
    storage: multerS3({
        s3: r2Client,
        bucket: process.env.R2_BUCKET_NAME || 'futbol-online-uploads',
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            const uniqueId = crypto.randomBytes(8).toString('hex');
            const ext = file.originalname.split('.').pop();
            cb(null, `avatars/${req.session.user.id}-${uniqueId}.${ext}`);
        },
        contentType: multerS3.AUTO_CONTENT_TYPE
    }),
    limits: { fileSize: 5 * 1024 * 1024 , files: 1},
    fileFilter: function (req, file, cb) {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Solo JPG, PNG, GIF, WebP'), false);
        }
    }
});

module.exports = { upload };
