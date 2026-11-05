import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    console.error("❌ Error: DATABASE_URL or POSTGRES_URL environment variable is not defined.");
    console.error("Please add your Neon connection string in .env.local or set DATABASE_URL.");
    process.exit(1);
  }

  console.log("Connecting to Neon PostgreSQL...");
  const sql = neon(dbUrl);

  const schemaPath = path.join(__dirname, "../src/lib/db/schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf-8");

  console.log("Applying schema.sql to database...");
  await sql(schemaSql);

  console.log("✅ Database schema initialized successfully!");
  console.log("Tables verified: examinations, exam_shifts, submissions, report_cards");
}

main().catch((err) => {
  console.error("❌ Migration error:", err);
  process.exit(1);
});
