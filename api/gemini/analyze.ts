import { analyzePdfWithGemini } from "../../src/server/geminiApi";

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

  const { base64Data } = parseJsonBody(request) as { base64Data?: string };

  if (!base64Data) {
    response.status(400).json({ error: "MISSING_BASE64_DATA" });
    return;
  }

  try {
    const data = await analyzePdfWithGemini(base64Data);
    response.status(200).json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "MISSING_API_KEY") {
      response.status(503).json({ error: "MISSING_API_KEY" });
      return;
    }

    console.error("Gemini analyze error", error);
    response.status(500).json({ error: "GEMINI_REQUEST_FAILED" });
  }
}
