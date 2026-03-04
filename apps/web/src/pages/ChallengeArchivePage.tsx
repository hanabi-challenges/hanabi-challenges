import React from 'react';
import { Main, PageContainer, Section, Stack, Heading, Text } from '../design-system';

export const ChallengeArchivePage: React.FC = () => {
  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg">
          <Stack gap="sm">
            <Heading level={1}>Challenge Archive</Heading>
            <Text variant="body">
              This page will list all challenges (current and past). For now, it&apos;s just a
              placeholder.
            </Text>
          </Stack>
        </Section>
      </PageContainer>
    </Main>
  );
};
