const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../models/db');
const { checkAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { r2Client } = require('../config/r2');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');

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

// ============================================
// SUBIR AVATAR (R2 + LOCAL + BASE64 - AUTOMÁTICO)
// ============================================
router.post('/avatar', upload.single('avatar'), async (req, res) => {
    try {
        console.log('📤 Archivo recibido:', req.file ? req.file.originalname : 'NINGUNO');
        
        if (!req.file) {
            return res.json({ success: false, message: 'No se seleccionó archivo' });
        }

        const userId = req.session.user.id;
        let avatarUrl = null;

        // ============================================
        // DETECTAR DÓNDE SE GUARDÓ LA IMAGEN
        // ============================================
        
        // Caso 1: Se guardó en R2 (req.file.location existe)
        if (req.file.location && req.file.location.includes('r2.dev')) {
            avatarUrl = req.file.location;
            console.log('📸 Avatar en R2:', avatarUrl);
            
            // BORRAR AVATAR ANTERIOR DE R2
            const [users] = await pool.query('SELECT avatar FROM users WHERE id = ?', [userId]);
            const oldAvatar = users[0].avatar;
            
            if (oldAvatar && oldAvatar.includes('r2.dev')) {
                try {
                    const urlParts = new URL(oldAvatar);
                    const oldKey = urlParts.pathname.substring(1);
                    console.log('🗑️ Borrando avatar anterior de R2:', oldKey);
                    
                    await r2Client.send(new DeleteObjectCommand({
                        Bucket: process.env.R2_BUCKET_NAME || 'futbol-online-uploads',
                        Key: oldKey
                    }));
                    console.log('✅ Avatar anterior borrado de R2');
                } catch (deleteError) {
                    console.log('⚠️ No se pudo borrar avatar anterior:', deleteError.message);
                }
            }
        }
        // Caso 2: Se guardó en disco local (Railway)
        else if (req.file.path && fs.existsSync(req.file.path)) {
            console.log('💾 Avatar en disco local, convirtiendo a Base64...');
            
            const imageBuffer = fs.readFileSync(req.file.path);
            avatarUrl = `data:${req.file.mimetype};base64,${imageBuffer.toString('base64')}`;
            
            // Eliminar archivo temporal
            try { fs.unlinkSync(req.file.path); } catch (e) {}
            
            console.log('✅ Avatar convertido a Base64');
        }
        // Caso 3: Ya viene en Base64 o es una URL
        else if (req.file.key || req.file.buffer) {
            avatarUrl = req.file.location || req.file.key;
            console.log('📸 Avatar desde buffer/key:', avatarUrl);
        }
        // Fallback
        else {
            avatarUrl = '/uploads/avatars/default.png';
            console.log('⚠️ Usando avatar por defecto');
        }

        // ============================================
        // GUARDAR EN BASE DE DATOS
        // ============================================
        await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, userId]);
        console.log('✅ Avatar guardado en BD para usuario:', userId);

        // Actualizar sesión
        req.session.user.avatar = avatarUrl;
        req.session.save();

        res.json({ 
            success: true, 
            message: 'Avatar actualizado correctamente', 
            avatar: avatarUrl 
        });

    } catch (error) {
        console.error('❌ Error al subir avatar:', error);
        res.json({ success: false, message: 'Error: ' + error.message });
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
