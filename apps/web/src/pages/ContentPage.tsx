import {
  CoreAlert as Alert,
  CoreButton as Button,
  CoreGroup as Group,
  CoreLoader as Loader,
  CoreStack as Stack,
  CoreText as Text,
  CoreTextInput as TextInput,
  CoreTextarea as Textarea,
  CoreTitle as Title,
} from '../design-system';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '../mantine';
import { ApiError, getJson, getJsonAuth, putJsonAuth } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';

export type ContentPagePayload = {
  slug: string;
  title: string;
  markdown: string;
  updated_at: string;
  updated_by_user_id: number | null;
};

export function usePublicContentPage(slug: string) {
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<ContentPagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const data = await getJson<ContentPagePayload>(
          `/content/pages/${encodeURIComponent(slug)}`,
        );
        if (!cancelled) setPage(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError('This page is not available yet.');
        } else {
          setError('Failed to load content.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { loading, page, error };
}

export function ContentPage({ slug }: { slug: string }) {
  const { loading, page, error } = usePublicContentPage(slug);

  if (loading) {
    return (
      <Stack gap="sm" py="lg">
        <Loader size="sm" />
        <Text c="dimmed" size="sm">
          Loading page...
        </Text>
      </Stack>
    );
  }

  if (error || !page) {
    return (
      <Alert color="red" variant="light">
        {error ?? 'This page is not available.'}
      </Alert>
    );
  }

  return (
    <Stack gap="md" py="lg">
      <Title order={1}>{page.title}</Title>
      <MarkdownRenderer markdown={page.markdown} />
    </Stack>
  );
}

export function ContentEditor({ slug }: { slug: string }) {
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const data = await getJsonAuth<ContentPagePayload>(
          `/content/pages/${encodeURIComponent(slug)}`,
          auth.token!,
        );
        if (cancelled) return;
        setTitle(data.title);
        setMarkdown(data.markdown);
        setSavedAt(data.updated_at ?? null);
      } catch {
        if (!cancelled) {
          setError('Failed to load page content.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, auth.token]);

  const canSave = useMemo(
    () => title.trim().length > 0 && markdown.trim().length > 0,
    [title, markdown],
  );

  const onSave = async () => {
    if (!auth.token || !canSave) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await putJsonAuth<ContentPagePayload>(
        `/content/pages/${encodeURIComponent(slug)}`,
        auth.token,
        { title: title.trim(), markdown },
      );
      setSavedAt(updated.updated_at ?? null);
      setSuccess('Saved.');
    } catch {
      setError('Failed to save page content.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Stack gap="sm" py="sm">
        <Loader size="sm" />
        <Text c="dimmed" size="sm">
          Loading editor...
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={3}>Edit: {slug}</Title>
          {savedAt ? (
            <Text size="xs" c="dimmed">
              Last saved: {new Date(savedAt).toLocaleString()}
            </Text>
          ) : null}
        </Stack>
        <Group gap="xs">
          <Button component={Link} variant="subtle" to="/admin/content" size="sm">
            Back to Content
          </Button>
          <Button onClick={onSave} loading={saving} disabled={!canSave} size="sm">
            Save
          </Button>
        </Group>
      </Group>

      {error ? (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      ) : null}

      {success ? (
        <Alert color="green" variant="light">
          {success}
        </Alert>
      ) : null}

      <TextInput
        label="Page title"
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
      />

      <Textarea
        label="Markdown"
        value={markdown}
        onChange={(event) => setMarkdown(event.currentTarget.value)}
        autosize
        minRows={14}
        maxRows={28}
      />

      <Stack gap="xs">
        <Text fw={600}>Preview</Text>
        <MarkdownRenderer markdown={markdown} />
      </Stack>
    </Stack>
  );
}
