// src/modules/auth/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import type { UserRole } from '../../middleware/authMiddleware';

class InvalidCredentialsError extends Error {
  code = 'INVALID_CREDENTIALS';
}

export type Role = UserRole; // "SUPERADMIN" | "ADMIN" | "USER"

export interface AuthUser {
  id: number;
  display_name: string;
  role: Role;
  color_hex: string;
  text_color: string;
  created_at: string;
}

export interface LoginResult {
  mode: 'created' | 'login';
  user: AuthUser;
  token: string;
}

export interface LoginOnlyResult {
  mode: 'login';
  user: AuthUser;
  token: string;
}

export interface TokenIdentityResult {
  canonical_display_name: string;
}

class UserNotFoundError extends Error {
  code = 'USER_NOT_FOUND';
}

class InvalidTokenError extends Error {
  code = 'INVALID_TOKEN';
}

function createToken(user: AuthUser): string {
  return jwt.sign(
    {
      userId: user.id,
      displayName: user.display_name,
      role: user.role,
      color_hex: user.color_hex,
      text_color: user.text_color,
    },
    env.JWT_SECRET,
    { expiresIn: '7d' },
  );
}

/**
 * Log in an existing user by display_name + password,
 * or create a new user if none exists.
 */
export async function loginOrCreateUser(
  display_name: string,
  password: string,
): Promise<LoginResult> {
  // 1) Look up the user
  const result = await pool.query(
    `
    SELECT id, display_name, password_hash, role, color_hex, text_color, created_at
    FROM users
    WHERE display_name = $1;
    `,
    [display_name],
  );

  // 2) User doesn't exist → create as USER
  if (result.rowCount === 0) {
    const passwordHash = await bcrypt.hash(password, 12);

    const color_hex = randomHexColor();
    const text_color = pickTextColor(color_hex);

    const insertResult = await pool.query(
      `
      INSERT INTO users (display_name, password_hash, color_hex, text_color)
      VALUES ($1, $2, $3, $4)
      RETURNING id, display_name, role, color_hex, text_color, created_at;
      `,
      [display_name, passwordHash, color_hex, text_color],
    );

    const newUser: AuthUser = insertResult.rows[0];
    const token = createToken(newUser);

    return {
      mode: 'created',
      user: newUser,
      token,
    };
  }

  // 3) User exists → check password
  const userRow = result.rows[0] as {
    id: number;
    display_name: string;
    password_hash: string;
    role: Role;
    color_hex: string | null;
    text_color: string | null;
    created_at: string;
  };

  const isMatch = await bcrypt.compare(password, userRow.password_hash);
  if (process.env.LOGIN_DEBUG === '1') {
    console.log('[login:debug]', {
      user: userRow.display_name,
      providedLength: password.length,
      hashPrefix: userRow.password_hash.slice(0, 10),
      isMatch,
    });
  }
  if (!isMatch) {
    throw new InvalidCredentialsError('Invalid credentials');
  }

  // Backfill missing colors for legacy accounts
  if (!userRow.color_hex || !userRow.text_color) {
    const newColor = randomHexColor();
    const newText = pickTextColor(newColor);
    await pool.query(
      `
      UPDATE users
      SET color_hex = $1, text_color = $2
      WHERE id = $3;
      `,
      [newColor, newText, userRow.id],
    );
    userRow.color_hex = newColor;
    userRow.text_color = newText;
  }

  const user: AuthUser = {
    id: userRow.id,
    display_name: userRow.display_name,
    role: userRow.role,
    color_hex: userRow.color_hex,
    text_color: userRow.text_color,
    created_at: userRow.created_at,
  };

  const token = createToken(user);

  return {
    mode: 'login',
    user,
    token,
  };
}

async function normalizeAuthUserFromRow(userRow: {
  id: number;
  display_name: string;
  role: Role;
  color_hex: string | null;
  text_color: string | null;
  created_at: string;
}): Promise<AuthUser> {
  // Backfill missing colors for legacy accounts
  if (!userRow.color_hex || !userRow.text_color) {
    const newColor = randomHexColor();
    const newText = pickTextColor(newColor);
    await pool.query(
      `
      UPDATE users
      SET color_hex = $1, text_color = $2
      WHERE id = $3;
      `,
      [newColor, newText, userRow.id],
    );
    userRow.color_hex = newColor;
    userRow.text_color = newText;
  }

  return {
    id: userRow.id,
    display_name: userRow.display_name,
    role: userRow.role,
    color_hex: userRow.color_hex,
    text_color: userRow.text_color,
    created_at: userRow.created_at,
  };
}

