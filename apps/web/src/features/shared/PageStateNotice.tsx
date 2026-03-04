import type { ReactNode } from 'react';
import {
  Card,
  CardBody,
  Heading,
  PageContainer,
  Section,
  Stack,
  Text,
  Main,
} from '../../design-system';

type PageStateNoticeProps = {
  title?: string;
  message: ReactNode;
  variant?: 'neutral' | 'error';
  container?: 'page' | 'narrow';
};

export function PageStateNotice({
  title,
  message,
  variant = 'neutral',
  container = 'narrow',
}: PageStateNoticeProps) {
  return (
    <Main>
      <PageContainer variant={container}>
        <Section paddingY="lg">
          <Card variant="outline">
            <CardBody>
              <Stack gap="sm">
                {title ? <Heading level={2}>{title}</Heading> : null}
                {typeof message === 'string' ? (
                  <Text variant={variant === 'error' ? 'body' : 'muted'}>{message}</Text>
                ) : (
                  message
                )}
              </Stack>
            </CardBody>
          </Card>
        </Section>
      </PageContainer>
    </Main>
  );
}
