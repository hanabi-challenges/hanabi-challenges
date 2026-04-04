import { useState } from 'react';
import { ApiError, postJsonAuth } from '../../../lib/api';
import {
  Button,
  Input,
  MaterialIcon,
  CoreAnchor as Anchor,
  CoreBox as Box,
  CoreTable as Table,
  CoreText as Text,
} from '../../../design-system';
import { UserPill } from '../../users/UserPill';
import type { TeamGame } from '../../../hooks/useTeamDetail';
import type { TeamTemplate } from '../../../hooks/useTeamTemplates';
import './gameRows.css';

export type TeamGameDraft = {
  replay: string;
  bdr: string;
  notes: string;
  replayError?: string | null;
  replayGameId?: string | null;
  validateStatus?: 'idle' | 'loading' | 'ok' | 'error';
  validateMessage?: string | null;
  derivedScore?: number | null;
  derivedEndCondition?: string | null;
  derivedEndConditionCode?: number | null;
  derivedPlayers?: string[];
  derivedPlayedAt?: string | null;
  validationRaw?: unknown;
};

function CreateTableLink({
  seed,
  variantName,
  teamSize,
  tablePassword,
  label,
}: {
  seed: string;
  variantName: string;
  teamSize: number;
  tablePassword?: string;
  label?: string;
}) {
  const params = new URLSearchParams({
    name: `!seed ${seed}`,
    variantName,
    deckPlays: 'false',
    emptyClues: 'false',
    detrimentalCharacters: 'false',
    oneLessCard: 'false',
    oneExtraCard: 'false',
    allOrNothing: 'false',
    maxPlayers: String(teamSize),
  });

  if (tablePassword) {
    params.set('password', tablePassword);
  }

  const query = params.toString().replace(/\+/g, '%20');
  const url = `https://hanab.live/create-table?${query}`;

  return (
    <Anchor
      href={url}
      target="_blank"
      rel="noreferrer"
      className="teamgame-link"
      title="Open create-table on hanab.live with this seed"
    >
      {label ?? 'Create table'}
    </Anchor>
  );
}

function mapEndCondition(code: number | null): string | null {
  if (code == null) return null;
  switch (code) {
    case 0:
      return 'In progress';
    case 1:
      return 'Normal';
    case 2:
      return 'Strikeout';
    case 3:
      return 'Timeout';
    case 4:
    case 10:
      return 'VTK';
    case 5:
      return 'Speedrun fail';
    case 6:
      return 'Idle timeout';
    case 7:
      return 'Character softlock';
    case 8:
      return 'All or nothing fail';
    case 9:
      return 'All or nothing softlock';
    default:
      return `Code ${code}`;
  }
}

function StatusIcon({
  draft,
}: {
  draft: {
    validateStatus?: 'idle' | 'loading' | 'ok' | 'error';
    validateMessage?: string | null;
    replayError?: string | null;
  };
}) {
  if (draft.replayError) {
    return (
      <MaterialIcon name="error" ariaLabel="error" ariaHidden={false} title={draft.replayError} />
    );
  }
  if (draft.validateStatus === 'loading') {
    return (
      <MaterialIcon
        name="autorenew"
        ariaLabel="loading"
        ariaHidden={false}
        title="Validating replay…"
      />
    );
  }
  if (draft.validateStatus === 'ok') {
    return (
      <MaterialIcon
        name="check_circle"
        ariaLabel="ok"
        ariaHidden={false}
        title={draft.validateMessage ?? 'Valid replay'}
      />
    );
  }
  if (draft.validateStatus === 'error') {
    return (
      <MaterialIcon
        name="error"
        ariaLabel="error"
        ariaHidden={false}
        title={draft.validateMessage ?? 'Validation failed'}
      />
    );
  }
  return null;
}

