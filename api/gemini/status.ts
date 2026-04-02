import { isGeminiConfigured } from "../../src/server/geminiApi";

export default function handler(_request: unknown, response: any) {
  response.status(200).json({ configured: isGeminiConfigured() });
}
