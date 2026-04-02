const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function parseJsonBody(request: any) {
  if (!request || request.body == null) return {};
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

  try {
    const { base64Data } = parseJsonBody(request) as { base64Data?: string };

    if (!base64Data) {
      response.status(400).json({ error: "MISSING_BASE64_DATA" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      response.status(503).json({ error: "MISSING_API_KEY" });
      return;
    }

    const geminiResponse = await fetch(
      `${GEMINI_API_BASE}/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `تحليل ملف PDF المرفق واستخراج بيانات أقساط العملاء في شكل JSON array فقط. الحقول المطلوبة: customer, project, unitCode, type, installmentCode, date, value, netValue, collected, remaining, commercialPaper, notes. استخدم YYYY-MM-DD للتاريخ واجعل الحقول الرقمية أرقاماً حقيقية.`,
                },
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
      },
    );

    const payload = await geminiResponse.json().catch(() => null) as any;
    if (!geminiResponse.ok) {
      response
        .status(500)
        .json({ error: payload?.error?.message || `GEMINI_HTTP_${geminiResponse.status}` });
      return;
    }

    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      response.status(500).json({ error: "EMPTY_GEMINI_RESPONSE" });
      return;
    }

    response.status(200).json({ data: JSON.parse(text) });
  } catch (error) {
    console.error("Gemini analyze error", error);
    response.status(500).json({
      error:
        error instanceof Error && error.message
          ? error.message
          : "GEMINI_REQUEST_FAILED",
    });
  }
}
