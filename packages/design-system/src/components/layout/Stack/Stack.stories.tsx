import type { Meta, StoryObj } from '@storybook/react';
import { Stack } from './Stack';
import { Box, Text, Title } from '../../../mantine';

const meta: Meta<typeof Stack> = {
  title: 'Layout/Stack',
  component: Stack,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    gap: {
      control: { type: 'select' },
      options: ['default', 'title'],
      description:
        "Semantic spacing between children. For this demo we only show 'default' and 'title'.",
    },
    align: { control: false },
    justify: { control: false },
    wrap: { control: false },
    as: { control: false },
    className: { control: false },
    children: { control: false },
  },
  args: {
    gap: 'default',
  },
};

export default meta;

type Story = StoryObj<typeof Stack>;

// A simple card frame for teaching examples
const DemoCard = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Box
    component="section"
    style={{
      padding: 16,
      borderRadius: 12,
      background: 'var(--ds-color-surface-muted)',
      border: '1px solid var(--ds-color-border)',
      maxWidth: 480,
    }}
  >
    <Text
      component="span"
      style={{
        fontSize: 12,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.04,
        marginBottom: 8,
        color: 'var(--ds-color-text-muted)',
      }}
    >
      {label}
    </Text>
    {children}
  </Box>
);

/**
 * Heading → body using gap="title".
 * Shows extra space between heading and body, with a band highlighting the gap.
 */
export const HeadingToBody: Story = {
  name: 'Heading → body (gap="title")',
  render: () => (
    <DemoCard label='Heading to body · gap="title"'>
      <Stack gap="title">
        <Title order={3} style={{ margin: 0 }}>
          Quarterly metrics
        </Title>
        <Text style={{ margin: 0 }}>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Foo bar baz qux.
        </Text>
      </Stack>
    </DemoCard>
  ),
  parameters: {
    controls: { disable: true },
  },
};

/**
 * Body → body using gap="default".
 * Shows tighter spacing between two paragraphs, with a band highlighting the gap.
 */
export const BodyToBody: Story = {
  name: 'Body → body (gap="default")',
  render: () => (
    <DemoCard label='Body to body · gap="default"'>
      <Stack gap="default">
        <Text style={{ margin: 0 }}>
          Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        </Text>
        <Text style={{ margin: 0 }}>
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip.
        </Text>
      </Stack>
    </DemoCard>
  ),
  parameters: {
    controls: { disable: true },
  },
};
