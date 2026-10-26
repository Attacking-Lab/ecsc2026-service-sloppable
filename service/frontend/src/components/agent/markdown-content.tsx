import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { SlopscriptCode } from "@/components/slopscript-code";

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-content min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} rel="noreferrer noopener" target="_blank">
              {children}
            </a>
          ),
          code: ({ children, className }) => (
            <code className={className}>
              {/\blanguage-slop(script)?\b/.test(className ?? "") ? (
                <SlopscriptCode source={String(children)} />
              ) : (
                children
              )}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
