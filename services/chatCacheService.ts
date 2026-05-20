import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cacheDirectory } from "@/lib/paths";
import type { ChatAnswer } from "@/types/chat";
import type { SearchResult } from "@/types/document";
import type { GuardrailsConfig } from "@/types/guardrails";

export interface ChatCacheInput {
  question: string;
  guardrails: GuardrailsConfig;
  contextChunks: SearchResult[];
  folderIdentifier: string;
}

interface ChatCacheEntry {
  createdAt: string;
  key: string;
  answer: ChatAnswer;
}

export function buildChatCacheKey(input: ChatCacheInput): string {
  const stablePayload = {
    question: input.question.trim().toLowerCase(),
    guardrails: input.guardrails,
    folderIdentifier: input.folderIdentifier,
    chunks: input.contextChunks.map((chunk) => ({
      fileName: chunk.fileName,
      relativePath: chunk.relativePath,
      snippet: chunk.snippet,
      webUrl: chunk.webUrl,
      checksum: crypto.createHash("sha256").update(chunk.snippet).digest("hex")
    }))
  };

  return crypto.createHash("sha256").update(JSON.stringify(stablePayload)).digest("hex");
}

export async function getCachedChatAnswer(key: string): Promise<ChatAnswer | null> {
  try {
    const raw = await fs.readFile(cachePathForKey(key), "utf8");
    const entry = JSON.parse(raw) as ChatCacheEntry;
    return {
      ...entry.answer,
      fromCache: true
    };
  } catch {
    return null;
  }
}

export async function saveCachedChatAnswer(key: string, answer: ChatAnswer): Promise<void> {
  await fs.mkdir(cacheDirectory, { recursive: true });
  const entry: ChatCacheEntry = {
    createdAt: new Date().toISOString(),
    key,
    answer: {
      ...answer,
      fromCache: false
    }
  };

  await fs.writeFile(cachePathForKey(key), `${JSON.stringify(entry, null, 2)}\n`, {
    mode: 0o600
  });
}

function cachePathForKey(key: string): string {
  return path.join(cacheDirectory, `${key}.json`);
}
