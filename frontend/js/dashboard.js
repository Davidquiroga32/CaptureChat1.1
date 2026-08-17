/**
 * Dashboard CaptureChat v1.3
 * ─────────────────────────────────────────────────────────────────
 * v1.3 cambios:
 *   1. Filtro por etiqueta: click en tag filtra galería, click de nuevo quita filtro
 *   2. Mensaje claro cuando la palabra ya existe (sin alert genérico de error)
 *   3. Límite de 300 capturas: bloquea nuevas si se supera (solo en frontend upload)
 *   4. Navegación ← → entre imágenes en el modal + swipe táctil para móvil
 */

const API_BASE = "";


// ===== Estado global =====
let allScreenshotsData = [];   // cache de todas las capturas
let activeKeywordFilter = null; // etiqueta seleccionada actualmente
let modalCurrentIndex   = 0;   // índice de la imagen abierta en el modal

// ===== Helpers de sesión/rol =====
function getToken()    { return localStorage.getItem("sessionToken"); }
function getUserRole() { return localStorage.getItem("role") || "WORKER"; }
function isAdmin()     { return getUserRole() === "ADMIN"; }

function applyRoleRestrictions() {
    if (isAdmin()) {
        const settingsTab = document.getElementById("settingsTab");
        const usersTab = document.getElementById("usersTab");
        if (settingsTab) settingsTab.style.display = "";
        if (usersTab) usersTab.style.display = "";
        return;
    }
    const clearAllBtn = document.getElementById("clearAllScreenshots");
    if (clearAllBtn) clearAllBtn.style.display = "none";
}

