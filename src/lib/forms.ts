export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const expected = process.env.PUBLIC_SITE_ORIGIN || new URL(request.url).origin;
  return Boolean(origin && origin === expected);
}

export async function readForm(request: Request, maxBytes = 128_000): Promise<URLSearchParams> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('application/x-www-form-urlencoded')) throw new Error('unsupported-content-type');
  const reader = request.body?.getReader();
  if (!reader) return new URLSearchParams();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error('body-too-large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new URLSearchParams(new TextDecoder().decode(bytes));
}

export function seeOther(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}
