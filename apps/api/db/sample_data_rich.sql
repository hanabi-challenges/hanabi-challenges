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

-- Set deterministic randomness for repeatable samples
SELECT setseed(0.314159);

-- Base password hash for plaintext "password"
DO $$
DECLARE
  base_hash CONSTANT TEXT := '$2b$12$7A4Z19xOJgqgS86FUmpcTuJFYXpaDjsc4hF.J3TZpWqKJDCofBvyK';
BEGIN
  CREATE TEMP TABLE player_profiles (
    user_id INTEGER,
    display_name TEXT,
    frequency TEXT,
    skill TEXT,
    skill_score NUMERIC,
    participation_bias NUMERIC
  );

  WITH base(display_name, role, frequency, skill, color_hex, text_color) AS (
    VALUES
      ('Avery',  'SUPERADMIN', 'frequent',   'high',    '#7aa6ff', '#000000'),
      ('Blair',  'ADMIN',      'frequent',   'high',    '#f6a5c0', '#000000'),
      ('Cam',    'USER',       'frequent',   'average', '#5fd0b8', '#000000'),
      ('Dev',    'USER',       'frequent',   'high',    '#ffcc80', '#000000'),
      ('Eden',   'USER',       'frequent',   'high',    '#b388ff', '#ffffff'),
      ('Flynn',  'USER',       'frequent',   'average', '#90caf9', '#000000'),
      ('Gio',    'USER',       'frequent',   'average', '#ffab91', '#000000'),
      ('Harper', 'USER',       'frequent',   'high',    '#8bc34a', '#000000'),
      ('Imani',  'USER',       'frequent',   'average', '#ff8a65', '#000000'),
      ('Jules',  'USER',       'frequent',   'average', '#4db6ac', '#000000'),
      ('Kai',    'USER',       'frequent',   'high',    '#64b5f6', '#000000'),
      ('Lennon', 'USER',       'frequent',   'average', '#ffd54f', '#000000'),
      ('Mira',   'USER',       'frequent',   'high',    '#ba68c8', '#ffffff'),
      ('Noel',   'USER',       'frequent',   'average', '#aed581', '#000000'),
      ('Parker', 'USER',       'frequent',   'average', '#f06292', '#ffffff'),
      ('Quinn',  'USER',       'frequent',   'high',    '#4fc3f7', '#000000'),
      ('Rowan',  'USER',       'frequent',   'average', '#ce93d8', '#000000'),
      ('Sage',   'USER',       'frequent',   'average', '#9ccc65', '#000000'),
      ('Tatum',  'USER',       'frequent',   'high',    '#ffb74d', '#000000'),
      ('Uma',    'USER',       'regular',    'average', '#81d4fa', '#000000'),
      ('Vince',  'USER',       'regular',    'high',    '#4dd0e1', '#000000'),
      ('Willow', 'USER',       'regular',    'average', '#f48fb1', '#000000'),
      ('Xavier', 'USER',       'regular',    'high',    '#a5d6a7', '#000000'),
      ('Yara',   'USER',       'regular',    'average', '#9575cd', '#ffffff'),
      ('Zane',   'USER',       'regular',    'average', '#ffb3ba', '#000000'),
      ('Adrian', 'USER',       'regular',    'high',    '#ffe082', '#000000'),
      ('Brielle','USER',       'regular',    'average', '#80cbc4', '#000000'),
      ('Callum', 'USER',       'regular',    'average', '#bcaaa4', '#000000'),
      ('Dara',   'USER',       'regular',    'average', '#ffab40', '#000000'),
      ('Elias',  'USER',       'regular',    'average', '#69f0ae', '#000000'),
      ('Fiona',  'USER',       'regular',    'average', '#ffd740', '#000000'),
      ('Grey',   'USER',       'regular',    'average', '#9e9d24', '#ffffff'),
      ('Hazel',  'USER',       'regular',    'average', '#ffccbc', '#000000'),
      ('Isaac',  'USER',       'regular',    'average', '#4db6f5', '#000000'),
      ('Jonah',  'USER',       'regular',    'average', '#f48fb1', '#000000'),
      ('Keira',  'USER',       'regular',    'average', '#bcaaa4', '#000000'),
      ('Luca',   'USER',       'regular',    'average', '#fbc02d', '#000000'),
      ('Marin',  'USER',       'regular',    'high',    '#81c784', '#000000'),
      ('Nova',   'USER',       'regular',    'average', '#ff8a80', '#000000'),
      ('Olive',  'USER',       'infrequent', 'novice',  '#a1887f', '#ffffff'),
      ('Pia',    'USER',       'infrequent', 'average', '#64ffda', '#000000'),
      ('Rory',   'USER',       'infrequent', 'novice',  '#90a4ae', '#000000'),
      ('Selene', 'USER',       'infrequent', 'average', '#ffcc80', '#000000'),
      ('Trent',  'USER',       'infrequent', 'average', '#ffab91', '#000000'),
      ('Umair',  'USER',       'infrequent', 'novice',  '#aed581', '#000000'),
      ('Val',    'USER',       'infrequent', 'novice',  '#b0bec5', '#000000'),
      ('Wren',   'USER',       'infrequent', 'average', '#c5e1a5', '#000000'),
      ('Ximena', 'USER',       'infrequent', 'novice',  '#ffecb3', '#000000'),
      ('Yuki',   'USER',       'infrequent', 'average', '#b3e5fc', '#000000'),
      ('Zara',   'USER',       'infrequent', 'average', '#d1c4e9', '#000000'),
      ('August', 'USER',       'infrequent', 'novice',  '#fff59d', '#000000'),
      ('Beau',   'USER',       'infrequent', 'novice',  '#80deea', '#000000'),
      ('Coral',  'USER',       'infrequent', 'average', '#ffe0b2', '#000000'),
      ('Delphi', 'USER',       'infrequent', 'novice',  '#cfd8dc', '#000000')
  )
  , inserted AS (
    INSERT INTO users (display_name, password_hash, role, color_hex, text_color)
    SELECT display_name, base_hash, role, color_hex, text_color
    FROM base
    RETURNING id, display_name
  )
  INSERT INTO player_profiles (user_id, display_name, frequency, skill, skill_score, participation_bias)
  SELECT ins.id,
         b.display_name,
         b.frequency,
         b.skill,
         CASE b.skill WHEN 'high' THEN 0.92 WHEN 'average' THEN 0.75 ELSE 0.52 END AS skill_score,
         CASE b.frequency WHEN 'frequent' THEN 0.9 WHEN 'regular' THEN 0.65 ELSE 0.3 END AS participation_bias
  FROM inserted ins
  JOIN base b ON b.display_name = ins.display_name;
