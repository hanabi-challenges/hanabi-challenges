import type { ReactElement } from 'react';
import { Text as MantineText } from '../../../mantine';

type EloDeltaProps = {
  delta: number;
};

/**
 * EloDelta
 * Renders a signed ELO/rating delta with directional colouring.
 * Positive → success (▲), negative → danger (▼), zero → muted (■).
 */
export function EloDelta({ delta }: EloDeltaProps): ReactElement {
  if (delta > 0) {
    return (
      <MantineText
        component="span"
        style={{ color: 'var(--ds-color-tone-success-text)', fontWeight: 600 }}
      >
        {`▲ ${Math.abs(delta).toFixed(1)}`}
      </MantineText>
    );
  }
  if (delta < 0) {
    return (
      <MantineText
        component="span"
        style={{ color: 'var(--ds-color-tone-danger-text)', fontWeight: 600 }}
      >
        {`▼ ${Math.abs(delta).toFixed(1)}`}
      </MantineText>
    );
  }
  return (
    <MantineText component="span" style={{ color: 'var(--ds-color-text-muted)' }}>
      {'■ 0.0'}
    </MantineText>
  );
}
