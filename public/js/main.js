// ============ CONFIGURACIÓN GLOBAL ============
const API_BASE = window.location.origin;
let socket = null;

// ============ INICIALIZACIÓN ============
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Inicializar tooltips
    initTooltips();
    
    // Inicializar popovers
    initPopovers();
    
    // Manejar errores globales
    window.addEventListener('error', handleGlobalError);
    
    // Manejar promesas no capturadas
    window.addEventListener('unhandledrejection', handlePromiseError);
}

// ============ AUTH FUNCTIONS ============
function showTab(tabName) {
    // Ocultar todos los formularios
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active');
    });
    
    // Mostrar formulario seleccionado
    const formMap = {
        'login': 'login-form',
        'register': 'register-form'
    };
    
    const formId = formMap[tabName];
    if (formId) {
        document.getElementById(formId).classList.add('active');
    }
    
    // Actualizar tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Ocultar formulario de recuperación
    document.getElementById('forgot-form').classList.remove('active');
}

function showForgotPassword() {
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active');
    });
    document.getElementById('forgot-form').classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
}

async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showErrorModal('Por favor, completa todos los campos');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        hideLoading();
        
        if (data.success) {
            window.location.href = data.redirect || '/dashboard';
        } else {
            if (data.needVerification) {
                window.location.href = '/verify';
            } else {
                showErrorModal(data.message || 'Error al iniciar sesión');
            }
        }
    } catch (error) {
        hideLoading();
        showErrorModal('Error de conexión. Intenta de nuevo.');
        console.error('Login error:', error);
    }
}

async function handleRegister(event) {
    event.preventDefault();
    
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    
    // Validaciones
    if (!username || !email || !password) {
        showErrorModal('Todos los campos son requeridos');
        return;
    }
    
    if (username.length < 3 || username.length > 10) {
        showErrorModal('El nombre de usuario debe tener entre 3 y 10 caracteres');
        return;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showErrorModal('El nombre de usuario solo puede contener letras, números y guiones bajos');
        return;
    }
    
    if (password.length < 8) {
        showErrorModal('La contraseña debe tener al menos 8 caracteres');
        return;
    }
    
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
        showErrorModal('La contraseña debe contener mayúsculas, minúsculas y números');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        hideLoading();
        
        if (data.success) {
            window.location.href = '/verify';
        } else {
            showErrorModal(data.message || 'Error al registrarse');
        }
    } catch (error) {
        hideLoading();
        showErrorModal('Error de conexión. Intenta de nuevo.');
        console.error('Register error:', error);
    }
}

async function handleForgotPassword(event) {
    event.preventDefault();
    
    const email = document.getElementById('forgot-email').value;
    
    if (!email) {
        showErrorModal('Por favor, ingresa tu email');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        hideLoading();
        
        if (data.success) {
            showSuccessModal(data.message);
            setTimeout(() => showTab('login'), 2000);
        } else {
            showErrorModal(data.message || 'Error al enviar recuperación');
        }
    } catch (error) {
        hideLoading();
        showErrorModal('Error de conexión. Intenta de nuevo.');
    }
}

// ============ MODAL FUNCTIONS ============
function showErrorModal(message) {
    const modal = document.getElementById('error-modal');
    const messageEl = document.getElementById('error-message');
    
    if (modal && messageEl) {
        messageEl.textContent = message;
        modal.classList.add('active');
    } else {
        alert(message);
    }
}

function showSuccessModal(message) {
    const modal = document.getElementById('success-modal');
    const messageEl = document.getElementById('success-message');
    
    if (modal && messageEl) {
        messageEl.textContent = message;
        modal.classList.add('active');
    }
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

// Cerrar modal al hacer clic fuera
window.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        closeModal();
    }
});

// Cerrar modal con tecla Escape
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeModal();
    }
});

// ============ LOADING ============
function showLoading() {
    let loader = document.getElementById('global-loader');
    
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.className = 'loading-overlay';
        loader.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(loader);
    }
    
    loader.style.display = 'flex';
}

function hideLoading() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.style.display = 'none';
    }
}

// ============ NOTIFICATIONS ============
function showNotification(title, message, type = 'info', duration = 5000) {
    // Crear contenedor si no existe
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(container);
    }
    
    const icons = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌'
    };
    
    const colors = {
        info: '#4a90e2',
        success: '#34a853',
        warning: '#fbbc04',
        error: '#ea4335'
    };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: rgba(26, 26, 46, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.1);
        border-left: 4px solid ${colors[type]};
        border-radius: 12px;
        padding: 16px 20px;
        min-width: 300px;
        max-width: 400px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        animation: slideInRight 0.3s ease;
    `;
    
    toast.innerHTML = `
        <div style="display: flex; gap: 12px; align-items: flex-start;">
            <span style="font-size: 20px;">${icons[type]}</span>
            <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 4px; color: white;">${title}</div>
                <div style="font-size: 13px; color: #aaa;">${message}</div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: none; border: none; color: #666; cursor: pointer; font-size: 18px;">
                ×
            </button>
        </div>
    `;
    
    container.appendChild(toast);
    
    if (duration > 0) {
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

// ============ ERROR HANDLING ============
function handleGlobalError(event) {
    console.error('Error global:', event.error);
    // En producción, enviar a servicio de logging
}

function handlePromiseError(event) {
    console.error('Promesa no capturada:', event.reason);
}

// ============ UTILITY FUNCTIONS ============
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function truncate(str, length = 50) {
    if (str.length <= length) return str;
    return str.substring(0, length) + '...';
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============ TOOLTIPS ============
function initTooltips() {
    document.querySelectorAll('[data-tooltip]').forEach(element => {
        element.addEventListener('mouseenter', function(e) {
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = this.dataset.tooltip;
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(0,0,0,0.9);
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                z-index: 10000;
                pointer-events: none;
                white-space: nowrap;
            `;
            document.body.appendChild(tooltip);
            
            const rect = this.getBoundingClientRect();
            tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
            tooltip.style.top = rect.top - tooltip.offsetHeight - 5 + 'px';
            
            this._tooltip = tooltip;
        });
        
        element.addEventListener('mouseleave', function() {
            if (this._tooltip) {
                this._tooltip.remove();
                this._tooltip = null;
            }
        });
    });
}

// ============ POP