END;
$$;

-- Event definitions
CREATE TEMP TABLE event_plan (
  name TEXT,
  slug TEXT,
  event_kind TEXT,
  season_label TEXT,
  year INTEGER,
  short_description TEXT,
  published BOOLEAN,
  event_format TEXT DEFAULT 'challenge',
  round_robin_enabled BOOLEAN DEFAULT FALSE,
  max_teams INTEGER,
  max_rounds INTEGER,
  allow_late_registration BOOLEAN,
  registration_opens_at TIMESTAMPTZ,
  registration_cutoff TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  template_count INTEGER,
  target_teams INTEGER,
  stage_label TEXT,
  max_score INTEGER DEFAULT 25,
  event_id INTEGER
);

-- Quarterly (10 games, no late reg, reg window = play window)
INSERT INTO event_plan (
  name, slug, event_kind, season_label, year, short_description, published, event_format, round_robin_enabled, max_teams, max_rounds, allow_late_registration,
  registration_opens_at, registration_cutoff, starts_at, ends_at, template_count, target_teams, stage_label, max_score
)
SELECT
  format('%s Challenge %s', season, yr) AS name,
  lower(format('%s-challenge-%s', season, yr)) AS slug,
  'quarterly',
  format('%s %s', season, yr),
  yr,
  format('%s seasonal challenge', season),
  TRUE,
  'challenge',
  FALSE,
  NULL,
  NULL,
  FALSE,
  CASE season
    WHEN 'Winter' THEN make_timestamp(yr, 1, 1, 12, 0, 0)
    WHEN 'Spring' THEN make_timestamp(yr, 4, 1, 12, 0, 0)
    WHEN 'Summer' THEN make_timestamp(yr, 7, 1, 12, 0, 0)
    ELSE make_timestamp(yr, 10, 1, 12, 0, 0)
  END,
  CASE season
    WHEN 'Winter' THEN make_timestamp(yr, 3, 31, 23, 59, 59)
    WHEN 'Spring' THEN make_timestamp(yr, 6, 30, 23, 59, 59)
    WHEN 'Summer' THEN make_timestamp(yr, 9, 30, 23, 59, 59)
    ELSE make_timestamp(yr, 12, 31, 23, 59, 59)
  END,
  CASE season
    WHEN 'Winter' THEN make_timestamp(yr, 1, 1, 12, 0, 0)
    WHEN 'Spring' THEN make_timestamp(yr, 4, 1, 12, 0, 0)
    WHEN 'Summer' THEN make_timestamp(yr, 7, 1, 12, 0, 0)
    ELSE make_timestamp(yr, 10, 1, 12, 0, 0)
  END,
  CASE season
    WHEN 'Winter' THEN make_timestamp(yr, 3, 31, 23, 59, 59)
    WHEN 'Spring' THEN make_timestamp(yr, 6, 30, 23, 59, 59)
    WHEN 'Summer' THEN make_timestamp(yr, 9, 30, 23, 59, 59)
    ELSE make_timestamp(yr, 12, 31, 23, 59, 59)
  END,
  10,
  8,
  format('%s Challenge %s', season, yr),
  25
