import { DOCS_PAGES, GITHUB_URL, SITE_DESCRIPTION, SITE_URL } from "../../lib/site";

export function GET(): Response {
  const docs = Object.values(DOCS_PAGES)
    .map(({ path, title, description }) =>
      `- [${title}](${new URL(path, SITE_URL).toString()}): ${description}`,
    )
    .join("\n");

  const body = `# NotifyKit

> ${SITE_DESCRIPTION}

NotifyKit is an open-source TypeScript framework for application-owned notification infrastructure. It is a library inside your application, not a hosted notification control plane.

## Links

- [Website](${SITE_URL.toString()})
- [GitHub](${GITHUB_URL})
- [Live demo](${new URL("/demo", SITE_URL).toString()})

## Documentation

${docs}
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
