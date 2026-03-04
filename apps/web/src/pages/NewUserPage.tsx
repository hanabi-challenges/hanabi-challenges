import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Heading, PageContainer, Section, Stack, Text, Main } from '../design-system';

type LocationState = {
  displayName?: string;
};

export function NewUserPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? {};
  const displayName = state.displayName ?? user?.display_name;

  useEffect(() => {
    if (!displayName) navigate('/', { replace: true });
  }, [displayName, navigate]);

  if (!displayName) return null;

  return (
    <Main>
      <PageContainer variant="narrow">
        <Section paddingY="lg">
          <Stack gap="sm">
            <Heading level={1}>Welcome, {displayName}!</Heading>
            <Text variant="body">
              Your account has been created. You can head back to the main page to explore events.
            </Text>
            <Button variant="primary" onClick={() => navigate('/')}>
              Go to main page
            </Button>
          </Stack>
        </Section>
      </PageContainer>
    </Main>
  );
}
