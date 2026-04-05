import {
  Card,
  CardBody,
  EloDelta,
  Grid,
  Inline,
  Table,
  Text,
  CoreAnchor as Anchor,
} from '../../../design-system';
import { UserPill } from '../../users/UserPill';
import type { LeagueResultsSummary, SessionRound } from './types';

function rankByValue<T>(rows: T[], valueOf: (row: T) => number): number[] {
  const ranks: number[] = [];
  let previousValue: number | null = null;
  let previousRank = 0;
  rows.forEach((row, index) => {
    const value = valueOf(row);
    if (previousValue == null || value !== previousValue) {
      previousRank = index + 1;
      previousValue = value;
    }
    ranks.push(previousRank);
  });
  return ranks;
}

export function LeagueResultsTables(props: { summary: LeagueResultsSummary; resultsTab: string }) {
  const { summary, resultsTab } = props;

  if (!summary) {
    return <Text variant="muted">No results yet.</Text>;
  }

  if (resultsTab === 'standings') {
    const standings = [...summary.standings].sort(
      (a, b) => b.rating - a.rating || a.display_name.localeCompare(b.display_name),
    );
    const ranks = rankByValue(standings, (row) => row.rating);

    const sessionRowsByUser = new Map<number, Map<number, { rank: number; elo_delta: number }>>();
    for (const session of summary.sessions) {
      const sessionElo = summary.session_elo
        .filter((row) => row.session_id === session.id)
        .sort((a, b) => b.elo_delta - a.elo_delta || a.display_name.localeCompare(b.display_name));
      const sessionRanks = rankByValue(sessionElo, (row) => row.elo_delta);
      sessionElo.forEach((row, idx) => {
        if (!sessionRowsByUser.has(row.user_id)) {
          sessionRowsByUser.set(row.user_id, new Map());
        }
        sessionRowsByUser.get(row.user_id)!.set(session.id, {
          rank: sessionRanks[idx],
          elo_delta: row.elo_delta,
        });
      });
    }

    return (
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Rank</Table.Th>
            <Table.Th>Name</Table.Th>
            {summary.sessions.map((s) => (
              <Table.Th key={s.id}>S{s.session_index}</Table.Th>
            ))}
            <Table.Th>Final ELO</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {standings.map((row, idx) => (
            <Table.Tr key={row.user_id}>
              <Table.Td>{ranks[idx]}</Table.Td>
              <Table.Td>
                <UserPill name={row.display_name} />
              </Table.Td>
              {summary.sessions.map((s) => {
                const sessionData = sessionRowsByUser.get(row.user_id)?.get(s.id);
                if (!sessionData) return <Table.Td key={`${row.user_id}-${s.id}`}>—</Table.Td>;
                return (
                  <Table.Td key={`${row.user_id}-${s.id}`}>
                    <Inline gap="xs" align="center">
                      <Text>{sessionData.rank}</Text>
                      <Text>(</Text>
                      <EloDelta delta={sessionData.elo_delta} />
                      <Text>)</Text>
                    </Inline>
                  </Table.Td>
                );
              })}
              <Table.Td>{row.rating.toFixed(1)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    );
  }

  const sessionId = Number(resultsTab.replace('session-', ''));
  const session = summary.sessions.find((s) => s.id === sessionId);
  if (!session) {
    return <Text variant="muted">Select a session.</Text>;
  }

  const sessionRows = summary.session_elo
    .filter((row) => row.session_id === session.id)
    .sort((a, b) => b.final_elo - a.final_elo || a.display_name.localeCompare(b.display_name));
  const sessionRanks = rankByValue(sessionRows, (row) => row.final_elo);

  const placementByUserRound = new Map<string, number>();
  summary.placements
    .filter((row) => row.session_id === session.id)
    .forEach((row) => {
      placementByUserRound.set(`${row.user_id}:${row.round_index}`, row.placement);
    });

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Rank</Table.Th>
          <Table.Th>Name</Table.Th>
          <Table.Th>Starting ELO</Table.Th>
          {Array.from({ length: session.round_count }, (_unused, idx) => (
            <Table.Th key={`g-${idx + 1}`}>G{idx + 1}</Table.Th>
          ))}
          <Table.Th>Final ELO</Table.Th>
          <Table.Th>ELO Change</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {sessionRows.map((row, idx) => {
          return (
            <Table.Tr key={`${row.user_id}-${session.id}`}>
              <Table.Td>{sessionRanks[idx]}</Table.Td>
              <Table.Td>
                <UserPill name={row.display_name} />
              </Table.Td>
              <Table.Td>{row.starting_elo.toFixed(1)}</Table.Td>
              {Array.from({ length: session.round_count }, (_unused, roundIdx) => {
                const placement = placementByUserRound.get(`${row.user_id}:${roundIdx + 1}`);
                return (
                  <Table.Td key={`${row.user_id}-${roundIdx + 1}`}>{placement ?? '—'}</Table.Td>
                );
              })}
              <Table.Td>{row.final_elo.toFixed(1)}</Table.Td>
              <Table.Td>
                <EloDelta delta={row.elo_delta} />
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

export function LeagueGameBlocks(props: {
  round: SessionRound | null;
  roundPlayers: Array<{
    round_id: number;
    user_id: number;
    display_name: string;
    role: 'playing' | 'spectating';
    assigned_team_no: number | null;
  }>;
  roundResults: Array<{
    round_id: number;
    team_no: number;
    score: number;
    submitted_at: string;
    submitted_by_user_id: number | null;
    replay_game_id: string | null;
  }>;
  ratingHistory: Array<{
    round_id: number;
    user_id: number;
    display_name: string;
    old_rating: number;
    delta_competitive: number;
    delta_participation: number;
    new_rating: number;
  }>;
  directoryById: Map<number, { color_hex: string; text_color: string }>;
}) {
  if (!props.round) {
    return <Text variant="muted">Select a game.</Text>;
  }
  const round = props.round;

  const teams = new Map<number, Array<{ user_id: number; display_name: string }>>();
  props.roundPlayers
    .filter((p) => p.round_id === round.id && p.role === 'playing' && p.assigned_team_no != null)
    .forEach((player) => {
      const teamNo = Number(player.assigned_team_no);
      if (!teams.has(teamNo)) teams.set(teamNo, []);
      teams.get(teamNo)!.push({
        user_id: player.user_id,
        display_name: player.display_name,
      });
    });

  const orderedTeamNos = [...teams.keys()].sort((a, b) => a - b);
  if (orderedTeamNos.length === 0) {
    return <Text variant="muted">No assigned teams for this game.</Text>;
  }

  const historyByUser = new Map<number, { new_rating: number; delta: number }>();
  props.ratingHistory
    .filter((row) => row.round_id === round.id)
    .forEach((row) => {
      historyByUser.set(row.user_id, {
        new_rating: row.new_rating,
        delta: row.delta_competitive + row.delta_participation,
      });
    });

  return (
    <Grid columns="repeat(3, minmax(0, 1fr))" gap="md">
      {orderedTeamNos.map((teamNo) => {
        const players = (teams.get(teamNo) ?? []).sort((a, b) =>
          a.display_name.localeCompare(b.display_name),
        );
        const result = props.roundResults.find(
          (r) => r.round_id === round.id && r.team_no === teamNo,
        );
        const isForfeit = Boolean(result && result.submitted_by_user_id == null);
        return (
          <Card key={teamNo} variant="outline">
            <CardBody>
              <Table style={{ width: '100%' }}>
                <Table.Tbody>
                  {players.map((player, index) => {
                    const rating = historyByUser.get(player.user_id);
                    return (
                      <Table.Tr key={player.user_id}>
                        <Table.Td style={{ padding: '0.25rem 0.25rem 0.25rem 0' }}>
                          <UserPill
                            name={player.display_name}
                            color={props.directoryById.get(player.user_id)?.color_hex}
                            textColor={props.directoryById.get(player.user_id)?.text_color}
                            size="sm"
                          />
                        </Table.Td>
                        {index === 0 ? (
                          <Table.Td
                            rowSpan={Math.max(players.length, 1)}
                            style={{
                              textAlign: 'center',
                              verticalAlign: 'middle',
                              width: '5rem',
                              fontWeight: 600,
                            }}
                          >
                            {result ? (
                              !isForfeit && result.replay_game_id ? (
                                <Anchor
                                  href={`https://hanab.live/replay/${result.replay_game_id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {result.score}
                                </Anchor>
                              ) : (
                                result.score
                              )
                            ) : (
                              '—'
                            )}
                          </Table.Td>
                        ) : null}
                        <Table.Td
                          style={{ padding: '0.25rem 0 0.25rem 0.5rem', whiteSpace: 'nowrap' }}
                        >
                          {rating ? (
                            <Inline gap="xs" align="center">
                              <Text>{rating.new_rating.toFixed(1)}</Text>
                              <Text>(</Text>
                              <EloDelta delta={rating.delta} />
                              <Text>)</Text>
                            </Inline>
                          ) : (
                            '—'
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </CardBody>
          </Card>
        );
      })}
    </Grid>
  );
}
