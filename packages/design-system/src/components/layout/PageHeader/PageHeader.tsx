import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';
import { Heading } from '../../typography/Heading/Heading';
import { Text } from '../../typography/Text/Text';
import { Inline } from '../Inline/Inline';

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  level?: 1 | 2 | 3 | 4;
};

/**
 * Canonical title/subtitle header block.
 * Locks spacing so pages do not drift between title/subtitle/body rhythm.
 */
export function PageHeader({ title, subtitle, actions, level = 1 }: PageHeaderProps): ReactElement {
  return (
    <Box style={{ display: 'block' }}>
      <Inline style={{ width: '100%' }} justify="space-between" align="start" wrap>
        <Box
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--ds-space-xs)',
            minWidth: 0,
          }}
        >
          <Heading level={level}>{title}</Heading>
          {subtitle ? <Text variant="muted">{subtitle}</Text> : null}
        </Box>
        {actions ? (
          <Box style={{ display: 'inline-flex', alignItems: 'center' }}>{actions}</Box>
        ) : null}
      </Inline>
    </Box>
  );
}
