const { pool } = require('../models/db');

const checkAuth = async (req, res, next) => {
    try {
        if (!req.session || !req.session.user) {
            if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'No autorizado',
                    redirect: '/login'
                });
            }
            return res.redirect('/?error=session_expired');
        }

        // Verificar que el usuario existe
        const [users] = await pool.query(
            'SELECT id, username, email, role, avatar, banned, ban_expiry, verified FROM users WHERE id = ?',
            [req.session.user.id]
        );

        if (users.length === 0) {
            req.session.destroy();
            return res.redirect('/?error=session_expired');
        }

        const user = users[0];

        // Verificar si está verificado
        if (!user.verified) {
            req.session.tempUserId = user.id;
            req.session.destroy();
            return res.redirect('/verify');
        }

        // Verificar si está baneado
        if (user.banned) {
            if (!user.ban_expiry || new Date(user.ban_expiry) > new Date()) {
                req.session.destroy();
                return res.redirect('/login?error=banned');
            } else {
                await pool.query(
                    'UPDATE users SET banned = FALSE, ban_reason = NULL, ban_expiry = NULL WHERE id = ?',
                    [user.id]
                );
            }
        }

        // Actualizar sesión
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            avatar: user.avatar
        };

        next();
    } catch (error) {
        console.error('Error en middleware de autenticación:', error);
        res.status(500).render('error', {
            statusCode: 500,
            message: 'Error de autenticación',
            user: null
        });
    }
};

const checkNotAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    next();
};

const checkVerification = async (req, res, next) => {
    if (!req.session.tempUserId) {
        return res.redirect('/login');
    }
    next();
};

module.exports = { checkAuth, checkNotAuth, checkVerification };