// ===== Branding =====
function loadBranding() {
    const savedName = localStorage.getItem("cc_app_name");
    const savedLogo = localStorage.getItem("cc_app_logo");
    if (savedName) {
        const headerName = document.getElementById("headerAppName");
        if (headerName) headerName.textContent = savedName;
        document.title = `Panel - ${savedName}`;
    }
    if (savedLogo) {
        const headerLogo = document.getElementById("headerLogo");
        if (headerLogo) headerLogo.innerHTML = `<img src="${savedLogo}" alt="Logo" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
    }
}

// ===== Helpers =====
async function authFetch(url, options = {}) {
    const token = getToken();
    const headers = { ...(options.headers || {}), "Authorization": "Bearer " + token };
    try {
        const res = await fetch(url, { ...options, headers });
        if (res.status === 401) { logout(); return null; }
        return res;
    } catch (err) {
        console.error("Error de red:", err);
        return null;
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
});

function initializeDashboard() {
    if (!isUserLoggedIn()) { window.location.href = 'index.html'; return; }

    fetch(`${API_BASE}/api/auth/protected`, {
        headers: { "Authorization": "Bearer " + localStorage.getItem("sessionToken") }
    })
    .then(res => { if (res.status === 401) logout(); })
    .catch(() => {});

    loadBranding();
    loadUserInfo();
    applyRoleRestrictions();
    initializeTabs();
    initializeButtons();
    initializeSettings();
    initializeUsers();
    initializeModal();
    setupUploadArea();
    loadDashboardData();
    loadGallery();
    loadKeywordTags();
    startGalleryAutoRefresh();
}

function isUserLoggedIn() { return !!getToken(); }

function loadUserInfo() {
    const username = localStorage.getItem('username') || 'admin';
    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.textContent = `${username} (${getUserRole()})`;
}

// ===== Tabs =====
function initializeTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            this.classList.add('active');
            const activeTab = document.getElementById(tabName);
            if (activeTab) activeTab.classList.add('active');
        });
    });
}

// ===== Botones =====
function initializeButtons() {
    const ids = {
        logoutBtn:     () => { if (confirm('¿Cerrar sesión?')) logout(); },
        exportScreenshots: exportScreenshots,
        clearAllScreenshots: handleClearGallery,
        refreshKeywordTags: loadKeywordTags,
        addWordBtn:    addWord,
        importWords:   importWords,
        addPageBtn:    addPage,
        importPages:   importPages,
        restoreBtn:    handleRestore,  // botón de recuperación
    };
    Object.entries(ids).forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    });
    const searchInput = document.getElementById('screenshotSearch');
    if (searchInput) searchInput.addEventListener('input', searchScreenshots);
}

// ===== Modal con navegación ← → y swipe =====
function initializeModal() {
    const modal      = document.getElementById('modal');
    const modalClose = document.getElementById('modalClose');
    const modalPrev  = document.getElementById('modalPrev');
    const modalNext  = document.getElementById('modalNext');

    if (!modal) return;

    // Cerrar al click en fondo
    modal.addEventListener('click', e => { if (e.target.id === 'modal') closeScreenshotModal(); });
    if (modalClose) modalClose.addEventListener('click', closeScreenshotModal);

    // Botones ← →
    if (modalPrev) modalPrev.addEventListener('click', e => { e.stopPropagation(); navigateModal(-1); });
    if (modalNext) modalNext.addEventListener('click', e => { e.stopPropagation(); navigateModal(1); });

    // Teclado ← → Esc
    document.addEventListener('keydown', e => {
        if (!modal.classList.contains('show')) return;
        if (e.key === 'ArrowLeft')  navigateModal(-1);
        if (e.key === 'ArrowRight') navigateModal(1);
        if (e.key === 'Escape')     closeScreenshotModal();
    });

    // Swipe táctil para móvil
    let touchStartX = 0;
    const img = document.getElementById('modalImage');
    if (img) {
        img.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
        img.addEventListener('touchend',   e => {
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) navigateModal(diff > 0 ? 1 : -1);
        }, { passive: true });
    }
}

function getFilteredScreenshots() {
    if (!activeKeywordFilter) return allScreenshotsData;
    return allScreenshotsData.filter(img => (img.keyword || "") === activeKeywordFilter);
}

function openScreenshotModal(src, filename, createdAt, device, keyword, index) {
    const modal  = document.getElementById('modal');
    const img    = document.getElementById('modalImage');
    const title  = document.getElementById('modalTitle');
    const info   = document.getElementById('modalInfo');
    const dev    = document.getElementById('modalDevice');
    const kw     = document.getElementById('modalKeyword');
    const counter= document.getElementById('modalCounter');

    if (!modal || !img || !title || !info) return;

    const list = getFilteredScreenshots();
    modalCurrentIndex = (index !== undefined) ? index : list.findIndex(s => s.filepath === src);
    if (modalCurrentIndex < 0) modalCurrentIndex = 0;

    const current = list[modalCurrentIndex];
    if (!current) return;

    img.src           = current.filepath;
    title.textContent = current.filename  || 'Captura de pantalla';
    info.textContent  = current.createdAt ? new Date(current.createdAt).toLocaleString('es-CO') : '';
    if (dev) dev.textContent = current.deviceName ? `💻 ${current.deviceName}` : '';
    if (kw)  kw.textContent  = current.keyword    ? `🏷️ ${current.keyword}`   : '';
    if (counter) counter.textContent = `${modalCurrentIndex + 1} / ${list.length}`;

    // Mostrar/ocultar flechas según posición
    const prevBtn = document.getElementById('modalPrev');
    const nextBtn = document.getElementById('modalNext');
    if (prevBtn) prevBtn.style.opacity = modalCurrentIndex > 0               ? '1' : '0.3';
    if (nextBtn) nextBtn.style.opacity = modalCurrentIndex < list.length - 1 ? '1' : '0.3';

    modal.classList.add('show');
}

function navigateModal(direction) {
    const list = getFilteredScreenshots();
    const newIndex = modalCurrentIndex + direction;
    if (newIndex < 0 || newIndex >= list.length) return;
    openScreenshotModal(null, null, null, null, null, newIndex);
}

function closeScreenshotModal() {
    const modal = document.getElementById('modal');
    if (!modal) return;
    modal.classList.remove('show');
    const img = document.getElementById('modalImage');
    if (img) img.src = ""; // liberar memoria
}

// ===== Upload zone =====
function setupUploadArea() {
    const uploadZone = document.getElementById("uploadZone");
    const fileInput  = document.getElementById("screenshotFile");
    if (!uploadZone || !fileInput) return;

    uploadZone.addEventListener("click",     () => fileInput.click());
    uploadZone.addEventListener("dragover",  e => { e.preventDefault(); uploadZone.classList.add("dragover"); });
    uploadZone.addEventListener("dragleave", e => { e.preventDefault(); uploadZone.classList.remove("dragover"); });
    uploadZone.addEventListener("drop", e => {
        e.preventDefault();
        uploadZone.classList.remove("dragover");
        const file = e.dataTransfer.files[0];
        if (file) uploadScreenshot(file);
    });
    fileInput.addEventListener("change", e => {
        const file = e.target.files[0];
        if (file) uploadScreenshot(file);
    });
}

// ===== Carga inicial =====
function loadDashboardData() {
    updateStats();
    loadScreenshots();
    loadDictionary();
    loadPages();
}

async function updateStats() {
    try {
        const [keywordRes, screenshotRes] = await Promise.all([
            authFetch(`${API_BASE}/api/keywords`),
            authFetch(`${API_BASE}/api/screenshots`)
        ]);
        if (!keywordRes || !screenshotRes) return;
        const keywords    = await keywordRes.json();
        const screenshots = await screenshotRes.json();
        const kwEl = document.getElementById('wordCount');
        const ssEl = document.getElementById('screenshotCount');
        const pgEl = document.getElementById('pageCount');
        if (kwEl) kwEl.textContent = Array.isArray(keywords)    ? keywords.length    : 0;
        if (ssEl) ssEl.textContent = Array.isArray(screenshots) ? screenshots.length : 0;
        if (pgEl) pgEl.textContent = getPages().length;
    } catch (err) { console.error("Error stats:", err); }
}

// ===== localStorage helpers =====
function getScreenshots() { return JSON.parse(localStorage.getItem('screenshots') || '[]'); }
function getWords()       { return JSON.parse(localStorage.getItem('dictionary')  || '[]'); }
function getPages()       { return JSON.parse(localStorage.getItem('pages')       || '[]'); }

function loadScreenshots() {
    const screenshots = getScreenshots();
    const list = document.getElementById('screenshotsList');
    if (!list) return;
    if (screenshots.length === 0) {
        list.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-secondary);">No hay capturas guardadas</p>';
        return;
    }
    list.innerHTML = screenshots.map(s => `
        <div class="screenshot-item">
            <img src="${s.data}" alt="Captura">
            <div class="screenshot-info">
                <p class="screenshot-title">${s.name || 'Captura'}</p>
                <p class="screenshot-date">${new Date(s.date).toLocaleString()}</p>
            </div>
        </div>
    `).join('');
}

// ===== Diccionario =====
function loadDictionary() {
    authFetch(`${API_BASE}/api/keywords`)
    .then(res => res ? res.json() : null)
    .then(keywords => {
        if (!keywords) return;
        const list = document.getElementById('wordList');
        const kwEl = document.getElementById('wordCount');
        if (kwEl) kwEl.textContent = keywords.length;
        if (!list) return;
        if (keywords.length === 0) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">No hay palabras guardadas</p>';
            return;
        }
        list.innerHTML = keywords.map(w => `
            <div class="word-item">
                <span>${escapeHtml(w.keyword)}</span>
                ${isAdmin() ? `<button onclick="removeWord(${w.id})">Eliminar</button>` : ""}
            </div>
        `).join('');
    })
    .catch(err => console.error(err));
}

// ===== Agregar palabra con mensaje claro si ya existe =====
function addWord() {
    const input   = document.getElementById('newWord');
    const msgEl   = document.getElementById('wordMessage'); // mensaje de feedback
    const keyword = input.value.trim();

    if (msgEl) { msgEl.textContent = ""; msgEl.className = "word-message"; }
    if (!keyword) return alert("Ingresa una palabra");

    authFetch(`${API_BASE}/api/keywords`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ keyword })
    })
    .then(async res => {
        if (!res) return;

        if (res.status === 400) {
            // La palabra ya existe — mostrar mensaje amigable
            if (msgEl) {
                msgEl.textContent = `⚠️ La palabra "${keyword}" ya está guardada en el diccionario.`;
                msgEl.className   = "word-message word-message-warn";
                setTimeout(() => { msgEl.textContent = ""; msgEl.className = "word-message"; }, 4000);
            }
            return;
        }

        if (!res.ok) {
            if (msgEl) {
                msgEl.textContent = "❌ Error al guardar la palabra. Intenta de nuevo.";
                msgEl.className   = "word-message word-message-error";
                setTimeout(() => { msgEl.textContent = ""; msgEl.className = "word-message"; }, 4000);
            }
            return;
        }

        // Éxito
        input.value = "";
        if (msgEl) {
            msgEl.textContent = `✅ Palabra "${keyword}" agregada correctamente.`;
            msgEl.className   = "word-message word-message-ok";
            setTimeout(() => { msgEl.textContent = ""; msgEl.className = "word-message"; }, 3000);
        }
        loadDictionary();
        updateStats();
    })
    .catch(err => console.error(err));
}

function removeWord(id) {
    if (!confirm("¿Eliminar palabra?")) return;
    authFetch(`${API_BASE}/api/keywords/${id}`, { method: "DELETE" })
    .then(() => { loadDictionary(); updateStats(); });
}

// ===== Páginas =====
function loadPages() {
    const pages = getPages();
    const list  = document.getElementById('pageList');
    if (!list) return;
    if (pages.length === 0) {
        list.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-secondary);">No hay páginas guardadas</p>';
        return;
    }
    list.innerHTML = pages.map((page, i) => `
        <div class="page-item">
            <span>${escapeHtml(page)}</span>
            <button onclick="removePage(${i})">Eliminar</button>
        </div>
    `).join('');
}

function addPage() {
    const input = document.getElementById('newPage');
    const page  = input?.value.trim();
    if (!page) return alert('Ingresa una URL');
    try { new URL(page); } catch { return alert('URL inválida'); }
    const pages = getPages();
    if (pages.includes(page)) return alert('Ya existe esta página');
    pages.push(page);
    localStorage.setItem('pages', JSON.stringify(pages));
    input.value = '';
    loadPages();
    updateStats();
}

function removePage(i) {
    if (!confirm('¿Eliminar página?')) return;
    const pages = getPages();
    pages.splice(i, 1);
    localStorage.setItem('pages', JSON.stringify(pages));
    loadPages();
    updateStats();
}

function searchScreenshots(e) {
    const query = (e.target ? e.target.value : e).toLowerCase();
    document.querySelectorAll(".screenshot-item").forEach(item => {
        const text = ((item.dataset.filename||"")+" "+(item.dataset.device||"")+" "+(item.dataset.keyword||"")).toLowerCase();
        item.style.display = text.includes(query) ? "" : "none";
    });
}

async function exportScreenshots() {
    try {
        const res  = await authFetch(`${API_BASE}/api/screenshots`);
        if (!res) return;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return alert('No hay capturas');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `capturas_${Date.now()}.json`;
        a.click();
    } catch (err) { console.error("Error exportando:", err); }
}

// ===== Etiquetas por keyword con filtro =====
async function loadKeywordTags() {
    const container = document.getElementById("keywordTags");
    if (!container) return;
    container.innerHTML = `<p class="keyword-tags-loading">Cargando etiquetas...</p>`;
    try {
        const res = await authFetch(`${API_BASE}/api/screenshots/by-keyword`);
        if (!res) return;
        const grupos = await res.json();

        if (!Array.isArray(grupos) || grupos.length === 0) {
            container.innerHTML = `<p class="keyword-tags-empty">Sin capturas aún</p>`;
            return;
        }

        container.innerHTML = grupos.map(g => `
            <div class="keyword-tag ${activeKeywordFilter === g.keyword ? 'keyword-tag-active' : ''}"
                data-keyword="${escapeHtml(g.keyword)}">
                <span class="keyword-tag-label" onclick="toggleKeywordFilter('${escapeHtml(g.keyword)}')">
                    🏷️ <strong>${escapeHtml(g.keyword)}</strong>
                    <span class="keyword-tag-count">${g.count}</span>
                </span>
                ${isAdmin() ? `
                <button class="keyword-tag-delete"
                    title="Borrar capturas de '${escapeHtml(g.keyword)}'"
                    onclick="deleteByKeyword('${escapeHtml(g.keyword)}')">
                    🗑️
                </button>` : ""}
            </div>
        `).join("");

    } catch (err) {
        container.innerHTML = `<p class="keyword-tags-empty" style="color:var(--danger-color)">Error al cargar etiquetas</p>`;
    }
}

// ── Toggle filtro por keyword ──────────────────────────────────────
function toggleKeywordFilter(keyword) {
    if (activeKeywordFilter === keyword) {
        // Quitar filtro
        activeKeywordFilter = null;
    } else {
        activeKeywordFilter = keyword;
    }

    // Actualizar estilos de las etiquetas
    document.querySelectorAll(".keyword-tag").forEach(tag => {
        if (tag.dataset.keyword === activeKeywordFilter) {
            tag.classList.add("keyword-tag-active");
        } else {
            tag.classList.remove("keyword-tag-active");
        }
    });

    // Mostrar banner de filtro activo
    updateFilterBanner();

    // Re-renderizar galería con el filtro
    renderGallery(allScreenshotsData);
}

function updateFilterBanner() {
    let banner = document.getElementById("filterActiveBanner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "filterActiveBanner";
        banner.className = "filter-active-banner";
        const gallery = document.getElementById("screenshotsList");
        if (gallery) gallery.parentNode.insertBefore(banner, gallery);
    }
    if (activeKeywordFilter) {
        banner.innerHTML = `
            <span>🔍 Mostrando capturas de <strong>"${escapeHtml(activeKeywordFilter)}"</strong></span>
            <button onclick="toggleKeywordFilter('${escapeHtml(activeKeywordFilter)}')" class="btn btn-small" style="padding:0.2rem 0.6rem;font-size:0.75rem;">
                ✕ Quitar filtro
            </button>
        `;
        banner.style.display = "flex";
    } else {
        banner.style.display = "none";
    }
}

async function deleteByKeyword(keyword) {
    if (!confirm(`¿Borrar TODAS las capturas de "${keyword}"?\nEsta acción no se puede deshacer.`)) return;
    try {
        const res = await authFetch(`${API_BASE}/api/screenshots/by-keyword/${encodeURIComponent(keyword)}`, { method: "DELETE" });
        if (!res || !res.ok) { alert("Error al borrar capturas."); return; }
        const data = await res.json();
        alert(`✅ ${data.deleted || 0} capturas de "${keyword}" eliminadas.`);
        if (activeKeywordFilter === keyword) activeKeywordFilter = null;
        loadGallery();
        loadKeywordTags();
        updateStats();
    } catch (err) { alert("No se pudo conectar con el servidor."); }
}

// ===== Galería =====
function loadGallery() {
    authFetch(`${API_BASE}/api/screenshots`)
    .then(res => res ? res.json() : null)
    .then(data => {
        if (!Array.isArray(data)) return;
        data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        allScreenshotsData = data; // guardar en cache global
        renderGallery(data);
        updateScreenshotCount(data.length);
    })
    .catch(err => console.error("Error cargando galería:", err));
}

// Genera URL de Cloudinary con calidad óptima para la grilla (800px ancho, auto calidad)
// Esto evita las imágenes borrosas sin cargar el archivo completo
function getCloudinaryPreview(url) {
    if (!url || !url.includes("res.cloudinary.com")) return url;
    // Insertar transformación antes del nombre del archivo
    // URL original: https://res.cloudinary.com/cloud/image/upload/v123/capturechat/screenshots/archivo.png
    // URL resultado: https://res.cloudinary.com/cloud/image/upload/w_800,q_auto,f_auto/v123/capturechat/screenshots/archivo.png
    return url.replace("/image/upload/", "/image/upload/w_800,q_auto,f_auto/");
}

function renderGallery(data) {
    const gallery = document.getElementById("screenshotsList");
    if (!gallery) return;

    // Aplicar filtro si hay uno activo
    const filtered = activeKeywordFilter
        ? data.filter(img => (img.keyword || "") === activeKeywordFilter)
        : data;

    if (filtered.length === 0) {
        const msg = activeKeywordFilter
            ? `No hay capturas con la palabra clave <strong>"${escapeHtml(activeKeywordFilter)}"</strong>`
            : 'No hay capturas en el servidor';
        gallery.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#9ca3af;padding:2rem;">${msg}</p>`;
        return;
    }

    const admin = isAdmin();
    gallery.innerHTML = filtered.map((img, idx) => {
        // Para la portada usamos la imagen completa de Cloudinary pero con
        // transformación de ancho 800px — suficiente calidad para la grilla
        // y sin cargar el archivo completo (que puede ser 2-4MB).
        // Si la URL es de Cloudinary, insertamos /w_800,q_auto,f_auto/ en la ruta.
        // Si no es Cloudinary (URLs antiguas del backend), usamos tal cual.
        const fullSrc  = img.filepath;
        const src      = getCloudinaryPreview(fullSrc);
        const filename = img.filename  || "Captura";
        const created  = img.createdAt || "";
        const device   = img.deviceName || "Dispositivo sin nombre";
        const keyword  = img.keyword   || "";
        return `
            <div class="screenshot-item"
                data-id="${img.id}"
                data-idx="${idx}"
                data-src="${escapeHtml(fullSrc)}"
                data-filename="${escapeHtml(filename)}"
                data-created="${escapeHtml(created)}"
                data-device="${escapeHtml(device)}"
                data-keyword="${escapeHtml(keyword)}">
                <img src="${escapeHtml(src)}" alt="${escapeHtml(filename)}" loading="lazy">
                <div class="screenshot-info">
                    <p class="screenshot-device">💻 ${escapeHtml(device)}</p>
                    ${keyword ? `<p class="screenshot-keyword">🏷️ ${escapeHtml(keyword)}</p>` : ""}
                    <p class="screenshot-title">${escapeHtml(filename)}</p>
                    <p class="screenshot-date">${created ? new Date(created).toLocaleString('es-CO') : ""}</p>
                    ${admin ? `<button class="btn btn-danger btn-small delete-screenshot">Eliminar</button>` : ""}
                </div>
            </div>
        `;
    }).join("");

    // Eventos de click
    gallery.querySelectorAll(".screenshot-item").forEach(item => {
        item.addEventListener("click", e => {
            if (e.target.classList.contains("delete-screenshot")) return;
            openScreenshotModal(null, null, null, null, null, parseInt(item.dataset.idx));
        });
    });
    gallery.querySelectorAll(".delete-screenshot").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            handleDeleteScreenshot(btn.closest(".screenshot-item").dataset.id);
        });
    });
}



