import { pool } from '../../config/db';

export type SiteContentPage = {
  slug: string;
  title: string;
  markdown: string;
  updated_at: string;
  updated_by_user_id: number | null;
};

export type SiteContentSummary = Pick<
  SiteContentPage,
  'slug' | 'title' | 'updated_at' | 'updated_by_user_id'
>;

type SiteContentDefault = {
  slug: string;
  title: string;
  markdown: string;
};

const DEFAULT_SITE_CONTENT: SiteContentDefault[] = [
  {
    slug: 'about',
    title: 'About Hanabi Challenges',
    markdown: `# About Hanabi Challenges

Hanabi Challenges is a home for organized play. We publish shared seed sets, collect results, and surface stats so every team, new or veteran, can compete on equal footing.

## How it works

- Browse events to see formats, timelines, and seed details.
- Register your team, choose a team size, and set a table password if needed.
- Play through the shared seeds, upload replays, and watch progress update.
- Review standings and stats as events progress and complete.

## Who's behind it

We are Hanabi players building tools we wished existed: faster registration, cleaner scorekeeping, and more reliable archives.

## What's next

- Tournaments and multi-stage brackets alongside seasonal challenges.
- Deeper stats, historical archives, and richer leaderboards.
- Better replay validation and smoother team management workflows.

## FAQ

Have questions? Visit [FAQ](/about/FAQ).`,
  },
  {
    slug: 'faq',
    title: 'FAQ',
    markdown: `# FAQ

## How do I register a team?

Open an [event](/events) page and click **Register a Team**. Pick a team size, add teammates, and submit.

## Can I join after an event starts?

Some events allow late registration. If registration is closed, the action will be disabled.

## How are replays used?

Replays validate that your team played the correct seed with the right players. Paste a hanab.live replay link when logging a game.

## Where can I report issues or give feedback?

Reach out through community channels or open a repository issue.

More details are available on the [About](/about) page.`,
  },
  {
    slug: 'legal',
    title: 'Legal',
    markdown: `# Legal

Use the pages below for policy details:

- [Terms of Service](/legal/terms)
- [Privacy Policy](/legal/privacy)

If you have policy questions, contact the organizers through the project community channels.`,
  },
  {
    slug: 'contact',
    title: 'Contact',
    markdown: `# Contact

For event and account support, use the project community channels where admins are active.

## What to include

- Your username
- Event name/slug (if relevant)
- A short description of the issue
- Screenshots or URLs when possible`,
  },
  {
    slug: 'feedback',
    title: 'Feedback',
    markdown: `# Feedback

We actively use feedback to improve event flows and admin tooling.

## Share feedback

- What you were trying to do
- What happened
- What you expected instead
- Any ideas for improvement`,
  },
  {
    slug: 'code-of-conduct',
    title: 'Code of Conduct',
    markdown: `# Code of Conduct

Participate respectfully and keep event play fair.

## Expected behavior

- Be respectful in communication.
- Report issues honestly.
- Follow event rules and admin guidance.

## Unacceptable behavior

- Harassment, hate speech, or personal attacks.
- Deliberate cheating or falsified submissions.
- Disruptive behavior that harms event operations.

## Enforcement

Admins may issue warnings, remove submissions, or restrict access depending on severity.`,
  },
  {
    slug: 'terms',
    title: 'Terms of Service',
    markdown: `# Terms of Service

_Last updated: March 2, 2026_

## Acceptance

By using Hanabi Challenges, you agree to these terms.

## Accounts

You are responsible for activity under your account and for keeping credentials private.

## Fair play

Do not submit fabricated results, impersonate other players, or interfere with event operations.

## Service availability

The service is provided as-is. Features may change without notice.

## Enforcement

Admins may limit access for abuse, cheating, or conduct that harms event integrity.

## Contact

Questions about these terms can be directed through project community channels.`,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    markdown: `# Privacy Policy

_Last updated: March 2, 2026_

## Data we store

- Account profile details (username, role, display colors).
- Event participation and submitted results.
- Authentication session data needed to keep you signed in.

## Why we store it

We use this data to run events, calculate standings, and provide account/admin functionality.

## Sharing

We do not sell personal data. Event and leaderboard data may be visible publicly as part of competition records.

## Retention

Data is retained to preserve event history and auditability unless removed by administrators.

## Contact

Questions about privacy can be directed through project community channels.`,
  },
];

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export async function ensureSiteContentTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_content_pages (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      markdown TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  for (const row of DEFAULT_SITE_CONTENT) {
    await pool.query(
      `
      INSERT INTO site_content_pages (slug, title, markdown, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (slug) DO NOTHING
      `,
      [row.slug, row.title, row.markdown],
    );
  }
}

export async function listSiteContentPages(): Promise<SiteContentSummary[]> {
  await ensureSiteContentTables();
  const result = await pool.query<SiteContentSummary>(
    `
    SELECT slug, title, updated_at, updated_by_user_id
    FROM site_content_pages
    ORDER BY slug
    `,
  );
  return result.rows;
}

export async function getSiteContentPage(slug: string): Promise<SiteContentPage | null> {
  await ensureSiteContentTables();
  const normalized = normalizeSlug(slug);
  const result = await pool.query<SiteContentPage>(
    `
    SELECT slug, title, markdown, updated_at, updated_by_user_id
    FROM site_content_pages
    WHERE slug = $1
    LIMIT 1
    `,
    [normalized],
  );
  return result.rows[0] ?? null;
}

export async function upsertSiteContentPage(
  slug: string,
  input: { title: string; markdown: string },
  updatedByUserId: number,
): Promise<SiteContentPage> {
  await ensureSiteContentTables();
  const normalized = normalizeSlug(slug);

  const result = await pool.query<SiteContentPage>(
    `
    INSERT INTO site_content_pages (slug, title, markdown, updated_at, updated_by_user_id)
    VALUES ($1, $2, $3, NOW(), $4)
    ON CONFLICT (slug)
    DO UPDATE SET
      title = EXCLUDED.title,
      markdown = EXCLUDED.markdown,
      updated_at = NOW(),
      updated_by_user_id = EXCLUDED.updated_by_user_id
    RETURNING slug, title, markdown, updated_at, updated_by_user_id
    `,
    [normalized, input.title.trim(), input.markdown, updatedByUserId],
  );

  return result.rows[0];
}
