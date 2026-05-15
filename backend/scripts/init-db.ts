import { initDb, all } from "../src/db/index.js";

await initDb();
const tables = await all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'");
console.log("tables:", tables.map((t) => t.name));
