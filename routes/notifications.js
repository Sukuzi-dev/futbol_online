const express = require('express');
const router = express.Router();
const { pool } = require('../models/db');
const { checkAuth } = require('../middleware/auth');

router.use(checkAuth);

// Obtener notificaciones del usuario
router.get('/list', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        const [notifications] = await pool.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
        
        const unreadCount = notifications.filter(n => !n.readed).length;
        
        res.json({ 
            success: true, 
            notifications,
            unreadCount
        });
    } catch (error) {
        console.error('Error al obtener notificaciones:', error);
        res.status(500).json({ success: false, message: 'Error al cargar notificaciones' });
    }
});

// Marcar notificación como leída
router.post('/read/:id', async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.session.user.id;
        
        await pool.query(
            'UPDATE notifications SET readed = TRUE WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error al marcar notificación:', error);
        res.status(500).json({ success: false, message: 'Error al marcar como leída' });
    }
});

// Marcar todas como leídas
router.post('/read-all', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        await pool.query(
            'UPDATE notifications SET readed = TRUE WHERE user_id = ? AND readed = FALSE',
            [userId]
        );
        
        res.json({ success: true, message: 'Todas las notificaciones marcadas como leídas' });
    } catch (error) {
        console.error('Error al marcar todas:', error);
        res.status(500).json({ success: false, message: 'Error al marcar notificaciones' });
    }
});

// Eliminar notificación
router.delete('/delete/:id', async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.session.user.id;
        
        await pool.query(
            'DELETE FROM notifications WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );
        
        res.json({ success: true, message: 'Notificación eliminada' });
    } catch (error) {
        console.error('Error al eliminar notificación:', error);
        res.status(500).json({ success: false, message: 'Error al eliminar notificación' });
    }
});

// Obtener conteo de no leídas
router.get('/unread-count', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        const [result] = await pool.query(
            'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND readed = FALSE',
            [userId]
        );
        
        res.json({ success: true, count: result[0].count });
    } catch (error) {
        console.error('Error al obtener conteo:', error);
        res.status(500).json({ success: false, message: 'Error al obtener conteo' });
    }
});

module.exports = router;