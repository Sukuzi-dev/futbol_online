const express = require('express');
const router = express.Router();
const { pool } = require('../models/db');
const { checkAuth } = require('../middleware/auth');
const { isOwner } = require('../middleware/roles');

router.use(checkAuth);
router.use(isOwner);

// Página principal
router.get('/', async (req, res) => {
    try {
        const [stats] = await pool.query(
            "SELECT (SELECT COUNT(*) FROM users) AS total_users, (SELECT COUNT(*) FROM streams WHERE active = TRUE AND end_time > NOW()) AS total_streams, (SELECT COUNT(*) FROM users WHERE banned = TRUE) AS banned_users, (SELECT COUNT(*) FROM users WHERE last_activity > DATE_SUB(NOW(), INTERVAL 5 MINUTE)) AS online_users"
        );
        const [recentBans] = await pool.query(
            "SELECT b.*, u.username AS banned_username, m.username AS mod_username FROM bans b JOIN users u ON b.user_id = u.id JOIN users m ON b.banned_by = m.id ORDER BY b.created_at DESC LIMIT 20"
        );
        const [blacklist] = await pool.query("SELECT * FROM ip_blacklist ORDER BY created_at DESC");
        
        res.render('owner', {
            stats: stats[0] || { total_users: 0, total_streams: 0, banned_users: 0, online_users: 0 },
            recentBans: recentBans || [],
            blacklist: blacklist || [],
            user: req.session.user,
            currentPage: 'owner',
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        console.error('Error al cargar panel owner:', error);
        res.status(500).render('error', { statusCode: 500, message: 'Error al cargar', user: req.session.user });
    }
});

// Buscar usuarios
router.get('/search-users', async (req, res) => {
    try {
        const { query, role, banned, sort } = req.query;
        let sql = "SELECT id, username, email, role, avatar, banned, verified, created_at, last_activity FROM users WHERE 1=1";
        const params = [];
        if (query) { sql += " AND (username LIKE ? OR email LIKE ?)"; params.push("%" + query + "%", "%" + query + "%"); }
        if (role && role !== "all") { sql += " AND role = ?"; params.push(role); }
        if (banned === "true") sql += " AND banned = TRUE";
        else if (banned === "false") sql += " AND banned = FALSE";
        if (sort === "oldest") sql += " ORDER BY created_at ASC";
        else if (sort === "username") sql += " ORDER BY username ASC";
        else if (sort === "active") sql += " ORDER BY last_activity DESC";
        else sql += " ORDER BY created_at DESC";
        sql += " LIMIT 100";
        const [users] = await pool.query(sql, params);
        res.json({ success: true, users });
    } catch (error) { res.json({ success: false, message: 'Error al buscar usuarios' }); }
});

// LISTAR IPs BLACKLIST (RUTA CORREGIDA)
router.get('/blacklist-ips', async (req, res) => {
    try {
        const [ips] = await pool.query("SELECT * FROM ip_blacklist ORDER BY created_at DESC");
        res.json({ success: true, ips });
    } catch (error) {
        console.error('Error al listar IPs:', error);
        res.json({ success: false, ips: [], message: 'Error al cargar IPs' });
    }
});

// Agregar IP a blacklist
router.post('/blacklist-ip', async (req, res) => {
    try {
        const { ip_address, reason } = req.body;
        if (!ip_address) return res.json({ success: false, message: 'IP requerida' });
        await pool.query("INSERT INTO ip_blacklist (ip_address, reason, blocked_by) VALUES (?, ?, ?)", [ip_address, reason, req.session.user.id]);
        res.json({ success: true, message: 'IP agregada exitosamente' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.json({ success: false, message: 'Esta IP ya está bloqueada' });
        res.json({ success: false, message: 'Error al agregar IP' });
    }
});

// Remover IP de blacklist
router.delete('/blacklist-ip/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM ip_blacklist WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'IP removida' });
    } catch (error) { res.json({ success: false, message: 'Error al remover IP' }); }
});

// Cambiar rol
router.post('/change-role', async (req, res) => {
    try {
        const { username, newRole } = req.body;
        if (!username || !newRole) return res.json({ success: false, message: 'Completa los campos' });
        const [target] = await pool.query("SELECT id, username, role FROM users WHERE username = ?", [username]);
        if (target.length === 0) return res.json({ success: false, message: 'Usuario no encontrado' });
        if (target[0].id === req.session.user.id) return res.json({ success: false, message: 'No puedes cambiarte a ti mismo' });
        await pool.query("UPDATE users SET role = ? WHERE id = ?", [newRole, target[0].id]);
        res.json({ success: true, message: 'Rol actualizado exitosamente' });
    } catch (error) { res.json({ success: false, message: 'Error' }); }
});

// Eliminar usuario
router.delete('/delete-user/:id', async (req, res) => {
    try {
        if (req.params.id == req.session.user.id) return res.json({ success: false, message: 'No puedes eliminarte' });
        await pool.query("DELETE FROM users WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'Usuario eliminado' });
    } catch (error) { res.json({ success: false, message: 'Error' }); }
});

// Eliminar stream
router.delete('/delete-stream/:id', async (req, res) => {
    try { await pool.query("DELETE FROM streams WHERE id = ?", [req.params.id]); res.json({ success: true }); }
    catch (error) { res.json({ success: false }); }
});

// Historial de baneos
router.get('/ban-reasons', async (req, res) => {
    try {
        const [bans] = await pool.query("SELECT b.*, u.username AS banned_username, m.username AS mod_username FROM bans b JOIN users u ON b.user_id = u.id JOIN users m ON b.banned_by = m.id ORDER BY b.created_at DESC LIMIT 100");
        res.json({ success: true, bans });
    } catch (error) { res.json({ success: false }); }
});

// Broadcast
router.post('/broadcast', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || message.length > 500) return res.json({ success: false, message: 'Mensaje inválido' });
        const [users] = await pool.query("SELECT id FROM users WHERE verified = TRUE");
        for (const user of users) await pool.query("INSERT INTO notifications (user_id, message) VALUES (?,?)", [user.id, "[BROADCAST] " + message]);
        const io = req.app.get('io'); io.emit('broadcast-message', { message, from: req.session.user.username, timestamp: new Date() });
        res.json({ success: true, message: 'Broadcast enviado' });
    } catch (error) { res.json({ success: false }); }
});

// Limpieza
router.post('/cleanup-bans', async (req, res) => {
    try {
        await pool.query("DELETE FROM bans WHERE expiry IS NOT NULL AND expiry < NOW()");
        await pool.query("UPDATE users SET banned = FALSE, ban_reason = NULL, ban_expiry = NULL WHERE banned = TRUE AND ban_expiry IS NOT NULL AND ban_expiry < NOW()");
        await pool.query("DELETE FROM users WHERE banned = TRUE AND ban_expiry IS NULL AND last_activity < DATE_SUB(NOW(), INTERVAL 30 DAY)");
        res.json({ success: true, message: 'Limpieza completada' });
    } catch (error) { res.json({ success: false }); }
});

module.exports = router;