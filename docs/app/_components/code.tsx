import { codeToHtml } from "shiki";

type Props = {
  code: string;
  lang?: string;
  filename?: string;
};

export async function Code({ code, lang = "typescript", filename }: Props) {
  const html = await codeToHtml(code.trim(), {
    lang,
    themes: { light: "github-light-default", dark: "github-dark-default" },
  });

  return (
    <figure className="code-block">
      {filename && <figcaption className="code-filename">{filename}</figcaption>}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <CopyButton code={code.trim()} />
    </figure>
  );
}

function CopyButton({ code }: { code: string }) {
  return (
    <button
      className="code-copy"
      data-code={code}
      aria-label="Copy to clipboard"
      title="Copy"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
        <path d="M10.5 5.5V3.5a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2" />
      </svg>
    </button>
  );
}