function updateScreenshotCount(count) {
    const el = document.getElementById("screenshotCount");
    if (el) el.textContent = count;
}

// ===== Auto-refresh =====
let galleryInterval = null;
function startGalleryAutoRefresh() {
    if (galleryInterval) return;
    galleryInterval = setInterval(() => {
        const tab = document.getElementById("screenshots");
        if (tab && tab.classList.contains("active")) {
            loadGallery();
            loadKeywordTags();
        }
    }, 8000);
}
function stopGalleryAutoRefresh() {
    if (!galleryInterval) return;
    clearInterval(galleryInterval);
    galleryInterval = null;
}

// ===== Acciones capturas =====
async function handleDeleteScreenshot(id) {
    if (!confirm("¿Eliminar esta captura?")) return;
    const res = await authFetch(`${API_BASE}/api/screenshots/${id}`, { method: "DELETE" });
    if (!res || !res.ok) { alert("Error al eliminar."); return; }
    loadGallery(); loadKeywordTags(); updateStats();
}

async function handleClearGallery() {
    if (!confirm("¿Seguro que quieres eliminar TODAS las capturas?\nQuedarán en papelera y podrás recuperarlas por 24 horas.")) return;
    const res = await authFetch(`${API_BASE}/api/screenshots`, { method: "DELETE" });
    if (!res || !res.ok) { alert("Error al limpiar."); return; }
    activeKeywordFilter = null;
    loadGallery(); loadKeywordTags(); updateStats();
    alert("Galería vaciada. Puedes recuperarlas con el botón '↩ Recuperar' en las próximas 24 horas.");
}

