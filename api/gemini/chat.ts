import type { InstallmentData } from "../../src/types.ts";
import {
  chatWithGemini,
  type GeminiChatHistoryEntry,
} from "../../src/server/geminiApi.ts";

function parseJsonBody(request: { body?: unknown }) {
  if (request.body == null) return {};
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  if (typeof request.body === "object") {
    return request.body as Record<string, unknown>;
  }

  return {};
}

export default async function handler(
  request: { method?: string; body?: unknown },
  response: {
    setHeader: (name: string, value: string) => void;
    status: (code: number) => {
      json: (payload: Record<string, unknown>) => void;
    };
  },
) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  try {
    const body = parseJsonBody(request) as {
      message?: string;
      data?: InstallmentData[];
      history?: GeminiChatHistoryEntry[];
    };
    const { message, data, history } = body;

    if (!message?.trim()) {
      response.status(400).json({ error: "MISSING_MESSAGE" });
      return;
    }

    if (!Array.isArray(data)) {
      response.status(400).json({ error: "MISSING_DATASET" });
      return;
    }

    const text = await chatWithGemini(
      message,
      data,
      Array.isArray(history) ? history : [],
    );

    response.status(200).json({ data: { text } });
  } catch (error) {
    console.error("Gemini chat error", error);
    response.status(500).json({
      error:
        error instanceof Error && error.message
          ? error.message
          : "GEMINI_REQUEST_FAILED",
    });
  }
}
