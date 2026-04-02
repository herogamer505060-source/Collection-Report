import { GoogleGenAI, Type } from "@google/genai";
import type { InstallmentData } from "../types";

let aiInstance: GoogleGenAI | null = null;

export function isGeminiConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

export function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("MISSING_API_KEY");
    }

    aiInstance = new GoogleGenAI({ apiKey });
  }

  return aiInstance;
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
    .slice(0, 400)
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

    البيانات المفصلة (محدودة بـ 400 سجل):
    ${header}
    ${rows}

    تعليمات هامة:
    1. أجب باللغة العربية بأسلوب مهني وواضح.
    2. عند ذكر مبالغ مالية، استخدم صيغة "ج.م" (الجنيه المصري).
    3. إذا سُئلت عن "المتأخرين"، فهم العملاء الذين لديهم مبلغ في خانة "المتبقي" وبدون "ورقة تجارية".
    4. إذا سُئلت عن "أوراق تجارية"، ابحث في خانة "الورقة_التجارية".
    5. التواريخ بصيغة YYYY-MM-DD. استخدم تاريخ اليوم (${today}) لحساب المواعيد (اليوم، غداً، الأسبوع القادم، إلخ).
    6. إذا كانت الإجابة تتطلب قائمة، استخدم التنسيق النقطي.
    7. إذا لم تجد العميل في البيانات المتاحة، اعتذر بأدب واطلب التأكد من الاسم.
    8. لا تذكر أبداً أن البيانات محدودة أو تذكر التفاصيل التقنية للجدول.
  `;
}

export async function analyzePdfWithGemini(base64Data: string) {
  const ai = getAI();
  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: `
              تحليل ملف PDF المرفق واستخراج بيانات أقساط العملاء في شكل JSON.
              الملف يحتوي على جدول بالأعمدة التالية:
              1. العميل (customer)
              2. المشروع (project)
              3. كود الوحدة (unitCode)
              4. نوع القسط (type)
              5. كود القسط (installmentCode)
              6. تاريخ القسط (date)
              7. قيمة القسط (value)
              8. صافي القسط (netValue)
              9. المحصل (collected)
              10. المتبقي (remaining)
              11. الورقة التجارية (commercialPaper)
              12. ملاحظات (notes)

              يجب أن يحتوي الـ JSON على قائمة من الكائنات بالخصائص المذكورة أعلاه.

              قواعد هامة جداً للدقة:
              - استخرج البيانات من جميع الصفحات الموجودة في الملف بدقة متناهية.
              - انتبه لخانة "المتبقي" (remaining): في بعض الصفوف، قد يكون هناك مبلغ في "المحصل" ولكن "المتبقي" لا يزال مساوياً لـ "صافي القسط" (بسبب وجود ورقة تجارية لم تُحصل بعد). استخرج القيمة كما هي مكتوبة في الجدول تماماً ولا تفترض أن المحصل يقلل المتبقي إذا كان الجدول يذكر غير ذلك.
              - لا تقم بتقريب الأرقام أبداً، استخرج القيم كما هي مكتوبة تماماً (مثلاً 1299600.00 تصبح 1299600).
              - إذا كانت القيمة فارغة، ضع سلسلة نصية فارغة "" أو 0 للأرقام.
              - تاريخ القسط يجب أن يكون بصيغة YYYY-MM-DD. إذا كان التاريخ في الملف بصيغة أخرى (مثل DD/MM/YYYY أو DD-MM-YYYY)، قم بتحويله بدقة إلى YYYY-MM-DD. إذا لم تجد تاريخاً أو كان غير واضح، ضع "0".
              - تأكد من تحويل الأرقام إلى قيم عددية (بدون فواصل أو علامات عملة).
              - لا تتجاهل أي صف في الجدول.
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
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            customer: { type: Type.STRING },
            project: { type: Type.STRING },
            unitCode: { type: Type.STRING },
            type: { type: Type.STRING },
            installmentCode: { type: Type.STRING },
            date: { type: Type.STRING },
            value: { type: Type.NUMBER },
            netValue: { type: Type.NUMBER },
            collected: { type: Type.NUMBER },
            remaining: { type: Type.NUMBER },
            commercialPaper: { type: Type.STRING },
            notes: { type: Type.STRING },
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
  });

  return JSON.parse(result.text || "[]") as InstallmentData[];
}

export async function chatWithGemini(
  message: string,
  data: InstallmentData[],
) {
  const ai = getAI();
  const result = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: message,
    config: {
      systemInstruction: buildSystemPrompt(data),
    },
  });

  return result.text || "";
}
