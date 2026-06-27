const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

// ============================================
// CONFIGURACIÓN DE HELMET
// ============================================
const helmetConfig = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://cdn.socket.io"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            mediaSrc: ["'self'", "blob:", "https:", "http:"],
            connectSrc: ["'self'", "ws:", "wss:", "https:", "http:"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "deny" },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true
});

// ============================================
// RATE LIMITERS
// ============================================

// Rate limiter para login (5 intentos cada 15 minutos)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5,
    message: {
        success: false,
        message: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        return req.ip + '_' + (req.body.email || 'unknown');
    }
});

// Rate limiter para registro (3 registros por hora por IP)
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3,
    message: {
        success: false,
        message: 'Demasiados registros desde esta IP. Intenta de nuevo en 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
});

// Rate limiter para API general (100 peticiones por minuto)
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100,
    message: {
        success: false,
        message: 'Demasiadas peticiones. Intenta de nuevo más tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter para verificación de email (3 intentos cada 10 minutos)
const verificationLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: 3,
    message: {
        success: false,
        message: 'Demasiados intentos de verificación. Intenta de nuevo en 10 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter para chat (5 mensajes por segundo)
const chatLimiter = rateLimit({
    windowMs: 1 * 1000, // 1 segundo
    max: 5,
    message: {
        success: false,
        message: 'Estás enviando mensajes demasiado rápido. Espera un momento.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.session?.user?.id || req.ip;
    }
});

// Rate limiter para búsquedas (30 por minuto)
const searchLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: {
        success: false,
        message: 'Demasiadas búsquedas. Intenta de nuevo en un minuto.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter para cambios de configuración (10 por hora)
const settingsLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        message: 'Demasiados cambios. Intenta de nuevo en 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// ============================================
// PROTECCIÓN CSRF
// ============================================

const csrfProtection = (req, res, next) => {
    // Generar token CSRF si no existe
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    // Para métodos que modifican datos
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const token = req.headers['x-csrf-token'] || req.body._csrf;
        
        if (!token || token !== req.session.csrfToken) {
            return res.status(403).json({
                success: false,
                message: 'Token CSRF inválido o ausente'
            });
        }
    }

    // Pasar token a las vistas
    res.locals.csrfToken = req.session.csrfToken;
    next();
};

// ============================================
// SANITIZACIÓN DE INPUTS
// ============================================

const sanitizeInput = (req, res, next) => {
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                // Eliminar tags HTML
                req.body[key] = req.body[key].replace(/<[^>]*>/g, '');
                // Eliminar scripts
                req.body[key] = req.body[key].replace(/javascript:/gi, '');
                // Eliminar eventos inline
                req.body[key] = req.body[key].replace(/on\w+\s*=/gi, '');
                // Eliminar expresiones de plantilla
                req.body[key] = req.body[key].replace(/\{\{.*?\}\}/g, '');
                req.body[key] = req.body[key].replace(/\{\%.*?\%\}/g, '');
                // Trim
                req.body[key] = req.body[key].trim();
            }
        });
    }
    
    if (req.query) {
        Object.keys(req.query).forEach(key => {
            if (typeof req.query[key] === 'string') {
                req.query[key] = req.query[key].replace(/<[^>]*>/g, '');
                req.query[key] = req.query[key].trim();
            }
        });
    }
    
    next();
};

// ============================================
// VALIDACIÓN DE URL
// ============================================

const validateUrl = (req, res, next) => {
    if (req.body.url) {
        try {
            const url = new URL(req.body.url);
            // Solo permitir ciertos protocolos
            if (!['http:', 'https:', 'rtmp:', 'rtmps:', 'rtsp:'].includes(url.protocol)) {
                return res.status(400).json({
                    success: false,
                    message: 'Protocolo de URL no permitido'
                });
            }
            // Bloquear URLs locales
            const hostname = url.hostname.toLowerCase();
            const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
            if (blockedHosts.includes(hostname)) {
                return res.status(400).json({
                    success: false,
                    message: 'URL no permitida'
                });
            }
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'URL inválida'
            });
        }
    }
    next();
};

// ============================================
// PREVENCIÓN DE INYECCIÓN SQL
// ============================================

