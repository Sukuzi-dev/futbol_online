const { pool } = require('../models/db');
const { logger } = require('./logger');

class CleanupTasks {
    // Limpiar bans expirados
    static async cleanupExpiredBans() {
        try {
            // Eliminar bans expirados
            const [result] = await pool.query(
                'DELETE FROM bans WHERE expiry IS NOT NULL AND expiry < NOW()'
            );
            
            // Desbanear usuarios con ban temporal expirado
            await pool.query(
                `UPDATE users SET banned = FALSE, ban_reason = NULL, ban_expiry = NULL 
                 WHERE banned = TRUE AND ban_expiry IS NOT NULL AND ban_expiry < NOW()`
            );
            
            if (result.affectedRows > 0) {
                logger.info(`Limpieza de bans: ${result.affectedRows} bans expirados eliminados`);
            }
        } catch (error) {
            logger.error('Error en limpieza de bans:', error);
        }
    }
    
    // Eliminar streams expirados
    static async removeExpiredStreams() {
        try {
            const [result] = await pool.query(
                'UPDATE streams SET active = FALSE WHERE active = TRUE AND end_time < NOW()'
            );
            
            if (result.affectedRows > 0) {
                logger.info(`Streams expirados desactivados: ${result.affectedRows}`);
            }
        } catch (error) {
            logger.error('Error en limpieza de streams:', error);
        }
    }
    
    // Limpiar sesiones inactivas
    static async cleanupInactiveSessions() {
        try {
            const [result] = await pool.query(
                'DELETE FROM active_sessions WHERE last_activity < DATE_SUB(NOW(), INTERVAL 1 HOUR)'
            );
            
            if (result.affectedRows > 0) {
                logger.info(`Sesiones inactivas eliminadas: ${result.affectedRows}`);
            }
        } catch (error) {
            logger.error('Error en limpieza de sesiones:', error);
        }
    }
    
    // Eliminar cuentas con ban permanente después de 30 días
    static async removePermanentBannedAccounts() {
        try {
            const [result] = await pool.query(
                `DELETE FROM users 
                 WHERE banned = TRUE 
                 AND ban_expiry IS NULL 
                 AND last_activity < DATE_SUB(NOW(), INTERVAL 30 DAY)`
            );
            
            if (result.affectedRows > 0) {
                logger.info(`Cuentas baneadas permanentemente eliminadas: ${result.affectedRows}`);
            }
        } catch (error) {
            logger.error('Error eliminando cuentas baneadas:', error);
        }
    }
    
    // Limpiar notificaciones antiguas (más de 90 días)
    static async cleanupOldNotifications() {
        try {
            const [result] = await pool.query(
                'DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)'
            );
            
            if (result.affectedRows > 0) {
                logger.info(`Notificaciones antiguas eliminadas: ${result.affectedRows}`);
            }
        } catch (error) {
            logger.error('Error limpiando notificaciones:', error);
        }
    }
    
    // Limpiar mensajes del chat antiguos (más de 30 días)
    static async cleanupOldChatMessages() {
        try {
            const [result] = await pool.query(
                'DELETE FROM chat_messages WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)'
            );
            
            if (result.affectedRows > 0) {
                logger.info(`Mensajes antiguos eliminados: ${result.affectedRows}`);
            }
        } catch (error) {
            logger.error('Error limpiando mensajes:', error);
        }
    }
    
    // Ejecutar todas las tareas de limpieza
    static async runAllCleanupTasks() {
        logger.info('Iniciando todas las tareas de limpieza...');
        
        await this.cleanupExpiredBans();
        await this.removeExpiredStreams();
        await this.cleanupInactiveSessions();
        await this.cleanupOldNotifications();
        await this.cleanupOldChatMessages();
        
        logger.info('Todas las tareas de limpieza completadas');
    }
}

module.exports = CleanupTasks;