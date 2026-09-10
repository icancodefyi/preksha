import ReactMarkdown from "react-markdown";

// Renders LLM answer markdown (bold, lists, paragraphs) with the app's own
// typography instead of react-markdown's default <p>/<ul> styling — the
// Groq responses come back with real markdown ("**bold**", "- item"), which
// was previously shown as literal asterisks/dashes in a plain <p> tag.
export function MarkdownAnswer({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[17px] font-medium leading-[1.5] tracking-[-0.02em] text-neutral-950 sm:text-[18px]">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="leading-[1.55]">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-neutral-950">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="ml-1 list-disc space-y-1.5 pl-4 text-[15px] leading-[1.5] font-normal text-neutral-800 sm:text-[16px]">{children}</ul>,
          ol: ({ children }) => <ol className="ml-1 list-decimal space-y-1.5 pl-4 text-[15px] leading-[1.5] font-normal text-neutral-800 sm:text-[16px]">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          code: ({ children }) => (
            <code className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-800">{children}</code>
          ),
          a: ({ children, href }) => (
            <a href={href} className="underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-950" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          h1: ({ children }) => <p className="text-[15px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{children}</p>,
          h2: ({ children }) => <p className="text-[15px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{children}</p>,
          h3: ({ children }) => <p className="text-[15px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{children}</p>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