async function handleRestore() {
    const trash = await authFetch(`${API_BASE}/api/screenshots/trash`);
    if (!trash) return;
    const data  = await trash.json();
    const count = Array.isArray(data) ? data.length : 0;

    if (count === 0) {
        alert("No hay capturas en la papelera para recuperar.");
        return;
    }

    if (!confirm(`¿Recuperar las últimas ${count} capturas eliminadas?\nEstarán disponibles nuevamente en la galería.`)) return;

    const res = await authFetch(`${API_BASE}/api/screenshots/restore`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ limit: 100 }),
    });

    if (!res || !res.ok) { alert("Error al recuperar capturas."); return; }
    const result = await res.json();
    alert(`✅ ${result.restored} capturas recuperadas correctamente.`);
    loadGallery(); loadKeywordTags(); updateStats();
}

async function uploadScreenshot(file) {
    
    const formData = new FormData();
    formData.append("screenshot", file);
    try {
        const res = await fetch(`${API_BASE}/api/screenshots`, {
            method: "POST", body: formData,
            headers: { "Authorization": "Bearer " + getToken() },
        });
        if (!res.ok) { alert("Error al subir la captura"); return; }
        loadGallery(); loadKeywordTags(); updateStats();
    } catch (err) { alert("No se pudo subir la captura"); }
}

