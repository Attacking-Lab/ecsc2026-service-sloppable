export interface RuntimeRenderResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export async function renderViaRuntime(
  caller: string,
  namespace: string,
  name: string,
  query?: Record<string, string>,
): Promise<RuntimeRenderResult> {
  const url = new URL(
    `http://runtime/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
  );
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.append(k, v);
    }
  }

  const res = await fetch(url, {
    method: "GET",
    headers: { "X-Caller": caller },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`runtime returned HTTP ${res.status}: ${body}`);
  }

  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return { status: res.status, body, headers };
}
