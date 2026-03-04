BEGIN;

-- Wipe existing data (and reset sequences)
TRUNCATE TABLE
  event_badge_awards,
  event_badges,
  pending_team_members,
  event_stage_team_statuses,
  game_participants,
  event_games,
  event_game_templates,
  event_player_eligibilities,
  team_memberships,
  event_teams,
  event_stages,
  events,
  users
RESTART IDENTITY CASCADE;

-- ================================
-- Users
-- ================================
INSERT INTO users (display_name, password_hash, role, color_hex, text_color)
VALUES
  ('alice',  '$2b$12$O1H7mQfsdGrTQZJ9u9DYF.wslBggsNktWnzr/EPLcBlagzDXF6Qi6', 'SUPERADMIN', '#7aa6ff', '#000000'),
  ('bob',    '$2b$12$f6kS7j/s2m0SQ6NeQ5XmueWyxwjJ/7zjpwIUpFCXNyG1XqGSevqK.', 'ADMIN', '#f6a5c0', '#000000'),
  ('cathy',  '$2b$12$3LAjRP5oRj34sTOv6PmVJui5Tw8uzAl317K4V8lZA5WWtTVdmY6PC', 'ADMIN', '#5fd0b8', '#000000'),
  ('donald', '$2b$12$CHDTGUSxfbxAuKv4jlX95ur1MFjNKBejDJyZQx60G7ICxdNpTkcEa', 'USER', '#ffcc80', '#000000'),
  ('emily',  '$2b$12$fN2p.HkwZPzF5eeh7mCDIOYxnzKMIXtmyJdj5DLk4Rl0lkqeSHV.m', 'USER', '#b388ff', '#ffffff'),
  ('frank',  '$2b$12$2SXylYSxmEPXZXtfhCzbTeDx3gNrhDeochghQNh8ukjUkSAVkQ8zm', 'USER', '#90caf9', '#000000'),
  ('grace',  '$2b$12$VJt0MxY2/lX5bYHQDBoHnOP5hMNpHpzTgLTCV/cAG.JsCJGIk/f/C', 'USER', '#ffab91', '#000000');

-- IDs:
-- 1 = alice, 2 = bob, 3 = cathy, 4 = donald, 5 = emily, 6 = frank, 7 = grace


-- ================================
-- Events
-- ================================
INSERT INTO events (
  name,
  slug,
  short_description,
  long_description,
  published,
  allow_late_registration,
  registration_cutoff,
  starts_at,
  ends_at
)
VALUES
  (
    'Spring Circuit 2025',
    'spring-circuit-2025',
    'Seasonal spring ladder',
    $$A seasonal circuit with mixed variants and rotating seeds.\nPlay clean, log your replays, and chase consistency across the whole stage.$$,
    TRUE,
    TRUE,
    '2025-02-25T00:00:00Z',
    '2025-03-01T00:00:00Z',
    '2025-06-01T00:00:00Z'
  ),
  (
    'Summer Sprint 2025',
    'summer-sprint-2025',
    'Fast-paced sprint event',
    $$Short sprint focused on quick plays. Mix of variants with fixed seeds for fairness.$$,
    FALSE,
    FALSE,
    '2025-06-25T00:00:00Z',
    '2025-07-01T00:00:00Z',
    '2025-09-01T00:00:00Z'
  );

-- event_ids:
-- 1 = Spring Circuit 2025
-- 2 = Summer Sprint 2025


-- ================================
-- Event stages
-- ================================
INSERT INTO event_stages (event_id, stage_index, label, stage_type, starts_at, ends_at)
VALUES
  (1, 1, 'Spring Circuit 2025', 'SINGLE', '2025-03-01T00:00:00Z', '2025-06-01T00:00:00Z'),
  (2, 1, 'Summer Sprint 2025', 'SINGLE', '2025-07-01T00:00:00Z', '2025-09-01T00:00:00Z');

-- event_stage_ids:
-- 1 = Event 1 Stage 1
-- 2 = Event 2 Stage 1


