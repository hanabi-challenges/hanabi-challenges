import { Box, Group, Text, Anchor } from '@mantine/core';
import { Link } from 'react-router-dom';

export function NavHeader() {
  return (
    <Box
      component="header"
      px="md"
      py="sm"
      style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}
    >
      <Group justify="space-between">
        <Text fw={700} size="lg" component={Link} to="/" style={{ textDecoration: 'none' }}>
          Hanabi Tracker
        </Text>
        <Group gap="md">
          <Anchor component={Link} to="/">
            All Tickets
          </Anchor>
          <Anchor component={Link} to="/submit">
            Submit
          </Anchor>
          <Anchor component={Link} to="/notifications">
            Notifications
          </Anchor>
        </Group>
      </Group>
    </Box>
  );
}
