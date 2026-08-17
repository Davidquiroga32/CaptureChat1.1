import { Router } from "express";
import { register, login, listUsers, createUser, deleteUser } from "../controllers/auth.controller.js";
import verifyToken from "../middlewares/verifyToken.js";

const router = Router();

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Solo el administrador puede realizar esta acción" });
    }
    next();
}

router.post("/register", verifyToken, requireAdmin, register);
router.post("/login", login);

// Gestión de usuarios (solo ADMIN)
router.get("/users", verifyToken, requireAdmin, listUsers);
router.post("/users", verifyToken, requireAdmin, createUser);
router.delete("/users/:id", verifyToken, requireAdmin, deleteUser);

export default router;
