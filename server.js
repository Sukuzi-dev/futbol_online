const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000
});

const mysql = require('mysql2/promise');
require('dotenv').config();

if (process.env.DATABASE_URL) {
    // Railway proporciona DATABASE_URL
    const url = new URL(process.env.DATABASE_URL);
    pool = mysql.createPool({
        host: url.hostname,
        port: url.port,
        user: url.username,
        password: url.password,
        database: url.pathname.replace('/', ''),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4'
    });
} else {
    // Configuración local
    pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'futbol_online',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4'
    });
}

// Seguridad
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Sesión
app.use(session({
    secret: process.env.SESSION_SECRET || 'futbol_online_secret_key_2024_secure',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000, sameSite: 'lax' }
}));

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('io', io);

// CSRF Token
app.use((req, res, next) => {
    if (req.session && !req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session ? req.session.csrfToken : '';
    next();
});

// Variables globales
app.use((req, res, next) => {
    res.locals.user = req.session ? req.session.user || null : null;
    res.locals.currentPath = req.path;
    try {
        res.locals.moment = require('moment');
        res.locals.moment.locale('es');
    } catch (e) {
        res.locals.moment = null;
    }
    next();
});

// Auto-login
const { pool } = require('./models/db');

app.use(async (req, res, next) => {
    if (req.session && !req.session.user && req.cookies && req.cookies.remember_token) {
        try {
            const [sessions] = await pool.query(
                "SELECT s.*, u.id, u.username, u.email, u.role, u.avatar FROM active_sessions s JOIN users u ON s.user_id = u.id WHERE s.session_id = ? AND u.banned = FALSE",
                [req.cookies.remember_token]
            );
            if (sessions.length > 0) {
                req.session.user = {
                    id: sessions[0].id,
                    username: sessions[0].username,
                    email: sessions[0].email,
                    role: sessions[0].role,
                    avatar: sessions[0].avatar
                };
                await pool.query('UPDATE active_sessions SET last_activity = NOW() WHERE session_id = ?', [req.cookies.remember_token]);
            }
        } catch (error) {}
    }
    next();
});

// Rutas
app.use('/', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/admin', require('./routes/admin'));
app.use('/owner', require('./routes/owner'));
app.use('/stream', require('./routes/stream'));
app.use('/settings', require('./routes/settings'));
app.use('/notifications', require('./routes/notifications'));

app.get('/', (req, res) => {
    res.redirect(req.session && req.session.user ? '/dashboard' : '/login');
});

// ============================================
// SOCKET.IO - CON VERIFICACIÓN DE MUTE
// ============================================
io.on('connection', (socket) => {
    const clientIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    console.log(`✅ Conectado: ${socket.id}`);

    // Stream principal
    socket.on('join-stream', (streamId) => {
        if (!streamId) return;
        socket.join(`stream-${streamId}`);
        const count = io.sockets.adapter.rooms.get(`stream-${streamId}`)?.size || 0;
        io.emit('viewer-count-update', { streamId, viewerCount: count });
        io.to(`stream-${streamId}`).emit('viewer-count', count);
        pool.query('UPDATE streams SET viewer_count = ? WHERE id = ?', [count, streamId]).catch(() => {});
    });

    socket.on('leave-stream', (streamId) => {
        if (!streamId) return;
        socket.leave(`stream-${streamId}`);
        const count = io.sockets.adapter.rooms.get(`stream-${streamId}`)?.size || 0;
        io.emit('viewer-count-update', { streamId, viewerCount: count });
        io.to(`stream-${streamId}`).emit('viewer-count', count);
        pool.query('UPDATE streams SET viewer_count = GREATEST(viewer_count - 1, 0) WHERE id = ?', [streamId]).catch(() => {});
    });

    // Chat por servidor (CON VERIFICACIÓN DE MUTE)
    socket.on('join-server-chat', (data) => {
        if (!data.streamId || data.serverIndex === undefined) return;
        const room = `stream-${data.streamId}-server-${data.serverIndex}`;
        socket.join(room);
        const count = io.sockets.adapter.rooms.get(room)?.size || 0;
        io.to(room).emit('viewer-count', count);
    });

    socket.on('leave-server-chat', (data) => {
        if (!data.streamId || data.serverIndex === undefined) return;
        const room = `stream-${data.streamId}-server-${data.serverIndex}`;
        socket.leave(room);
        const count = io.sockets.adapter.rooms.get(room)?.size || 0;
        io.to(room).emit('viewer-count', count);
    });

    // MENSAJE DE CHAT POR SERVIDOR (CON VERIFICACIÓN DE MUTE)
    socket.on('server-chat-message', async (data) => {
        if (!data.streamId || data.serverIndex === undefined || !data.message) return;
        if (data.message.length > 200) return;
        
        // VERIFICAR SI EL USUARIO ESTÁ MUTEADO
        try {
            const [mutes] = await pool.query(
                "SELECT id FROM bans WHERE user_id = ? AND ban_type = 'mute' AND (expiry IS NULL OR expiry > NOW())",
                [data.userId]
            );
            
            if (mutes.length > 0) {
                // Notificar solo al usuario muteado
                socket.emit('mute-notification', { 
                    message: '🔇 Estás silenciado y no puedes enviar mensajes.' 
                });
                console.log(`🚫 Mensaje bloqueado (mute): usuario ${data.userId}`);
                return;
            }
        } catch (error) {
            console.error('Error verificando mute:', error.message);
            return;
        }
        
        const room = `stream-${data.streamId}-server-${data.serverIndex}`;
        
        const messageData = {
            streamId: data.streamId,
            serverIndex: data.serverIndex,
            userId: data.userId,
            username: data.username || 'Anónimo',
            avatar: data.avatar || 'default.png',
            role: data.role || 'user',
            message: data.message.substring(0, 200),
            timestamp: new Date()
        };
        
        io.to(room).emit('new-server-message', messageData);
        console.log(`💬 Mensaje en servidor ${data.serverIndex}: ${data.username}: ${data.message.substring(0, 30)}`);
    });

    // Chat global (CON VERIFICACIÓN DE MUTE)
    socket.on('chat-message', async (data) => {
        if (!data.streamId || !data.message || data.message.length > 200) return;
        
        // VERIFICAR SI EL USUARIO ESTÁ MUTEADO
        try {
            const [mutes] = await pool.query(
                "SELECT id FROM bans WHERE user_id = ? AND ban_type = 'mute' AND (expiry IS NULL OR expiry > NOW())",
                [data.userId]
            );
            
            if (mutes.length > 0) {
                socket.emit('mute-notification', { 
                    message: '🔇 Estás silenciado y no puedes enviar mensajes.' 
                });
                return;
            }
        } catch (error) {
            console.error('Error verificando mute:', error.message);
            return;
        }
        
        io.to(`stream-${data.streamId}`).emit('new-message', {
            username: data.username || 'Anónimo',
            avatar: data.avatar || 'default.png',
            message: data.message.substring(0, 200),
            role: data.role || 'user',
            timestamp: new Date()
        });
    });

    socket.on('request-viewers-update', async () => {
        try {
            const [streams] = await pool.query('SELECT id, name, viewer_count FROM streams WHERE active = TRUE AND end_time > NOW()');
            socket.emit('global-viewers-update', { streams });
        } catch (e) {}
    });

    socket.on('disconnect', () => {
        socket.rooms.forEach(room => {
            if (room.startsWith('stream-')) {
                if (!room.includes('-server-')) {
                    const streamId = room.replace('stream-', '');
                    const count = io.sockets.adapter.rooms.get(room)?.size || 0;
                    io.emit('viewer-count-update', { streamId, viewerCount: count });
                    pool.query('UPDATE streams SET viewer_count = ? WHERE id = ?', [count, streamId]).catch(() => {});
                }
                if (room.includes('-server-')) {
                    const count = io.sockets.adapter.rooms.get(room)?.size || 0;
                    io.to(room).emit('viewer-count', count);
                }
            }
        });
    });
});

setInterval(async () => {
    try {
        const [streams] = await pool.query('SELECT id, name, viewer_count FROM streams WHERE active = TRUE AND end_time > NOW()');
        io.emit('global-viewers-update', { streams });
    } catch (e) {}
}, 10000);

// Errores
app.use((req, res) => {
    res.status(404).render('error', { statusCode: 404, message: 'Página no encontrada', user: req.session ? req.session.user : null });
});

app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(err.status || 500).render('error', { statusCode: err.status || 500, message: err.message || 'Error interno', user: req.session ? req.session.user : null });
});

// Iniciar
const { initializeDatabase, testConnection } = require('./models/db');
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        const connected = await testConnection();
        if (connected) await initializeDatabase();
    } catch (e) {}
    
    server.listen(PORT, () => {
        console.log('⚽ Futbol Online - Puerto ' + PORT);
        console.log('🌐 http://localhost:' + PORT);
        console.log('🔇 Sistema anti-mute activado');
    });
}

startServer();

module.exports = app;
