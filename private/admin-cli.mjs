import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./server.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const email = String(process.argv[2] || "").trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
 console.error("Usage: node private/admin-cli.mjs account@example.com");
 process.exit(2);
}
const db = openDb(process.env.TGL_DB_PATH || path.join(root,"data","private.sqlite"));
const result = db.prepare("UPDATE users SET role='admin' WHERE email=?").run(email);
db.close();
if (result.changes !== 1) { console.error("No matching registered account."); process.exit(1); }
console.log("Administrator role granted to the existing account.");
