import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Title,
  Stack,
  TextInput,
  Textarea,
  Select,
  Button,
  Alert,
  Loader,
} from '@mantine/core';
import type { LookupsResponse, BugSeverity, BugReproducibility } from '@tracker/types';
import { api, ApiError } from '../api.js';

const SEVERITY_OPTIONS: { value: BugSeverity; label: string }[] = [
  { value: 'cosmetic', label: 'Cosmetic' },
  { value: 'functional', label: 'Functional' },
  { value: 'blocking', label: 'Blocking' },
];

const REPRODUCIBILITY_OPTIONS: { value: BugReproducibility; label: string }[] = [
  { value: 'always', label: 'Always' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'once', label: 'Once' },
];

export function SubmitTicketPage() {
  const navigate = useNavigate();
  const [lookups, setLookups] = useState<LookupsResponse | null>(null);
  const [lookupsError, setLookupsError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [domainId, setDomainId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [reproducibility, setReproducibility] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getLookups()
      .then(setLookups)
      .catch((err: unknown) => {
        setLookupsError(err instanceof ApiError ? err.message : 'Failed to load options.');
      });
  }, []);

  const selectedTypeName = lookups?.ticket_types.find((t) => String(t.id) === typeId)?.slug;
  const isBugType = selectedTypeName === 'bug';

  function handleSubmit() {
    if (!title.trim() || !description.trim() || !typeId || !domainId) return;
    setSubmitting(true);
    setSubmitError(null);

    const body = {
      title: title.trim(),
      description: description.trim(),
      type_id: Number(typeId),
      domain_id: Number(domainId),
      ...(isBugType && severity ? { severity: severity as BugSeverity } : {}),
      ...(isBugType && reproducibility
        ? { reproducibility: reproducibility as BugReproducibility }
        : {}),
    };

    api
      .createTicket(body)
      .then((res) => navigate(`/tickets/${res.id}`))
      .catch((err: unknown) => {
        setSubmitError(err instanceof ApiError ? err.message : 'Failed to submit ticket.');
      })
      .finally(() => setSubmitting(false));
  }

  if (!lookups && !lookupsError) return <Loader m="md" />;
  if (lookupsError)
    return (
      <Alert color="red" m="md">
        {lookupsError}
      </Alert>
    );
  if (!lookups) return null;

  const typeData = lookups.ticket_types.map((t) => ({
    value: String(t.id),
    label: t.name,
  }));

  const domainData = lookups.domains.map((d) => ({
    value: String(d.id),
    label: d.name,
  }));

  const isValid = title.trim() && description.trim() && typeId && domainId;

  return (
    <Container size="sm" py="md">
      <Stack gap="md">
        <Title order={2}>Submit a Ticket</Title>

        {submitError && <Alert color="red">{submitError}</Alert>}

        <TextInput
          label="Title"
          placeholder="Brief summary of the issue"
          required
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />

        <Textarea
          label="Description"
          placeholder="Describe the issue in detail"
          required
          minRows={5}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />

        <Select
          label="Type"
          placeholder="Select type"
          required
          data={typeData}
          value={typeId}
          onChange={setTypeId}
        />

        <Select
          label="Domain"
          placeholder="Select domain"
          required
          data={domainData}
          value={domainId}
          onChange={setDomainId}
        />

        {isBugType && (
          <>
            <Select
              label="Severity"
              placeholder="Select severity"
              data={SEVERITY_OPTIONS}
              value={severity}
              onChange={setSeverity}
            />
            <Select
              label="Reproducibility"
              placeholder="Select reproducibility"
              data={REPRODUCIBILITY_OPTIONS}
              value={reproducibility}
              onChange={setReproducibility}
            />
          </>
        )}

        <Button onClick={handleSubmit} loading={submitting} disabled={!isValid}>
          Submit Ticket
        </Button>
      </Stack>
    </Container>
  );
}
