import { Router } from "express";
import multer from "multer";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import imghash from "imghash";
import leven from "leven";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import verifyToken from "../middlewares/verifyToken.js";

const router = Router();
const prisma = new PrismaClient();

// ── Backblaze B2 (compatible con S3) ──────────────────────────────
const b2Client = new S3Client({
    endpoint:   process.env.B2_ENDPOINT,   // https://s3.us-east-005.backblazeb2.com
    region:     "us-east-005",
    credentials: {
        accessKeyId:     process.env.B2_KEY_ID,
        secretAccessKey: process.env.B2_APP_KEY,
    },
    forcePathStyle: true, // Requerido para Backblaze B2
});

const B2_BUCKET     = process.env.B2_BUCKET;      // Jpservice-media
const B2_PUBLIC_URL = process.env.B2_PUBLIC_URL;  // https://s3.us-east-005.backblazeb2.com/Jpservice-media

async function uploadToB2(localPath, key, mimetype) {
    const fileStream = fs.createReadStream(localPath);
    const uploader = new Upload({
        client: b2Client,
        params: {
            Bucket:      B2_BUCKET,
            Key:         key,
            Body:        fileStream,
            ContentType: mimetype || "image/png",
        },
    });
    await uploader.done();
    return `${B2_PUBLIC_URL}/${key}`;
}

// ── Admin guard ────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Solo el administrador puede realizar esta acción" });
    }
    next();
}

// ── Multer: guarda en /tmp para calcular hash antes de subir ───────
const tmpDir = "/tmp/capturechat";
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const storage = multer.diskStorage({
    destination: tmpDir,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB máx
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) return cb(new Error("Solo imágenes"));
        cb(null, true);
    },
});

// ── Cooldown en memoria ────────────────────────────────────────────
const cooldownMap = new Map();
const COOLDOWN_MS = 45 * 1000;

function isInCooldown(deviceName, keyword) {
    if (!keyword) return false;
    const key  = `${deviceName || "unknown"}::${keyword}`;
    const last = cooldownMap.get(key);
    if (!last) return false;
    return (Date.now() - last) < COOLDOWN_MS;
}

function setCooldown(deviceName, keyword) {
    if (!keyword) return;
    cooldownMap.set(`${deviceName || "unknown"}::${keyword}`, Date.now());
}

setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of cooldownMap.entries()) {
        if (now - ts > COOLDOWN_MS * 4) cooldownMap.delete(key);
    }
}, 5 * 60 * 1000);

// ── Hash perceptual ────────────────────────────────────────────────
async function calcularHash(absolutePath) {
    try {
        return await imghash.hash(absolutePath, 16);
    } catch {
        return null;
    }
}

// ── POST /api/screenshots ──────────────────────────────────────────
router.post("/", upload.single("screenshot"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No se recibió la imagen" });
    }

    const tmpPath = req.file.path;
    const { deviceName, keyword } = req.body;

    try {
        // 1. COOLDOWN
        if (isInCooldown(deviceName, keyword)) {
            fs.unlink(tmpPath, () => {});
            return res.status(200).json({
                message:  "Captura ignorada: cooldown activo para este dispositivo y palabra",
                cooldown: true,
                waitMs:   COOLDOWN_MS,
            });
        }

        // 2. HASH PERCEPTUAL
        const hash = await calcularHash(tmpPath);

        if (hash) {
            const THRESHOLD = 0.92;

            const candidatos = await prisma.screenshot.findMany({
                where:   { hash: { not: null } },
                select:  { id: true, hash: true, deviceName: true, createdAt: true },
                orderBy: { createdAt: "desc" },
                take:    500,
            });

            for (const s of candidatos) {
                const distance = leven(hash, s.hash);
                const maxLen   = Math.max(hash.length, s.hash.length);
                const sim      = 1 - distance / maxLen;

                if (sim >= THRESHOLD) {
                    fs.unlink(tmpPath, () => {});
                    return res.status(200).json({
                        message:    "Captura duplicada por similitud visual, no se guardó",
                        duplicated: true,
                        similarity: sim,
                    });
                }
            }
        }

        // 3. SUBIR A BACKBLAZE B2
        const timestamp = Date.now();
        const ext       = req.file.originalname.split(".").pop() || "png";
        const b2Key     = `capturechat/screenshots/${timestamp}.${ext}`;
        const publicUrl = await uploadToB2(tmpPath, b2Key, req.file.mimetype);

        // 4. Limpiar temporal y registrar cooldown
        fs.unlink(tmpPath, () => {});
        setCooldown(deviceName, keyword);

        // 5. Guardar en BD
        const screenshot = await prisma.screenshot.create({
            data: {
                filename:   `${timestamp}.${ext}`,
                filepath:   publicUrl,
                publicId:   b2Key,
                deviceName: deviceName || null,
                keyword:    keyword    || null,
                hash:       hash       || null,
            },
        });

        res.status(201).json({
            message:    "Captura guardada correctamente",
            cooldown:   false,
            duplicated: false,
            screenshot,
        });

    } catch (error) {
        fs.unlink(tmpPath, () => {});
        console.error("Error guardando captura:", error);
        res.status(500).json({ error: "Error al guardar captura" });
    }
});

// ── GET /api/screenshots ───────────────────────────────────────────
router.get("/", async (req, res) => {
    try {
        const screenshots = await prisma.screenshot.findMany({
            where:   { deletedAt: null },
            orderBy: { createdAt: "desc" },
        });
        res.json(screenshots);
    } catch (error) {
        console.error("Error obteniendo capturas:", error);
        res.status(500).json({ error: "Error al obtener capturas" });
    }
});