function importWords()  { alert('Función no implementada aún'); }
function importPages()  { alert('Función no implementada aún'); }

// ===== Configuración admin =====
function initializeSettings() {
    if (!isAdmin()) return;

    const savedName = localStorage.getItem("cc_app_name") || "Webcam Monitor Pro";
    const savedLogo = localStorage.getItem("cc_app_logo");

    const appNameInput = document.getElementById("appNameInput");
    if (appNameInput) appNameInput.value = savedName;

    updatePreview(savedName, savedLogo);
    if (savedLogo) showLogoInSettings(savedLogo);

    const changeLogoBtn = document.getElementById("changeLogoBtnSettings");
    const logoFileInput = document.getElementById("logoFileInputSettings");
    const removeLogoBtn = document.getElementById("removeLogoBtnSettings");

    if (changeLogoBtn) changeLogoBtn.addEventListener("click", () => logoFileInput.click());

    if (logoFileInput) {
        logoFileInput.addEventListener("change", e => {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith("image/")) return alert("Solo imágenes.");
            if (file.size > 2 * 1024 * 1024)    return alert("Máximo 2MB.");
            const reader = new FileReader();
            reader.onload = ev => {
                const b64 = ev.target.result;
                localStorage.setItem("cc_app_logo", b64);
                showLogoInSettings(b64);
                updatePreview(document.getElementById("appNameInput")?.value || savedName, b64);
                applyBrandingLive(null, b64);
            };
            reader.readAsDataURL(file);
        });
    }

    if (removeLogoBtn) {
        removeLogoBtn.addEventListener("click", () => {
            localStorage.removeItem("cc_app_logo");
            const emoji = document.getElementById("logoPreviewEmoji");
            const img   = document.getElementById("logoPreviewImg");
            if (emoji) emoji.style.display = "";
            if (img)   { img.style.display = "none"; img.src = ""; }
            removeLogoBtn.style.display = "none";
            const headerLogo = document.getElementById("headerLogo");
            if (headerLogo) headerLogo.innerHTML = "📸";
            updatePreview(document.getElementById("appNameInput")?.value || savedName, null);
        });
    }

    const saveAppNameBtn = document.getElementById("saveAppNameBtn");
    if (saveAppNameBtn) {
        saveAppNameBtn.addEventListener("click", () => {
            const nombre = document.getElementById("appNameInput")?.value.trim();
            if (!nombre) return alert("Escribe un nombre.");
            localStorage.setItem("cc_app_name", nombre);
            applyBrandingLive(nombre, null);
            updatePreview(nombre, localStorage.getItem("cc_app_logo"));
            saveAppNameBtn.textContent = "✅ Guardado";
            setTimeout(() => { saveAppNameBtn.textContent = "Guardar"; }, 2000);
        });
    }

    const appNameInput2 = document.getElementById("appNameInput");
    if (appNameInput2) {
        appNameInput2.addEventListener("input", e => {
            updatePreview(e.target.value || "Webcam Monitor Pro", localStorage.getItem("cc_app_logo"));
        });
    }
}

