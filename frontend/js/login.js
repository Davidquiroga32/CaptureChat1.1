const API_BASE = "https://capturechat-backend-v2-production.up.railway.app";

// ── Cargar branding guardado (logo y nombre personalizados desde Configuración) ──
(function loadBranding() {
    const savedName = localStorage.getItem("cc_app_name");
    const savedLogo = localStorage.getItem("cc_app_logo");

    const appName    = document.getElementById("appName");
    const footerName = document.getElementById("footerAppName");
    const logoImg    = document.getElementById("logoImg");
    const logoEmoji  = document.getElementById("logoEmoji");

    if (savedName && appName) {
        appName.textContent    = savedName;
        if (footerName) footerName.textContent = `${savedName} v2.0 - Seguro y Profesional`;
        document.title = `Login - ${savedName}`;
    }

    if (savedLogo && logoImg) {
        logoImg.src             = savedLogo;
        logoImg.style.display   = "block";
        if (logoEmoji) logoEmoji.style.display = "none";
    }
})();

// ── Login ──────────────────────────────────────────────────────────
const loginForm = document.getElementById("loginForm");
const loginBtn  = document.getElementById("loginBtn");

loginForm.addEventListener("submit", async function(e) {
    e.preventDefault();

    const user       = document.getElementById("username").value.trim();
    const password   = document.getElementById("password").value;
    const loginError = document.getElementById("loginError");

    loginError.innerHTML     = "";
    loginError.style.display = "none";

    if (!user || !password) {
        showError("Usuario y contraseña son obligatorios.");
        return;
    }

    loginBtn.disabled    = true;
    loginBtn.textContent = "Iniciando sesión...";

    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ user, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            showError(data.message || "Error de inicio de sesión.");
            return;
        }

        // Guardar sesión
        localStorage.setItem("sessionToken", data.token);
        localStorage.setItem("username",     data.user?.user || user);
        localStorage.setItem("role",         data.user?.role || "WORKER");

        window.location.href = "dashboard.html";

    } catch (error) {
        console.error("Login Error:", error);
        showError("Error al conectar con el servidor.");
    } finally {
        loginBtn.disabled    = false;
        loginBtn.textContent = "Iniciar Sesión";
    }
});

function showError(msg) {
    const el          = document.getElementById("loginError");
    el.innerHTML      = `<p class="error">${msg}</p>`;
    el.style.display  = "block";
}