// ── GET /api/screenshots/by-keyword ───────────────────────────────
router.get("/by-keyword", async (req, res) => {
    try {
        const grouped = await prisma.screenshot.groupBy({
            by:      ["keyword"],
            where:   { deletedAt: null },
            _count:  { id: true },
            orderBy: { _count: { id: "desc" } },
        });
        res.json(grouped.map(g => ({
            keyword: g.keyword || "(sin palabra)",
            count:   g._count.id,
        })));
    } catch (error) {
        console.error("Error agrupando por keyword:", error);
        res.status(500).json({ error: "Error al obtener estadísticas" });
    }
});

// ── DELETE /api/screenshots/by-keyword/:keyword ────────────────────
router.delete("/by-keyword/:keyword", verifyToken, requireAdmin, async (req, res) => {
    const keyword = decodeURIComponent(req.params.keyword || "").trim();
    if (!keyword) return res.status(400).json({ error: "Keyword inválida" });

    const MAX_DELETE_PER_KEYWORD = 500;

    try {
        const whereClause = keyword === "(sin palabra)"
            ? { keyword: null,    deletedAt: null }
            : { keyword: keyword, deletedAt: null };

        const count = await prisma.screenshot.count({ where: whereClause });

        if (count === 0) return res.json({ message: `No hay capturas de "${keyword}"`, deleted: 0 });

        if (count > MAX_DELETE_PER_KEYWORD) {
            return res.status(400).json({
                error: `Hay ${count} capturas de "${keyword}". Máximo por operación: ${MAX_DELETE_PER_KEYWORD}.`,
            });
        }

        await prisma.screenshot.updateMany({
            where: whereClause,
            data:  { deletedAt: new Date() },
        });

        res.json({ message: `Capturas de "${keyword}" eliminadas (recuperables por 24h)`, deleted: count });
    } catch (error) {
        console.error("Error borrando por keyword:", error);
        res.status(500).json({ error: "Error al borrar capturas" });
    }
});

// ── DELETE /api/screenshots/:id ────────────────────────────────────
router.delete("/:id", verifyToken, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    try {
        const screenshot = await prisma.screenshot.findUnique({ where: { id } });
        if (!screenshot) return res.status(404).json({ error: "Captura no encontrada" });

        await prisma.screenshot.update({
            where: { id },
            data:  { deletedAt: new Date() },
        });

        res.json({ message: "Captura eliminada (recuperable por 24h)" });
    } catch (error) {
        console.error("Error eliminando captura:", error);
        res.status(500).json({ error: "Error al eliminar captura" });
    }
});

// ── DELETE /api/screenshots (limpiar todo – soft delete) ───────────
router.delete("/", verifyToken, requireAdmin, async (req, res) => {
    try {
        const result = await prisma.screenshot.updateMany({
            where: { deletedAt: null },
            data:  { deletedAt: new Date() },
        });
        res.json({ message: "Galería vaciada (recuperable por 24h)", deleted: result.count });
    } catch (error) {
        console.error("Error limpiando galería:", error);
        res.status(500).json({ error: "Error al limpiar galería" });
    }
});

// ── GET /api/screenshots/trash ─────────────────────────────────────
router.get("/trash", verifyToken, requireAdmin, async (req, res) => {
    try {
        const trash = await prisma.screenshot.findMany({
            where:   { deletedAt: { not: null } },
            orderBy: { deletedAt: "desc" },
            take:    100,
        });
        res.json(trash);
    } catch (error) {
        console.error("Error obteniendo papelera:", error);
        res.status(500).json({ error: "Error al obtener papelera" });
    }
});

// ── POST /api/screenshots/restore ──────────────────────────────────
router.post("/restore", verifyToken, requireAdmin, async (req, res) => {
    const limit = Math.min(parseInt(req.body?.limit) || 100, 100);

    try {
        const toRestore = await prisma.screenshot.findMany({
            where:   { deletedAt: { not: null } },
            orderBy: { deletedAt: "desc" },
            take:    limit,
            select:  { id: true },
        });

        if (toRestore.length === 0) return res.json({ message: "No hay capturas en la papelera", restored: 0 });

        await prisma.screenshot.updateMany({
            where: { id: { in: toRestore.map(s => s.id) } },
            data:  { deletedAt: null },
        });

        res.json({ message: `${toRestore.length} capturas recuperadas`, restored: toRestore.length });
    } catch (error) {
        console.error("Error recuperando capturas:", error);
        res.status(500).json({ error: "Error al recuperar capturas" });
    }
});

// ── POST /api/screenshots/purge ────────────────────────────────────
router.post("/purge", verifyToken, requireAdmin, async (req, res) => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
        const toDelete = await prisma.screenshot.findMany({
            where:  { deletedAt: { lte: cutoff } },
            select: { id: true, publicId: true },
        });

        if (toDelete.length === 0) return res.json({ message: "Nada que purgar todavía", purged: 0 });

        // Eliminar de B2 en lotes de 1000
        const keys = toDelete.map(s => s.publicId).filter(Boolean);
        for (let i = 0; i < keys.length; i += 1000) {
            const lote = keys.slice(i, i + 1000).map(k => ({ Key: k }));
            await b2Client.send(new DeleteObjectsCommand({
                Bucket: B2_BUCKET,
                Delete: { Objects: lote, Quiet: true },
            })).catch(err => console.warn("Error borrando de B2:", err));
        }

        await prisma.screenshot.deleteMany({
            where: { id: { in: toDelete.map(s => s.id) } },
        });

        res.json({ message: `${toDelete.length} capturas purgadas permanentemente`, purged: toDelete.length });
    } catch (error) {
        console.error("Error purgando papelera:", error);
        res.status(500).json({ error: "Error al purgar papelera" });
    }
});

export default router;