function showLogoInSettings(base64) {
    const emoji     = document.getElementById("logoPreviewEmoji");
    const img       = document.getElementById("logoPreviewImg");
    const removeBtn = document.getElementById("removeLogoBtnSettings");
    if (emoji)     emoji.style.display     = "none";
    if (img)       { img.src = base64; img.style.display = "block"; }
    if (removeBtn) removeBtn.style.display = "";
}

function updatePreview(name, logo) {
    const previewName = document.getElementById("previewAppName");
    const previewEmoji= document.getElementById("previewLogoEmoji");
    const previewImg  = document.getElementById("previewLogoImg");
    if (previewName)  previewName.textContent = name || "Webcam Monitor Pro";
    if (logo) {
        if (previewEmoji) previewEmoji.style.display = "none";
        if (previewImg)   { previewImg.src = logo; previewImg.style.display = "block"; }
    } else {
        if (previewEmoji) previewEmoji.style.display = "";
        if (previewImg)   { previewImg.style.display = "none"; previewImg.src = ""; }
    }
}

function applyBrandingLive(nombre, logo) {
    if (nombre) {
        const h = document.getElementById("headerAppName");
        if (h) h.textContent = nombre;
        document.title = `Panel - ${nombre}`;
    }
    if (logo) {
        const l = document.getElementById("headerLogo");
        if (l) l.innerHTML = `<img src="${logo}" alt="Logo" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
    }
}

// ===== Gestión de Usuarios (solo ADMIN) =====
function initializeUsers() {
    if (!isAdmin()) return;
    const addUserBtn = document.getElementById("addUserBtn");
    if (addUserBtn) addUserBtn.addEventListener("click", createUser);
    loadUsers();
}

async function loadUsers() {
    const list = document.getElementById("usersList");
    if (!list) return;
    try {
        const res = await authFetch(`${API_BASE}/api/auth/users`);
        if (!res) return;
        const users = await res.json();
        if (!Array.isArray(users)) return;
        renderUsers(users);
    } catch (err) {
        console.error("Error cargando usuarios:", err);
        list.innerHTML = '<p style="color:#fca5a5;text-align:center;padding:1rem;">Error al cargar usuarios.</p>';
    }
}

function renderUsers(users) {
    const list = document.getElementById("usersList");
    if (!list) return;
    if (users.length === 0) {
        list.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:1rem;">No hay usuarios registrados.</p>';
        return;
    }
    list.innerHTML = users.map(u => `
        <div class="user-item">
            <div class="user-item-info">
                <span class="user-item-name">${escapeHtml(u.user)}</span>
                <span class="role-badge role-badge-${u.role === 'ADMIN' ? 'admin' : 'worker'}">${escapeHtml(u.role)}</span>
            </div>
            <button class="btn btn-danger btn-small" onclick="deleteUser(${u.id})">Eliminar</button>
        </div>
    `).join("");
}

async function createUser() {
    const userInput = document.getElementById("newUserUser");
    const passInput = document.getElementById("newUserPassword");
    const roleInput = document.getElementById("newUserRole");
    const msgEl = document.getElementById("userMessage");
    const user = userInput ? userInput.value.trim() : "";
    const password = passInput ? passInput.value : "";
    const role = roleInput ? roleInput.value : "WORKER";

    if (msgEl) { msgEl.textContent = ""; msgEl.className = "word-message"; }
    if (!user) return alert("Ingresa un usuario");
    if (!password || password.length < 8) return alert("La contraseña debe tener al menos 8 caracteres");

    const res = await authFetch(`${API_BASE}/api/auth/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password, role }),
    });
    if (!res) return;

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        if (msgEl) {
            msgEl.textContent = "❌ " + (data.message || "Error al crear el usuario.");
            msgEl.className = "word-message word-message-error";
        }
        return;
    }

    if (msgEl) {
        msgEl.textContent = `✅ Usuario "${user}" creado como ${role}.`;
        msgEl.className = "word-message word-message-ok";
        setTimeout(() => { msgEl.textContent = ""; msgEl.className = "word-message"; }, 3000);
    }
    if (userInput) userInput.value = "";
    if (passInput) passInput.value = "";
    loadUsers();
}

async function deleteUser(id) {
    if (!confirm("¿Eliminar este usuario? Esta acción no se puede deshacer.")) return;
    const res = await authFetch(`${API_BASE}/api/auth/users/${id}`, { method: "DELETE" });
    if (!res || !res.ok) {
        const data = res ? await res.json().catch(() => ({})) : {};
        alert(data.message || "Error al eliminar el usuario.");
        return;
    }
    loadUsers();
}

// ===== Logout =====
function logout() {
    localStorage.removeItem("sessionToken");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    window.location.href = 'index.html';
}