import { ApiError } from '../../../lib/api';
import type { StageForm } from './config';

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function datesValid(start: string, end: string) {
  if (start && end) {
    const s = new Date(start);
    const e = new Date(end);
    if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return false;
    return e > s;
  }
  return true;
}

export function extractApiErrorMessage(err: ApiError): string {
  const body = err.body as
    | {
        error?: string;
        message?: string;
        detail?: string;
        code?: string;
      }
    | null
    | undefined;
  const primary = body?.error ?? body?.message;
  const detail = body?.detail?.trim();
  const code = body?.code?.trim();
  if (primary && detail && !primary.toLowerCase().includes(detail.toLowerCase())) {
    return code ? `${primary} (${code}): ${detail}` : `${primary}: ${detail}`;
  }
  if (primary) return code ? `${primary} (${code})` : primary;
  if (detail) return code ? `${detail} (${code})` : detail;
  return `Request failed (${err.status})`;
}

export function getStageAbbrForSeeds(
  stage: StageForm | undefined,
  eventAbbr: string,
  maxTeams: number | null,
) {
  if (stage?.abbr?.trim()) return stage.abbr.trim();
  if (stage?.stageType === 'BRACKET' && maxTeams) return `${eventAbbr}-BRK`;
  return eventAbbr;
}

export function getRoundIdForStage(stage: StageForm | undefined, idx: number) {
  if (!stage) return 'STG';
  if (stage.stageType === 'BRACKET') return `R${idx + 1}`;
  if (stage.stageType === 'ROUND_ROBIN') return 'RR';
  if (stage.stageType === 'GAUNTLET') return 'G';
  return 'C';
}

export function buildSeedsFromFormula(
  formula: string,
  eventAbbr: string,
  stageAbbr: string,
  roundId: string,
  count: number,
  hashToken?: string,
) {
  const seeds: string[] = [];
  const safeFormula = formula.trim() || '{eID}-{sID}-{i}';
  const resolvedHash = hashToken ?? generateHashToken();

  for (let idx = 1; idx <= count; idx += 1) {
    let seed = safeFormula;
    seed = seed.replace(/\{eID\}/g, eventAbbr || 'EVT');
    seed = seed.replace(/\{sID\}/g, stageAbbr || 'STG');
    seed = seed.replace(/\{rID\}/g, roundId || 'R1');
    seed = seed.replace(/\{hash\}/g, resolvedHash);

    seed = seed.replace(/\{0+i\}/g, (match) => {
      const zeros = match.length - 3;
      const padLen = Math.max(1, zeros + 1);
      return String(idx).padStart(padLen, '0');
    });

    seed = seed.replace(/\{i\}/g, String(idx));
    seeds.push(seed);
  }

  return seeds;
}

export function generateHashToken() {
  const len = 3 + Math.floor(Math.random() * 3);
  const min = 10 ** (len - 1);
  const max = 10 ** len - 1;
  const value = min + Math.floor(Math.random() * (max - min + 1));
  return String(value);
}
