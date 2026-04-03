import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

export function getGeminiClient() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable");
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export function getGeminiModel(modelName = "gemini-2.0-flash") {
  const client = getGeminiClient();
  return client.getGenerativeModel({ model: modelName });
}
