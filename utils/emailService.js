const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailService {
    constructor() {
        this.transporter = null;
        this.initTransporter();
    }

    initTransporter() {
        try {
            if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                // Configuración para Brevo
                this.transporter = nodemailer.createTransport({
                    host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
                    port: parseInt(process.env.EMAIL_PORT) || 587,
                    secure: false, // false para 587, true para 465
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS
                    },
                    tls: {
                        rejectUnauthorized: false
                    }
                });
                
                // Verificar conexión
                this.transporter.verify()
                    .then(() => console.log('✅ Conectado a Brevo SMTP'))
                    .catch(err => console.error('❌ Error Brevo:', err.message));
            } else {
                console.log('⚠️  Credenciales Brevo no configuradas');
                console.log('📧 Modo desarrollo: códigos mostrados en consola');
            }
        } catch (error) {
            console.error('❌ Error al configurar Brevo:', error.message);
        }
    }

    async sendVerificationEmail(to, username, code) {
        // Si no hay transporter, mostrar código en consola
        if (!this.transporter) {
            console.log('');
            console.log('=========================================');
            console.log('📧 MODO DESARROLLO - Código de verificación');
            console.log('=========================================');
            console.log('👤 Usuario:', username);
            console.log('📩 Email:', to);
            console.log('🔢 Código:', code);
            console.log('=========================================');
            console.log('');
            return { success: true, devMode: true };
        }

        const mailOptions = {
            from: `"Futbol Online" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
            to: to,
            subject: '⚽ Verifica tu cuenta - Futbol Online',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
                        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 5px 20px rgba(0,0,0,0.1); }
                        .header { background: linear-gradient(135deg, #667eea, #764ba2); padding: 40px 30px; text-align: center; }
                        .header h1 { color: white; margin: 0; font-size: 28px; }
                        .header .icon { font-size: 50px; margin-bottom: 10px; }
                        .content { padding: 40px 30px; text-align: center; }
                        .content h2 { color: #1a1a2e; margin-bottom: 15px; font-size: 22px; }
                        .content p { color: #666; line-height: 1.6; margin-bottom: 20px; font-size: 15px; }
                        .code-box { 
                            background: #f0f0ff; 
                            border: 2px dashed #667eea; 
                            border-radius: 15px; 
                            padding: 30px; 
                            margin: 30px 0;
                            display: inline-block;
                        }
                        .code { 
                            font-size: 42px; 
                            font-weight: 700; 
                            color: #667eea; 
                            letter-spacing: 10px;
                            font-family: 'Courier New', monospace;
                        }
                        .expire-info { 
                            color: #888; 
                            font-size: 13px; 
                            margin-top: 20px;
                            padding: 10px 20px;
                            background: #fff8e1;
                            border-radius: 8px;
                            display: inline-block;
                        }
                        .footer { 
                            background: #f9f9f9; 
                            padding: 20px; 
                            text-align: center; 
                            border-top: 1px solid #eee;
                        }
                        .footer p { color: #999; font-size: 12px; margin: 5px 0; }
                        .footer a { color: #667eea; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="icon">⚽</div>
                            <h1>Futbol Online</h1>
                        </div>
                        <div class="content">
                            <h2>¡Bienvenido ${username}! 🎉</h2>
                            <p>Gracias por registrarte en <strong>Futbol Online</strong>, la mejor plataforma de streaming de fútbol en vivo.</p>
                            <p>Para completar tu registro, ingresa el siguiente código de verificación:</p>
                            
                            <div class="code-box">
                                <div class="code">${code}</div>
                            </div>
                            
                            <div class="expire-info">
                                ⏰ Este código expirará en <strong>30 minutos</strong>
                            </div>
                            
                            <p style="margin-top: 25px; color: #888; font-size: 14px;">
                                Si no solicitaste este registro, puedes ignorar este mensaje.
                            </p>
                        </div>
                        <div class="footer">
                            <p>© ${new Date().getFullYear()} Futbol Online. Todos los derechos reservados.</p>
                            <p>Este es un email automático, por favor no respondas.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ Email enviado por Brevo:', info.messageId);
            console.log('📩 Para:', to);
            console.log('🔢 Código:', code);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Error al enviar email por Brevo:', error.message);
            // Mostrar código en consola como respaldo
            console.log('📧 CÓDIGO DE RESPALDO:', code);
            throw error;
        }
    }

    async sendPasswordResetEmail(to, username, resetUrl) {
        if (!this.transporter) {
            console.log('🔗 [DESARROLLO] Link de recuperación:', resetUrl);
            return { success: true, devMode: true };
        }

        const mailOptions = {
            from: `"Futbol Online" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
            to: to,
            subject: '🔑 Recuperación de contraseña - Futbol Online',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
                        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 5px 20px rgba(0,0,0,0.1); }
                        .header { background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; text-align: center; }
                        .header h1 { color: white; margin: 0; font-size: 24px; }
                        .content { padding: 30px; }
                        .content h2 { color: #1a1a2e; margin-bottom: 15px; }
                        .content p { color: #666; line-height: 1.6; margin-bottom: 20px; }
                        .btn { 
                            display: inline-block; 
                            background: linear-gradient(135deg, #667eea, #764ba2); 
                            color: white; 
                            padding: 15px 35px; 
                            border-radius: 25px; 
                            text-decoration: none; 
                            font-weight: bold; 
                            font-size: 16px;
                            margin: 20px 0;
                        }
                        .footer { background: #f9f9f9; padding: 20px; text-align: center; }
                        .footer p { color: #999; font-size: 12px; margin: 5px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>⚽ Futbol Online</h1>
                        </div>
                        <div class="content">
                            <h2>Hola ${username}</h2>
                            <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente botón para crear una nueva contraseña:</p>
                            <div style="text-align: center;">
                                <a href="${resetUrl}" class="btn">Restablecer Contraseña</a>
                            </div>
                            <p style="color: #888; font-size: 13px;">Este enlace expirará en 1 hora.</p>
                            <p style="color: #888; font-size: 13px;">Si no solicitaste este cambio, ignora este mensaje.</p>
                        </div>
                        <div class="footer">
                            <p>© ${new Date().getFullYear()} Futbol Online</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ Email de recuperación enviado por Brevo:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Error al enviar email:', error.message);
            throw error;
        }
    }
}

module.exports = new EmailService();