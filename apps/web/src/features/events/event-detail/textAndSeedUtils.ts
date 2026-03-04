export function firstHeadingSectionMarkdown(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) return '';
  const lines = trimmed.split('\n');
  const firstHeadingIndex = lines.findIndex((line) => /^#{1,6}\s+/.test(line.trim()));

  if (firstHeadingIndex === -1) {
    const paragraphBreak = lines.findIndex((line) => line.trim() === '');
    if (paragraphBreak <= 0) return trimmed;
    return lines.slice(0, paragraphBreak).join('\n').trim();
  }

  let nextHeadingIndex = lines.length;
  for (let i = firstHeadingIndex + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s+/.test(lines[i].trim())) {
      nextHeadingIndex = i;
      break;
    }
  }

  return lines.slice(firstHeadingIndex, nextHeadingIndex).join('\n').trim();
}

export function parseRoundSeedPayload(seedPayload: string | null): {
  variant: string;
  seed: string;
} {
  if (!seedPayload) return { variant: '', seed: '' };
  try {
    const parsed = JSON.parse(seedPayload) as { variant?: unknown; seed?: unknown };
    return {
      variant: typeof parsed.variant === 'string' ? parsed.variant : '',
      seed: typeof parsed.seed === 'string' ? parsed.seed : '',
    };
  } catch {
    return { variant: '', seed: seedPayload };
  }
}

export function formatDateRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt && !endsAt) return '';
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (start && end) return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  if (start) return `Starts ${start.toLocaleDateString()}`;
  if (end) return `Ends ${end.toLocaleDateString()}`;
  return '';
}
