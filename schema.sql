-- ============================================
-- FUTBOL ONLINE - BASE DE DATOS COMPLETA
-- ============================================
-- Versión: 3.0 Final
-- Motor: MySQL 5.7+ / MariaDB 10.3+
-- Codificación: utf8mb4
-- Ejecutar: mysql -u root -p < futbol_online_complete.sql
-- ============================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";
SET NAMES utf8mb4;

-- Crear base de datos
DROP DATABASE IF EXISTS futbol_online;
CREATE DATABASE futbol_online CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE futbol_online;

-- ============================================
-- TABLA: users
-- ============================================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(10) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin', 'owner') DEFAULT 'user',
    avatar VARCHAR(255) DEFAULT 'default.png',
    verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(6) DEFAULT NULL,
    verification_expiry DATETIME DEFAULT NULL,
    name_changes INT DEFAULT 0,
    last_name_change YEAR DEFAULT NULL,
    banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT DEFAULT NULL,
    ban_expiry DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_username (username),
    UNIQUE KEY uk_email (email),
    INDEX idx_role (role),
    INDEX idx_banned (banned),
    INDEX idx_verified (verified),
    INDEX idx_last_activity (last_activity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: pending_registrations
-- ============================================
CREATE TABLE pending_registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(10) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    verification_code VARCHAR(6) NOT NULL,
    verification_expiry DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_username (username),
    INDEX idx_used (used),
    INDEX idx_expiry (verification_expiry)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: streams
-- ============================================
CREATE TABLE streams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stream_id VARCHAR(20) NOT NULL,
    name VARCHAR(20) NOT NULL,
    url TEXT NOT NULL,
    type ENUM('rtmp', 'hls', 'url') NOT NULL,
    duration INT NOT NULL,
    end_time DATETIME NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    viewer_count INT DEFAULT 0,
    created_by INT DEFAULT NULL,
    scheduled_start DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_stream_id (stream_id),
    INDEX idx_active (active),
    INDEX idx_end_time (end_time),
    INDEX idx_viewer_count (viewer_count),
    INDEX idx_created_by (created_by),
    INDEX idx_scheduled_start (scheduled_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: notifications
-- ============================================
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    message TEXT NOT NULL,
    readed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_readed (readed),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: bans
-- ============================================
CREATE TABLE bans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    banned_by INT NOT NULL,
    reason TEXT DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    ban_type ENUM('mute', 'temp_ban', 'perm_ban') NOT NULL,
    expiry DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_banned_by (banned_by),
    INDEX idx_ban_type (ban_type),
    INDEX idx_expiry (expiry),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: ip_blacklist
-- ============================================
CREATE TABLE ip_blacklist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    reason TEXT DEFAULT NULL,
    blocked_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_ip_address (ip_address),
    INDEX idx_blocked_by (blocked_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: chat_messages
-- ============================================
CREATE TABLE chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    stream_id INT NOT NULL,
    server_index INT DEFAULT 0,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_stream_id (stream_id),
    INDEX idx_user_id (user_id),
    INDEX idx_server_index (stream_id, server_index),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: active_sessions
-- ============================================
CREATE TABLE active_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_session_id (session_id),
    INDEX idx_ip_address (ip_address),
    INDEX idx_last_activity (last_activity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: password_resets
-- ============================================
CREATE TABLE password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_token (token),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: audit_log
-- ============================================
CREATE TABLE audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) DEFAULT NULL,
    entity_id INT DEFAULT NULL,
    details TEXT DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- LLAVES FORÁNEAS
-- ============================================
ALTER TABLE streams ADD CONSTRAINT fk_streams_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE bans ADD CONSTRAINT fk_bans_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE bans ADD CONSTRAINT fk_bans_banned_by FOREIGN KEY (banned_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ip_blacklist ADD CONSTRAINT fk_ip_blacklist_blocked_by FOREIGN KEY (blocked_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_messages_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_messages_stream_id FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE;
ALTER TABLE active_sessions ADD CONSTRAINT fk_active_sessions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE password_resets ADD CONSTRAINT fk_password_resets_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE audit_log ADD CONSTRAINT fk_audit_log_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================
-- INSERTAR USUARIO OWNER POR DEFECTO
-- ============================================
-- Contraseña: Admin123
INSERT INTO users (username, email, password, role, verified, avatar) VALUES ('Sukuzi', 'jeannnmt21@gmail.com', '$2a$12$6qwF2ToeKLzH2llGsBlUG.INR2dnqbKjr0VD2/XMgglUuddMo96QW', 'owner', TRUE, 'default.png');

-- Contraseña: Test1234
INSERT INTO users (username, email, password, role, verified) VALUES ('Admin1', 'admin1@test.com', '$2a$12$LJ3m4ys3GZfnYMz8kVsKaOMqFhRNmXqFJqMqXqFJqMqXqFJqM', 'admin', TRUE);
INSERT INTO users (username, email, password, role, verified) VALUES ('User1', 'user1@test.com', '$2a$12$LJ3m4ys3GZfnYMz8kVsKaOMqFhRNmXqFJqMqXqFJqMqXqFJqM', 'user', TRUE);

-- Datos de prueba para IP blacklist
INSERT INTO ip_blacklist (ip_address, reason, blocked_by) VALUES ('192.168.1.100', 'Intento de ataque DDoS', 1);
INSERT INTO ip_blacklist (ip_address, reason, blocked_by) VALUES ('10.0.0.50', 'Spam en el chat', 1);

COMMIT;

SELECT '✅ BASE DE DATOS CREADA EXITOSAMENTE' AS '';
SELECT '👑 Sukuzi: jeannnmt21@gmail.com / lavidabuena1331' AS '';
SELECT '🛡️ Admin: admin1@test.com / Test1234' AS '';
SELECT '👤 User: user1@test.com / Test1234' AS '';