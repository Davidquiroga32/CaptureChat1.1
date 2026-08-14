import { Router } from "express";
import { register, login } from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);

// Cuando el servidor esté estable, volvemos a activar la protegida
// import verifyToken from "../middlewares/verifyToken.js";
// import { protectedRoute } from "../controllers/auth.controller.js";
// router.get("/protected", verifyToken, protectedRoute);

export default router;
