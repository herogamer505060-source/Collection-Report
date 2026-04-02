const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function buildSystemPrompt(data: any[]) {
  const today = new Date().toISOString().slice(0, 10);
  const totalNet = data.reduce((sum, item) => sum + (Number(item.netValue) || 0), 0);
  const totalCollected = data.reduce(
    (sum, item) => sum + (Number(item.collected) || 0),
    0,
  );
  const totalRemaining = data.reduce(
    (sum, item) => sum + (Number(item.remaining) || 0),
    0,
  );
  const projects = Array.from(new Set(data.map((item) => item.project))).filter(Boolean);

  const rows = data
    .slice(0, 120)
    .map(
      (item) =>
        `${item.customer || ""}|${item.project || ""}|${item.unitCode || ""}|${item.date || ""}|${item.netValue || 0}|${item.collected || 0}|${item.remaining || 0}|${item.commercialPaper || ""}|${item.notes || ""}`,
    )
    .join("\n");

  return `
أنت مساعد مالي ذكي لنظام Indigo Ledger.
تاريخ اليوم: ${today}
إجمالي القيمة الصافية: ${totalNet} ج.م
إجمالي المحصل: ${totalCollected} ج.م
إجمالي المتبقي: ${totalRemaining} ج.م
المشاريع: ${projects.join(", ")}

البيانات:
العميل|المشروع|الوحدة|تاريخ_القسط|صافي_القيمة|المحصل|المتبقي|الورقة_التجارية|ملاحظات
${rows}

تعليمات:
1. أجب بالعربية.
2. إذا لم توجد الإجابة في البيانات فقل ذلك بوضوح.
3. إذا سئلت عن المتأخرين فهم من لديهم متبقٍ وبدون ورقة تجارية.
4. لا تذكر تفاصيل تقنية داخلية.
`;
}

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

async function callGemini(model: string, message: string, data: any[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }

  const response = await fetch(
    `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
                text: `${buildSystemPrompt(data)}\n\nسؤال المستخدم: ${message}`,
              },
            ],
          },
        ],
      }),
    },
  );

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) {
    throw new Error(payload?.error?.message || `GEMINI_HTTP_${response.status}`);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("EMPTY_GEMINI_RESPONSE");
  }

  return text;
}

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  try {
    const body = parseJsonBody(request) as { message?: string; data?: any[] };
    const { message, data } = body;

    if (!message?.trim()) {
      response.status(400).json({ error: "MISSING_MESSAGE" });
      return;
    }

    if (!Array.isArray(data)) {
      response.status(400).json({ error: "MISSING_DATASET" });
      return;
    }

    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let lastError: unknown;

    for (const model of models) {
      try {
        const text = await callGemini(model, message, data);
        response.status(200).json({ data: { text } });
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("GEMINI_REQUEST_FAILED");
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
