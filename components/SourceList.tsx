"use client";

import { FileText } from "lucide-react";
import type { SourceReference } from "@/types/document";

interface SourceListProps {
  sources: SourceReference[];
}

export function SourceList({ sources }: SourceListProps) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="source-list" aria-label="Source references">
      {sources.map((source, index) => (
        <article className="source-item" key={`${source.fileName}-${index}`}>
          <h3 className="source-title">
            <FileText aria-hidden="true" size={16} />
            {source.webUrl ? (
              <a href={source.webUrl} rel="noreferrer" target="_blank">
                {source.relativePath || source.fileName}
              </a>
            ) : (
              source.relativePath || source.fileName
            )}
          </h3>
          {source.pageCount ? <p className="source-meta">{source.pageCount} pages</p> : null}
          <p>{source.snippet}</p>
        </article>
      ))}
    </div>
  );
}
