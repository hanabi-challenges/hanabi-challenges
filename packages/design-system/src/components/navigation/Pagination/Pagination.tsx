import type { ReactElement } from 'react';
import { Box, Text } from '../../../mantine';
import { Button } from '../../inputs/Button/Button';

type PaginationProps = {
  totalItems: number;
  pageSize?: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function Pagination({
  totalItems,
  pageSize = 10,
  currentPage,
  onPageChange,
  className,
}: PaginationProps): ReactElement {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const goTo = (page: number) => {
    const clamped = Math.min(Math.max(page, 1), totalPages);
    if (clamped !== currentPage) onPageChange(clamped);
  };

  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  return (
    <Box
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}
      className={className}
    >
      <Box
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--ds-space-xs)',
          flexWrap: 'wrap',
        }}
      >
        <Button
          size="sm"
          variant="secondary"
          onClick={() => goTo(1)}
          disabled={isFirst}
          aria-label="First page"
        >
          «
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => goTo(currentPage - 1)}
          disabled={isFirst}
          aria-label="Previous page"
        >
          ‹
        </Button>
        <Text component="span" style={{ color: 'var(--ds-color-text-muted)', fontWeight: 600 }}>
          Page {currentPage} of {totalPages}
        </Text>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => goTo(currentPage + 1)}
          disabled={isLast}
          aria-label="Next page"
        >
          ›
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => goTo(totalPages)}
          disabled={isLast}
          aria-label="Last page"
        >
          »
        </Button>
      </Box>
    </Box>
  );
}