-- ================================
-- Event game templates
-- ================================
-- For event 1 stage 1: template_index 1..5
INSERT INTO event_game_templates (event_stage_id, template_index, variant, seed_payload, max_score)
VALUES
  (1, 1, 'No Variant', 'SC25-1', 25),
  (1, 2, 'No Variant', 'SC25-2', 25),
  (1, 3, 'No Variant', 'SC25-3', 25),
  (1, 4, 'No Variant', 'SC25-4', 25),
  (1, 5, 'No Variant', 'SC25-5', 25);

-- For event 2 stage 1: template_index 1..5
INSERT INTO event_game_templates (event_stage_id, template_index, variant, seed_payload, max_score)
VALUES
  (2, 1, 'Rainbow', 'SS25-1', 25),
  (2, 2, 'Rainbow', 'SS25-2', 25),
  (2, 3, 'No Variant', 'SS25-3', 25),
  (2, 4, 'No Variant', 'SS25-4', 25),
  (2, 5, 'No Variant', 'SS25-5', 25);

-- event_game_template_ids:
-- 1..5  -> Spring Circuit 2025 templates (index 1..5)
-- 6..10 -> Summer Sprint 2025 templates (index 1..5)


-- ================================
-- Event teams
-- ================================
-- team_size = number of players at the table (per game), not roster size.

INSERT INTO event_teams (event_id, name, team_size, table_password, owner_user_id)
VALUES
  (1, 'Lanterns',      2, 'team1234', 1), -- owner alice
  (1, 'Clue Crew',     3, 'team1234', 2), -- owner bob
  (2, 'Faded Signals', 4, 'team1234', 3), -- owner cathy
  (2, 'Risky Fuses',   3, 'team1234', 4); -- owner donald

-- event_team_ids:
-- 1 = Lanterns       (event 1)
-- 2 = Clue Crew      (event 1)
-- 3 = Faded Signals  (event 2)
-- 4 = Risky Fuses    (event 2)


-- ================================
-- Team memberships (roster)
-- ================================
-- Roles: 'PLAYER' (part of the team) and 'STAFF' (can edit, not counted as player).
-- Roster size must be >= team_size.

-- Team 1: Lanterns (2p team)
-- Staff:  alice
-- Players: bob, cathy, donald  (3-player roster, 2 play each game)
INSERT INTO team_memberships (event_team_id, user_id, role, is_listed)
VALUES
  (1, 1, 'STAFF',  true),  -- alice
  (1, 2, 'PLAYER', true),  -- bob
  (1, 3, 'PLAYER', true),  -- cathy
  (1, 4, 'PLAYER', true);  -- donald

-- Team 2: Clue Crew (3p team)
-- Players: bob, emily, frank
INSERT INTO team_memberships (event_team_id, user_id, role, is_listed)
VALUES
  (2, 2, 'PLAYER', true),  -- bob
  (2, 5, 'PLAYER', true),  -- emily
  (2, 6, 'PLAYER', true);  -- frank

-- Team 3: Faded Signals (4p team)
-- Staff:   cathy
-- Players: alice, emily, frank, grace
INSERT INTO team_memberships (event_team_id, user_id, role, is_listed)
VALUES
  (3, 3, 'STAFF',  true),  -- cathy
  (3, 1, 'PLAYER', true),  -- alice
  (3, 5, 'PLAYER', true),  -- emily
  (3, 6, 'PLAYER', true),  -- frank
  (3, 7, 'PLAYER', true);  -- grace

-- Team 4: Risky Fuses (3p team)
-- Players: donald, emily, grace (3 players, all play each game)
INSERT INTO team_memberships (event_team_id, user_id, role, is_listed)
VALUES
  (4, 4, 'PLAYER', true),  -- donald
  (4, 5, 'PLAYER', true),  -- emily
  (4, 7, 'PLAYER', true);  -- grace


-- ================================
-- Event player eligibility (team-size scoped)
-- ================================
-- Tracks enrollment and spoiler forfeits per team size.
-- NOTE: timestamps are generated at import time for simplicity.

