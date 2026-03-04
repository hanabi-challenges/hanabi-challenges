import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, postJsonAuth } from '../../../lib/api';
import { UserPill } from '../../users/UserPill';
import { UserSearchSelect, type UserSuggestion } from '../../users/UserSearchSelect';
import {
  Alert,
  Button,
  Heading,
  Inline,
  Input,
  InputContainer,
  MaterialIcon,
  Modal,
  Pill,
  Select,
  Stack,
  Text,
  Tooltip,
} from '../../../design-system';

type MemberEntry = {
  id?: number;
  display_name: string;
  color_hex: string;
  text_color: string;
  role: 'PLAYER' | 'STAFF';
  isPending?: boolean;
  locked?: boolean;
  ineligible?: boolean;
};

type RegisterModalProps = {
  eventSlug: string;
  eventName: string;
  refetchTeams: () => Promise<void>;
  auth: {
    user: {
      id: number;
      display_name: string;
      color_hex: string;
      text_color: string;
    } | null;
    token: string | null;
  };
  directory: Array<{
    id: number;
    display_name: string;
    color_hex: string;
    text_color: string;
  }>;
  memberships: Array<{
    user_id: number;
    team_size: number;
  }>;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string | null) => void;
  enforceExactTeamSize?: boolean;
};

export function RegisterModal({
  eventSlug,
  eventName,
  refetchTeams,
  auth,
  directory,
  memberships,
  onClose,
  onSuccess,
  onError,
  enforceExactTeamSize = false,
}: RegisterModalProps) {
  const navigate = useNavigate();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const user = auth.user;
  const defaultTeamName = user ? `${user.display_name}'s Team` : 'My Team';
  const [teamName, setTeamName] = useState('');
  const [teamPassword, setTeamPassword] = useState('');
  const [teamSize, setTeamSize] = useState<number | null>(null);
  const [memberInput, setMemberInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberEntry[]>(() => {
    if (!user) return [];
    return [
      {
        id: user.id,
        display_name: user.display_name,
        color_hex: user.color_hex,
        text_color: user.text_color,
        role: 'PLAYER',
        locked: true,
      },
    ];
  });

  const conflictsBySize = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const m of memberships) {
      if (!map.has(m.team_size)) map.set(m.team_size, new Set());
      map.get(m.team_size)!.add(m.user_id);
    }
    return map;
  }, [memberships]);

  const markIneligibility = (list: MemberEntry[], size: number | null) => {
    if (!size) return list.map((m) => ({ ...m, ineligible: false }));
    const blocked = conflictsBySize.get(size) ?? new Set<number>();
    return list.map((m) =>
      m.id && blocked.has(m.id) ? { ...m, ineligible: true } : { ...m, ineligible: false },
    );
  };

  const suggestions = useMemo(() => {
    const term = memberInput.trim().toLowerCase();
    if (!term) return [];
    const blocked = teamSize ? conflictsBySize.get(teamSize) : undefined;
    return directory
      .filter((u) => !members.some((m) => m.id === u.id))
      .filter((u) => !blocked?.has(u.id))
      .filter((u) => u.display_name.toLowerCase().includes(term))
      .slice(0, 5);
  }, [memberInput, directory, members, conflictsBySize, teamSize]);

  useEffect(() => {
    const invalid = members.filter((m) => m.ineligible);
    if (invalid.length > 0) {
      setLocalError(
        `${invalid.map((m) => m.display_name).join(', ')} already on a ${teamSize}p team.`,
      );
    } else if (localError && localError.includes('already on a')) {
      setLocalError(null);
    }
  }, [members, teamSize, localError]);

  if (!user) {
    return (
      <Modal open onClose={onClose} maxWidth="520px">
        <Stack gap="sm">
          <Heading level={3}>Log in to register</Heading>
          <Text variant="body">You need to log in before registering a team.</Text>
          <Inline gap="sm" align="center">
            <Button as={Link} to="/login" variant="primary" size="sm">
              Go to login
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </Inline>
        </Stack>
      </Modal>
    );
  }

  const addMember = (entry: MemberEntry) => {
    setMembers((prev) => markIneligibility([...prev, entry], teamSize));
    setLocalError(null);
  };

  const handleAddMemberInput = (inputVal?: string) => {
    const name = (inputVal ?? memberInput).trim();
    if (!name) return;
    const existing = directory.find((u) => u.display_name.toLowerCase() === name.toLowerCase());
    if (existing && !members.some((m) => m.id === existing.id)) {
      const conflictSet = teamSize ? conflictsBySize.get(teamSize) : undefined;
      if (conflictSet?.has(existing.id)) {
        const msg = `${existing.display_name} is already on a ${teamSize}p team for this event.`;
        setLocalError(msg);
        onError(msg);
        return;
      }
      addMember({
        id: existing.id,
        display_name: existing.display_name,
        color_hex: existing.color_hex,
        text_color: existing.text_color,
        role: 'PLAYER',
      });
      return;
    }
    // Pending member
    addMember({
      display_name: name,
      color_hex: '#777777',
      text_color: '#ffffff',
      role: 'PLAYER',
      isPending: true,
    });
    setMemberInput('');
  };

  const removeMember = (name: string) => {
    setMembers((prev) =>
      markIneligibility(
        prev.filter((m) => m.display_name !== name || m.locked),
        teamSize,
      ),
    );
  };

  const handleSubmit = async () => {
    const finalName = teamName.trim() || defaultTeamName;
    if (!teamSize) {
      const msg = 'Select a team size.';
      setLocalError(msg);
      onError(msg);
      return;
    }
    if (enforceExactTeamSize && teamSize && members.length !== teamSize) {
      const msg = `Team must have exactly ${teamSize} players.`;
      setLocalError(msg);
      onError(msg);
      return;
    }
    if (teamPassword && /[^a-zA-Z0-9]/.test(teamPassword)) {
      const msg = 'Team password must be alphanumeric only.';
      setLocalError(msg);
      onError(msg);
      return;
    }
    if (members.length === 0) {
      const msg = 'Add at least one member.';
      setLocalError(msg);
      onError(msg);
      return;
    }
    const invalid = members.filter((m) => m.ineligible);
    if (invalid.length > 0) {
      const msg = `${invalid.map((m) => m.display_name).join(', ')} already on a ${teamSize}p team.`;
      setLocalError(msg);
      onError(msg);
      return;
    }
    if (!auth.token) {
      const msg = 'Not authenticated.';
      setLocalError(msg);
      onError(msg);
      return;
    }
    setSaving(true);
    setLocalError(null);
    onError(null);
    try {
      const payload = {
        team_name: finalName,
        team_password: teamPassword || undefined,
        team_size: teamSize,
        members: members.map((m) =>
          m.id
            ? { user_id: m.id, role: 'PLAYER' }
            : { display_name: m.display_name, role: 'PLAYER' },
        ),
      };
      await postJsonAuth(`/events/${eventSlug}/register`, auth.token, payload);
      onError(null);
      setLocalError(null);
      onSuccess('Team registered!');
      try {
        await refetchTeams();
      } catch (fetchErr) {
        console.error('Failed to refresh teams after register', fetchErr);
      }
      const target =
        teamSize && teamSize !== 3 ? `/events/${eventSlug}/${teamSize}` : `/events/${eventSlug}`;
      navigate(target, { replace: true });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = (err.body as { error?: string })?.error ?? 'Failed to register team.';
        setLocalError(msg);
        onError(msg);
      } else {
        const msg = 'Failed to register team.';
        setLocalError(msg);
        onError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} maxWidth="720px">
      <Stack gap="md">
        <Stack gap="xs">
          <Heading level={2}>Register for {eventName}</Heading>
          <Text variant="muted">Create a team, set your size, and add members.</Text>
        </Stack>

        <InputContainer label="Team name">
          <Input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder={defaultTeamName}
            fullWidth
          />
        </InputContainer>

        <Inline columnWidths={[3, 7]} align="start" gap="sm">
          <InputContainer label="Team size">
            <Select
              value={teamSize != null ? String(teamSize) : ''}
              onChange={(value) => {
                const next = value ? Number(value) : null;
                setTeamSize(next);
                setMembers((prev) => markIneligibility(prev, next));
              }}
              options={[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n} players` }))}
              placeholder="Select team size"
            />
          </InputContainer>
          <InputContainer
            label="Team password (optional)"
            labelAction={
              <Tooltip content="This password is only used to gate access to your table. This is a feature of convenience. While your password won't be visible to anyone but you and your teammates, it is not securely stored. Do not use sensitive passwords. Passwords should be letters and numbers only.">
                <MaterialIcon
                  name="info"
                  size={18}
                  ariaLabel="Team password info"
                  ariaHidden={false}
                  style={{ color: 'var(--ds-color-text-muted)' }}
                />
              </Tooltip>
            }
          >
            <Input
              type="text"
              value={teamPassword}
              onChange={(e) => setTeamPassword(e.target.value)}
              placeholder="Set a password for your team"
              fullWidth
            />
          </InputContainer>
        </Inline>

        <InputContainer label="Members">
          <UserSearchSelect
            value={memberInput}
            onChange={(next) => setMemberInput(next)}
            suggestions={suggestions as UserSuggestion[]}
            onSelect={(s) => {
              addMember({
                id: s.id,
                display_name: s.display_name,
                color_hex: s.color_hex || '#777777',
                text_color: s.text_color || '#ffffff',
                role: 'PLAYER',
              });
              setMemberInput('');
            }}
            onSubmitFreeText={() => handleAddMemberInput()}
            placeholder="Add member by name"
            maxSelections={enforceExactTeamSize ? (teamSize ?? undefined) : undefined}
            selectedCount={members.length}
            disabled={!teamSize}
            tokens={members.map((m) => {
              const bg = m.ineligible ? '#dc2626' : m.color_hex || '#777777';
              const fg = m.ineligible ? '#ffffff' : m.text_color || '#ffffff';
              const locked = m.locked;
              return (
                <Pill
                  as="button"
                  type="button"
                  key={`${m.display_name}-${m.id ?? 'pending'}`}
                  size="sm"
                  interactive={!locked}
                  onClick={() => {
                    if (!locked) removeMember(m.display_name);
                  }}
                  title={
                    locked
                      ? 'You are automatically included and cannot be removed'
                      : 'Click to remove'
                  }
                  style={{
                    background: bg,
                    color: fg,
                    borderRadius: '999px',
                    borderColor: bg,
                    cursor: locked ? 'default' : 'pointer',
                  }}
                >
                  <UserPill
                    name={m.display_name}
                    size="sm"
                    color={bg}
                    textColor={fg}
                    hoverIcon={!locked ? <MaterialIcon name="close" /> : undefined}
                    className={`${m.isPending || !m.id ? 'user-pill--pending' : ''} user-pill--inline`}
                  />
                </Pill>
              );
            })}
          />
        </InputContainer>

        {localError && <Alert variant="error" message={localError} />}

        <Inline justify="end" align="center" gap="sm">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Registering...' : 'Submit'}
          </Button>
        </Inline>
      </Stack>
    </Modal>
  );
}
