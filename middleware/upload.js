const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Configuración de almacenamiento para avatares
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/uploads/avatars'));
    },
    filename: function (req, file, cb) {
        // Generar nombre único para evitar colisiones
        const uniqueSuffix = crypto.randomBytes(16).toString('hex');
        const extension = path.extname(file.originalname).toLowerCase();
        cb(null, `avatar-${req.session.user.id}-${uniqueSuffix}${extension}`);
    }
});

// Validación de archivos
const fileFilter = (req, file, cb) => {
    // Tipos de archivo permitidos
    const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de archivo no permitido. Solo se permiten: JPEG, JPG, PNG, GIF y WebP'), false);
    }
};

// Configuración de multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB máximo
        files: 1 // Solo un archivo a la vez
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