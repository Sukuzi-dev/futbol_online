const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'futbol_online',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Función para probar la conexión
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Conexión a MySQL establecida correctamente');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Error al conectar con MySQL:', error.message);
        return false;
    }
}

// Inicializar base de datos
async function initializeDatabase() {
    const connection = await pool.getConnection();
    try {
        console.log('🔄 Verificando tablas...');
        
        // Tabla de usuarios
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(10) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('user', 'admin', 'owner') DEFAULT 'user',
                avatar VARCHAR(255) DEFAULT 'default.png',
                verified BOOLEAN DEFAULT FALSE,
                verification_code VARCHAR(6),
                verification_expiry DATETIME,
                name_changes INT DEFAULT 0,
                last_name_change YEAR,
                banned BOOLEAN DEFAULT FALSE,
                ban_reason TEXT,
                ban_expiry DATETIME,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_username (username),
                INDEX idx_email (email),
                INDEX idx_role (role),
                INDEX idx_banned (banned),
                INDEX idx_last_activity (last_activity)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // Tabla de streams
        await connection.query(`
            CREATE TABLE IF NOT EXISTS streams (
                id INT AUTO_INCREMENT PRIMARY KEY,
                stream_id VARCHAR(20) UNIQUE NOT NULL,
                name VARCHAR(20) NOT NULL,
                url TEXT NOT NULL,
                type ENUM('rtmp', 'hls', 'url') NOT NULL,
                duration INT NOT NULL,
                end_time DATETIME NOT NULL,
                active BOOLEAN DEFAULT TRUE,
                viewer_count INT DEFAULT 0,
                created_by INT,
                scheduled_start DATETIME,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_stream_id (stream_id),
                INDEX idx_active (active),
                INDEX idx_end_time (end_time),
                INDEX idx_scheduled_start (scheduled_start)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // Tabla de notificaciones
        await connection.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                message TEXT NOT NULL,
                readed BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_readed (readed)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // Tabla de bans
        await connection.query(`
            CREATE TABLE IF NOT EXISTS bans (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                banned_by INT NOT NULL,
                reason TEXT,
                ip_address VARCHAR(45),
                ban_type ENUM('mute', 'temp_ban', 'perm_ban') NOT NULL,
                expiry DATETIME,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_ban_type (ban_type),
                INDEX idx_expiry (expiry)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // Tabla de IP blacklist
        await connection.query(`
            CREATE TABLE IF NOT EXISTS ip_blacklist (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ip_address VARCHAR(45) UNIQUE NOT NULL,
                reason TEXT,
                blocked_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // Tabla de chat
        await connection.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                stream_id INT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_stream_id (stream_id),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // Tabla de sesiones activas
        await connection.query(`
            CREATE TABLE IF NOT EXISTS active_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                session_id VARCHAR(255) NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_session_id (session_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // Tabla de recuperación de contraseña
        await connection.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token VARCHAR(255) NOT NULL,
                expires_at DATETIME NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // Verificar si existe usuario owner
        const [owners] = await connection.query(
            'SELECT id FROM users WHERE role = ? LIMIT 1',
            ['owner']
        );
        
        if (owners.length === 0) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('Admin123', 12);
            
            await connection.query(
                'INSERT INTO users (username, email, password, role, verified) VALUES (?, ?, ?, ?, ?)',
                ['Owner', 'owner@futbolonline.com', hashedPassword, 'owner', true]
            );
            console.log('✅ Usuario Owner creado: owner@futbolonline.com / Admin123');
        }
        
        console.log('✅ Base de datos inicializada correctamente');
    } catch (error) {
        console.error('❌ Error al inicializar la base de datos:', error.message);
        throw error;
    } finally {
        connection.release();
    }
}

// Helper para queries
async function query(sql, params = []) {
    const [rows] = await pool.query(sql, params);
    return rows;
}

// Helper para obtener un solo registro
async function getOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0] || null;
}

// Helper para insertar y obtener ID
async function insert(sql, params = []) {
    const [result] = await pool.query(sql, params);
    return result.insertId;
}

module.exports = {
    pool,
    query,
    getOne,
    insert,
    testConnection,
    initializeDatabase
};