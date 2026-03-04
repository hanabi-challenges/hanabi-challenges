import type { ReactNode } from 'react';
import { Box } from '../../../../mantine';
import { Heading } from '../../typography/Heading/Heading';
import { Text } from '../../typography/Text/Text';
import { Inline } from '../Inline/Inline';
import './PageHeader.css';

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
export function PageHeader({ title, subtitle, actions, level = 1 }: PageHeaderProps) {
  return (
    <Box className="ui-page-header">
      <Inline className="ui-page-header__main" justify="space-between" align="start" wrap>
        <Box className="ui-page-header__text">
          <Heading level={level}>{title}</Heading>
          {subtitle ? <Text variant="muted">{subtitle}</Text> : null}
        </Box>
        {actions ? <Box className="ui-page-header__actions">{actions}</Box> : null}
      </Inline>
    </Box>
  );
}
