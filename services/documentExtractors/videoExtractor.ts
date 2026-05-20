import fs from "node:fs/promises";
import path from "node:path";

export interface VideoExtractionInput {
  filePath: string;
  fileName: string;
  relativePath: string;
  metadataOnly?: boolean;
}

const transcriptExtensions = [".txt", ".vtt"];

export async function extractVideoMetadata(input: VideoExtractionInput): Promise<{
  text: string;
  metadata: {
    transcriptPath?: string;
  };
  transcriptLinked: boolean;
}> {
  const transcript = input.metadataOnly
    ? null
    : await readNearbyTranscript(input.filePath, input.relativePath);
  const folder = path.dirname(input.relativePath) === "." ? "Root" : path.dirname(input.relativePath);
  const baseText = [
    `Video asset: ${stripExtension(input.fileName)}`,
    `File: ${input.fileName}`,
    `Path: ${input.relativePath}`,
    `Category: ${folder}`,
    "TODO: add speech-to-text transcript generation and thumbnail previews."
  ].join("\n");

  if (transcript) {
    return {
      text: `${baseText}\nTranscript:\n${transcript.text}`,
      metadata: {
        transcriptPath: transcript.relativePath
      },
      transcriptLinked: true
    };
  }

  return {
    text: baseText,
    metadata: {},
    transcriptLinked: false
  };
}

async function readNearbyTranscript(
  filePath: string,
  videoRelativePath: string
): Promise<{ text: string; relativePath: string } | null> {
  const directory = path.dirname(filePath);
  const basename = path.basename(filePath, path.extname(filePath));
  const relativeDirectory = path.posix.dirname(videoRelativePath);

  for (const extension of transcriptExtensions) {
    const transcriptPath = path.join(
      /* turbopackIgnore: true */ directory,
      `${basename}${extension}`
    );

    try {
      const stats = await fs.stat(/* turbopackIgnore: true */ transcriptPath);
      if (!stats.isFile() || stats.size > 2_000_000) {
        continue;
      }

      const text = (await fs.readFile(/* turbopackIgnore: true */ transcriptPath, "utf8"))
        .replace(/^WEBVTT\s*/i, "")
        .replace(/\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (text) {
        return {
          text,
          relativePath:
            relativeDirectory === "."
              ? path.basename(transcriptPath)
              : `${relativeDirectory}/${path.basename(transcriptPath)}`
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}
