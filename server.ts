import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- DATABASE SETUP ---
const db = new Database("nova.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(sessionId) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY(sessionId) REFERENCES sessions(id)
  );
`);

// --- APP SETUP ---
const app = express();

async function startServer() {
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // --- API ROUTES ---

  // Sessions
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", engine: "Nova-1", version: "2.5.0" });
  });

  // Sessions
  app.get("/api/sessions", (req, res) => {
    const sessions = db.prepare("SELECT * FROM sessions ORDER BY createdAt DESC").all();
    res.json(sessions);
  });

  app.post("/api/sessions", (req, res) => {
    const { id, name } = req.body;
    db.prepare("INSERT INTO sessions (id, name, createdAt) VALUES (?, ?, ?)").run(id, name, Date.now());
    res.json({ success: true });
  });

  app.delete("/api/sessions/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM files WHERE sessionId = ?").run(id);
    db.prepare("DELETE FROM messages WHERE sessionId = ?").run(id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // Messages
  app.get("/api/sessions/:sessionId/messages", (req, res) => {
    const { sessionId } = req.params;
    const messages = db.prepare("SELECT * FROM messages WHERE sessionId = ? ORDER BY timestamp ASC").all(sessionId);
    res.json(messages);
  });

  app.post("/api/sessions/:sessionId/messages", (req, res) => {
    const { sessionId } = req.params;
    const { id, role, content } = req.body;
    db.prepare("INSERT INTO messages (id, sessionId, role, content, timestamp) VALUES (?, ?, ?, ?, ?)").run(id, sessionId, role, content, Date.now());
    res.json({ success: true });
  });

  // Files
  app.get("/api/sessions/:sessionId/files", (req, res) => {
    const { sessionId } = req.params;
    const files = db.prepare("SELECT * FROM files WHERE sessionId = ? ORDER BY updatedAt DESC").all(sessionId);
    res.json(files);
  });

  app.post("/api/sessions/:sessionId/files", (req, res) => {
    const { sessionId } = req.params;
    const { name, content } = req.body;
    const id = `${sessionId}_${name}`;
    db.prepare(`
      INSERT OR REPLACE INTO files (id, sessionId, name, content, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, sessionId, name, content, Date.now());
    res.json({ success: true });
  });

  app.delete("/api/sessions/:sessionId/files/:name", (req, res) => {
    const { sessionId, name } = req.params;
    const id = `${sessionId}_${name}`;
    db.prepare("DELETE FROM files WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // External API Access
  const SYSTEM_INSTRUCTION = `
You are "Nova-1", a highly creative Full-Stack AI Architect. You help users turn raw ideas into detailed technical roadmaps and code.

Core Guidelines:
1. USE SIMPLE LANGUAGE: Explain complex tech in plain English. No unnecessary jargon.
2. CREATIVE BLUEPRINTING: When asked to "blueprint" or "plan", provide a detailed architectural roadmap in your message FIRST. Do NOT automatically create a file unless specifically asked. Focus on the "Why", "What", and "How".
3. DOMAIN INTELLIGENCE: Be platform-aware. If a user asks for a Discord bot, suggest creative features like custom slash commands, interactive embeds, or economy systems. If it's a web app, suggest unique UX patterns.
4. SEARCH & VERIFY: Always use Google Search if you need to understand specific platform limitations or find the best modern tools for a user's request.
5. API MODE: You are currently being accessed via an external API. Provide responses that are clean, structured, and easy for other apps to consume.

Philosophy: You are a mentor and a builder. You don't just write code; you design experiences.
`;

  app.post("/api/external/chat", async (req, res) => {
    const apiKey = req.headers["x-nova-api-key"];
    if (!process.env.NOVA_API_KEY || apiKey !== process.env.NOVA_API_KEY) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    try {
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const result = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        }
      });
      res.json({ 
        response: result.text,
        model: "gemini-3-flash-preview",
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("External API Error:", error);
      res.status(500).json({ error: "Failed to process request" });
    }
  });

  // Alternative GET endpoint for testing/simple webhooks
  app.get("/api/external/ask", async (req, res) => {
    const apiKey = req.query.key;
    if (!process.env.NOVA_API_KEY || apiKey !== process.env.NOVA_API_KEY) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const { prompt } = req.query;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    try {
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const result = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: prompt as string }] }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        }
      });
      res.json({ response: result.text });
    } catch (error) {
      res.status(500).json({ error: "Failed to process request" });
    }
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Nova Engine running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
