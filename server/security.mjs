import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { AppError } from "./domain.mjs";
const derive = promisify(scrypt);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 64);
  return salt + ":" + key.toString("hex");
}
export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const key = await derive(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(hash, "hex"));
}
export function validateUser(body) {
  if (
    typeof body.username !== "string" ||
    !/^[a-zA-Z0-9_.-]{3,40}$/.test(body.username)
  )
    throw new AppError("账号需为 3～40 位字母、数字、点、横线或下划线");
  if (
    typeof body.password !== "string" ||
    body.password.length < 12 ||
    body.password.length > 128
  )
    throw new AppError("密码长度需为 12～128 位");
  if (
    body.name !== undefined &&
    (typeof body.name !== "string" ||
      body.name.trim().length < 1 ||
      body.name.length > 40)
  )
    throw new AppError("姓名需为 1～40 个字符");
  if (body.role !== undefined && !["admin", "viewer"].includes(body.role))
    throw new AppError("角色无效");
}
export const tokenHash = (token) =>
  createHash("sha256").update(token).digest("hex");
export function issueSession(db, userId) {
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)",
  ).run(tokenHash(token), userId, Date.now() + 7 * 86400000);
  return token;
}
export function getSession(db, req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("keran_session="))
    ?.slice(14);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return (
    db
      .prepare(
        "SELECT u.id,u.username,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .get(tokenHash(token), Date.now()) || null
  );
}
export function revokeSession(db, req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("keran_session="))
    ?.slice(14);
  if (token)
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(token));
}
