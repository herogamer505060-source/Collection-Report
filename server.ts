import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import type { InstallmentData } from "./src/types.ts";
import {
  analyzePdfWithGemini,
  chatWithGemini,
  isGeminiConfigured,
} from "./src/server/geminiApi.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);

app.use(express.json({ limit: "25mb" }));

function sendGeminiError(response: express.Response, error: unknown) {
  if (error instanceof Error && error.message === "MISSING_API_KEY") {
    response.status(503).json({ error: "MISSING_API_KEY" });
    return;
  }

  console.error("Gemini API error", error);
  response.status(500).json({ error: "GEMINI_REQUEST_FAILED" });
}

app.get("/api/gemini/status", (_request, response) => {
  response.json({ configured: isGeminiConfigured() });
});

app.post("/api/gemini/analyze", async (request, response) => {
  const { base64Data } = request.body as { base64Data?: string };

  if (!base64Data) {
    response.status(400).json({ error: "MISSING_BASE64_DATA" });
    return;
  }

  try {
    const parsed = await analyzePdfWithGemini(base64Data);
    response.json({ data: parsed });
  } catch (error) {
    sendGeminiError(response, error);
  }
});

app.post("/api/gemini/chat", async (request, response) => {
  const { message, data } = request.body as {
    message?: string;
    data?: InstallmentData[];
  };

  if (!message?.trim()) {
    response.status(400).json({ error: "MISSING_MESSAGE" });
    return;
  }

  if (!Array.isArray(data)) {
    response.status(400).json({ error: "MISSING_DATASET" });
    return;
  }

  try {
    const text = await chatWithGemini(message, data);
    response.json({ data: { text } });
  } catch (error) {
    sendGeminiError(response, error);
  }
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "dist");

  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (_request, response) => {
    response.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Gemini server listening on http://localhost:${port}`);
});
