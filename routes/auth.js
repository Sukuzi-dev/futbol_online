const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../models/db');
const { checkNotAuth } = require('../middleware/auth');
const emailService = require('../utils/emailService');

// ============================================
// PÁGINA DE LOGIN/REGISTRO
// ============================================
router.get('/login', checkNotAuth, (req, res) => {
    res.render('login', { error: req.query.error || null });
});

// ============================================
// REGISTRO DE USUARIO (NO CREA LA CUENTA AÚN)
// ============================================
router.post('/register', checkNotAuth, async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Validaciones
        if (!username || !email || !password) {
            return res.json({ success: false, message: 'Todos los campos son requeridos' });
        }
        
        if (username.length < 3 || username.length > 10) {
            return res.json({ success: false, message: 'El nombre de usuario debe tener entre 3 y 10 caracteres' });
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.json({ success: false, message: 'Solo se permiten letras, números y guiones bajos' });
        }
        
        if (password.length < 8) {
            return res.json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres' });
        }
        
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.json({ success: false, message: 'Email inválido' });
        }
        
        // Verificar si el usuario o email ya existe en usuarios VERIFICADOS
        const [existingVerified] = await pool.query(
            'SELECT id FROM users WHERE (username = ? OR email = ?) AND verified = TRUE',
            [username, email]
        );
        
        if (existingVerified.length > 0) {
            return res.json({ success: false, message: 'El usuario o email ya está registrado' });
        }
        
        // Verificar si hay una verificación pendiente para este email/usuario
        const [pendingVerification] = await pool.query(
            'SELECT id, verification_expiry FROM pending_registrations WHERE (username = ? OR email = ?) AND used = FALSE',
            [username, email]
        );
        
        if (pendingVerification.length > 0) {
            // Si la verificación anterior expiró, eliminarla
            if (new Date(pendingVerification[0].verification_expiry) < new Date()) {
                await pool.query('DELETE FROM pending_registrations WHERE id = ?', [pendingVerification[0].id]);
            } else {
                return res.json({ 
                    success: false, 
                    message: 'Ya existe una verificación pendiente para este email/usuario. Revisa tu email o espera 30 minutos.' 
                });
            }
        }
        
        // Hashear password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Generar código de verificación
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Guardar en tabla de registros PENDIENTES (no en users)
        const [result] = await pool.query(
            `INSERT INTO pending_registrations 
             (username, email, password, verification_code, verification_expiry) 
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
            [username, email, hashedPassword, verificationCode]
        );
        
        // Enviar email de verificación
        try {
            await emailService.sendVerificationEmail(email, username, verificationCode);
            console.log('✅ Email de verificación enviado a:', email);
        } catch (emailError) {
            console.log('⚠️  No se pudo enviar email:', emailError.message);
        }
        
        // Siempre mostrar el código en consola (desarrollo)
        console.log('');
        console.log('=========================================');
        console.log('📧 NUEVO REGISTRO PENDIENTE');
        console.log('=========================================');
        console.log('👤 Usuario:', username);
        console.log('📩 Email:', email);
        console.log('🔢 Código:', verificationCode);
        console.log('⏰ Expira en 30 minutos');
        console.log('📌 La cuenta NO se ha creado aún');
        console.log('=========================================');
        console.log('');
        
        // Guardar ID temporal en sesión
        req.session.tempUserId = result.insertId;
        req.session.tempUsername = username;
        req.session.tempEmail = email;
        
        res.json({ 
            success: true, 
            message: 'Código de verificación enviado a tu email. La cuenta se creará después de verificar.' 
        });
        
    } catch (error) {
        console.error('Error en registro:', error);
        res.json({ success: false, message: 'Error al procesar el registro' });
    }
});

// ============================================
// INICIO DE SESIÓN
// ============================================
router.post('/login', checkNotAuth, async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        
        if (!email || !password) {
            return res.json({ success: false, message: 'Email y contraseña requeridos' });
        }
        
        // Buscar usuario SOLO entre los verificados
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? AND verified = TRUE',
            [email]
        );
        
        if (users.length === 0) {
            // Verificar si hay un registro pendiente
            const [pending] = await pool.query(
                'SELECT id FROM pending_registrations WHERE email = ? AND used = FALSE AND verification_expiry > NOW()',
                [email]
            );
            
            if (pending.length > 0) {
                req.session.tempUserId = pending[0].id;
                return res.json({ 
                    success: false, 
                    message: 'Tu cuenta aún no ha sido verificada. Revisa tu email.',
                    needVerification: true 
                });
            }
            
            return res.json({ success: false, message: 'Credenciales incorrectas' });
        }
        
        const user = users[0];
        
        // Verificar si está baneado
        if (user.banned) {
            if (!user.ban_expiry || new Date(user.ban_expiry) > new Date()) {
                return res.json({ success: false, message: 'Tu cuenta ha sido suspendida' });
            } else {
                await pool.query(
                    'UPDATE users SET banned = FALSE, ban_reason = NULL, ban_expiry = NULL WHERE id = ?',
                    [user.id]
                );
            }
        }
        
        // Verificar contraseña
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.json({ success: false, message: 'Credenciales incorrectas' });
        }
        
        // Crear sesión
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            avatar: user.avatar
        };
        
        // Recordarme
        if (rememberMe) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
            
            const rememberToken = crypto.randomBytes(32).toString('hex');
            await pool.query(
                'INSERT INTO active_sessions (user_id, session_id, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [user.id, rememberToken, req.ip, req.headers['user-agent']]
            );
            
            res.cookie('remember_token', rememberToken, {
                maxAge: 30 * 24 * 60 * 60 * 1000,
                httpOnly: true,
                sameSite: 'strict'
            });
        }
        
        await pool.query('UPDATE users SET last_activity = NOW() WHERE id = ?', [user.id]);
        
        console.log(`✅ Login exitoso: ${user.username} (${user.email})`);
        
        res.json({ 
            success: true, 
            message: 'Inicio de sesión exitoso', 
            redirect: '/dashboard' 
        });
        
    } catch (error) {
        console.error('Error en login:', error);
        res.json({ success: false, message: 'Error al iniciar sesión' });
    }
});

// ============================================
// PÁGINA DE VERIFICACIÓN
// ============================================
router.get('/verify', checkNotAuth, (req, res) => {
    if (!req.session.tempUserId) {
        return res.redirect('/login');
    }
    res.render('verify');
});

// ============================================
// VERIFICAR CÓDIGO - AQUÍ SE CREA LA CUENTA REAL
// ============================================
router.post('/verify', checkNotAuth, async (req, res) => {
    try {
        const { code } = req.body;
        const pendingId = req.session.tempUserId;
        
        if (!pendingId) {
            return res.json({ 
                success: false, 
                message: 'Sesión expirada. Regístrate nuevamente.' 
            });
        }
        
        // Buscar en registros pendientes
        const [pending] = await pool.query(
            `SELECT * FROM pending_registrations 
             WHERE id = ? AND verification_code = ? AND verification_expiry > NOW() AND used = FALSE`,
            [pendingId, code]
        );
        
        if (pending.length === 0) {
            return res.json({ 
                success: false, 
                message: 'Código incorrecto o expirado. Regístrate nuevamente.' 
            });
        }
        
        const registration = pending[0];
        
        // ============================================
        // CREAR LA CUENTA REAL EN users
        // ============================================
        const [result] = await pool.query(
            `INSERT INTO users (username, email, password, verified, avatar) 
             VALUES (?, ?, ?, TRUE, 'default.png')`,
            [registration.username, registration.email, registration.password]
        );
        
        // Marcar el registro pendiente como usado
        await pool.query(
            'UPDATE pending_registrations SET used = TRUE WHERE id = ?',
            [pendingId]
        );
        
        // Limpiar sesión temporal
        delete req.session.tempUserId;
        delete req.session.tempUsername;
        delete req.session.tempEmail;
        
        console.log('');
        console.log('=========================================');
        console.log('✅ CUENTA CREADA Y VERIFICADA');
        console.log('=========================================');
        console.log('👤 Usuario:', registration.username);
        console.log('📩 Email:', registration.email);
        console.log('🆔 ID:', result.insertId);
        console.log('=========================================');
        console.log('');
        
        res.json({ 
            success: true, 
            message: '¡Cuenta verificada exitosamente! Ya puedes iniciar sesión.' 
        });
        
    } catch (error) {
        console.error('Error en verificación:', error);
        
        // Si el error es de duplicado (username/email ya existe)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.json({ 
                success: false, 
                message: 'El usuario o email ya fue registrado durante tu verificación.' 
            });
        }
        
        res.json({ success: false, message: 'Error al verificar. Intenta de nuevo.' });
    }
});

// ============================================
// REENVIAR CÓDIGO DE VERIFICACIÓN
// ============================================
router.post('/resend-verification', checkNotAuth, async (req, res) => {
    try {
        const pendingId = req.session.tempUserId;
        
        if (!pendingId) {
            return res.json({ 
                success: false, 
                message: 'Sesión expirada. Regístrate nuevamente.' 
            });
        }
        
        // Buscar registro pendiente
        const [pending] = await pool.query(
            'SELECT email, username FROM pending_registrations WHERE id = ? AND used = FALSE',
            [pendingId]
        );
        
        if (pending.length === 0) {
            delete req.session.tempUserId;
            return res.json({ 
                success: false, 
                message: 'Registro no encontrado. Regístrate nuevamente.' 
            });
        }
        
        // Generar nuevo código
        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Actualizar código
        await pool.query(
            'UPDATE pending_registrations SET verification_code = ?, verification_expiry = DATE_ADD(NOW(), INTERVAL 30 MINUTE) WHERE id = ?',
            [newCode, pendingId]
        );
        
        // Enviar email
        try {
            await emailService.sendVerificationEmail(pending[0].email, pending[0].username, newCode);
            console.log('✅ Nuevo código enviado a:', pending[0].email);
        } catch (emailError) {
            console.log('⚠️  No se pudo enviar email:', emailError.message);
        }
        
        console.log('📧 Nuevo código:', newCode);
        
        res.json({ 
            success: true, 
            message: 'Nuevo código enviado a tu email' 
        });
        
    } catch (error) {
        console.error('Error al reenviar:', error);
        res.json({ success: false, message: 'Error al reenviar el código' });
    }
});

// ============================================
// PÁGINA DE RECUPERACIÓN DE CONTRASEÑA
// ============================================
router.get('/forgot-password', checkNotAuth, (req, res) => {
    res.render('forgot-password');
});

// ============================================
// ENVIAR EMAIL DE RECUPERACIÓN
// ============================================
router.post('/forgot-password', checkNotAuth, async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.json({ success: false, message: 'Email requerido' });
        }
        
        // Buscar usuario verificado
        const [users] = await pool.query(
            'SELECT id, username FROM users WHERE email = ? AND verified = TRUE',
            [email]
        );
        
        if (users.length > 0) {
            const resetToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
            
            // Eliminar tokens anteriores
            await pool.query(
                'UPDATE password_resets SET used = TRUE WHERE user_id = ? AND used = FALSE',
                [users[0].id]
            );
            
            // Crear nuevo token
            await pool.query(
                'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
                [users[0].id, resetToken, expiresAt]
            );
            
            const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
            
            // Enviar email
            try {
                await emailService.sendPasswordResetEmail(email, users[0].username, resetUrl);
                console.log('✅ Email de recuperación enviado a:', email);
            } catch (emailError) {
                console.log('⚠️  No se pudo enviar email:', emailError.message);
                console.log('🔗 Link de recuperación:', resetUrl);
            }
        }
        
        // Siempre responder igual (seguridad)
        res.json({ 
            success: true, 
            message: 'Si el email está registrado, recibirás un enlace para restablecer tu contraseña.' 
        });
        
    } catch (error) {
        console.error('Error en recuperación:', error);
        res.json({ success: false, message: 'Error al procesar la solicitud' });
    }
});

// ============================================
// PÁGINA DE NUEVA CONTRASEÑA (con token)
// ============================================
router.get('/reset-password/:token', checkNotAuth, async (req, res) => {
    try {
        const { token } = req.params;
        
        // Verificar token
        const [tokens] = await pool.query(
            'SELECT * FROM password_resets WHERE token = ? AND used = FALSE AND expires_at > NOW()',
            [token]
        );
        
        if (tokens.length === 0) {
            return res.render('error', {
                statusCode: 400,
                message: 'El enlace de recuperación es inválido o ha expirado. Solicita uno nuevo.',
                user: null
            });
        }
        
        res.render('reset-password', { token });
        
    } catch (error) {
        console.error('Error al verificar token:', error);
        res.render('error', {
            statusCode: 500,
            message: 'Error al verificar el enlace de recuperación.',
            user: null
        });
    }
});

// ============================================
// GUARDAR NUEVA CONTRASEÑA
// ============================================
router.post('/reset-password/:token', checkNotAuth, async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;
        
        if (!password || password.length < 8) {
            return res.json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres' });
        }
        
        // Verificar token
        const [tokens] = await pool.query(
            'SELECT * FROM password_resets WHERE token = ? AND used = FALSE AND expires_at > NOW()',
            [token]
        );
        
        if (tokens.length === 0) {
            return res.json({ success: false, message: 'El enlace ha expirado. Solicita uno nuevo.' });
        }
        
        const resetData = tokens[0];
        
        // Hashear nueva contraseña
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Actualizar contraseña
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, resetData.user_id]);
        
        // Marcar token como usado
        await pool.query('UPDATE password_resets SET used = TRUE WHERE id = ?', [resetData.id]);
        
        // Eliminar sesiones activas del usuario (forzar re-login)
        await pool.query('DELETE FROM active_sessions WHERE user_id = ?', [resetData.user_id]);
        
        console.log(`✅ Contraseña restablecida para usuario ID: ${resetData.user_id}`);
        
        res.json({ 
            success: true, 
            message: 'Contraseña actualizada exitosamente. Redirigiendo al inicio de sesión...' 
        });
        
    } catch (error) {
        console.error('Error al resetear contraseña:', error);
        res.json({ success: false, message: 'Error al cambiar la contraseña' });
    }
});

// ============================================
// CERRAR SESIÓN
// ============================================
router.get('/logout', async (req, res) => {
    try {
        if (req.session.user) {
            await pool.query(
                'DELETE FROM active_sessions WHERE user_id = ? AND session_id = ?',
                [req.session.user.id, req.sessionID]
            );
        }
        
        res.clearCookie('remember_token');
        
        req.session.destroy((err) => {
            if (err) console.error('Error al cerrar sesión:', err);
            res.redirect('/login');
        });
        
    } catch (error) {
        console.error('Error en logout:', error);
        res.redirect('/login');
    }
});

module.exports = router;