export default function handler(_request: unknown, response: any) {
  response.status(200).json({ configured: !!process.env.GEMINI_API_KEY });
}
