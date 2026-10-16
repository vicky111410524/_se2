const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.PGHOST || "postgres",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "demo",
  password: process.env.PGPASSWORD || "demo1234",
  database: process.env.PGDATABASE || "demo",
  connectionTimeoutMillis: 5000,
});

app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    const r = await pool.query("SELECT NOW() AS now");
    res.json({
      service: "node-api",
      status: "ok",
      runtime: `node ${process.version}`,
      database: "postgresql",
      dbTime: r.rows[0].now,
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ service: "node-api", status: "error", message: err.message });
  }
});

app.get("/messages", async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, name, content, created_at FROM messages ORDER BY id DESC LIMIT 100"
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/messages", async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 40) || "anonymous";
  const content = String(req.body.content || "").trim().slice(0, 500);
  if (!content) {
    return res.status(400).json({ error: "content is required" });
  }
  try {
    const r = await pool.query(
      "INSERT INTO messages (name, content) VALUES ($1, $2) RETURNING id, name, content, created_at",
      [name, content]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/messages/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid id" });
  try {
    const r = await pool.query("DELETE FROM messages WHERE id = $1 RETURNING id", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "not found" });
    res.json({ deleted: r.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`node-api listening on :${PORT}`);
});