INSERT INTO event_player_eligibilities (
  event_id,
  user_id,
  team_size,
  status,
  source_event_team_id,
  status_reason,
  changed_at
)
VALUES
  -- Event 1 (Spring Circuit 2025) - 2p team (Lanterns) - enrolled
  (1, 1, 2, 'ENROLLED', 1, 'registered', NOW()),
  (1, 2, 2, 'ENROLLED', 1, 'registered', NOW()),
  (1, 3, 2, 'ENROLLED', 1, 'registered', NOW()),
  (1, 4, 2, 'ENROLLED', 1, 'registered', NOW()),

  -- Event 1 (Spring Circuit 2025) - 3p team (Clue Crew) - enrolled
  (1, 2, 3, 'ENROLLED', 2, 'registered', NOW()),
  (1, 5, 3, 'ENROLLED', 2, 'registered', NOW()),
  (1, 6, 3, 'ENROLLED', 2, 'registered', NOW()),

  -- Event 2 (Summer Sprint 2025) - 4p team (Faded Signals) - enrolled
  (2, 1, 4, 'ENROLLED', 3, 'registered', NOW()),
  (2, 3, 4, 'ENROLLED', 3, 'registered', NOW()),
  (2, 5, 4, 'ENROLLED', 3, 'registered', NOW()),
  (2, 6, 4, 'ENROLLED', 3, 'registered', NOW()),
  (2, 7, 4, 'ENROLLED', 3, 'registered', NOW()),

  -- Event 2 (Summer Sprint 2025) - 3p team (Risky Fuses) - enrolled
  (2, 4, 3, 'ENROLLED', 4, 'registered', NOW()),
  (2, 5, 3, 'ENROLLED', 4, 'registered', NOW()),
  (2, 7, 3, 'ENROLLED', 4, 'registered', NOW()),

  -- Example spoiler: grace peeked at the Lanterns (event 1, 2p) despite not being on a 2p team there
  (1, 7, 2, 'INELIGIBLE', 1, 'Viewed Lanterns team page', NOW());


-- ================================
-- Event badges
-- ================================
-- All badges use icon "f612" for now.

INSERT INTO event_badges (event_id, name, description, icon, rank, team_size)
VALUES
  (1, 'Spring Circuit 2p Champion',     'First place 2-player teams for Spring Circuit 2025.',              'f612', '1',           2),
  (1, 'Spring Circuit 2p Silver',       'Second place 2-player teams for Spring Circuit 2025.',             'f612', '2',           2),
  (1, 'Spring Circuit 2p Bronze',       'Third place 2-player teams for Spring Circuit 2025.',              'f612', '3',           2),
  (1, 'Spring Circuit 2p Completion',   'Completed all Spring Circuit 2025 seeds before the deadline (2p).','f612', 'completion',  2),
  (1, 'Spring Circuit 3p Champion',     'First place 3-player teams for Spring Circuit 2025.',              'f612', '1',           3),
  (1, 'Spring Circuit 3p Silver',       'Second place 3-player teams for Spring Circuit 2025.',             'f612', '2',           3),
  (1, 'Spring Circuit 3p Bronze',       'Third place 3-player teams for Spring Circuit 2025.',              'f612', '3',           3),
  (1, 'Spring Circuit 3p Completion',   'Completed all Spring Circuit 2025 seeds before the deadline (3p).','f612', 'completion',  3),
  (2, 'Summer Sprint 3p Champion',      'First place 3-player teams for Summer Sprint 2025.',               'f612', '1',           3),
  (2, 'Summer Sprint 3p Completion',    'Completed all Summer Sprint 2025 seeds before the deadline (3p).', 'f612', 'completion',  3),
  (2, 'Summer Sprint 4p Champion',      'First place 4-player teams for Summer Sprint 2025.',               'f612', '1',           4),
  (2, 'Summer Sprint 4p Completion',    'Completed all Summer Sprint 2025 seeds before the deadline (4p).', 'f612', 'completion',  4);

-- event_badge ids:
-- 1..4   -> Spring Circuit 2025 (2p)
-- 5..8   -> Spring Circuit 2025 (3p)
-- 9..10  -> Summer Sprint 2025 (3p)
-- 11..12 -> Summer Sprint 2025 (4p)


-- ================================
-- Event badge awards
-- ================================

