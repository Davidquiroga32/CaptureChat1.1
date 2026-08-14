import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import generateToken from "../utils/generateToken.js";

const prisma = new PrismaClient();

export const register = async (req, res) => {
    try {
        const { user, password, role } = req.body;

        if (!user || !password) {
            return res
            .status(400)
            .json({ message: "Usuario y contraseña son obligatorios." });
        }

        const existing = await prisma.usuario.findUnique({ where: { user } });
        if (existing) {
            return res
            .status(400)
            .json({ message: "El usuario ya está registrado." });
        }

        const hashed = await bcrypt.hash(password, 10);

        await prisma.usuario.create({
            data: {
                user,
                password: hashed,
                role: role || "WORKER", 
            },
        });

        res.status(201).json({ message: "Usuario registrado correctamente " });
    } catch (err) {
        console.error(" Error en registro:", err);
        if (err?.code === "P2002")
            return res.status(400).json({ message: "El usuario ya está registrado." });
        res.status(500).json({ message: "Error del servidor." });
    }
};

export const login = async (req, res) => {
    try {
        const { user, password } = req.body;
        if (!user || !password)
            return res
            .status(400)
            .json({ message: "Usuario y contraseña obligatorios." });

        const existing = await prisma.usuario.findUnique({ where: { user } });
        if (!existing)
            return res.status(401).json({ message: "Usuario no encontrado." });

        const ok = await bcrypt.compare(password, existing.password);
        if (!ok)
            return res.status(401).json({ message: "Contraseña incorrecta." });

        const token = generateToken(existing);

        res.json({
            message: "Inicio de sesión exitoso ",
            token,
            user: {
                id: existing.id,
                user: existing.user,
                role: existing.role, 
            },
        });
    } catch (err) {
        console.error(" Error en login:", err);
        res.status(500).json({ message: "Error del servidor." });
    }
};

