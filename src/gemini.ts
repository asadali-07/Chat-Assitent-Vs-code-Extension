import * as dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI } from "@google/genai";

const apiKey = 'AIzaSyCOveNVFplxXkakOl1Xg4uon8Ers5MceHI';
console.log("🔑 GEMINI_API_KEY:", apiKey ? "Loaded" : "Not found");
if (!apiKey) throw new Error("❌ GEMINI_API_KEY not found in .env file");

const ai = new GoogleGenAI({ apiKey });

interface AttachedFile {
  name: string;
  path: string;
  type: 'text' | 'image';
  content?: string;
  size?: number;
}

export async function askGemini(prompt: string, attachedFiles?: AttachedFile[]): Promise<string> {
  try {
    let enhancedPrompt = prompt;
    
    // Add file context to prompt
    if (attachedFiles && attachedFiles.length > 0) {
      enhancedPrompt += "\n\n--- Attached Files ---\n";
      
      for (const file of attachedFiles) {
        enhancedPrompt += `\nFile: ${file.name} (${file.type})\n`;
        if (file.type === 'text' && file.content) {
          enhancedPrompt += `Content:\n${file.content}\n`;
        } else if (file.type === 'image') {
          enhancedPrompt += `[This is an image file: ${file.name}]\n`;
        }
        enhancedPrompt += "---\n";
      }
    }

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: enhancedPrompt,
    });

    return response.text ?? "❌ Empty response from Gemini.";
  } catch (err) {
    console.error("❌ Gemini Error:", err);
    return "❌ Gemini API request failed.";
  }
}
