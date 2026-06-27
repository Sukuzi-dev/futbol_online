const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../models/db');
const { checkAuth } = require('../middleware/auth');
const { checkRole, checkModerationPermission } = require('../middleware/roles');

router.use(checkAuth);
router.use(checkRole(['admin', 'owner']));

// Página principal
router.get('/', async (req, res) => {
    try {
        const [streams] = await pool.query(
            "SELECT s.*, u.username AS created_by_username FROM streams s LEFT JOIN users u ON s.created_by = u.id WHERE s.active = TRUE AND s.end_time > NOW() ORDER BY s.created_at DESC"
        );
        res.render('admin', {
            streams: streams || [],
            user: req.session.user,
            currentPage: 'admin',
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', { statusCode: 500, message: 'Error al cargar', user: req.session.user });
    }
});

// Agregar stream
router.post('/add-stream', async (req, res) => {
    try {
        const { name, type, url, duration, scheduledDate, scheduledTime } = req.body;
        if (!name || !type || !url || !duration) {
            return res.json({ success: false, message: 'Faltan datos' });
        }
        const streamId = 'STR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        let startTime = new Date();
        let active = true;
        
        if (scheduledDate && scheduledTime) {
            const dt = new Date(scheduledDate + 'T' + scheduledTime + ':00');
            if (dt > new Date()) {
                startTime = dt;
                active = false;
            }
        }
        
        const endTime = new Date(startTime.getTime() + parseInt(duration) * 60 * 1000);
        
        await pool.query(
            "INSERT INTO streams (stream_id, name, url, type, duration, end_time, active, created_by, scheduled_start) VALUES (?,?,?,?,?,?,?,?,?)",
            [streamId, name, url, type, parseInt(duration), endTime, active, req.session.user.id, active ? null : startTime]
        );
        
        res.json({ success: true, message: active ? 'Transmisión iniciada' : 'Programada para ' + scheduledDate + ' a las ' + scheduledTime });
    } catch (error) {
        console.error('Error al agregar stream:', error);
        res.json({ success: false, message: 'Error al crear transmisión' });
    }
});

// Eliminar stream
router.delete('/delete-stream/:id', async (req, res) => {
    try {
        await pool.query("UPDATE streams SET active = FALSE WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'Stream detenido' });
    } catch (error) {
        console.error('Error:', error);
        res.json({ success: false, message: 'Error al detener' });
    }
});

// LISTAR USUARIOS SANCIONADOS - CORREGIDO
router.get('/sanctioned-users', async (req, res) => {
    try {
        console.log('Cargando usuarios sancionados...');
        const [bans] = await pool.query(
            "SELECT b.id, b.user_id, b.banned_by, b.reason, b.ban_type, b.expiry, b.created_at, u.username AS banned_username, m.username AS mod_username FROM bans b JOIN users u ON b.user_id = u.id JOIN users m ON b.banned_by = m.id ORDER BY b.created_at DESC LIMIT 50"
        );
        console.log('Sanciones encontradas:', bans.length);
        res.json({ success: true, bans: bans || [] });
    } catch (error) {
        console.error('Error al listar sancionados:', error.message);
        res.json({ success: false, bans: [], message: 'Error: ' + error.message });
    }
});

// Moderar usuario
router.post('/moderate', checkModerationPermission, async (req, res) => {
    try {
        const { username, action, reason, duration } = req.body;
        const targetUser = req.targetUser;
        
        let banExpiry = null;
        if (action === 'mute') {
            banExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        } else if (action === 'temp_ban') {
            banExpiry = new Date(Date.now() + (parseInt(duration) || 24) * 60 * 60 * 1000);
        }
        
        await pool.query(
            "INSERT INTO bans (user_id, banned_by, reason, ban_type, expiry) VALUES (?,?,?,?,?)",
            [targetUser.id, req.session.user.id, reason || 'Sin razón', action, banExpiry]
        );
        
        if (action === 'perm_ban' || action === 'temp_ban') {
            await pool.query(
                "UPDATE users SET banned = TRUE, ban_reason = ?, ban_expiry = ? WHERE id = ?",
                [reason, banExpiry, targetUser.id]
            );
        }
        
        res.json({ success: true, message: 'Sanción aplicada correctamente' });
    } catch (error) {
        console.error('Error al moderar:', error);
        res.json({ success: false, message: 'Error al aplicar sanción' });
    }
});

// Desbanear/Quitar sanción
router.post('/unban', async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.json({ success: false, message: 'Usuario requerido' });
        }
        
        const [users] = await pool.query("SELECT id, role FROM users WHERE username = ?", [username]);
        
        if (users.length === 0) {
            return res.json({ success: false, message: 'Usuario no encontrado' });
        }
        
        // Verificar jerarquía
        if (req.session.user.role === 'admin' && users[0].role === 'owner') {
            return res.json({ success: false, message: 'No puedes quitar sanciones al propietario' });
        }
        
        // Eliminar todas las sanciones del usuario
        await pool.query("DELETE FROM bans WHERE user_id = ?", [users[0].id]);
        
        // Quitar ban si lo tenía
        await pool.query(
            "UPDATE users SET banned = FALSE, ban_reason = NULL, ban_expiry = NULL WHERE id = ?",
            [users[0].id]
        );
        
        res.json({ success: true, message: 'Sanción eliminada correctamente' });
    } catch (error) {
        console.error('Error al desbanear:', error);
        res.json({ success: false, message: 'Error al quitar sanción' });
    }
});

// Notificación global
router.post('/send-notification', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message || message.length > 500) {
            return res.json({ success: false, message: 'Mensaje inválido' });
        }
        
        const [users] = await pool.query("SELECT id FROM users WHERE verified = TRUE");
        
        for (const user of users) {
            await pool.query("INSERT INTO notifications (user_id, message) VALUES (?,?)", [user.id, message]);
        }
        
        const io = req.app.get('io');
        if (io) {
            io.emit('global-notification', {
                message,
                from: req.session.user.username,
                timestamp: new Date()
            });
        }
        
        res.json({ success: true, message: 'Notificación enviada a todos los usuarios' });
    } catch (error) {
        console.error('Error:', error);
        res.json({ success: false, message: 'Error al enviar' });
    }
});

// Streams programados
router.get('/scheduled-streams', async (req, res) => {
    try {
        const [streams] = await pool.query(
            "SELECT * FROM streams WHERE scheduled_start IS NOT NULL AND active = FALSE AND scheduled_start > NOW() ORDER BY scheduled_start ASC"
        );
        res.json({ success: true, streams: streams || [] });
    } catch (error) {
        console.error('Error:', error);
        res.json({ success: false, streams: [] });
    }
});

module.exports = router;