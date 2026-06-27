const express = require('express');
const router = express.Router();
const { pool } = require('../models/db');
const { checkAuth } = require('../middleware/auth');

router.use(checkAuth);

// Página del stream
router.get('/:id', async (req, res) => {
    try {
        const streamId = req.params.id;
        
        const [streams] = await pool.query(
            "SELECT s.*, u.username AS created_by_username FROM streams s LEFT JOIN users u ON s.created_by = u.id WHERE s.id = ? AND s.active = TRUE AND s.end_time > NOW()",
            [streamId]
        );
        
        if (streams.length === 0) {
            return res.status(404).render('error', {
                statusCode: 404,
                message: 'Transmisión no encontrada o ha finalizado',
                user: req.session.user
            });
        }
        
        res.render('stream', {
            stream: streams[0],
            user: req.session.user,
            currentPage: 'stream'
        });
    } catch (error) {
        console.error('Error al cargar stream:', error);
        res.status(500).render('error', {
            statusCode: 500,
            message: 'Error al cargar la transmisión',
            user: req.session.user
        });
    }
});

// Obtener mensajes del chat por servidor
router.get('/chat/:id', async (req, res) => {
    try {
        const streamId = req.params.id;
        const serverIndex = parseInt(req.query.server) || 0;
        
        const [messages] = await pool.query(
            "SELECT cm.*, u.username, u.avatar, u.role FROM chat_messages cm JOIN users u ON cm.user_id = u.id WHERE cm.stream_id = ? AND cm.server_index = ? ORDER BY cm.created_at ASC LIMIT 200",
            [streamId, serverIndex]
        );
        
        res.json(messages);
    } catch (error) {
        console.error('Error al cargar chat:', error);
        res.status(500).json([]);
    }
});

// Enviar mensaje al chat (CON VERIFICACIÓN DE MUTE)
router.post('/chat/:id', async (req, res) => {
    try {
        const streamId = req.params.id;
        const { message, serverIndex } = req.body;
        const userId = req.session.user.id;
        
        if (!message || message.trim().length === 0) {
            return res.json({ success: false, message: 'El mensaje no puede estar vacío' });
        }
        
        if (message.length > 200) {
            return res.json({ success: false, message: 'El mensaje no puede exceder 200 caracteres' });
        }
        
        // VERIFICAR SI EL USUARIO ESTÁ MUTEADO
        const [mutes] = await pool.query(
            "SELECT id FROM bans WHERE user_id = ? AND ban_type = 'mute' AND (expiry IS NULL OR expiry > NOW())",
            [userId]
        );
        
        if (mutes.length > 0) {
            return res.json({ 
                success: false, 
                message: '🔇 Estás silenciado y no puedes enviar mensajes.' 
            });
        }
        
        // Guardar mensaje con índice de servidor
        await pool.query(
            'INSERT INTO chat_messages (user_id, stream_id, server_index, message) VALUES (?, ?, ?, ?)',
            [userId, streamId, parseInt(serverIndex) || 0, message.trim()]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error al guardar mensaje:', error);
        res.json({ success: false, message: 'Error al enviar mensaje' });
    }
});

module.exports = router;