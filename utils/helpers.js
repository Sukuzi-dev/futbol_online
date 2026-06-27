const crypto = require('crypto');
const moment = require('moment');

class Helpers {
    // Generar ID único
    static generateId(length = 12) {
        return crypto.randomBytes(length).toString('hex').substring(0, length);
    }
    
    // Generar código de verificación
    static generateVerificationCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    
    // Validar email
    static isValidEmail(email) {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(email);
    }
    
    // Validar username
    static isValidUsername(username) {
        const usernameRegex = /^[a-zA-Z0-9_]{3,10}$/;
        return usernameRegex.test(username);
    }
    
    // Validar URL
    static isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
    
    // Validar IP
    static isValidIP(ip) {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }
    
    // Formatear fecha
    static formatDate(date, format = 'DD/MM/YYYY HH:mm') {
        return moment(date).format(format);
    }
    
    // Calcular tiempo restante
    static timeRemaining(endDate) {
        const now = moment();
        const end = moment(endDate);
        const duration = moment.duration(end.diff(now));
        
        if (duration.asSeconds() <= 0) return 'Finalizado';
        
        const hours = Math.floor(duration.asHours());
        const minutes = duration.minutes();
        
        return `${hours}h ${minutes}m`;
    }
    
    // Sanitizar string para prevenir XSS
    static sanitizeString(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }
    
    // Truncar texto
    static truncate(str, length = 100) {
        if (!str || str.length <= length) return str;
        return str.substring(0, length) + '...';
    }
    
    // Generar slug
    static generateSlug(text) {
        return text
            .toString()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }
    
    // Formatear bytes
    static formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    // Generar color aleatorio
    static randomColor() {
        return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    }
    
    // Obtener extensión de archivo
    static getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }
    
    // Verificar si es imagen
    static isImage(filename) {
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
        const ext = this.getFileExtension(filename);
        return imageExtensions.includes(ext);
    }
    
    // Enmascarar email
    static maskEmail(email) {
        const [name, domain] = email.split('@');
        const maskedName = name.charAt(0) + '*'.repeat(name.length - 2) + name.charAt(name.length - 1);
        return `${maskedName}@${domain}`;
    }
    
    // Enmascarar IP
    static maskIP(ip) {
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.*.*`;
    }
    
    // Calcular nivel de riesgo de contraseña
    static passwordStrength(password) {
        let score = 0;
        
        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        if (/[a-z]/.test(password)) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/\d/.test(password)) score++;
        if (/[^a-zA-Z0-9]/.test(password)) score++;
        
        if (score <= 2) return 'Débil';
        if (score <= 4) return 'Media';
        return 'Fuerte';
    }
    
    // Generar paginación
    static paginate(page, limit, total) {
        const totalPages = Math.ceil(total / limit);
        const currentPage = Math.max(1, Math.min(page, totalPages));
        const offset = (currentPage - 1) * limit;
        
        return {
            currentPage,
            totalPages,
            limit,
            total,
            offset,
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1
        };
    }
}

module.exports = Helpers;