FROM generate_series(2022, 2025) AS yr
CROSS JOIN LATERAL unnest(ARRAY['Winter','Spring','Summer','Fall']) AS season;

-- Upcoming unpublished Winter/Spring 2026
INSERT INTO event_plan (
  name, slug, event_kind, season_label, year, short_description, published, event_format, round_robin_enabled, max_teams, max_rounds, allow_late_registration,
  registration_opens_at, registration_cutoff, starts_at, ends_at, template_count, target_teams, stage_label, max_score
)
VALUES
  ('Winter Challenge 2026', 'winter-challenge-2026', 'quarterly', 'Winter 2026', 2026, 'Winter seasonal challenge', FALSE, 'challenge', FALSE, NULL, NULL, FALSE,
    make_timestamp(2026, 1, 1, 12, 0, 0), make_timestamp(2026, 3, 31, 23, 59, 59), make_timestamp(2026, 1, 1, 12, 0, 0), make_timestamp(2026, 3, 31, 23, 59, 59), 10, 8, 'Winter Challenge 2026', 25),
  ('Spring Challenge 2026', 'spring-challenge-2026', 'quarterly', 'Spring 2026', 2026, 'Spring seasonal challenge', FALSE, 'challenge', FALSE, NULL, NULL, FALSE,
    make_timestamp(2026, 4, 1, 12, 0, 0), make_timestamp(2026, 6, 30, 23, 59, 59), make_timestamp(2026, 4, 1, 12, 0, 0), make_timestamp(2026, 6, 30, 23, 59, 59), 10, 8, 'Spring Challenge 2026', 25);

-- Annual (100 games, registration opens previous Nov 1, closes Dec 31, no late reg)
INSERT INTO event_plan (
  name, slug, event_kind, season_label, year, short_description, published, event_format, round_robin_enabled, max_teams, max_rounds, allow_late_registration,
  registration_opens_at, registration_cutoff, starts_at, ends_at, template_count, target_teams, stage_label, max_score
)
SELECT
  format('Annual Challenge %s', gs),
  format('annual-challenge-%s', gs),
  'annual',
  format('Annual %s', gs),
  gs,
  'Year-long gauntlet',
  CASE WHEN gs <= 2026 THEN TRUE ELSE FALSE END,
  'challenge',
  FALSE,
  NULL,
  NULL,
  FALSE,
  make_timestamp(gs - 1, 11, 1, 12, 0, 0),
  make_timestamp(gs - 1, 12, 31, 23, 59, 59),
  make_timestamp(gs, 1, 1, 12, 0, 0),
  make_timestamp(gs, 12, 31, 23, 59, 59),
  100,
  10,
  format('Annual Challenge %s', gs),
  25
FROM generate_series(2022, 2026) AS gs;

-- Unbound events (always open, no windows)
INSERT INTO event_plan (
  name, slug, event_kind, season_label, year, short_description, published, event_format, round_robin_enabled, max_teams, max_rounds, allow_late_registration,
  registration_opens_at, registration_cutoff, starts_at, ends_at, template_count, target_teams, stage_label, max_score
)
VALUES
  ('Unboxed Relay 2023', 'unboxed-relay-2023', 'unbound', 'Unbound', 2023, 'Live unboxed relay', TRUE, 'challenge', FALSE, NULL, NULL, TRUE, NULL, NULL, NULL, NULL, 12, 6, 'Unboxed Relay 2023', 25),
  ('Unboxed Relay 2024', 'unboxed-relay-2024', 'unbound', 'Unbound', 2024, 'Live unboxed relay', TRUE, 'challenge', FALSE, NULL, NULL, TRUE, NULL, NULL, NULL, NULL, 12, 6, 'Unboxed Relay 2024', 25),
  ('Unboxed Prototype 2025', 'unboxed-prototype-2025', 'unbound', 'Unbound', 2025, 'Future unboxed set', FALSE, 'challenge', FALSE, NULL, NULL, TRUE, NULL, NULL, NULL, NULL, 12, 6, 'Unboxed Prototype 2025', 25);

