const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../models/db');
const { checkAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Configuración de multer
const storage = multer.diskStorage({
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

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Solo imágenes JPG, PNG, GIF, WebP'));
    }
});

router.use(checkAuth);

// Página de configuración
router.get('/', async (req, res) => {
    try {
        const [userData] = await pool.query(
            'SELECT username, email, avatar, name_changes, last_name_change FROM users WHERE id = ?',
            [req.session.user.id]
        );
        
        if (userData.length === 0) return res.redirect('/login');
        
        res.render('settings', {
            user: {
                ...req.session.user,
                ...userData[0]
            },
            currentPage: 'settings',
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        console.error('Error al cargar settings:', error);
        res.status(500).render('error', {
            statusCode: 500,
            message: 'Error al cargar configuración',
            user: req.session.user
        });
    }
});

// Subir avatar
router.post('/avatar', upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.json({ success: false, message: 'No se seleccionó archivo' });
        }

        // La URL de la imagen en R2
        const avatarUrl = req.file.location; // URL pública de R2

        // Guardar URL en base de datos
        await pool.query('UPDATE users SET avatar = ? WHERE id = ?', 
            [avatarUrl, req.session.user.id]);

        // Actualizar sesión
        req.session.user.avatar = avatarUrl;

        res.json({ 
            success: true, 
            message: 'Avatar actualizado', 
            avatar: avatarUrl 
        });
    } catch (error) {
        console.error('Error:', error);
        res.json({ success: false, message: 'Error al subir imagen' });
    }
});

// Actualizar username
router.post('/username', async (req, res) => {
    try {
        const { username } = req.body;
        const userId = req.session.user.id;
        
        if (!username || username.length < 3 || username.length > 10) {
            return res.json({ success: false, message: 'Nombre inválido (3-10 caracteres)' });
        }
        
        const [userData] = await pool.query('SELECT name_changes, last_name_change FROM users WHERE id = ?', [userId]);
        const currentYear = new Date().getFullYear();
        let changesLeft = 3;
        
        if (userData[0].last_name_change === currentYear) {
            changesLeft = Math.max(0, 3 - userData[0].name_changes);
        }
        
        if (changesLeft <= 0) {
            return res.json({ success: false, message: 'Límite de cambios alcanzado (3 por año)' });
        }
        
        const [existing] = await pool.query('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId]);
        if (existing.length > 0) {
            return res.json({ success: false, message: 'Nombre no disponible' });
        }
        
        const nameChanges = userData[0].last_name_change === currentYear ? userData[0].name_changes + 1 : 1;
        await pool.query(
            'UPDATE users SET username = ?, name_changes = ?, last_name_change = ? WHERE id = ?',
            [username, nameChanges, currentYear, userId]
        );
        
        req.session.user.username = username;
        
        res.json({ success: true, message: 'Nombre actualizado', changesLeft: 3 - nameChanges });
    } catch (error) {
        console.error('Error al actualizar username:', error);
        res.json({ success: false, message: 'Error al actualizar' });
    }
});

// Actualizar email
router.post('/email', async (req, res) => {
    try {
        const { email } = req.body;
        const userId = req.session.user.id;
        
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.json({ success: false, message: 'Email inválido' });
        }
        
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
        if (existing.length > 0) {
            return res.json({ success: false, message: 'Email en uso' });
        }
        
        await pool.query('UPDATE users SET email = ? WHERE id = ?', [email, userId]);
        req.session.user.email = email;
        
        res.json({ success: true, message: 'Email actualizado' });
    } catch (error) {
        console.error('Error al actualizar email:', error);
        res.json({ success: false, message: 'Error al actualizar' });
    }
});

// Cambiar contraseña
router.post('/password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.session.user.id;
        
        if (!currentPassword || !newPassword || newPassword.length < 8) {
            return res.json({ success: false, message: 'Datos inválidos' });
        }
        
        const [users] = await pool.query('SELECT password FROM users WHERE id = ?', [userId]);
        const valid = await bcrypt.compare(currentPassword, users[0].password);
        
        if (!valid) {
            return res.json({ success: false, message: 'Contraseña actual incorrecta' });
        }
        
        const hash = await bcrypt.hash(newPassword, 12);
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hash, userId]);
        
        res.json({ success: true, message: 'Contraseña actualizada' });
    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        res.json({ success: false, message: 'Error al actualizar' });
    }
});

module.exports = router;
