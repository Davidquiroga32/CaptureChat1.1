// Base de la API en Railway
const API_BASE = "https://capturechat-backend-v2-production.up.railway.app";

class RegisterManager {
    constructor() {
        this.form = document.getElementById("registerForm");

        if (!this.form) {
            // No estamos en register.html, salir sin romper nada
            return;
        }

        this.usernameInput = document.getElementById("newUsername");
        this.passwordInput = document.getElementById("newPassword");
        this.confirmPasswordInput = document.getElementById("confirmPassword");
        this.termsCheckbox = document.getElementById("terms");
        this.registerBtn = document.getElementById("registerBtn");
        this.errorDiv = document.getElementById("registerError");
        this.successDiv = document.getElementById("registerSuccess");
        this.strengthMeter = document.getElementById("strengthMeter");
        this.strengthText = document.getElementById("strengthText");

        this.initEventListeners();
    }

    initEventListeners() {
        this.form.addEventListener("submit", (e) => this.handleSubmit(e));
        if (this.passwordInput) {
            this.passwordInput.addEventListener("input", (e) =>
                this.updatePasswordStrength(e)
            );
        }
    }

    showError(message) {
        this.errorDiv.textContent = message;
        this.errorDiv.classList.add("show");
        this.successDiv.classList.remove("show");
    }

    showSuccess(message) {
        this.successDiv.textContent = message;
        this.successDiv.classList.add("show");
        this.errorDiv.classList.remove("show");
    }

    clearMessages() {
        this.errorDiv.classList.remove("show");
        this.successDiv.classList.remove("show");
    }

    updatePasswordStrength(event) {
        const password = event.target.value;
        let strength = 0;
        let label = "Débil";

        if (password.length >= 8) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/[@$!%*?&]/.test(password)) strength++;

        const percent = (strength / 5) * 100;
        this.strengthMeter.style.width = percent + "%";

        if (strength <= 2) {
            label = "Débil";
            this.strengthMeter.style.backgroundColor = "#ef4444";
        } else if (strength === 3) {
            label = "Medio";
            this.strengthMeter.style.backgroundColor = "#f59e0b";
        } else {
            label = "Fuerte";
            this.strengthMeter.style.backgroundColor = "#10b981";
        }

        this.strengthText.textContent = `Seguridad: ${label}`;
    }

    async handleSubmit(event) {
        event.preventDefault();
        this.clearMessages();

        const username = this.usernameInput.value.trim();
        const password = this.passwordInput.value.trim();
        const confirmPassword = this.confirmPasswordInput.value.trim();

        if (!username || !password) {
            this.showError("Usuario y contraseña son obligatorios");
            return;
        }

        if (password !== confirmPassword) {
            this.showError("Las contraseñas no coinciden");
            return;
        }

        if (!this.termsCheckbox.checked) {
            this.showError("Debes aceptar los Términos y Condiciones");
            return;
        }

        this.registerBtn.disabled = true;
        this.registerBtn.textContent = "Creando...";

        try {
            const userData = { user: username, password };

            const response = await fetch(`${API_BASE}/api/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(userData),
            });

            const result = await response.json();

            if (!response.ok) {
                this.showError(result.message || "Error al registrar.");
                return;
            }

            this.showSuccess("¡Cuenta creada exitosamente! Redirigiendo al login...");
            this.form.reset();

            setTimeout(() => {
                window.location.href = "login.html";
            }, 2000);
        } catch (error) {
            console.error("Error de conexión:", error);
            this.showError("Error de conexión con el servidor.");
        } finally {
            this.registerBtn.disabled = false;
            this.registerBtn.textContent = "Crear Cuenta";
        }
    }
}

// Solo inicializar cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", () => {
    new RegisterManager();
});