-- Lanterns (event_team_id 1, 2p) earned champion + completion
INSERT INTO event_badge_awards (event_badge_id, team_id, user_id)
VALUES
  (1, 1, 2),  -- bob
  (1, 1, 3),  -- cathy
  (1, 1, 4),  -- donald
  (4, 1, 2),  -- bob
  (4, 1, 3),  -- cathy
  (4, 1, 4);  -- donald

-- Clue Crew (event_team_id 2, 3p) earned completion
INSERT INTO event_badge_awards (event_badge_id, team_id, user_id)
VALUES
  (8, 2, 2),  -- bob
  (8, 2, 5),  -- emily
  (8, 2, 6);  -- frank

-- Risky Fuses (event_team_id 4, 3p) won Summer Sprint champion + completion
INSERT INTO event_badge_awards (event_badge_id, team_id, user_id)
VALUES
  (9, 4, 4),  -- donald
  (9, 4, 5),  -- emily
  (9, 4, 7),  -- grace
  (10, 4, 4), -- donald
  (10, 4, 5), -- emily
  (10, 4, 7); -- grace

-- Faded Signals (event_team_id 3, 4p) earned completion
INSERT INTO event_badge_awards (event_badge_id, team_id, user_id)
VALUES
  (12, 3, 1), -- alice
  (12, 3, 5), -- emily
  (12, 3, 6), -- frank
  (12, 3, 7); -- grace


-- ================================
-- Event games (results)
-- ================================
-- Assumes event_games(event_team_id, event_game_template_id, game_id, score, zero_reason, bottom_deck_risk, notes, played_at).
-- Each team:
-- - plays templates 1,2,3 for its event (no games for templates 4,5)
-- - If template 3 exists, 1 and 2 also exist.

-- Event 1 templates: ids 1,2,3
-- Event 2 templates: ids 6,7,8

-- Lanterns (event_team_id 1, 2p, event 1)
INSERT INTO event_games (
  event_team_id,
  event_game_template_id,
  game_id,
  score,
  zero_reason,
  bottom_deck_risk,
  notes,
  played_at
)
VALUES
  (1, 1, 1001, 25, NULL,         2, 'Lanterns 2p – template 1, clean',      '2025-02-01T20:00:00Z'),
  (1, 2, 1002, 23, NULL,         4, 'Lanterns 2p – template 2, minor risk', '2025-02-08T20:00:00Z'),
  (1, 3, 1003,  0, 'Strike Out', 7, 'Lanterns 2p – template 3, strike out', '2025-02-15T20:00:00Z');

-- Clue Crew (event_team_id 2, 3p, event 1)
INSERT INTO event_games (
  event_team_id,
  event_game_template_id,
  game_id,
  score,
  zero_reason,
  bottom_deck_risk,
  notes,
  played_at
)
VALUES
  (2, 1, 1004, 24, NULL,        3, 'Clue Crew 3p – template 1, solid',    '2025-03-01T19:30:00Z'),
  (2, 2, 1005, 21, NULL,        5, 'Clue Crew 3p – template 2, messy',    '2025-03-08T19:30:00Z'),
  (2, 3, 1006,  0, 'Time Out',  6, 'Clue Crew 3p – template 3, time out', '2025-03-15T19:30:00Z');

-- Faded Signals (event_team_id 3, 4p, event 2)
INSERT INTO event_games (
  event_team_id,
  event_game_template_id,
  game_id,
  score,
  zero_reason,
  bottom_deck_risk,
  notes,
  played_at
)
VALUES
  (3, 6, 2001, 26, NULL,       1, 'Faded Signals 4p – template 1, near-perfect', '2026-01-10T21:00:00Z'),
  (3, 7, 2002, 24, NULL,       3, 'Faded Signals 4p – template 2, good',         '2026-01-17T21:00:00Z'),
  (3, 8, 2003,  0, 'VTK',      8, 'Faded Signals 4p – template 3, VTK loss',     '2026-01-24T21:00:00Z');

