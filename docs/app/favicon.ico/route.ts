export function GET(request: Request): Response {
  return new Response(null, {
    status: 308,
    headers: {
      location: new URL("/icon.png", request.url).toString(),
      "cache-control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
