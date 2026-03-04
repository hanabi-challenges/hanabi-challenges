import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../src/config/db';
import { loginOrCreateUser } from '../../src/modules/auth/auth.service';

describe('loginOrCreateUser (integration)', () => {
  const TEST_DISPLAY_NAME = 'unit_test_user';

  // Ensure each test starts from a clean users table
  beforeEach(async () => {
    // If there are FKs referencing users, CASCADE is helpful
    await pool.query('TRUNCATE users RESTART IDENTITY CASCADE;');
  });

  it('creates a new user when display_name does not exist', async () => {
    const result = await loginOrCreateUser(TEST_DISPLAY_NAME, 'secretpw');

    expect(result.mode).toBe('created');
    expect(result.user.display_name).toBe(TEST_DISPLAY_NAME);
    expect(result.user.role).toBe('USER'); // default role from your schema
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);

    // Verify it really hit the DB, using only the user we just created
    const dbCheck = await pool.query(
      'SELECT display_name, role FROM users WHERE display_name = $1',
      [TEST_DISPLAY_NAME],
    );
    expect(dbCheck.rowCount).toBe(1);
    expect(dbCheck.rows[0].display_name).toBe(TEST_DISPLAY_NAME);
    expect(dbCheck.rows[0].role).toBe('USER');
  });

  it('logs in an existing user with correct password', async () => {
    const displayName = 'login_user';

    // Arrange: create the user via the same service
    const firstCall = await loginOrCreateUser(displayName, 'correctpw');
    expect(firstCall.mode).toBe('created');

    // Act: call again with same credentials
    const secondCall = await loginOrCreateUser(displayName, 'correctpw');

    // Assert: now it should be a login, not a create
    expect(secondCall.mode).toBe('login');
    expect(secondCall.user.display_name).toBe(displayName);
    expect(typeof secondCall.token).toBe('string');
    expect(secondCall.token.length).toBeGreaterThan(0);
  });

  it('throws INVALID_CREDENTIALS error when password is wrong', async () => {
    const displayName = 'wrong_password_user';

    // Arrange: create the user with a known password
    const created = await loginOrCreateUser(displayName, 'correctpw');
    expect(created.mode).toBe('created');

    // Act + Assert: wrong password should reject with INVALID_CREDENTIALS
    await expect(loginOrCreateUser(displayName, 'wrong-password')).rejects.toMatchObject({
      message: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS',
    } as { message: string; code: string });
  });
});
