import { GoogleGenAI, Type } from "@google/genai";
import { InstallmentData } from "../types";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("MISSING_API_KEY");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export function isAIConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function analyzeCollectionPDF(base64Data: string): Promise<InstallmentData[]> {
  const ai = getAI();
  const model = "gemini-3-flash-preview";
  
  const prompt = `
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
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
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
          required: ["customer", "project", "netValue", "collected", "remaining"],
        },
      },
    },
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return [];
  }
}