-- Insert events with long descriptions tailored per run
WITH template AS (
  SELECT '%s is a no-variant, challenge-style circuit. Registration runs from %s to %s, and play runs from %s to %s with curated seeds that mix max-score pushes and recovery puzzles. Late registration is %s. Seeds carry hidden difficulty that shapes BDR in the simulated outcomes. Expect 2-6 player tables, table passwords, and enough variation to exercise standings, pagination, and analytics.'::TEXT AS body
)
, inserted AS (
  INSERT INTO events (
    name,
    slug,
    short_description,
    long_description,
    published,
    event_format,
    round_robin_enabled,
    max_teams,
    max_rounds,
    allow_late_registration,
    registration_opens_at,
    registration_cutoff,
    starts_at,
    ends_at
  )
  SELECT
    ep.name,
    ep.slug,
    ep.short_description,
    format(template.body,
      ep.name,
      COALESCE(to_char(ep.registration_opens_at, 'YYYY-MM-DD'), 'open'),
      COALESCE(to_char(ep.registration_cutoff, 'YYYY-MM-DD'), 'open'),
      COALESCE(to_char(ep.starts_at, 'YYYY-MM-DD'), 'open'),
      COALESCE(to_char(ep.ends_at, 'YYYY-MM-DD'), 'open'),
      CASE WHEN ep.allow_late_registration THEN 'allowed' ELSE 'not allowed' END
    ) AS long_description,
    ep.published,
    ep.event_format,
    ep.round_robin_enabled,
    ep.max_teams,
    ep.max_rounds,
    ep.allow_late_registration,
    ep.registration_opens_at,
    ep.registration_cutoff,
    ep.starts_at,
    ep.ends_at
  FROM event_plan ep
  CROSS JOIN template
  RETURNING id, slug
)
UPDATE event_plan ep
SET event_id = inserted.id
FROM inserted
WHERE ep.slug = inserted.slug;

-- Create single-stage definitions per event
WITH staged AS (
  INSERT INTO event_stages (event_id, stage_index, label, stage_type, starts_at, ends_at)
  SELECT ep.event_id, 1, ep.stage_label, 'SINGLE', ep.starts_at, ep.ends_at
  FROM event_plan ep
  RETURNING event_stage_id, event_id
)
-- Insert game templates (seed_payload + difficulty stored in metadata_json)
INSERT INTO event_game_templates (event_stage_id, template_index, variant, seed_payload, max_score, metadata_json)
SELECT
  staged.event_stage_id,
  gs AS template_index,
  'No Variant' AS variant,
  format('%s-g%03s', ep.slug, gs) AS seed_payload,
  ep.max_score,
  jsonb_build_object(
    'seed_difficulty', round((0.25 + random() * 0.45)::numeric, 2),
    'seed_label', format('%s Seed %s', ep.season_label, gs)
  )
FROM staged
JOIN event_plan ep ON ep.event_id = staged.event_id
CROSS JOIN LATERAL generate_series(1, ep.template_count) AS gs;

-- Generate teams, roster enrollments, and eligibility per event
CREATE TEMP TABLE team_facts (
  event_team_id INTEGER,
  event_id INTEGER,
  team_size INTEGER,
  avg_skill NUMERIC,
  completion_bias NUMERIC,
  roster INTEGER[]
);

DO $$
DECLARE
  ev RECORD;
  pool INTEGER[];
  roster INTEGER[];
  team_size INTEGER;
  roster_size INTEGER;
  team_id INTEGER;
  owner_id INTEGER;
  name_try INTEGER;
  team_name TEXT;
  adjectives TEXT[] := ARRAY['Crimson','Amber','Cobalt','Verdant','Silent','Keen','Bright','Midnight','Silver','Glowing','Velvet','Brisk'];
  nouns TEXT[] := ARRAY['Signals','Clues','Lanterns','Fuses','Stacks','Gardens','Sparks','Mirrors','Visions','Tempos','Echoes','Whispers'];
  max_adjs INTEGER := array_length(adjectives, 1);
  max_nouns INTEGER := array_length(nouns, 1);
