import type { InstallmentData } from "../types";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
};

type GeminiContent = {
  role?: "user" | "model";
  parts: GeminiPart[];
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export function isGeminiConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }

  return apiKey;
}

async function generateContent(
  model: string,
  contents: GeminiContent[],
  config?: Record<string, unknown>,
) {
  const apiKey = getApiKey();
  const response = await fetch(
    `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contents, generationConfig: config }),
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | GeminiGenerateResponse
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `GEMINI_HTTP_${response.status}`);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("EMPTY_GEMINI_RESPONSE");
  }

  return text;
}

export function buildSystemPrompt(data: InstallmentData[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const totalNet = data.reduce((sum, item) => sum + (item.netValue || 0), 0);
  const totalCollected = data.reduce(
    (sum, item) => sum + (item.collected || 0),
    0,
  );
  const totalRemaining = data.reduce(
    (sum, item) => sum + (item.remaining || 0),
    0,
  );
  const projects = Array.from(new Set(data.map((item) => item.project))).filter(
    Boolean,
  );

  const header =
    "العميل|المشروع|الوحدة|تاريخ_القسط|صافي_القيمة|المحصل|المتبقي|الورقة_التجارية|ملاحظات";
  const rows = data
    .slice(0, 200)
    .map(
      (item) =>
        `${item.customer}|${item.project}|${item.unitCode}|${item.date}|${item.netValue}|${item.collected}|${item.remaining}|${item.commercialPaper || ""}|${item.notes || ""}`,
    )
    .join("\n");

  return `
    أنت مساعد مالي ذكي لنظام "Indigo Ledger" (سجل التحصيلات لمجموعة الحصري).
    تاريخ اليوم: ${today}

    ملخص عام للبيانات (الإجمالي للفترة):
    - إجمالي القيمة الصافية: ${totalNet} ج.م
    - إجمالي المحصل: ${totalCollected} ج.م
    - إجمالي المتبقي: ${totalRemaining} ج.م
    - المشاريع: ${projects.join(", ")}

    البيانات المفصلة (محدودة بـ 200 سجل):
    ${header}
    ${rows}

    تعليمات هامة:
    1. أجب باللغة العربية بأسلوب مهني وواضح.
    2. عند ذكر مبالغ مالية، استخدم صيغة "ج.م".
    3. إذا سُئلت عن المتأخرين، فهم العملاء الذين لديهم مبلغ متبقٍ وبدون ورقة تجارية.
    4. إذا سُئلت عن أوراق تجارية، ابحث في خانة الورقة_التجارية.
    5. إذا لم تجد الإجابة في البيانات، قل ذلك بوضوح.
    6. لا تذكر تفاصيل تقنية عن النظام أو بنية البيانات.
  `;
}

export async function analyzePdfWithGemini(base64Data: string) {
  const text = await generateContent(
    "gemini-1.5-flash",
    [
      {
        role: "user",
        parts: [
          {
            text: `
              تحليل ملف PDF المرفق واستخراج بيانات أقساط العملاء في شكل JSON.
              الملف يحتوي على جدول بالأعمدة التالية:
              customer, project, unitCode, type, installmentCode, date, value,
              netValue, collected, remaining, commercialPaper, notes.

              أرجع JSON array فقط بدون أي شرح إضافي.
              استخدم YYYY-MM-DD للتاريخ.
              اجعل الحقول الرقمية أرقاماً حقيقية.
              لا تتجاهل أي صف.
            `,
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
    {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            customer: { type: "STRING" },
            project: { type: "STRING" },
            unitCode: { type: "STRING" },
            type: { type: "STRING" },
            installmentCode: { type: "STRING" },
            date: { type: "STRING" },
            value: { type: "NUMBER" },
            netValue: { type: "NUMBER" },
            collected: { type: "NUMBER" },
            remaining: { type: "NUMBER" },
            commercialPaper: { type: "STRING" },
            notes: { type: "STRING" },
          },
          required: [
            "customer",
            "project",
            "netValue",
            "collected",
            "remaining",
          ],
        },
      },
    },
  );

  return JSON.parse(text) as InstallmentData[];
}

export async function chatWithGemini(message: string, data: InstallmentData[]) {
  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  let lastError: unknown;

  for (const model of models) {
    try {
      return await generateContent(
        model,
        [
          {
            role: "user",
            parts: [
              {
                text: `${buildSystemPrompt(data)}\n\nسؤال المستخدم: ${message}`,
              },
            ],
          },
        ],
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("GEMINI_CHAT_REQUEST_FAILED");
}
