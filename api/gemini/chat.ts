import type { InstallmentData } from "../../src/types";
import { chatWithGemini } from "../../src/server/geminiApi";

function parseJsonBody(request: any) {
  if (!request || request.body == null) {
    return {};
  }

  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      return {};
    }
  }

  return request.body;
}

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = parseJsonBody(request) as {
    message?: string;
    data?: InstallmentData[];
  };
  const { message, data } = body;

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
    response.status(200).json({ data: { text } });
  } catch (error) {
    if (error instanceof Error && error.message === "MISSING_API_KEY") {
      response.status(503).json({ error: "MISSING_API_KEY" });
      return;
    }

    console.error("Gemini chat error", error);
    response.status(500).json({
      error:
        error instanceof Error && error.message
          ? error.message
          : "GEMINI_REQUEST_FAILED",
    });
  }
}