BEGIN
  FOR ev IN SELECT *, COALESCE(target_teams, 6) AS desired_teams FROM event_plan LOOP
    pool := ARRAY(
      SELECT user_id
      FROM player_profiles pp
      WHERE random() < CASE pp.frequency WHEN 'frequent' THEN 0.9 WHEN 'regular' THEN 0.6 ELSE 0.3 END
      ORDER BY random()
      LIMIT ev.desired_teams * 6
    );

    IF array_length(pool, 1) IS NULL OR array_length(pool, 1) < ev.desired_teams * 2 THEN
      pool := COALESCE(pool, ARRAY[]::INTEGER[]) || ARRAY(
        SELECT user_id FROM player_profiles ORDER BY random() LIMIT ev.desired_teams * 2
      );
    END IF;

    WHILE array_length(pool, 1) IS NOT NULL AND (SELECT COUNT(*) FROM event_teams WHERE event_id = ev.event_id) < ev.desired_teams LOOP
      team_size := CASE
        WHEN random() < 0.15 THEN 2
        WHEN random() < 0.65 THEN 3
        WHEN random() < 0.9 THEN 4
        WHEN random() < 0.97 THEN 5
        ELSE 6
      END;

      IF array_length(pool, 1) < team_size THEN
        EXIT;
      END IF;

      roster_size := team_size + CASE WHEN array_length(pool, 1) > team_size AND random() < 0.4 THEN 1 ELSE 0 END;
      roster := pool[1:roster_size];
      pool := CASE
        WHEN array_length(pool, 1) > roster_size THEN pool[(roster_size + 1):array_length(pool, 1)]
        ELSE ARRAY[]::INTEGER[]
      END;

      name_try := 0;
      LOOP
        team_name := format('%s %s',
          adjectives[floor(random() * max_adjs)::INTEGER + 1],
          nouns[floor(random() * max_nouns)::INTEGER + 1]
        );
        name_try := name_try + 1;
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM event_teams WHERE event_id = ev.event_id AND name = team_name
        ) OR name_try > 4;
        team_name := team_name || ' ' || name_try;
      END LOOP;

      owner_id := roster[1];

      INSERT INTO event_teams (event_id, name, team_size, table_password, owner_user_id)
      VALUES (ev.event_id, team_name, team_size, 'demo1234', owner_id)
      RETURNING id INTO team_id;

      INSERT INTO team_memberships (event_team_id, user_id, role, is_listed)
      SELECT team_id, rid, 'PLAYER', TRUE FROM unnest(roster) AS rid;

      INSERT INTO event_player_eligibilities (
        event_id, user_id, team_size, status, source_event_team_id, status_reason, changed_at
      )
      SELECT ev.event_id, rid, team_size, 'ENROLLED', team_id, 'registered via sample data', NOW()
      FROM unnest(roster) AS rid;

      INSERT INTO team_facts (event_team_id, event_id, team_size, avg_skill, completion_bias, roster)
      SELECT team_id, ev.event_id, team_size,
        (SELECT AVG(skill_score) FROM player_profiles WHERE user_id = ANY (roster)),
        (SELECT AVG(participation_bias) FROM player_profiles WHERE user_id = ANY (roster)),
        roster;
    END LOOP;
  END LOOP;
END;
$$;

-- Simulate games, scores, and completion statuses per team (sequential play, lower BDR)
DO $$
DECLARE
  tf RECORD;
  tmpl RECORD;
  total_templates INTEGER;
  event_max INTEGER;
  games_played INTEGER;
  total_score INTEGER;
  total_bdr NUMERIC;
  avg_score NUMERIC;
  avg_bdr NUMERIC;
  percent_max NUMERIC;
  status_label TEXT;
  difficulty NUMERIC;
  play_prob NUMERIC;
  perf NUMERIC;
  score INTEGER;
  bdr INTEGER;
  zero_reason TEXT;
  played_at TIMESTAMPTZ;
  participants INTEGER[];
  game_pk INTEGER;
  event_start TIMESTAMPTZ;