const preventSQLInjection = (req, res, next) => {
    const sqlKeywords = [
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'UNION',
        'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE', 'DECLARE',
        'CAST', 'CONVERT', 'INFORMATION_SCHEMA', 'SLEEP', 'BENCHMARK'
    ];
    
    const sqlPattern = new RegExp(`\\b(${sqlKeywords.join('|')})\\b`, 'i');
    const commentPattern = /(\-\-|\#|\/\*|\*\/)/;
    
    const checkForSQL = (obj) => {
        for (let key in obj) {
            if (typeof obj[key] === 'string') {
                if (sqlPattern.test(obj[key]) || commentPattern.test(obj[key])) {
                    // Verificar si es una inyección real o solo una coincidencia
                    const suspicious = [
                        '1=1', '1=0', 'OR 1', 'AND 1', "' OR '", '" OR "',
                        'WAITFOR DELAY', 'BENCHMARK(', 'SLEEP('
                    ];
                    if (suspicious.some(s => obj[key].toUpperCase().includes(s))) {
                        return true;
                    }
                }
            }
        }
        return false;
    };

    if (req.body && checkForSQL(req.body)) {
        console.warn('⚠️ Posible inyección SQL detectada desde IP:', req.ip);
        return res.status(403).json({
            success: false,
            message: 'Entrada no permitida'
        });
    }

    next();
};

// ============================================
// HEADERS DE SEGURIDAD ADICIONALES
// ============================================

const securityHeaders = (req, res, next) => {
    // Prevenir clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevenir MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions Policy
    res.setHeader('Permissions-Policy', 
        'geolocation=(), microphone=(), camera=(), ' +
        'payment=(), usb=(), magnetometer=(), gyroscope=()'
    );
    
    // Cross-Origin-Opener-Policy
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    
    // Cross-Origin-Resource-Policy
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    
    // Cache-Control para páginas sensibles
    if (req.path.includes('/admin') || req.path.includes('/owner') || req.path.includes('/settings')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    
    // Remover headers que revelan información del servidor
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    next();
};

// ============================================
// VALIDACIÓN DE IDS
// ============================================

const validateId = (req, res, next) => {
    const id = req.params.id || req.body.id || req.query.id;
    
    if (id !== undefined && id !== null && id !== '') {
        // Verificar que es un número entero positivo
        if (!/^\d+$/.test(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID inválido'
            });
        }
        
        // Verificar que no es demasiado grande
        if (parseInt(id) > 2147483647) {
            return res.status(400).json({
                success: false,
                message: 'ID fuera de rango'
            });
        }
    }
    
    next();
};

// ============================================
// LOGGING DE SEGURIDAD
// ============================================

const securityLogger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const method = req.method;
    const url = req.originalUrl;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const userId = req.session?.user?.id || 'anonymous';
    
    // Log de peticiones a áreas sensibles
    if (url.includes('/admin') || url.includes('/owner') || method === 'DELETE') {
        console.log(`[SECURITY] ${timestamp} | User: ${userId} | IP: ${ip} | ${method} ${url} | UA: ${userAgent.substring(0, 100)}`);
    }
    
    // Log de intentos de acceso a rutas inexistentes
    if (res.statusCode === 404 && (url.includes('wp-') || url.includes('.php') || url.includes('.asp'))) {
        console.warn(`[SECURITY] Posible escaneo detectado: ${ip} intentó acceder a ${url}`);
    }
    
    next();
};

// ============================================
// VALIDACIÓN DE SESIÓN
// ============================================

const validateSession = async (req, res, next) => {
    if (req.session && req.session.user) {
        const { pool } = require('../models/db');
        
        try {
            // Verificar que el usuario sigue existiendo
            const [users] = await pool.query(
                'SELECT id, banned, ban_expiry FROM users WHERE id = ?',
                [req.session.user.id]
            );
            
            if (users.length === 0) {
                req.session.destroy();
                return res.status(401).json({
                    success: false,
                    message: 'Usuario no encontrado'
                });
            }
            
            // Verificar si fue baneado durante la sesión
            if (users[0].banned) {
                const banExpiry = users[0].ban_expiry;
                if (!banExpiry || new Date(banExpiry) > new Date()) {
                    req.session.destroy();
                    return res.status(403).json({
                        success: false,
                        message: 'Has sido baneado'
                    });
                }
            }
            
        } catch (error) {
            console.error('Error validando sesión:', error);
        }
    }
    
    next();
};

// ============================================
// PROTECCIÓN CONTRA ATAQUES DE FUERZA BRUTA
// ============================================

const bruteForceProtection = new Map();

const checkBruteForce = (req, res, next) => {
    const ip = req.ip;
    const key = `${ip}_${req.path}`;
    
    if (!bruteForceProtection.has(key)) {
        bruteForceProtection.set(key, {
            attempts: 0,
            firstAttempt: Date.now(),
            blocked: false
        });
    }
    
    const record = bruteForceProtection.get(key);
    
    // Resetear después de 15 minutos
    if (Date.now() - record.firstAttempt > 15 * 60 * 1000) {
        record.attempts = 0;
        record.firstAttempt = Date.now();
        record.blocked = false;
    }
    
    if (record.blocked) {
        return res.status(429).json({
            success: false,
            message: 'Demasiados intentos. Intenta de nuevo en 15 minutos.'
        });
    }
    
    record.attempts++;
    
    // Bloquear después de 10 intentos fallidos
    if (record.attempts > 10) {
        record.blocked = true;
        return res.status(429).json({
            success: false,
            message: 'IP bloqueada temporalmente por múltiples intentos fallidos.'
        });
    }
    
    next();
};

