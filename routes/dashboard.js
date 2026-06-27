const express = require('express');
const router = express.Router();
const { pool } = require('../models/db');
const { checkAuth } = require('../middleware/auth');

router.use(checkAuth);

router.get('/', async (req, res) => {
    try {
        const [streams] = await pool.query(
            `SELECT s.*, u.username AS created_by_username
             FROM streams s 
             LEFT JOIN users u ON s.created_by = u.id
             WHERE s.active = TRUE AND s.end_time > NOW() 
             ORDER BY s.viewer_count DESC, s.created_at DESC`
        );
        
        res.render('dashboard', {
            streams: streams || [],
            user: req.session.user,
            currentPage: 'dashboard'
        });
    } catch (error) {
        console.error('Error al cargar dashboard:', error);
        res.status(500).render('error', {
            statusCode: 500,
            message: 'Error al cargar el dashboard',
            user: req.session.user
        });
    }
});

router.get('/live-stats', async (req, res) => {
    try {
        const [streams] = await pool.query(
            'SELECT id, name, viewer_count, stream_id, type FROM streams WHERE active = TRUE AND end_time > NOW()'
        );
        
        const [totalViewers] = await pool.query(
            'SELECT COALESCE(SUM(viewer_count), 0) AS total FROM streams WHERE active = TRUE AND end_time > NOW()'
        );
        
        res.json({
            success: true,
            streams,
            totalViewers: totalViewers[0].total
        });
    } catch (error) {
        console.error('Error al obtener stats:', error);
        res.status(500).json({ success: false, message: 'Error' });
    }
});

module.exports = router;