export async function loginExistingUser(
  display_name: string,
  password: string,
): Promise<LoginOnlyResult> {
  const result = await pool.query(
    `
    SELECT id, display_name, password_hash, role, color_hex, text_color, created_at
    FROM users
    WHERE display_name = $1;
    `,
    [display_name],
  );

  if (result.rowCount === 0) {
    throw new UserNotFoundError('User not found');
  }

  const userRow = result.rows[0] as {
    id: number;
    display_name: string;
    password_hash: string;
    role: Role;
    color_hex: string | null;
    text_color: string | null;
    created_at: string;
  };

  const isMatch = await bcrypt.compare(password, userRow.password_hash);
  if (!isMatch) {
    throw new InvalidCredentialsError('Invalid credentials');
  }

  const user = await normalizeAuthUserFromRow(userRow);
  const token = createToken(user);
  return { mode: 'login', user, token };
}

export async function userExistsByDisplayName(display_name: string): Promise<boolean> {
  const result = await pool.query(
    `
    SELECT 1
    FROM users
    WHERE display_name = $1
    LIMIT 1;
    `,
    [display_name],
  );
  return result.rowCount > 0;
}

export async function changeUserPassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const result = await pool.query(
    `
    SELECT password_hash
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId],
  );

  if (result.rowCount === 0) {
    throw new UserNotFoundError('User not found');
  }

  const row = result.rows[0] as { password_hash: string };
  const isMatch = await bcrypt.compare(currentPassword, row.password_hash);
  if (!isMatch) {
    throw new InvalidCredentialsError('Invalid current password');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.query(
    `
    UPDATE users
    SET password_hash = $1
    WHERE id = $2
    `,
    [passwordHash, userId],
  );
}

function extractCanonicalDisplayName(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const candidates = [obj.display_name, obj.displayName, obj.username, obj.user_name, obj.name];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export async function resolveHanabIdentityToken(token: string): Promise<TokenIdentityResult> {
  const endpoint = `https://hanab.live/api/v1/identity`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    throw new InvalidTokenError('Invalid or expired token');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new InvalidTokenError('Invalid identity response');
  }

  const canonical = extractCanonicalDisplayName(payload);
  if (!canonical) {
    throw new InvalidTokenError('Identity token did not return a username');
  }

  return { canonical_display_name: canonical };
}

export async function registerUserWithIdentityToken(input: {
  password: string;
  token: string;
}): Promise<LoginResult> {
  const identity = await resolveHanabIdentityToken(input.token);
  const canonicalDisplayName = identity.canonical_display_name;

  const existing = await pool.query(
    `
    SELECT id
    FROM users
    WHERE display_name = $1
    LIMIT 1;
    `,
    [canonicalDisplayName],
  );
  if (existing.rowCount > 0) {
    throw new InvalidCredentialsError('User already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const color_hex = randomHexColor();
  const text_color = pickTextColor(color_hex);

  const insertResult = await pool.query(
    `
    INSERT INTO users (display_name, password_hash, color_hex, text_color)
    VALUES ($1, $2, $3, $4)
    RETURNING id, display_name, role, color_hex, text_color, created_at;
    `,
    [canonicalDisplayName, passwordHash, color_hex, text_color],
  );

  const newUser: AuthUser = insertResult.rows[0];
  const token = createToken(newUser);

  return {
    mode: 'created',
    user: newUser,
    token,
  };
}

export async function recoverPasswordWithIdentityToken(input: {
  password: string;
  token: string;
}): Promise<LoginOnlyResult> {
  const identity = await resolveHanabIdentityToken(input.token);
  const canonicalDisplayName = identity.canonical_display_name;

  const existing = await pool.query(
    `
    SELECT id, display_name, role, color_hex, text_color, created_at
    FROM users
    WHERE display_name = $1
    LIMIT 1;
    `,
    [canonicalDisplayName],
  );
  if (existing.rowCount === 0) {
    throw new UserNotFoundError('User not found');
  }

  const userRow = existing.rows[0] as {
    id: number;
    display_name: string;
    role: Role;
    color_hex: string | null;
    text_color: string | null;
    created_at: string;
  };

  const passwordHash = await bcrypt.hash(input.password, 12);
  await pool.query(
    `
    UPDATE users
    SET password_hash = $1
    WHERE id = $2
    `,
    [passwordHash, userRow.id],
  );

  const user = await normalizeAuthUserFromRow(userRow);
  const token = createToken(user);
  return { mode: 'login', user, token };
}

export function randomHexColor(): string {
  const n = Math.floor(Math.random() * 0xffffff);
  return `#${n.toString(16).padStart(6, '0')}`;
}

// WCAG contrast heuristic against white/black
export function pickTextColor(hex: string): '#000000' | '#ffffff' {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  const full = m ? m[1] : '777777';
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const [R, G, B] = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B;

  return luminance > 0.179 ? '#000000' : '#ffffff';
}
