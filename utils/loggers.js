const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Crear directorio de logs si no existe
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Configuración de formato
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.prettyPrint()
);

// Crear logger
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    transports: [
        // Log de errores
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        
        // Log combinado
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 5242880,
            maxFiles: 10,
        }),
        
        // Log de seguridad
        new winston.transports.File({
            filename: path.join(logDir, 'security.log'),
            level: 'warn',
            maxsize: 5242880,
            maxFiles: 3,
        })
    ]
});

// En desarrollo, también mostrar en consola
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
                return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
            })
        )
    }));
}

// Logger específico para seguridad
const securityLogger = {
    logAuthAttempt: (username, ip, success, reason = '') => {
        const message = success 
            ? `Inicio de sesión exitoso: ${username} desde ${ip}`
            : `Intento fallido de inicio de sesión: ${username} desde ${ip} - Razón: ${reason}`;
        
        logger.warn(message, { 
            type: 'auth_attempt',
            username,
            ip,
            success,
            reason 
        });
    },
    
    logModeration: (moderator, action, target, reason) => {
        logger.warn(`Moderación: ${moderator} realizó "${action}" sobre ${target} - Razón: ${reason}`, {
            type: 'moderation',
            moderator,
            action,
            target,
            reason
        });
    },
    
    logBanEvent: (bannedUser, bannedBy, banType, reason) => {
        logger.warn(`Baneo: ${bannedUser} fue baneado por ${bannedBy} (${banType}) - Razón: ${reason}`, {
            type: 'ban',
            bannedUser,
            bannedBy,
            banType,
            reason
        });
    },
    
    logSuspiciousActivity: (ip, activity, details) => {
        logger.error(`Actividad sospechosa detectada: ${activity} desde IP ${ip}`, {
            type: 'suspicious',
            ip,
            activity,
            details
        });
    }
};

module.exports = {
    logger,
    securityLogger
};