import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import verifyToken from "../middlewares/verifyToken.js";

const router = Router();
const prisma = new PrismaClient();

// helper para admin
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "ADMIN") {
        return res
        .status(403)
        .json({ error: "Solo el administrador puede realizar esta acción" });
    }
    next();
}

// Obtener todas las palabras 
router.get("/", async (req, res) => {
    try {
        const words = await prisma.keyword.findMany();
        res.json(words);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener palabras" });
    }
});

// Crear palabra 
router.post("/", async (req, res) => {
    const { keyword } = req.body;
    if (!keyword) return res.status(400).json({ error: "Keyword requerida" });

    try {
        const newWord = await prisma.keyword.create({
            data: { keyword },
        });
        res.json(newWord);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al guardar palabra" });
    }
});

// Eliminar palabra por ID (SOLO ADMIN)
router.delete("/:id", verifyToken, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    try {
        await prisma.keyword.delete({ where: { id } });
        res.json({ message: "Eliminada " });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al eliminar palabra" });
    }
});

export default router;