export function groupTemplatesByStage(templates: TeamTemplate[]) {
  const map = new Map<
    string,
    {
      stage_label: string;
      stage_type: string;
      stage_index: number;
      stage_status?: string | null;
      templates: TeamTemplate[];
      stats?: { games_played: number; perfect_games: number };
    }
  >();
  templates.forEach((tpl) => {
    const key = `${tpl.stage_index}-${tpl.stage_label}`;
    if (tpl.stage_status === 'not_started') {
      return;
    }
    if (!map.has(key)) {
      map.set(key, {
        stage_label: tpl.stage_label,
        stage_type: tpl.stage_type,
        stage_index: tpl.stage_index,
        stage_status: tpl.stage_status,
        templates: [],
        stats: tpl.stats,
      });
    }
    const existing = map.get(key);
    if (!existing?.stats && tpl.stats) {
      map.get(key)!.stats = tpl.stats;
    }
    map.get(key)!.templates.push(tpl);
  });
  return Array.from(map.values()).sort((a, b) => {
    const rank = (s?: string | null) => (s === 'in_progress' ? 0 : s === 'complete' ? 1 : 2);
    const ra = rank(a.stage_status);
    const rb = rank(b.stage_status);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.stage_index - b.stage_index;
    if (ra === 1) return b.stage_index - a.stage_index;
    return a.stage_index - b.stage_index;
  });
}

export function PlayedRow({
  template,
  fallbackGame,
}: {
  template: TeamTemplate;
  fallbackGame?: TeamGame;
}) {
  const r = template.result!;
  const playedAtIso = r.played_at ?? fallbackGame?.played_at ?? null;
  const playedAt = playedAtIso ? new Date(playedAtIso) : null;
  const score = r.score ?? fallbackGame?.score ?? '';
  const reason = r.zero_reason ?? fallbackGame?.zero_reason ?? '';
  const players =
    (template.result?.players as
      | { display_name: string; color_hex: string; text_color: string }[]
      | undefined) ??
    fallbackGame?.players ??
    [];

  return (
    <Table.Tr className="teamgame-row">
      <Table.Td className="teamgame-cell">{template.template_index}</Table.Td>
      <Table.Td className="teamgame-cell">{template.variant}</Table.Td>
      <Table.Td className="teamgame-cell teamgame-cell-right">{score}</Table.Td>
      <Table.Td className="teamgame-cell">{reason || 'Normal'}</Table.Td>
      <Table.Td className="teamgame-cell teamgame-cell-right">{r.bottom_deck_risk ?? ''}</Table.Td>
      <Table.Td className="teamgame-cell">
        {players.length > 0 ? (
          <Box className="pill-row">
            {players.map((p) => (
              <UserPill
                key={p.display_name}
                name={p.display_name}
                color={p.color_hex}
                textColor={p.text_color}
              />
            ))}
          </Box>
        ) : (
          <Text component="span" className="teamgame-empty">
            —
          </Text>
        )}
      </Table.Td>
      <Table.Td className="teamgame-cell">{playedAt ? playedAt.toLocaleDateString() : ''}</Table.Td>
      <Table.Td className="teamgame-cell">
        {r.hanab_game_id ? (
          <Anchor
            href={`https://hanab.live/replay/${r.hanab_game_id}`}
            className="teamgame-link"
            target="_blank"
            rel="noreferrer"
          >
            {r.hanab_game_id}
          </Anchor>
        ) : (
          ''
        )}
      </Table.Td>
      <Table.Td className="teamgame-cell">
        {r.notes && (
          <MaterialIcon name="note" ariaLabel="Notes" ariaHidden={false} title={r.notes} />
        )}
      </Table.Td>
    </Table.Tr>
  );
}

