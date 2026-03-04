export function normalizeMaterialIconToken(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^material-symbols:/, '')
    .replaceAll('_', '-')
    .replaceAll(' ', '-')
    .replace(/-+/g, '-');
}

export async function resolveMaterialIconPath(
  tokenInput: string,
): Promise<{ token: string; path: string }> {
  const token = normalizeMaterialIconToken(tokenInput);
  if (!token) {
    throw new Error('Icon token is required.');
  }

  const response = await fetch(
    `https://api.iconify.design/material-symbols/${encodeURIComponent(token)}.svg`,
  );
  if (!response.ok) {
    throw new Error(`Unknown Material icon: "${tokenInput}"`);
  }

  const svg = await response.text();
  const matches = Array.from(svg.matchAll(/<path[^>]*\sd="([^"]+)"/g));
  const path = matches
    .map((match) => match[1])
    .filter(Boolean)
    .join(' ');
  if (!path) {
    throw new Error(`No vector path found for icon "${tokenInput}"`);
  }

  return { token, path };
}
