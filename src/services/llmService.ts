import { GoogleGenAI, Type, type FunctionDeclaration, type Content, type Part } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are "Nova-1", a highly creative Full-Stack AI Architect. You help users turn raw ideas into detailed technical roadmaps and code.

Core Guidelines:
1. USE SIMPLE LANGUAGE: Explain complex tech in plain English. No unnecessary jargon.
2. CREATIVE BLUEPRINTING: When asked to "blueprint" or "plan", provide a detailed architectural roadmap in your message FIRST. Do NOT automatically create a file unless specifically asked. Focus on the "Why", "What", and "How".
3. DOMAIN INTELLIGENCE: Be platform-aware. If a user asks for a Discord bot, suggest creative features like custom slash commands, interactive embeds, or economy systems. If it's a web app, suggest unique UX patterns.
4. SEARCH & VERIFY: Always use Google Search if you need to understand specific platform limitations or find the best modern tools for a user's request.
5. API MODE: You are also accessible via an external API. Provide responses that are clean, structured, and easy for other apps to consume.

Philosophy: You are a mentor and a builder. You don't just write code; you design experiences.
`;

export interface WorkspaceFile {
  name: string;
  content: string;
  updatedAt: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  timestamp: number;
  toolCalls?: any[];
}

export type NovaStatus = 'idle' | 'searching' | 'thinking' | 'coding' | 'blueprint' | 'deploying';

const listFilesTool: FunctionDeclaration = {
  name: "listFiles",
  description: "List all files currently in the Nova Workspace sandbox.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

const readFileTool: FunctionDeclaration = {
  name: "readFile",
  description: "Read the content of a specific file from the workspace.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: {
        type: Type.STRING,
        description: "The name of the file to read.",
      },
    },
    required: ["filename"],
  },
};

const writeFileTool: FunctionDeclaration = {
  name: "writeFile",
  description: "Create or update a file in the workspace.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: {
        type: Type.STRING,
        description: "The name of the file.",
      },
      content: {
        type: Type.STRING,
        description: "The content to write to the file.",
      },
    },
    required: ["filename", "content"],
  },
};

const deleteFileTool: FunctionDeclaration = {
  name: "deleteFile",
  description: "Delete a file from the workspace.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: {
        type: Type.STRING,
        description: "The name of the file to delete.",
      },
    },
    required: ["filename"],
  },
};

const setLivePreviewTool: FunctionDeclaration = {
  name: "setLivePreview",
  description: "Render HTML/CSS/JS code in the Nova Live Preview window.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      code: {
        type: Type.STRING,
        description: "The full HTML string (including scripts/styles) to render. Use Tailwind CDN if needed.",
      },
      title: {
        type: Type.STRING,
        description: "A short title for the preview tab.",
      }
    },
    required: ["code"],
  },
};

export class LLMService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined.");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async *chat(history: Message[], context: { 
    onToolCall: (calls: any[]) => Promise<any[]>,
    onStatusChange?: (status: NovaStatus) => void 
  }) {
    let contents: Content[] = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    contents = contents.filter(c => c.parts && c.parts.length > 0 && c.parts[0].text !== '');

    const tools = [
      { functionDeclarations: [listFilesTool, readFileTool, writeFileTool, deleteFileTool, setLivePreviewTool] },
      { googleSearch: {} }
    ];

    context.onStatusChange?.('thinking');

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.1,
        topP: 0.95,
        tools,
        toolConfig: { includeServerSideToolInvocations: true }
      }
    });

    if (response.functionCalls) {
      const firstTool = response.functionCalls[0].name;
      if (firstTool === 'writeFile' || firstTool === 'deleteFile') context.onStatusChange?.('coding');
      else if (firstTool === 'setLivePreview') context.onStatusChange?.('deploying');
      
      const toolResults = await context.onToolCall(response.functionCalls);
      const candidate = response.candidates?.[0];
      if (!candidate) throw new Error("No response from Nova.");
      const modelContent = candidate.content;

      const nextContents: Content[] = [
        ...contents,
        modelContent,
        { role: 'user', parts: toolResults.map(res => ({ functionResponse: res })) }
      ];

      const stream = await this.ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: nextContents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools,
          toolConfig: { includeServerSideToolInvocations: true }
        }
      });

      for await (const chunk of stream) {
        if (chunk.text) {
          yield chunk.text;
        }
      }
    } else if (response.text) {
      yield response.text;
    }
    context.onStatusChange?.('idle');
  }
}

export const llmService = new LLMService();