export function UnplayedRow({
  template,
  draft,
  teamSize,
  tablePassword,
  showCreateLink,
  slug,
  teamId,
  token,
  editable,
  onDraftChange,
  memberColors,
}: {
  template: TeamTemplate;
  draft: TeamGameDraft;
  teamSize: number;
  tablePassword?: string;
  showCreateLink: boolean;
  slug: string;
  teamId: number;
  token?: string;
  editable: boolean;
  onDraftChange: (next: TeamGameDraft) => void;
  memberColors: Record<string, { color: string; textColor: string }>;
}) {
  const [showNotes, setShowNotes] = useState(
    Boolean(draft.replay) || Boolean(draft.bdr) || Boolean(draft.notes),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = (patch: Partial<TeamGameDraft>) => {
    const next = { ...draft, ...patch };
    onDraftChange(next);
    setShowNotes(Boolean(next.replay) || Boolean(next.bdr) || Boolean(next.notes));
  };

  const validateReplay = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      update({
        replay: '',
        replayError: null,
        replayGameId: null,
        validateStatus: 'idle',
        validateMessage: null,
        derivedScore: null,
        derivedEndCondition: null,
        derivedEndConditionCode: null,
        derivedPlayers: [],
        derivedPlayedAt: null,
        validationRaw: null,
      });
      return;
    }
    const matchUrl = trimmed.match(/(?:replay|shared-replay)\/(\d+)/i);
    const matchId = trimmed.match(/^\d+$/);
    const gameId = matchUrl ? matchUrl[1] : matchId ? matchId[0] : null;
    if (!gameId) {
      update({
        replay: '',
        replayError: 'Unable to parse game ID from link',
        replayGameId: null,
        validateStatus: 'error',
        derivedScore: null,
        derivedEndCondition: null,
        derivedEndConditionCode: null,
        derivedPlayers: [],
        derivedPlayedAt: null,
        validationRaw: null,
      });
      return;
    }

    update({
      replay: gameId,
      replayError: null,
      replayGameId: gameId,
      validateStatus: 'loading',
      validateMessage: null,
      derivedScore: null,
      derivedEndCondition: null,
      derivedEndConditionCode: null,
      derivedPlayers: [],
      derivedPlayedAt: null,
      validationRaw: null,
    });

    validateReplayRemote(gameId, trimmed);
  };

  const validateReplayRemote = async (gameId: string, replayValue: string) => {
    if (!replayValue || !gameId) return;

    if (!editable) {
      update({
        validateStatus: 'error',
        validateMessage: 'Not authorized to validate (not a team member).',
      });
      return;
    }
    if (!token) {
      update({
        validateStatus: 'error',
        validateMessage: 'No auth token available.',
      });
      return;
    }
    if (!slug) {
      update({
        validateStatus: 'error',
        validateMessage: 'Missing event slug.',
      });
      return;
    }

    update({ validateStatus: 'loading', validateMessage: null });
    try {
      const resp = await postJsonAuth<{
        ok: boolean;
        derived?: { variant?: string; score?: number; endCondition?: number; playedAt?: string };
        export?: { seed?: string; players?: string[] };
        raw?: unknown;
      }>(
        `/events/${encodeURIComponent(slug)}/teams/${teamId}/validate-replay?template_id=${template.template_id}`,
        token,
        {
          template_id: template.template_id,
          replay: replayValue,
        },
      );
      if (resp.ok) {
        const mappedEnd = mapEndCondition(resp.derived?.endCondition ?? null);
        update({
          validateStatus: 'ok',
          validateMessage: 'Replay matches team, seed, and variant.',
          replay: gameId,
          replayGameId: gameId,
          derivedScore: resp.derived?.score ?? null,
          derivedEndCondition: mappedEnd,
          derivedEndConditionCode: resp.derived?.endCondition ?? null,
          derivedPlayers: resp.export?.players ?? [],
          derivedPlayedAt: resp.derived?.playedAt ?? null,
          validationRaw: resp,
        });
      } else {
        update({
          validateStatus: 'error',
          validateMessage: 'Validation failed.',
          replayGameId: null,
          derivedScore: null,
          derivedEndCondition: null,
          derivedEndConditionCode: null,
          derivedPlayers: [],
          derivedPlayedAt: null,
          validationRaw: resp,
        });
      }
    } catch (err) {
      const bodyError =
        err instanceof ApiError ? (err.body as { error?: string; details?: string })?.error : null;
      const bodyDetails =
        err instanceof ApiError
          ? (err.body as { error?: string; details?: string })?.details
          : null;
      const message =
        err instanceof ApiError
          ? (bodyError ?? `Validation failed (status ${err.status})`)
          : `Validation failed: ${(err as Error)?.message ?? String(err)}`;
      const detail = bodyDetails ? ` Details: ${bodyDetails}` : '';
      update({
        validateStatus: 'error',
        validateMessage: `${message}${detail ? ' - ' + detail : ''}`,
        replayGameId: null,
        derivedScore: null,
        derivedEndCondition: null,
        derivedEndConditionCode: null,
        derivedPlayers: [],
        derivedPlayedAt: null,
        validationRaw:
          err instanceof ApiError
            ? { status: err.status, body: err.body }
            : { error: (err as Error)?.message ?? String(err) },
      });
    }
  };

  const handleSubmit = async () => {
    if (!editable) return;
    setSubmitError(null);
    if (!token) {
      setSubmitError('Not authenticated.');
      return;
    }
    if (!draft.replay) {
      setSubmitError('Enter a game ID or replay URL.');
      return;
    }

    setSubmitting(true);
    try {
      await postJsonAuth(
        `/events/${encodeURIComponent(slug)}/teams/${teamId}/submit-replay`,
        token,
        {
          template_id: template.template_id,
          replay: draft.replay,
          bottom_deck_risk: draft.bdr ? Number(draft.bdr) : null,
          notes: draft.notes || null,
        },
      );
      window.location.reload();
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { error?: string }) : null;
      const message =
        body?.error ??
        (err instanceof ApiError
          ? `Submit failed (status ${err.status})`
          : ((err as Error)?.message ?? 'Submit failed'));
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Table.Tr className="teamgame-row">
        <Table.Td className="teamgame-cell">
          {showCreateLink && template.seed_payload ? (
            <CreateTableLink
              seed={template.seed_payload}
              variantName={template.variant}
              teamSize={teamSize}
              tablePassword={tablePassword}
              label={String(template.template_index)}
            />
          ) : (
            <Text component="span">{template.template_index}</Text>
          )}
        </Table.Td>
        <Table.Td className="teamgame-cell">{template.variant}</Table.Td>
        <Table.Td className="teamgame-cell teamgame-cell-right">
          {draft.derivedScore != null ? draft.derivedScore : ''}
        </Table.Td>
        <Table.Td className="teamgame-cell">
          {draft.derivedEndCondition ? draft.derivedEndCondition : ''}
        </Table.Td>
        <Table.Td className="teamgame-cell teamgame-cell-right">
          {editable ? (
            <Input
              style={{ width: '72px' }}
              placeholder="BDR"
              value={draft.bdr}
              onChange={(e) => update({ bdr: e.target.value })}
              fullWidth
            />
          ) : (
            ''
          )}
        </Table.Td>
        <Table.Td className="teamgame-cell">
          {draft.derivedPlayers && draft.derivedPlayers.length > 0 ? (
            <Box className="pill-row">
              {draft.derivedPlayers.map((p) => (
                <UserPill
                  key={p}
                  name={p}
                  color={memberColors[p]?.color ?? '#777777'}
                  textColor={memberColors[p]?.textColor ?? '#ffffff'}
                />
              ))}
            </Box>
          ) : (
            ''
          )}
        </Table.Td>
        <Table.Td className="teamgame-cell">
          {draft.derivedPlayedAt ? (
            <Text component="span">{new Date(draft.derivedPlayedAt).toLocaleDateString()}</Text>
          ) : (
            ''
          )}
        </Table.Td>
        <Table.Td className="teamgame-cell">
          {editable ? (
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto auto auto',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <Input
                style={{ maxWidth: '150px', minWidth: '120px' }}
                placeholder="Game ID or URL"
                value={draft.replay}
                onChange={(e) => validateReplay(e.target.value)}
                fullWidth
              />
              <StatusIcon draft={draft} />
              <Button
                variant="primary"
                size="sm"
                disabled={
                  !draft.replay ||
                  Boolean(draft.replayError) ||
                  draft.validateStatus !== 'ok' ||
                  submitting
                }
                onClick={handleSubmit}
                aria-label="Submit"
              >
                <MaterialIcon name="check" />
              </Button>
            </Box>
          ) : (
            ''
          )}
        </Table.Td>
        <Table.Td className="teamgame-cell teamgame-empty"></Table.Td>
      </Table.Tr>
      {showNotes && (
        <Table.Tr className="teamgame-notes-row">
          <Table.Td colSpan={9} className="teamgame-cell">
            <Text component="label" className="teamgame-notes-label">
              Notes (optional)
            </Text>
            <Input
              multiline
              rows={Math.max(1, draft.notes.split('\n').length + 1)}
              placeholder="Add notes about this game"
              value={draft.notes}
              onChange={(e) => update({ notes: e.target.value })}
              disabled={!editable}
              fullWidth
            />
          </Table.Td>
        </Table.Tr>
      )}
      {draft.validateStatus === 'error' && draft.validateMessage && (
        <Table.Tr className="teamgame-error-row">
          <Table.Td colSpan={9} className="teamgame-error-cell">
            {draft.validateMessage}
          </Table.Td>
        </Table.Tr>
      )}
      {submitError && (
        <Table.Tr className="teamgame-error-row">
          <Table.Td colSpan={9} className="teamgame-error-cell">
            {submitError}
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}
