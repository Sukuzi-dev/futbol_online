const crypto = require('crypto');
require('dotenv').config();

class Encryption {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.key = crypto.scryptSync(
            process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32chars',
            'salt',
            32
        );
        this.ivLength = 16;
    }

    // Encriptar datos sensibles
    encrypt(text) {
        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            iv: iv.toString('hex'),
            encrypted: encrypted,
            authTag: authTag.toString('hex')
        };
    }

    // Desencriptar datos
    decrypt(encryptedData) {
        const decipher = crypto.createDecipheriv(
            this.algorithm,
            this.key,
            Buffer.from(encryptedData.iv, 'hex')
        );
        
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
        
        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    // Hash de datos (one-way)
    hash(text) {
        return crypto.createHash('sha256').update(text).digest('hex');
    }

    // Generar token seguro
    generateToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Comparar hash
    compareHash(text, hashedText) {
        return this.hash(text) === hashedText;
    }
}

module.exports = new Encryption();