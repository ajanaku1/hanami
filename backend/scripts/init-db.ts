import { db } from "../src/db/index.js";
console.log("tables:", db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
