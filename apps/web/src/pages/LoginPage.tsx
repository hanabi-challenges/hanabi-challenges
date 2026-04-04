import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Inline,
  Input,
  InputContainer,
  MaterialIcon,
  PageHeader,
  PageContainer,
  Section,
  Stack,
  Tooltip,
  Main,
  CoreAnchor as Anchor,
  CoreBox as Box,
} from '../design-system';

type LoginResponse = {
  mode: 'created' | 'login';
  user: {
    id: number;
    display_name: string;
    roles: string[];
    created_at: string;
    color_hex: string;
    text_color: string;
  };
  token: string;
};

type UsernameStatusResponse = {
  exists: boolean;
};

type IdentityResponse = {
  canonical_display_name: string;
};

const USERNAME_DEBOUNCE_MS = 500;
const TOKEN_DEBOUNCE_MS = 350;

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'recover'>('login');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');

  const [loading, setLoading] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(false);

  const [usernameExists, setUsernameExists] = useState<boolean | null>(null);
  const [usernameLocked, setUsernameLocked] = useState(false);
  const [tokenVerified, setTokenVerified] = useState(false);
  const [tokenVerifiedName, setTokenVerifiedName] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const navigate = useNavigate();
  const auth = useAuth();

  const usernameCheckSeq = useRef(0);
  const tokenVerifySeq = useRef(0);
  const isRecovery = mode === 'recover';
  const showTokenField = isRecovery || usernameExists === false;

  useEffect(() => {
    if (auth.user) {
      navigate('/');
    }
  }, [auth.user, navigate]);

  async function checkUsernameExists(nextDisplayName: string): Promise<boolean | null> {
    const trimmed = nextDisplayName.trim();
    if (!trimmed) return null;

    const res = await fetch(
      `/api/auth/username-status?display_name=${encodeURIComponent(trimmed)}`,
    );

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }

    if (!res.ok) {
      throw new ApiError('Username status check failed', res.status, body);
    }

    return (body as UsernameStatusResponse).exists;
  }

  useEffect(() => {
    if (isRecovery) return;
    if (usernameLocked) return;

    const trimmed = displayName.trim();
    if (!trimmed) {
      setUsernameExists(null);
      setToken('');
      setTokenError(null);
      setTokenVerified(false);
      setTokenVerifiedName(null);
      return;
    }

    const seq = ++usernameCheckSeq.current;
    setCheckingUsername(true);

    const timeout = setTimeout(async () => {
      try {
        const exists = await checkUsernameExists(trimmed);
        if (usernameCheckSeq.current !== seq) return;

        setUsernameExists(exists);
        if (exists) {
          setToken('');
          setTokenError(null);
          setTokenVerified(false);
          setTokenVerifiedName(null);
          setUsernameLocked(false);
        }
      } catch {
        if (usernameCheckSeq.current !== seq) return;
        setUsernameExists(null);
      } finally {
        if (usernameCheckSeq.current === seq) {
          setCheckingUsername(false);
        }
      }
    }, USERNAME_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [displayName, isRecovery, usernameLocked]);

  useEffect(() => {
    if (!showTokenField) return;

    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setVerifyingToken(false);
      setTokenError(null);
      setTokenVerified(false);
      setTokenVerifiedName(null);
      setUsernameLocked(false);
      return;
    }

    const seq = ++tokenVerifySeq.current;
    setVerifyingToken(true);
    setTokenError(null);
    setTokenVerified(false);

    const timeout = setTimeout(async () => {
      try {
        const identityRes = await fetch(`/api/auth/identity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: trimmedToken }),
        });

        let identityBody: unknown = null;
        try {
          identityBody = await identityRes.json();
        } catch {
          // ignore
        }

        if (!identityRes.ok) {
          throw new ApiError('Token validation failed', identityRes.status, identityBody);
        }

        const canonical = (identityBody as IdentityResponse).canonical_display_name;

        if (!canonical || !canonical.trim()) {
          throw new ApiError('Token validation failed', 400, {
            error: 'Token validation did not return a canonical username',
          });
        }

        if (tokenVerifySeq.current !== seq) return;

        setDisplayName(canonical);
        setUsernameLocked(true);
        setTokenVerified(true);
        setTokenVerifiedName(canonical);

        // Recheck against local user table using canonical name so flow can seamlessly log in
        // if that account already exists.
        const exists = await checkUsernameExists(canonical);
        if (tokenVerifySeq.current !== seq) return;
        setUsernameExists(exists);
      } catch {
        if (tokenVerifySeq.current !== seq) return;
        setTokenVerified(false);
        setTokenVerifiedName(null);
        setUsernameLocked(false);
        setTokenError('Invalid token. Generate a new token from hanab.live and try again.');
      } finally {
        if (tokenVerifySeq.current === seq) {
          setVerifyingToken(false);
        }
      }
    }, TOKEN_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [showTokenField, token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const name = displayName.trim();
    const pass = password.trim();

    if (!name || !pass) {
      setLoading(false);
      setError('Username and password are required.');
      return;
    }

    try {
      async function loginRequest() {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name: name, password: pass }),
        });

        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          // ignore
        }

        if (!res.ok) {
          throw new ApiError('Login failed', res.status, body);
        }

        return body as LoginResponse;
      }

      async function registerRequest() {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pass, token: token.trim() }),
        });

        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          // ignore
        }

        if (!res.ok) {
          throw new ApiError('Register failed', res.status, body);
        }

        return body as LoginResponse;
      }

      async function recoverRequest() {
        const res = await fetch('/api/auth/recover-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pass, token: token.trim() }),
        });

        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          // ignore
        }

        if (!res.ok) {
          throw new ApiError('Recovery failed', res.status, body);
        }

        return body as LoginResponse;
      }

      let authResult: LoginResponse;

      if (isRecovery) {
        if (!token.trim() || !tokenVerified || !usernameLocked) {
          setError('A valid H-Live hash is required to recover your password.');
          return;
        }
        if (usernameExists === false) {
          setError(
            'No local account exists for this H-Live identity. Use account creation instead.',
          );
          return;
        }
        authResult = await recoverRequest();
      } else if (usernameExists === false) {
        try {
          // Existing accounts should still log in exactly as before, even if
          // the pre-check incorrectly suggested the username was new.
          authResult = await loginRequest();
        } catch (err) {
          if (
            err instanceof ApiError &&
            (err.body as { code?: string } | null)?.code === 'USER_NOT_FOUND'
          ) {
            if (!token.trim() || !tokenVerified || !usernameLocked) {
              setError('A valid hanab.live token is required to create a new account.');
              return;
            }
            authResult = await registerRequest();
          } else {
            throw err;
          }
        }
      } else {
        authResult = await loginRequest();
      }

      auth.login(authResult.user, authResult.token);
      setPassword('');
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) {
        const apiError = err.body as { error?: string; code?: string } | null;

        if (!isRecovery && apiError?.code === 'USER_NOT_FOUND') {
          setUsernameExists(false);
          setError('This username is new. Add a hanab.live token to create the account.');
        } else {
          setError(apiError?.error ?? 'Authentication failed. Please try again.');
        }
      } else {
        setError('Unexpected error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  function switchToLoginMode() {
    setMode('login');
    setError(null);
    setTokenError(null);
    setToken('');
    setTokenVerified(false);
    setTokenVerifiedName(null);
    setUsernameLocked(false);
  }

  function switchToRecoveryMode() {
    setMode('recover');
    setError(null);
    setTokenError(null);
    setToken('');
    setTokenVerified(false);
    setTokenVerifiedName(null);
    setUsernameLocked(false);
  }

  return (
    <Main>
      <PageContainer variant="narrow">
        <Section paddingY="lg">
          <Stack gap="md">
            <PageHeader
              title={isRecovery ? 'Recover password' : 'Log in'}
              subtitle={
                isRecovery
                  ? 'Verify your identity with an H-Live hash, then set a new password.'
                  : 'Existing usernames log in as usual. New usernames require a hanab.live token.'
              }
              level={1}
            />

            {error && <Alert variant="error" message={error} />}

            <Card>
              <CardBody>
                <Box component="form" onSubmit={handleSubmit}>
                  <Stack gap="sm">
                    <InputContainer
                      label="Username"
                      helperText={
                        checkingUsername
                          ? 'Checking username...'
                          : usernameLocked
                            ? 'Locked to canonical hanab.live username. Clear token to edit.'
                            : undefined
                      }
                    >
                      <Input
                        id="displayName"
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        autoComplete="username"
                        fullWidth
                        disabled={usernameLocked}
                      />
                    </InputContainer>

                    {showTokenField && (
                      <InputContainer
                        label={isRecovery ? 'H-Live hash' : 'Account Token'}
                        labelAction={
                          <Tooltip
                            content="Accounts here should match hanab.live accounts. Log in on hanab.live, run /token, copy the token, and paste it here."
                            placement="right"
                            minWidth={260}
                          >
                            <Box
                              component="span"
                              aria-label="How to get a token"
                              style={{ display: 'inline-flex', cursor: 'help' }}
                            >
                              <MaterialIcon name="info" />
                            </Box>
                          </Tooltip>
                        }
                        helperText={verifyingToken ? 'Validating token...' : undefined}
                        error={tokenError}
                      >
                        <Input
                          id="token"
                          type="text"
                          value={token}
                          onChange={(e) => {
                            const next = e.target.value;
                            setToken(next);
                            if (!next.trim()) {
                              setUsernameLocked(false);
                              setTokenVerified(false);
                              setTokenVerifiedName(null);
                              setTokenError(null);
                            }
                          }}
                          placeholder={isRecovery ? 'H-Live hash' : 'Token'}
                          fullWidth
                          autoComplete="off"
                        />
                      </InputContainer>
                    )}

                    {tokenVerified && tokenVerifiedName && (
                      <Alert
                        variant="success"
                        message={`Token verified. Username locked to ${tokenVerifiedName}.`}
                      />
                    )}

                    <InputContainer label={isRecovery ? 'New password' : 'Password'}>
                      <Input
                        id="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={
                          showTokenField || isRecovery ? 'new-password' : 'current-password'
                        }
                        fullWidth
                      />
                    </InputContainer>

                    <Inline gap="sm" align="center">
                      <Button type="submit" variant="primary" size="md" disabled={loading}>
                        {loading
                          ? 'Submitting...'
                          : isRecovery
                            ? 'Reset password'
                            : showTokenField
                              ? 'Create account'
                              : 'Log in'}
                      </Button>
                    </Inline>

                    <Inline gap="sm" align="center">
                      {isRecovery ? (
                        <Anchor
                          component="button"
                          type="button"
                          onClick={switchToLoginMode}
                          size="sm"
                        >
                          Back to log in
                        </Anchor>
                      ) : (
                        <Anchor
                          component="button"
                          type="button"
                          onClick={switchToRecoveryMode}
                          size="sm"
                        >
                          Forgot password?
                        </Anchor>
                      )}
                    </Inline>
                  </Stack>
                </Box>
              </CardBody>
            </Card>
          </Stack>
        </Section>
      </PageContainer>
    </Main>
  );
}
