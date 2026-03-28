import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  FormContainer,
  Heading,
  Input,
  InputContainer,
  Main,
  PageContainer,
  Section,
  Select,
  Stack,
  Text,
} from '../design-system';
import { useAuth } from '../context/AuthContext';
import { getLookups, createTicket } from '../features/feedback/api';
import {
  DOMAIN_LABELS,
  TYPE_LABELS,
  SEVERITY_LABELS,
  REPRODUCIBILITY_LABELS,
} from '../features/feedback/statusConfig';
import type {
  TicketTypeLookup,
  DomainLookup,
  BugSeverity,
  BugReproducibility,
} from '../features/feedback/types';

type FormErrors = Partial<
  Record<'title' | 'type_id' | 'domain_id' | 'description' | 'severity' | 'reproducibility', string>
>;

export function FeedbackNewPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [types, setTypes] = useState<TicketTypeLookup[]>([]);
  const [domains, setDomains] = useState<DomainLookup[]>([]);
  const [lookupsError, setLookupsError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [typeId, setTypeId] = useState('');
  const [domainId, setDomainId] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('');
  const [reproducibility, setReproducibility] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedTypeSlug = types.find((t) => String(t.id) === typeId)?.slug;
  const isBug = selectedTypeSlug === 'bug';

  useEffect(() => {
    getLookups()
      .then((res) => {
        setTypes(res.ticket_types);
        setDomains(res.domains);
      })
      .catch((err: unknown) => {
        setLookupsError(err instanceof Error ? err.message : 'Failed to load form options.');
      });
  }, []);

  // Redirect to login if not authenticated
  if (!user) {
    return (
      <Main>
        <PageContainer>
          <Section paddingY="lg" baseLevel={1}>
            <Stack gap="md">
              <Heading level={1}>Submit Feedback</Heading>
              <Alert variant="default" message="You must be logged in to submit feedback." />
              <Button variant="primary" onClick={() => navigate('/login')}>
                Log in
              </Button>
            </Stack>
          </Section>
        </PageContainer>
      </Main>
    );
  }

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!title.trim()) e.title = 'Title is required.';
    else if (title.trim().length > 200) e.title = 'Title must be 200 characters or fewer.';
    if (!typeId) e.type_id = 'Type is required.';
    if (!domainId) e.domain_id = 'Domain is required.';
    if (!description.trim()) e.description = 'Description is required.';
    if (isBug && !severity) e.severity = 'Severity is required for bugs.';
    if (isBug && !reproducibility) e.reproducibility = 'Reproducibility is required for bugs.';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    if (!token) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const res = await createTicket(
        {
          title: title.trim(),
          description: description.trim(),
          type_id: Number(typeId),
          domain_id: Number(domainId),
          ...(isBug && severity ? { severity: severity as BugSeverity } : {}),
          ...(isBug && reproducibility
            ? { reproducibility: reproducibility as BugReproducibility }
            : {}),
        },
        token,
      );
      navigate(`/feedback/${res.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const typeOptions = types.map((t) => ({
    value: String(t.id),
    label: TYPE_LABELS[t.slug] ?? t.name,
  }));

  const domainOptions = domains.map((d) => ({
    value: String(d.id),
    label: DOMAIN_LABELS[d.slug] ?? d.name,
  }));

  const severityOptions = Object.entries(SEVERITY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const reproducibilityOptions = Object.entries(REPRODUCIBILITY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg" baseLevel={1} header={<Heading level={1}>Submit Feedback</Heading>}>
          <Text variant="muted">
            Use this form to report bugs, request features, or leave other feedback.
          </Text>

          {lookupsError ? <Alert variant="error" message={lookupsError} /> : null}

          <FormContainer gap="lg">
            <InputContainer label="Title" error={errors.title}>
              <Input
                placeholder="Briefly describe the issue or request"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
                }}
                fullWidth
              />
            </InputContainer>

            <InputContainer label="Type" error={errors.type_id}>
              <Select
                options={typeOptions}
                value={typeId}
                onChange={(v) => {
                  setTypeId(v);
                  setSeverity('');
                  setReproducibility('');
                  if (errors.type_id) setErrors((prev) => ({ ...prev, type_id: undefined }));
                }}
                placeholder="Select a type"
              />
            </InputContainer>

            <InputContainer label="Domain" error={errors.domain_id}>
              <Select
                options={domainOptions}
                value={domainId}
                onChange={(v) => {
                  setDomainId(v);
                  if (errors.domain_id) setErrors((prev) => ({ ...prev, domain_id: undefined }));
                }}
                placeholder="Select a domain"
              />
            </InputContainer>

            {isBug ? (
              <>
                <InputContainer
                  label="Severity"
                  error={errors.severity}
                  helperText="How badly does this bug affect functionality?"
                >
                  <Select
                    options={severityOptions}
                    value={severity}
                    onChange={(v) => {
                      setSeverity(v);
                      if (errors.severity) setErrors((prev) => ({ ...prev, severity: undefined }));
                    }}
                    placeholder="Select severity"
                  />
                </InputContainer>

                <InputContainer
                  label="Reproducibility"
                  error={errors.reproducibility}
                  helperText="How consistently does this bug occur?"
                >
                  <Select
                    options={reproducibilityOptions}
                    value={reproducibility}
                    onChange={(v) => {
                      setReproducibility(v);
                      if (errors.reproducibility)
                        setErrors((prev) => ({ ...prev, reproducibility: undefined }));
                    }}
                    placeholder="Select reproducibility"
                  />
                </InputContainer>
              </>
            ) : null}

            <InputContainer
              label="Description"
              error={errors.description}
              helperText="Include as much detail as you can: steps to reproduce, expected vs. actual behavior, etc."
            >
              <Input
                multiline
                rows={7}
                placeholder="Describe the issue or request in detail…"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (errors.description)
                    setErrors((prev) => ({ ...prev, description: undefined }));
                }}
                fullWidth
              />
            </InputContainer>

            {submitError ? <Alert variant="error" message={submitError} /> : null}

            <Button
              variant="primary"
              size="md"
              onClick={() => void handleSubmit()}
              disabled={busy}
              style={{ alignSelf: 'flex-start' }}
            >
              {busy ? 'Submitting…' : 'Submit'}
            </Button>
          </FormContainer>
        </Section>
      </PageContainer>
    </Main>
  );
}
