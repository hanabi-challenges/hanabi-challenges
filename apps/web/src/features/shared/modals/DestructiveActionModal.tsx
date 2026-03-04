import { useEffect, useMemo, useState } from 'react';
import {
  CoreAlert as Alert,
  CoreButton as Button,
  CoreGroup as Group,
  CoreModal as Modal,
  CoreStack as Stack,
  CoreText as Text,
  CoreTextInput as TextInput,
} from '../../../design-system';

export type DestructiveConsequence = {
  label: string;
  value: string | number;
};

export function DestructiveActionModal(props: {
  opened: boolean;
  onClose: () => void;
  title: string;
  summary: string;
  consequences: DestructiveConsequence[];
  confirmLabel: string;
  confirmPhrase: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
}) {
  const {
    opened,
    onClose,
    title,
    summary,
    consequences,
    confirmLabel,
    confirmPhrase,
    loading,
    error,
    onConfirm,
  } = props;
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!opened) return;
    setTyped('');
  }, [opened, confirmPhrase]);

  const normalizedTyped = useMemo(() => typed.trim(), [typed]);
  const canConfirm =
    normalizedTyped === confirmPhrase && !loading && confirmPhrase.trim().length > 0;

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack gap="md">
        <Text size="sm">{summary}</Text>

        <Stack gap="xs">
          {consequences.map((entry) => (
            <Group key={entry.label} justify="space-between" wrap="nowrap">
              <Text size="sm" c="dimmed">
                {entry.label}
              </Text>
              <Text size="sm" fw={700}>
                {entry.value}
              </Text>
            </Group>
          ))}
        </Stack>

        <TextInput
          label={`Type "${confirmPhrase}" to continue`}
          value={typed}
          onChange={(event) => setTyped(event.currentTarget.value)}
          autoComplete="off"
          spellCheck={false}
        />

        {error ? <Alert color="red">{error}</Alert> : null}

        <Group justify="end">
          <Button variant="subtle" onClick={onClose} disabled={Boolean(loading)}>
            Cancel
          </Button>
          <Button color="red" onClick={() => void onConfirm()} disabled={!canConfirm}>
            {loading ? 'Working...' : confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
