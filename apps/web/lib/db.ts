import Database from "better-sqlite3";
import path from "node:path";

// El almacen analitico. SQLite ahora: cero infraestructura y suficiente para
// decenas de miles de instrumentos. El esquema esta escrito para migrar a
// Postgres sin reescribir consultas cuando toque desplegar.
const DB_PATH =
  process.env.PCP_DB ?? path.join(process.cwd(), "..", "..", "data", "pcp.db");

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}

/** Fecha de calculo de senales mas reciente. */
export function latestAsOf(): string {
  const r = db().prepare("SELECT MAX(as_of) a FROM signals").get() as { a: string };
  return r.a;
}
