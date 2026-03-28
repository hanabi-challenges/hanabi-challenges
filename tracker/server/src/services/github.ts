import { createHmac, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import type { Sql } from 'postgres';
import { env } from '../env.js';
import { logger } from '../logger.js';
import {
  insertGithubLink,
  insertInboundWebhookLog,
  getPendingWebhookLogs,
  markWebhookLog,
} from '../db/github.js';
import { transitionTicketFromGithub } from './lifecycle.js';

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
// GitHub App: installation token cache
// ---------------------------------------------------------------------------

interface InstallationToken {
  token: string;
  expiresAt: number; // Unix ms
}

let cachedInstallationToken: InstallationToken | null = null;

/**
 * Returns a valid GitHub App installation token, refreshing it when it has
 * fewer than 5 minutes remaining. Tokens are valid for 1 hour.
 *
 * Throws if GitHub App credentials are not configured.
 */
async function getInstallationToken(): Promise<string> {
  const { GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID } = env;
  // Normalize stored private key: platforms often store newlines as literal \n
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!GITHUB_APP_ID || !privateKey || !GITHUB_APP_INSTALLATION_ID) {
    throw new Error('GitHub App credentials not configured');
  }

  // Return cached token if more than 5 minutes remain
  if (cachedInstallationToken && cachedInstallationToken.expiresAt - Date.now() > 5 * 60 * 1000) {
    return cachedInstallationToken.token;
  }

  // Sign a 10-minute JWT to authenticate as the GitHub App
  const now = Math.floor(Date.now() / 1000);
  const appJwt = jwt.sign({ iat: now - 60, exp: now + 10 * 60, iss: GITHUB_APP_ID }, privateKey, {
    algorithm: 'RS256',
  });

  const url = `https://api.github.com/app/installations/${GITHUB_APP_INSTALLATION_ID}/access_tokens`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appJwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub App token exchange failed: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as { token: string; expires_at: string };
  cachedInstallationToken = { token: data.token, expiresAt: new Date(data.expires_at).getTime() };
  return cachedInstallationToken.token;
}

// ---------------------------------------------------------------------------
// GitHub Issues API: create an issue
// ---------------------------------------------------------------------------

interface GithubIssueCreated {
  number: number;
  node_id: string;
  html_url: string;
}

async function callGithubCreateIssue(
  title: string,
  body: string,
  labels: string[],
): Promise<GithubIssueCreated | null> {
  const { GITHUB_APP_ID, GITHUB_REPO_OWNER, GITHUB_REPO_NAME } = env;
  if (!GITHUB_APP_ID || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) return null;

  const token = await getInstallationToken();
  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ title, body, labels }),
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
  typeSlug?: string,
  domainSlug?: string,
): Promise<void> {
  if (!env.GITHUB_APP_ID) return;

  const body = `**Tracker ticket:** ${trackerUrl}\n\nThis issue was automatically created when the ticket moved to In Review.`;

  const labels: string[] = [];
  if (typeSlug) labels.push(`type: ${typeSlug.replace('_', '-')}`);
  if (domainSlug) labels.push(`domain: ${domainSlug}`);

  try {
    const issue = await callGithubCreateIssue(title, body, labels);
    if (!issue) return;
    await insertGithubLink(sql, ticketId, issue.number, issue.html_url, issue.node_id);
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
  issue: { number: number; node_id: string; html_url: string; state_reason: string | null };
  repository: { full_name: string };
}

interface ProjectsV2ItemPayload {
  action: string;
  changes?: {
    field_value?: {
      field_name: string;
      to?: { name?: string };
    };
  };
  projects_v2_item: {
    content_type: string;
    content_node_id: string;
  };
}

async function processOneWebhook(
  sql: Sql,
  id: string,
  githubEvent: string,
  payload: unknown,
): Promise<void> {
  // Handle project card moved to "In Progress" → transition ticket to in_progress
  if (githubEvent === 'projects_v2_item') {
    const p = payload as ProjectsV2ItemPayload;
    const isStatusEdit = p.action === 'edited' && p.changes?.field_value?.field_name === 'Status';
    const newStatus = p.changes?.field_value?.to?.name;

    if (!isStatusEdit || newStatus !== 'In Progress') {
      await markWebhookLog(sql, id, 'ignored');
      return;
    }

    if (p.projects_v2_item.content_type !== 'Issue') {
      await markWebhookLog(sql, id, 'ignored');
      return;
    }

    const nodeId = p.projects_v2_item.content_node_id;
    const result = await transitionTicketFromGithub(sql, nodeId, 'in_progress', 'decided');
    if (!result.ok) {
      logger.info(
        { nodeId, reason: result.reason },
        'github: projects_v2_item In Progress — ticket transition skipped',
      );
    }
    await markWebhookLog(sql, id, 'processed');
    return;
  }

  // Handle issue closed → transition ticket to resolved
  if (githubEvent === 'issues') {
    const p = payload as IssuePayload;

    if (p.action !== 'closed') {
      await markWebhookLog(sql, id, 'ignored');
      return;
    }

    // Only sync back when the issue was completed (not "not planned")
    if (p.issue.state_reason !== 'completed') {
      logger.info(
        { issueNumber: p.issue.number, stateReason: p.issue.state_reason },
        'github: issue closed as not_planned — no automatic ticket transition',
      );
      await markWebhookLog(sql, id, 'ignored');
      return;
    }

    const nodeId = p.issue.node_id;
    const result = await transitionTicketFromGithub(sql, nodeId, 'resolved', 'in_progress');
    if (!result.ok) {
      logger.info(
        { nodeId, issueNumber: p.issue.number, reason: result.reason },
        'github: issue closed — ticket transition skipped',
      );
    }
    await markWebhookLog(sql, id, 'processed');
    return;
  }

  await markWebhookLog(sql, id, 'ignored');
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
