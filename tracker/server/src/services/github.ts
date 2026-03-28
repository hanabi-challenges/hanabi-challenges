import { createHmac, timingSafeEqual } from 'crypto';
import type { Sql } from 'postgres';
import { env } from '../env.js';
import { logger } from '../logger.js';
import {
  insertGithubLink,
  insertInboundWebhookLog,
  getPendingWebhookLogs,
  markWebhookLog,
} from '../db/github.js';

// ---------------------------------------------------------------------------
// HMAC signature validation
// ---------------------------------------------------------------------------

/**
 * Validates a GitHub webhook HMAC-SHA256 signature.
 *
 * @param rawBody   The raw request body buffer
 * @param signature The value of the `X-Hub-Signature-256` header (e.g. "sha256=abc...")
 * @param secret    The webhook secret
 * @returns true if the signature is valid
 */
export function validateGithubSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GitHub Issues API: create an issue
// ---------------------------------------------------------------------------

interface GithubIssueCreated {
  number: number;
  html_url: string;
}

async function callGithubCreateIssue(
  title: string,
  body: string,
): Promise<GithubIssueCreated | null> {
  const { GITHUB_BOT_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME } = env;
  if (!GITHUB_BOT_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) return null;

  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_BOT_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ title, body }),
  });

  if (response.status === 403 || response.status === 429) {
    const resetHeader = response.headers.get('x-ratelimit-reset');
    logger.warn({ resetAt: resetHeader }, 'github: rate limit hit, skipping issue creation');
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    logger.error(
      { status: response.status, body: errorText.slice(0, 200) },
      'github: create issue failed',
    );
    return null;
  }

  return response.json() as Promise<GithubIssueCreated>;
}

/**
 * Creates a GitHub issue for a ticket that has transitioned to in_review.
 *
 * Fire-and-forget from the caller's perspective: failure is logged but never
 * propagated — the transition itself must already have succeeded.
 */
export async function createGithubIssue(
  sql: Sql,
  ticketId: string,
  title: string,
  trackerUrl: string,
): Promise<void> {
  if (!env.GITHUB_BOT_TOKEN) return;

  const body = `**Tracker ticket:** ${trackerUrl}\n\nThis issue was automatically created when the ticket moved to In Review.`;

  try {
    const issue = await callGithubCreateIssue(title, body);
    if (!issue) return;
    await insertGithubLink(sql, ticketId, issue.number, issue.html_url);
    logger.info({ ticketId, issueNumber: issue.number }, 'github: issue created');
  } catch (err) {
    logger.error({ ticketId, err }, 'github: createGithubIssue failed');
  }
}

// ---------------------------------------------------------------------------
// Inbound webhook receiver (write-only, called from route handler)
// ---------------------------------------------------------------------------

/**
 * Persists an inbound webhook payload as `pending` and returns immediately.
 * Processing happens asynchronously via processWebhookQueue.
 */
export async function receiveGithubWebhook(
  sql: Sql,
  githubEvent: string,
  payload: unknown,
): Promise<void> {
  await insertInboundWebhookLog(sql, githubEvent, payload);
}

// ---------------------------------------------------------------------------
// Background webhook processor
// ---------------------------------------------------------------------------

interface IssuePayload {
  action: string;
  issue: { number: number; html_url: string; state: string };
  repository: { full_name: string };
}

async function processOneWebhook(
  sql: Sql,
  id: string,
  githubEvent: string,
  payload: unknown,
): Promise<void> {
  if (githubEvent !== 'issues') {
    await markWebhookLog(sql, id, 'ignored');
    return;
  }

  const p = payload as IssuePayload;
  const { action } = p;

  // Only handle assigned and closed events per the spec
  if (action !== 'assigned' && action !== 'closed') {
    await markWebhookLog(sql, id, 'ignored');
    return;
  }

  // Log a committee notification at info level; the committee confirms transitions manually
  if (action === 'closed') {
    logger.info(
      { issueNumber: p.issue.number, repo: p.repository.full_name },
      'github: issue closed — committee should review and confirm resolution',
    );
  } else if (action === 'assigned') {
    logger.info(
      { issueNumber: p.issue.number, repo: p.repository.full_name },
      'github: issue assigned — committee alert for in-progress tracking',
    );
  }

  await markWebhookLog(sql, id, 'processed');
}

/**
 * Processes all pending inbound webhook log rows.
 * Designed to run after the HTTP response has been sent.
 */
export async function processWebhookQueue(sql: Sql): Promise<void> {
  let rows;
  try {
    rows = await getPendingWebhookLogs(sql);
  } catch (err) {
    logger.error({ err }, 'github: failed to fetch pending webhooks');
    return;
  }

  for (const row of rows) {
    try {
      await processOneWebhook(sql, row.id, row.github_event, row.payload);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await markWebhookLog(sql, row.id, 'failed', error.slice(0, 500)).catch((e) => {
        logger.error({ id: row.id, err: e }, 'github: failed to mark webhook as failed');
      });
      logger.error({ id: row.id, err }, 'github: webhook processing failed');
    }
  }
}
