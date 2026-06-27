class Validators {
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

    // Validar contraseña
    static isStrongPassword(password) {
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        
        return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumber;
    }

    // Validar IP
    static isValidIP(ip) {
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Regex.test(ip) || ipv6Regex.test(ip);
    }

    // Validar URL
    static isValidURL(url) {
        try {
            const urlObj = new URL(url);
            return ['http:', 'https:', 'rtmp:', 'rtmps:'].includes(urlObj.protocol);
        } catch {
            return false;
        }
    }

    // Validar nombre de stream
    static isValidStreamName(name) {
        return /^[a-zA-Z0-9\s\-_áéíóúÁÉÍÓÚñÑ]{1,20}$/.test(name);
    }

    // Sanitizar texto
    static sanitize(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    // Validar longitud del mensaje
    static isValidMessageLength(message, max = 200) {
        return message && message.length > 0 && message.length <= max;
    }

    // Validar código de verificación
    static isValidVerificationCode(code) {
        return /^\d{6}$/.test(code);
    }
}

module.exports = Validators;