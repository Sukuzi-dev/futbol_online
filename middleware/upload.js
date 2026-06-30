const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const crypto = require('crypto');

const { r2Client } = require('../config/r2');

const upload = multer({
    storage: multerS3({
        s3: r2Client,
        bucket: 'futbol-online-uploads',
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            const uniqueId = crypto.randomBytes(16).toString('hex');
            const ext = file.originalname.split('.').pop();
            cb(null, `avatars/${req.session.user.id}-${uniqueId}.${ext}`);
        }
    }),
    limits: { 
        fileSize: 5 * 1024 * 1024,
        files: 1 }, // 5MB
    fileFilter: function (req, file, cb) {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato no permitido'), false);
        }
    }
});


// Middleware para manejar errores de multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'El archivo es demasiado grande. Tamaño máximo: 5MB'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Solo se permite un archivo a la vez'
            });
        }
        return res.status(400).json({
            success: false,
            message: 'Error al subir el archivo'
        });
    }
    
    if (err) {
        return res.status(400).json({
            success: false,
            message: err.message || 'Error al procesar el archivo'
        });
    }
    
    next();
};

// Middleware para validar que el archivo existe
const validateFileExists = (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No se ha seleccionado ningún archivo'
        });
    }
    next();
};

// Limpiar archivos antiguos (se puede ejecutar periódicamente)
const cleanupOldAvatars = async (userId, currentAvatar) => {
    const fs = require('fs').promises;
    const avatarsDir = path.join(__dirname, '../public/uploads/avatars');
    
    try {
        const files = await fs.readdir(avatarsDir);
        const userAvatarPattern = `avatar-${userId}-`;
        
        for (const file of files) {
            if (file.startsWith(userAvatarPattern) && file !== currentAvatar && file !== 'default.png') {
                await fs.unlink(path.join(avatarsDir, file));
            }
        }
    } catch (error) {
        console.error('Error limpiando avatares antiguos:', error);
    }
};

module.exports = {
    upload,
    handleMulterError,
    validateFileExists,
    cleanupOldAvatars
};
