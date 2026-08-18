// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

// Rutas
import authRoutes       from "./routes/auth.routes.js";
import keywordRoutes    from "./routes/keyword.routes.js";
import screenshotRoutes from "./routes/screenshot.routes.js";

const app  = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
app.set("trust proxy", 1);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

// ── Seguridad: cabeceras HTTP ──────────────────────────────────────
// Nota: se desactiva el CSP de helmet porque el frontend ya define su
// propia política vía <meta http-equiv="Content-Security-Policy">.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }, // permitir imágenes desde otro origen
}));

// ── CORS manual (necesario para Railway + Vercel) ─────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);

app.use((req, res, next) => {
    const origin = req.headers.origin;
    // Permitir el origen si está en la lista blanca, o cualquiera si la lista está vacía
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

// ── Rate limiting ──────────────────────────────────────────────────
// Login: máx 10 intentos por 15 minutos por IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Demasiados intentos de inicio de sesión, espera 15 minutos." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Subida de capturas: máx 60 por minuto por IP (para la app de escritorio)
const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: "Demasiadas capturas enviadas, espera un momento." },
    standardHeaders: true,
    legacyHeaders: false,
});

// ── Body parser ────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));  // reducido: las imágenes van a Cloudinary directo

// ── Estáticos del frontend (servidos desde el mismo backend) ────────
app.use(express.static(publicDir, {
    setHeaders(res, filePath) {
        // El service worker no debe cachearse en el navegador
        if (filePath.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache");
    },
}));

// ── Rutas ──────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({
    ok: true,
    message: "Backend CaptureChat funcionando",
    port: PORT,
    uptime: process.uptime(),
}));

app.use("/api/auth",        loginLimiter,  authRoutes);
app.use("/api/keywords",                   keywordRoutes);
app.use("/api/screenshots", uploadLimiter, screenshotRoutes);

// ── 404 ────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada", path: req.originalUrl }));

// ── Error global ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error("❌ Error en el servidor:", err);
    res.status(500).json({ error: "Error interno del servidor" }); // sin exponer detalles
});

// ── Logs de proceso ────────────────────────────────────────────────
process.on("uncaughtException",  err    => console.error("⚠️ uncaughtException:",  err));
process.on("unhandledRejection", reason => console.error("⚠️ unhandledRejection:", reason));

// ── Start ──────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🟢 Backend CaptureChat corriendo en http://0.0.0.0:${PORT}`);
});