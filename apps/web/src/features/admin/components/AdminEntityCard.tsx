import type { MouseEvent, ReactNode } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CoreBox as Box,
  Heading,
  Inline,
  Stack,
  Text,
} from '../../../design-system';

export type AdminEntityCardProps = {
  title: string;
  subtitle?: string | null;
  href?: string;
  leftSlot?: ReactNode;
  actions?: ReactNode;
};

/**
 * Canonical row card for admin entity indexes.
 * Keeps spacing/interaction consistent across Events, Badges, and similar admin lists.
 */
export function AdminEntityCard({
  title,
  subtitle,
  href,
  leftSlot,
  actions,
}: AdminEntityCardProps) {
  return (
    <Card variant="outline" href={href}>
      <CardBody>
        <Inline align="center" justify="space-between" wrap={false}>
          <Inline align="center" gap="sm" wrap={false}>
            {leftSlot ?? null}
            <Stack gap="xs">
              <Heading level={4}>{title}</Heading>
              {subtitle ? (
                <Text tone="muted" size="sm">
                  {subtitle}
                </Text>
              ) : null}
            </Stack>
          </Inline>
          {actions ? (
            <Box
              onClick={(event: MouseEvent) => event.stopPropagation()}
              onMouseDown={(event: MouseEvent) => event.stopPropagation()}
              role="presentation"
            >
              {actions}
            </Box>
          ) : null}
        </Inline>
      </CardBody>
    </Card>
  );
}

export type AdminLinkCardProps = {
  title: string;
  description: string;
  href: string;
  rightSlot?: ReactNode;
};

/**
 * Canonical navigation card for admin landing/section pages.
 */
export function AdminLinkCard({ title, description, href, rightSlot }: AdminLinkCardProps) {
  return (
    <Card variant="outline" href={href} interactive>
      <CardHeader>
        <Inline align="center" justify="space-between" wrap={false}>
          <Heading level={3}>{title}</Heading>
          {rightSlot ?? null}
        </Inline>
      </CardHeader>
      <CardBody>
        <Text tone="muted" size="sm">
          {description}
        </Text>
      </CardBody>
    </Card>
  );
}