const resetBruteForce = (req) => {
    const ip = req.ip;
    const key = `${ip}_${req.path}`;
    bruteForceProtection.delete(key);
};

// Limpiar registros antiguos cada 30 minutos
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of bruteForceProtection.entries()) {
        if (now - record.firstAttempt > 30 * 60 * 1000) {
            bruteForceProtection.delete(key);
        }
    }
}, 30 * 60 * 1000);

// ============================================
// VALIDADORES CON EXPRESS-VALIDATOR
// ============================================

const registerValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 10 })
        .withMessage('El nombre de usuario debe tener entre 3 y 10 caracteres')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Solo se permiten letras, números y guiones bajos')
        .escape(),
    
    body('email')
        .trim()
        .isEmail()
        .withMessage('Email inválido')
        .normalizeEmail()
        .isLength({ max: 255 })
        .withMessage('Email demasiado largo'),
    
    body('password')
        .isLength({ min: 8, max: 128 })
        .withMessage('La contraseña debe tener entre 8 y 128 caracteres')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('La contraseña debe contener mayúsculas, minúsculas y números')
];

const loginValidation = [
    body('email')
        .trim()
        .isEmail()
        .withMessage('Email inválido')
        .normalizeEmail(),
    
    body('password')
        .notEmpty()
        .withMessage('La contraseña es requerida')
];

const streamValidation = [
    body('name')
        .trim()
        .isLength({ min: 1, max: 20 })
        .withMessage('El nombre debe tener entre 1 y 20 caracteres')
        .escape(),
    
    body('type')
        .isIn(['rtmp', 'hls', 'url'])
        .withMessage('Tipo de stream inválido'),
    
    body('url')
        .trim()
        .isURL()
        .withMessage('URL inválida'),
    
    body('duration')
        .isInt({ min: 1, max: 480 })
        .withMessage('La duración debe estar entre 1 y 480 minutos')
];

const chatValidation = [
    body('message')
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('El mensaje debe tener entre 1 y 200 caracteres')
        .escape()
];

// ============================================
// MIDDLEWARE DE VALIDACIÓN DE RESULTADOS
// ============================================

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Error de validación',
            errors: errors.array().map(err => ({
                field: err.param || err.path,
                message: err.msg
            }))
        });
    }
    
    next();
};

// ============================================
// PROTECCIÓN DE ARCHIVOS
// ============================================

const fileTypeFilter = (allowedTypes) => {
    return (req, res, next) => {
        if (req.file) {
            const ext = req.file.originalname.split('.').pop().toLowerCase();
            
            if (!allowedTypes.includes(ext)) {
                return res.status(400).json({
                    success: false,
                    message: `Tipo de archivo no permitido. Permitidos: ${allowedTypes.join(', ')}`
                });
            }
            
            // Verificar magic numbers para mayor seguridad
            const magicNumbers = {
                'jpg': ['ffd8ff'],
                'jpeg': ['ffd8ff'],
                'png': ['89504e47'],
                'gif': ['47494638'],
                'webp': ['52494646']
            };
            
            if (magicNumbers[ext] && req.file.buffer) {
                const hex = req.file.buffer.toString('hex', 0, 4);
                if (!magicNumbers[ext].includes(hex.substring(0, 6))) {
                    return res.status(400).json({
                        success: false,
                        message: 'El archivo no coincide con su extensión'
                    });
                }
            }
        }
        next();
    };
};

// ============================================
// MIDDLEWARE COMPUESTO PARA RUTAS PROTEGIDAS
// ============================================

const secureRoute = [
    securityHeaders,
    securityLogger,
    validateSession,
    csrfProtection,
    sanitizeInput,
    preventSQLInjection
];

const secureAPIRoute = [
    apiLimiter,
    securityHeaders,
    securityLogger,
    validateSession,
    csrfProtection,
    sanitizeInput,
    preventSQLInjection,
    validateId
];

// ============================================
// EXPORTACIÓN
// ============================================

module.exports = {
    // Configuración
    helmetConfig,
    
    // Rate Limiters
    loginLimiter,
    registerLimiter,
    apiLimiter,
    verificationLimiter,
    chatLimiter,
    searchLimiter,
    settingsLimiter,
    
    // Protecciones
    csrfProtection,
    sanitizeInput,
    validateUrl,
    preventSQLInjection,
    securityHeaders,
    validateId,
    securityLogger,
    validateSession,
    checkBruteForce,
    resetBruteForce,
    
    // Validadores
    registerValidation,
    loginValidation,
    streamValidation,
    chatValidation,
    handleValidationErrors,
    
    // Archivos
    fileTypeFilter,
    
    // Compuestos
    secureRoute,
    secureAPIRoute
};