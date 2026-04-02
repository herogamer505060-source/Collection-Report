import { InstallmentData } from "../types";

type ChatRequest = {
  message: string;
  data: InstallmentData[];
};

type GeminiApiError = Error & {
  status?: number;
};

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string; configured?: boolean; text?: string; data?: T }
    | null;

  if (!response.ok) {
    const error = new Error(payload?.error || "GEMINI_REQUEST_FAILED") as GeminiApiError;
    error.status = response.status;
    throw error;
  }

  return (payload?.data as T | undefined) ?? (payload as T);
}

export async function getAIStatus(): Promise<boolean> {
  const response = await fetch("/api/gemini/status");
  const payload = (await response.json()) as { configured: boolean };
  return payload.configured;
}

export async function analyzeCollectionPDF(
  base64Data: string,
): Promise<InstallmentData[]> {
  const response = await fetch("/api/gemini/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ base64Data }),
  });

  return parseApiResponse<InstallmentData[]>(response);
}

export function createDataChatSession(data: InstallmentData[]) {
  return {
    async sendMessage({ message }: ChatRequest) {
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, data }),
      });

      const payload = await parseApiResponse<{ text: string }>(response);
      return { text: payload.text };
    },
  };
}
