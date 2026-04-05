import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Title,
  Card,
  Text,
  Textarea,
  Button,
  Group,
  Alert,
  Loader,
  Center,
  Stack,
  Code,
} from '@mantine/core';
import { api, ApiError } from '../api.js';

interface Template {
  type_slug: string;
  type_name: string;
  body: string;
  updated_at: string | null;
  updated_by: string | null;
}

const MAX_BODY_LENGTH = 5000;

function TemplateEditor({ template, onSaved }: { template: Template; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  function handleCancel() {
    setDraft(template.body);
    setEditing(false);
    setError(null);
  }

  async function handleSave() {
    if (draft.length > MAX_BODY_LENGTH) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateTemplate(template.type_slug, draft);
      if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card withBorder mb="md">
      <Title order={4} mb="xs">
        {template.type_name}
      </Title>
      {template.updated_at && (
        <Text size="xs" c="dimmed" mb="sm">
          Last updated: {new Date(template.updated_at).toLocaleString()}
          {template.updated_by ? ` by ${template.updated_by}` : ''}
        </Text>
      )}

      {!editing ? (
        <>
          <Code block mb="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {template.body || '(no template)'}
          </Code>
          <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </>
      ) : (
        <>
          <Group mb="xs" gap="xs">
            <Button
              size="xs"
              variant={preview ? 'outline' : 'filled'}
              onClick={() => setPreview(false)}
            >
              Edit
            </Button>
            <Button
              size="xs"
              variant={preview ? 'filled' : 'outline'}
              onClick={() => setPreview(true)}
            >
              Preview
            </Button>
          </Group>

          {preview ? (
            <Code block mb="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {draft || '(empty)'}
            </Code>
          ) : (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              minRows={8}
              mb="xs"
              error={
                draft.length > MAX_BODY_LENGTH
                  ? `${draft.length}/${MAX_BODY_LENGTH} — too long`
                  : undefined
              }
            />
          )}

          {error && (
            <Alert color="red" mb="sm">
              {error}
            </Alert>
          )}

          <Group gap="xs">
            <Button
              size="xs"
              loading={saving}
              disabled={draft.length > MAX_BODY_LENGTH}
              onClick={() => void handleSave()}
            >
              Save
            </Button>
            <Button size="xs" variant="outline" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
          </Group>
        </>
      )}
    </Card>
  );
}

export function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.listTemplates();
      setTemplates(data.templates);
      setError(null);
    } catch {
      setError('Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Center mt="xl">
        <Loader />
      </Center>
    );
  }

  if (error) {
    return (
      <Container mt="md">
        <Alert color="red">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container mt="md">
      <Title order={2} mb="md">
        Template Management
      </Title>
      <Stack gap={0}>
        {templates.map((t) => (
          <TemplateEditor key={t.type_slug} template={t} onSaved={load} />
        ))}
      </Stack>
    </Container>
  );
}
