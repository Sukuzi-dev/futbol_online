const { pool } = require('../models/db');
const { securityLogger } = require('./logger');

function initializeSocket(io) {
    // Middleware de autenticación para Socket.IO
    io.use(async (socket, next) => {
        try {
            const session = socket.request.session;
            
            if (!session || !session.user) {
                return next(new Error('No autenticado'));
            }
            
            // Verificar que el usuario no está baneado
            const [users] = await pool.query(
                'SELECT banned, ban_expiry FROM users WHERE id = ?',
                [session.user.id]
            );
            
            if (users.length > 0) {
                const user = users[0];
                if (user.banned) {
                    if (!user.ban_expiry || new Date(user.ban_expiry) > new Date()) {
                        return next(new Error('Usuario baneado'));
                    }
                }
            }
            
            socket.userId = session.user.id;
            socket.username = session.user.username;
            socket.userRole = session.user.role;
            socket.userAvatar = session.user.avatar;
            
            next();
        } catch (error) {
            next(new Error('Error de autenticación'));
        }
    });
    
    io.on('connection', (socket) => {
        console.log(`✅ Usuario conectado: ${socket.username} (${socket.id})`);
        
        // Unirse a una sala de stream
        socket.on('join-stream', (streamId) => {
            if (!streamId) return;
            
            socket.join(`stream-${streamId}`);
            
            // Registrar sesión activa
            const clientIp = socket.handshake.address;
            pool.query(
                'INSERT INTO active_sessions (user_id, session_id, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                [socket.userId, socket.id, clientIp, socket.handshake.headers['user-agent']]
            ).catch(err => console.error('Error registrando sesión:', err));
            
            // Actualizar contador de viewers
            const room = io.sockets.adapter.rooms.get(`stream-${streamId}`);
            const viewerCount = room ? room.size : 0;
            
            io.to(`stream-${streamId}`).emit('viewer-count', viewerCount);
            
            // Actualizar en base de datos
            pool.query(
                'UPDATE streams SET viewer_count = ? WHERE id = ?',
                [viewerCount, streamId]
            ).catch(err => console.error('Error actualizando viewers:', err));
            
            console.log(`${socket.username} se unió al stream ${streamId}`);
        });
        
        // Salir de una sala de stream
        socket.on('leave-stream', (streamId) => {
            if (!streamId) return;
            
            socket.leave(`stream-${streamId}`);
            
            // Actualizar contador
            const room = io.sockets.adapter.rooms.get(`stream-${streamId}`);
            const viewerCount = room ? room.size : 0;
            
            io.to(`stream-${streamId}`).emit('viewer-count', viewerCount);
            
            // Actualizar en base de datos
            pool.query(
                'UPDATE streams SET viewer_count = GREATEST(viewer_count - 1, 0) WHERE id = ?',
                [streamId]
            ).catch(err => console.error('Error actualizando viewers:', err));
            
            // Eliminar sesión
            pool.query(
                'DELETE FROM active_sessions WHERE session_id = ?',
                [socket.id]
            ).catch(err => console.error('Error eliminando sesión:', err));
        });
        
        // Manejar mensajes del chat
        socket.on('chat-message', async (data) => {
            try {
                const { streamId, message } = data;
                
                // Validaciones
                if (!streamId || !message) return;
                if (message.length > 200) return;
                
                // Anti-spam: verificar último mensaje
                const [lastMessages] = await pool.query(
                    'SELECT created_at FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
                    [socket.userId]
                );
                
                if (lastMessages.length > 0) {
                    const timeSinceLastMessage = Date.now() - new Date(lastMessages[0].created_at).getTime();
                    if (timeSinceLastMessage < 1000) { // 1 segundo entre mensajes
                        socket.emit('chat-error', { message: 'Espera un segundo antes de enviar otro mensaje' });
                        return;
                    }
                }
                
                // Verificar si el usuario está silenciado
                const [mutes] = await pool.query(
                    'SELECT id FROM bans WHERE user_id = ? AND ban_type = ? AND (expiry IS NULL OR expiry > NOW())',
                    [socket.userId, 'mute']
                );
                
                if (mutes.length > 0) {
                    socket.emit('chat-error', { message: 'Estás silenciado y no puedes enviar mensajes' });
                    return;
                }
                
                // Verificar que el stream existe y está activo
                const [streams] = await pool.query(
                    'SELECT id FROM streams WHERE id = ? AND active = TRUE',
                    [streamId]
                );
                
                if (streams.length === 0) return;
                
                // Guardar mensaje en BD
                const [result] = await pool.query(
                    'INSERT INTO chat_messages (user_id, stream_id, message) VALUES (?, ?, ?)',
                    [socket.userId, streamId, message]
                );
                
                // Emitir mensaje a la sala
                io.to(`stream-${streamId}`).emit('new-message', {
                    id: result.insertId,
                    userId: socket.userId,
                    username: socket.username,
                    avatar: socket.userAvatar,
                    role: socket.userRole,
                    message: message,
                    timestamp: new Date()
                });
                
            } catch (error) {
                console.error('Error en chat:', error);
            }
        });
        
        // Notificaciones globales (admin/owner)
        socket.on('global-notification', (data) => {
            if (socket.userRole === 'admin' || socket.userRole === 'owner') {
                io.emit('new-notification', {
                    message: data.message,
                    from: socket.username,
                    timestamp: new Date()
                });
            }
        });
        
        // Broadcast (solo owner)
        socket.on('broadcast-message', (data) => {
            if (socket.userRole === 'owner') {
                io.emit('broadcast', {
                    message: data.message,
                    from: socket.username,
                    timestamp: new Date()
                });
            }
        });
        
        // Desconexión
        socket.on('disconnect', async () => {
            console.log(`❌ Usuario desconectado: ${socket.username}`);
            
            // Limpiar sesiones activas
            await pool.query(
                'DELETE FROM active_sessions WHERE session_id = ?',
                [socket.id]
            ).catch(err => console.error('Error limpiando sesión:', err));
            
            // Actualizar viewers en todas las salas donde estaba
            socket.rooms.forEach(room => {
                if (room.startsWith('stream-')) {
                    const streamId = room.replace('stream-', '');
                    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
                    io.to(room).emit('viewer-count', roomSize);
                    
                    pool.query(
                        'UPDATE streams SET viewer_count = ? WHERE id = ?',
                        [roomSize, streamId]
                    ).catch(err => console.error('Error actualizando viewers:', err));
                }
            });
        });
    });
}

module.exports = initializeSocket;