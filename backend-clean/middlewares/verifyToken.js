import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("❌ FATAL: JWT_SECRET no está definido en las variables de entorno.");
    process.exit(1);
}

export default function verifyToken(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Token requerido" });
    }

    const token = header.split(" ")[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            if (err.name === "TokenExpiredError") {
                return res.status(401).json({ error: "Sesión expirada, inicia sesión de nuevo" });
            }
            return res.status(401).json({ error: "Token inválido" });
        }
        req.user = user; // { id, user, role }
        next();
    });
}