-- Risky Fuses (event_team_id 4, 3p, event 2) – only templates 1 & 2 (6 & 7)
INSERT INTO event_games (
  event_team_id,
  event_game_template_id,
  game_id,
  score,
  zero_reason,
  bottom_deck_risk,
  notes,
  played_at
)
VALUES
  (4, 6, 2004, 22, NULL,       4, 'Risky Fuses 3p – template 1, okay',    '2026-02-05T20:15:00Z'),
  (4, 7, 2005, 18, NULL,       5, 'Risky Fuses 3p – template 2, shaky',   '2026-02-12T20:15:00Z');

-- After these INSERTs, event_game ids (PK) should be:
-- 1..3   -> Lanterns games
-- 4..6   -> Clue Crew games
-- 7..9   -> Faded Signals games
-- 10..11 -> Risky Fuses games

-- ================================
-- Event stage team statuses
-- ================================
-- Metadata fields align with backend upsert: percent_max_score, average_score, average_bdr, games_played, total_templates, total_score, total_max_score
INSERT INTO event_stage_team_statuses (
  event_stage_id,
  event_team_id,
  status,
  completed_at,
  metadata_json
)
VALUES
  -- Event 1 stage 1 has 5 templates (max score per template = 25)
  (1, 1, 'in_progress', NULL, jsonb_build_object(
    'percent_max_score', 48.0 / 125.0,
    'average_score', 48.0 / 3.0,
    'average_bdr', (2 + 4 + 7)::decimal / 3,
    'games_played', 3,
    'total_templates', 5,
    'total_score', 48,
    'total_max_score', 125
  )),
  (1, 2, 'in_progress', NULL, jsonb_build_object(
    'percent_max_score', 45.0 / 125.0,
    'average_score', 45.0 / 3.0,
    'average_bdr', (3 + 5 + 6)::decimal / 3,
    'games_played', 3,
    'total_templates', 5,
    'total_score', 45,
    'total_max_score', 125
  )),
  -- Event 2 stage 1 has 5 templates (max score per template = 25)
  (2, 3, 'in_progress', NULL, jsonb_build_object(
    'percent_max_score', 50.0 / 125.0,
    'average_score', 50.0 / 3.0,
    'average_bdr', (1 + 3 + 8)::decimal / 3,
    'games_played', 3,
    'total_templates', 5,
    'total_score', 50,
    'total_max_score', 125
  )),
  (2, 4, 'in_progress', NULL, jsonb_build_object(
    'percent_max_score', 40.0 / 125.0,
    'average_score', 40.0 / 2.0,
    'average_bdr', (4 + 5)::decimal / 2,
    'games_played', 2,
    'total_templates', 5,
    'total_score', 40,
    'total_max_score', 125
  ));


-- ================================
-- Game participants
-- ================================
-- Enrollment pattern now inferred from team_memberships + team_size.
-- Lanterns 2p:   bob(2), cathy(3), donald(4)         [2 play each game]
-- Clue Crew 3p:  bob(2), emily(5), frank(6)          [all 3 play]
-- Faded Signals 4p: alice(1), emily(5), frank(6), grace(7) [all 4 play]
-- Risky Fuses 3p: donald(4), emily(5), grace(7)      [all 3 play]

-- Lanterns games (game_ids 1,2,3) – 2 players per game
INSERT INTO game_participants (event_game_id, user_id)
VALUES
  (1, 2), (1, 3),
  (2, 2), (2, 3),
  (3, 3), (3, 4);

-- Clue Crew games (game_ids 4,5,6) – 3 players per game
INSERT INTO game_participants (event_game_id, user_id)
VALUES
  (4, 2), (4, 5), (4, 6),
  (5, 2), (5, 5), (5, 6),
  (6, 2), (6, 5), (6, 6);

-- Faded Signals games (game_ids 7,8,9) – 4 players per game
INSERT INTO game_participants (event_game_id, user_id)
VALUES
  (7, 1), (7, 5), (7, 6), (7, 7),
  (8, 1), (8, 5), (8, 6), (8, 7),
  (9, 1), (9, 5), (9, 6), (9, 7);

-- Risky Fuses games (game_ids 10,11) – 3 players per game
INSERT INTO game_participants (event_game_id, user_id)
VALUES
  (10, 4), (10, 5), (10, 7),
  (11, 4), (11, 5), (11, 7);

COMMIT;