BEGIN
  PERFORM setseed(0.777);

  FOR tf IN SELECT * FROM team_facts LOOP
    games_played := 0;
    total_score := 0;
    total_bdr := 0;
    event_max := 0;
    SELECT starts_at INTO event_start FROM event_plan WHERE event_id = tf.event_id;
    total_templates := (
      SELECT COUNT(*)
      FROM event_game_templates egt
      JOIN event_stages es ON es.event_stage_id = egt.event_stage_id
      WHERE es.event_id = tf.event_id
    );

    FOR tmpl IN
      SELECT egt.*, ep.starts_at AS event_starts, ep.ends_at AS event_ends
      FROM event_game_templates egt
      JOIN event_stages es ON es.event_stage_id = egt.event_stage_id
      JOIN event_plan ep ON ep.event_id = es.event_id
      WHERE ep.event_id = tf.event_id
      ORDER BY egt.template_index
    LOOP
      event_max := event_max + tmpl.max_score;
      difficulty := COALESCE((tmpl.metadata_json ->> 'seed_difficulty')::NUMERIC, 0.4);
      play_prob := GREATEST(0.3, LEAST(0.92, 0.4 + tf.completion_bias * 0.45 - difficulty * 0.05));

      IF random() < play_prob THEN
        perf := tf.avg_skill - (difficulty * 0.12) + (random() - 0.5) * 0.1 + 0.35;
        perf := GREATEST(0.15, LEAST(perf, 1.02));
        score := GREATEST(0, FLOOR(tmpl.max_score * perf));

        IF score < tmpl.max_score * 0.6 AND random() < 0.2 THEN
          zero_reason := (ARRAY['Strike Out', 'Time Out', 'VTK'])[floor(random() * 3)::INTEGER + 1];
          score := 0;
        ELSE
          zero_reason := NULL;
        END IF;

        bdr := GREATEST(0, LEAST(8, ROUND(1.0 + difficulty * 3.5 + (1.0 - tf.avg_skill) * 2.5 + (random() - 0.5) * 0.8)));
        played_at := COALESCE(tmpl.event_starts, NOW() - INTERVAL '45 days')
          + ((tmpl.template_index - 1) || ' days')::INTERVAL
          + (random() * 6 || ' hours')::INTERVAL;

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
        VALUES (
          tf.event_team_id,
          tmpl.id,
          10000 + tf.event_team_id * 100 + tmpl.template_index,
          score,
          zero_reason,
          bdr,
          format(
            'Simulated result for team %s on %s (diff %s, skill %s)',
            tf.event_team_id,
            tmpl.seed_payload,
            to_char(difficulty, 'FM990.00'),
            to_char(tf.avg_skill, 'FM990.00')
          ),
          played_at
        )
        RETURNING id INTO game_pk;

        participants := (
          SELECT ARRAY(SELECT rid FROM unnest(tf.roster) AS rid ORDER BY random() LIMIT tf.team_size)
        );
        INSERT INTO game_participants (event_game_id, user_id)
        SELECT game_pk, uid FROM unnest(participants) AS uid;

        games_played := games_played + 1;
        total_score := total_score + score;
        total_bdr := total_bdr + bdr;
      END IF;
    END LOOP;

    avg_score := CASE WHEN games_played > 0 THEN total_score::NUMERIC / games_played ELSE 0 END;
    avg_bdr := CASE WHEN games_played > 0 THEN total_bdr::NUMERIC / games_played ELSE NULL END;
    percent_max := CASE WHEN event_max > 0 THEN total_score::NUMERIC / event_max ELSE 0 END;
    status_label := CASE
      WHEN games_played = total_templates THEN 'complete'
      WHEN games_played = 0 THEN 'not_started'
      ELSE 'in_progress'
    END;

    INSERT INTO event_stage_team_statuses (
      event_stage_id,
      event_team_id,
      status,
      completed_at,
      metadata_json
    )
    SELECT
      es.event_stage_id,
      tf.event_team_id,
      status_label,
      CASE WHEN status_label = 'complete' THEN event_start + (total_templates || ' days')::INTERVAL ELSE NULL END,
      jsonb_build_object(
        'percent_max_score', percent_max,
        'average_score', avg_score,
        'average_bdr', avg_bdr,
        'games_played', games_played,
        'total_templates', total_templates,
        'total_score', total_score,
        'total_max_score', event_max
      )
    FROM event_stages es
    WHERE es.event_id = tf.event_id;
  END LOOP;

  -- Mark enrollments complete when the team finished the stage
  UPDATE event_player_eligibilities epe
  SET status = 'COMPLETED', status_reason = 'finished all templates'
  FROM event_stage_team_statuses ests
  JOIN event_teams et ON et.id = ests.event_team_id
  WHERE ests.status = 'complete'
    AND epe.event_id = et.event_id
    AND epe.team_size = et.team_size
    AND EXISTS (
      SELECT 1 FROM team_memberships tm
      WHERE tm.event_team_id = et.id AND tm.user_id = epe.user_id
    );
END;
$$;

COMMIT;
