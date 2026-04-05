import { type ReactElement } from 'react';
import { Inline, SearchSelect, CoreBox as Box, CoreText as Text } from '../../design-system';
import type { SearchSuggestion } from '../../design-system';

export type UserSuggestion = {
  id: number;
  display_name: string;
  color_hex?: string | null;
  text_color?: string | null;
};

type UserSearchSelectProps = {
  value: string;
  onChange: (next: string) => void;
  suggestions: UserSuggestion[];
  onSelect: (suggestion: UserSuggestion) => void;
  onSubmitFreeText: () => void;
  placeholder?: string;
  maxSelections?: number;
  selectedCount?: number;
  disabled?: boolean;
  tokens?: ReactElement[];
};

export function UserSearchSelect({
  value,
  onChange,
  suggestions,
  onSelect,
  onSubmitFreeText,
  placeholder,
  maxSelections,
  selectedCount = 0,
  disabled,
  tokens = [],
}: UserSearchSelectProps): ReactElement {
  const mapped: Array<SearchSuggestion<UserSuggestion>> = suggestions.map((s) => ({
    key: s.id,
    value: s,
    node: (
      <Inline gap="xs" align="center">
        <Box
          component="span"
          style={{
            display: 'inline-block',
            width: '24px',
            height: '24px',
            borderRadius: '999px',
            background: s.color_hex || '#777',
          }}
        />
        <Text span>{s.display_name}</Text>
      </Inline>
    ),
  }));

  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      suggestions={mapped}
      onSelect={onSelect}
      onSubmitFreeText={onSubmitFreeText}
      placeholder={placeholder}
      maxSelections={maxSelections}
      selectedCount={selectedCount}
      disabled={disabled}
      tokens={tokens}
    />
  );
}
