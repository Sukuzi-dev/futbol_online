const { pool } = require('../models/db');

const checkRole = (allowedRoles) => {
    return async (req, res, next) => {
        try {
            if (!req.session || !req.session.user) {
                return res.redirect('/login');
            }

            const userRole = req.session.user.role;

            if (!allowedRoles.includes(userRole)) {
                console.log(`Acceso denegado: ${req.session.user.username} (${userRole}) intentó acceder a ruta de ${allowedRoles.join(',')}`);
                return res.status(403).render('error', {
                    statusCode: 403,
                    message: 'No tienes permisos para acceder a esta página',
                    user: req.session.user
                });
            }

            next();
        } catch (error) {
            console.error('Error en middleware de roles:', error);
            res.status(500).render('error', {
                statusCode: 500,
                message: 'Error al verificar permisos',
                user: req.session.user
            });
        }
    };
};

const isOwner = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'owner') {
        next();
    } else {
        console.log(`Acceso denegado a owner: ${req.session?.user?.username || 'desconocido'}`);
        res.status(403).render('error', {
            statusCode: 403,
            message: 'Solo el propietario puede acceder a esta página',
            user: req.session?.user || null
        });
    }
};

const isAdminOrAbove = (req, res, next) => {
    if (req.session && req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'owner')) {
        next();
    } else {
        res.status(403).render('error', {
            statusCode: 403,
            message: 'Necesitas permisos de administrador',
            user: req.session?.user || null
        });
    }
};

const checkModerationPermission = async (req, res, next) => {
    try {
        const targetUsername = req.body.username;

        if (!targetUsername) {
            return res.json({ success: false, message: 'Usuario objetivo no especificado' });
        }

        const [targetUsers] = await pool.query(
            'SELECT id, role FROM users WHERE username = ?',
            [targetUsername]
        );

        if (targetUsers.length === 0) {
            return res.json({ success: false, message: 'Usuario no encontrado' });
        }

        const targetUser = targetUsers[0];
        const moderatorRole = req.session.user.role;

        // Jerarquía
        const hierarchy = { 'owner': 3, 'admin': 2, 'user': 1 };

        if (hierarchy[moderatorRole] <= hierarchy[targetUser.role]) {
            return res.json({ success: false, message: 'No tienes permisos para moderar a este usuario' });
        }

        if (targetUser.id === req.session.user.id) {
            return res.json({ success: false, message: 'No puedes moderarte a ti mismo' });
        }

        req.targetUser = targetUser;
        next();
    } catch (error) {
        console.error('Error en moderación:', error);
        res.json({ success: false, message: 'Error al verificar permisos' });
    }
};

module.exports = { 
    checkRole, 
    isOwner, 
    isAdminOrAbove, 
    checkModerationPermission 
};