import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export default function generateToken(user) {
    return jwt.sign(
        {
            id:   user.id,
            user: user.user,
            role: user.role,
        },
        JWT_SECRET,
        { expiresIn: "8h" }
    );
}