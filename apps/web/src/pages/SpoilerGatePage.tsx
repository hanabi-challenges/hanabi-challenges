import { Link } from 'react-router-dom';
import {
  Alert,
  Button,
  Heading,
  Inline,
  PageContainer,
  Section,
  Stack,
  Text,
  Main,
} from '../design-system';

type Mode = 'prompt' | 'blocked' | 'login' | 'error' | 'loading';

interface Props {
  mode: Mode;
  eventSlug?: string;
  onForfeit?: () => Promise<void> | void;
  loading?: boolean;
  errorMessage?: string | null;
  loginPath?: string;
}

export function SpoilerGatePage({
  mode,
  eventSlug,
  onForfeit,
  loading = false,
  errorMessage,
  loginPath = '/login',
}: Props) {
  const heading =
    mode === 'prompt'
      ? 'Spoilers!'
      : mode === 'blocked'
        ? 'Spoilers!'
        : mode === 'login'
          ? 'Spoilers!'
          : mode === 'error'
            ? 'Spoilers!'
            : 'Checking eligibility…';

  const backHref = eventSlug ? `/events/${eventSlug}` : '/';

  return (
    <Main>
      <PageContainer variant="narrow">
        <Section paddingY="lg">
          <Stack gap="md">
            <Heading level={1}>{heading}</Heading>

            {mode === 'loading' && <Text>Checking your eligibility…</Text>}

            {mode === 'prompt' && (
              <Stack gap="sm">
                <Text>
                  The page you&apos;re trying to look at contains spoilers. If you’re just here to
                  browse, you can continue and we’ll mark you as having seen the spoilers and you'll
                  forfeit your eligibility to participate. If you still plan to play, head back and
                  keep the mystery intact&nbsp;&mdash; no hard feelings either way.
                </Text>
                <Inline gap="sm" align="center">
                  <Button onClick={onForfeit} disabled={loading} variant="primary">
                    {loading ? 'Continuing…' : 'Continue to spoilers'}
                  </Button>
                  <Button as={Link} to={backHref} variant="secondary">
                    Stay eligible
                  </Button>
                </Inline>
              </Stack>
            )}

            {mode === 'blocked' && (
              <Stack gap="sm">
                <Text>
                  You’re enrolled for this event and team size, so we’re keeping this page tucked
                  away to protect fairness. Finish playing before peeking at other teams’ secrets.
                </Text>
                <Button as={Link} to={backHref} variant="secondary">
                  Back to event
                </Button>
              </Stack>
            )}

            {mode === 'login' && (
              <Stack gap="sm">
                <Text>
                  The page you&apos;re trying to look at contains spoilers. Log in so we can check
                  your eligibility before you decide whether to peek or leave the mystery intact.
                </Text>
                <Inline>
                  <Button as={Link} to={loginPath} variant="primary">
                    Go to login
                  </Button>
                </Inline>
              </Stack>
            )}

            {mode === 'error' && (
              <Stack gap="sm">
                <Alert variant="error" message={errorMessage ?? 'Unable to check eligibility.'} />
                <Inline gap="sm">
                  <Button as={Link} to={backHref} variant="secondary">
                    Back to event
                  </Button>
                  <Button as={Link} to={loginPath} variant="primary">
                    Log in
                  </Button>
                </Inline>
              </Stack>
            )}
          </Stack>
        </Section>
      </PageContainer>
    </Main>
  );
}
