import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Box, TextInput, UnstyledButton } from '../../../mantine';
import { Inline } from '../../layout/Inline/Inline';

export type SearchSuggestion<T> = {
  key: string | number;
  node: ReactNode;
  value: T;
};

export type SearchSelectProps<T> = {
  value: string;
  onChange: (next: string) => void;
  suggestions: Array<SearchSuggestion<T>>;
  onSelect: (value: T) => void;
  blurOnSelect?: boolean;
  onSubmitFreeText?: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxSelections?: number;
  selectedCount?: number;
  tokens?: ReactNode[];
};

export function SearchSelect<T>({
  value,
  onChange,
  suggestions,
  onSelect,
  blurOnSelect = false,
  onSubmitFreeText,
  placeholder,
  disabled = false,
  maxSelections,
  selectedCount = 0,
  tokens = [],
}: SearchSelectProps<T>): ReactElement {
  const reachedLimit = maxSelections !== undefined && selectedCount >= maxSelections;
  const isDisabled = disabled || reachedLimit;
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isControlHovered, setIsControlHovered] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleSelect = (selected: T) => {
    onSelect(selected);
    if (blurOnSelect) {
      setIsFocused(false);
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    setHighlightIndex(0);
  }, [suggestions.length]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isDisabled) return;
    if (suggestions.length === 0) {
      if (e.key === 'Enter' && onSubmitFreeText) {
        e.preventDefault();
        onSubmitFreeText();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const choice = suggestions[highlightIndex];
      if (choice) handleSelect(choice.value);
    }
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const active = el.querySelector('[data-active="true"]') as HTMLButtonElement | null;
    if (active) {
      const viewTop = el.scrollTop;
      const viewBottom = el.scrollTop + el.clientHeight;
      const itemTop = active.offsetTop;
      const itemBottom = itemTop + active.offsetHeight;
      if (itemTop < viewTop) el.scrollTop = itemTop;
      else if (itemBottom > viewBottom) el.scrollTop = itemBottom - el.clientHeight;
    }
  }, [highlightIndex, suggestions.length]);

  const controlBorderColor = isFocused
    ? 'var(--ds-color-accent-strong)'
    : isControlHovered && !isDisabled
      ? 'color-mix(in srgb, var(--ds-color-border) 70%, var(--ds-color-accent-strong) 30%)'
      : 'var(--ds-color-border)';

  const controlBoxShadow = isFocused
    ? '0 0 0 1px color-mix(in srgb, var(--ds-color-accent-strong) 50%, transparent)'
    : undefined;

  return (
    <Box style={{ position: 'relative', width: '100%' }}>
      <Box
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--ds-space-xxs)',
          border: `1px solid ${controlBorderColor}`,
          borderRadius: 'var(--ds-radius-md)',
          background: isDisabled ? 'var(--ds-color-surface-muted)' : 'var(--ds-color-surface)',
          color: isDisabled ? 'var(--ds-color-text-muted)' : undefined,
          minHeight: 'var(--ds-size-control-md-height)',
          padding: '0 var(--ds-size-control-md-paddingX)',
          transition: 'border-color 120ms ease, box-shadow 120ms ease',
          boxShadow: controlBoxShadow,
        }}
        onMouseEnter={() => setIsControlHovered(true)}
        onMouseLeave={() => setIsControlHovered(false)}
      >
        {tokens.map((token, idx) => (
          <Box
            key={idx}
            component="span"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--ds-space-xxs)',
              padding: 0,
              borderRadius: 'var(--ds-radius-pill)',
              background: 'transparent',
              color: 'var(--ds-color-text)',
            }}
          >
            {token}
          </Box>
        ))}
        <TextInput
          ref={inputRef}
          style={{ flex: 1, minWidth: 120 }}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder={isDisabled ? '' : placeholder}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          styles={{
            input: { border: 'none', boxShadow: 'none', padding: 0, background: 'transparent' },
          }}
        />
      </Box>
      {!isDisabled && isFocused && suggestions.length > 0 && (
        <Box
          ref={listRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + var(--ds-space-xxs))',
            left: 0,
            right: 0,
            maxHeight: '200px',
            overflowY: 'auto',
            background: 'var(--ds-color-surface)',
            border: '1px solid var(--ds-color-border)',
            borderRadius: 'var(--ds-radius-sm)',
            boxShadow: 'var(--ds-shadow-modal, 0 10px 30px rgba(0, 0, 0, 0.12))',
            padding: 'var(--ds-space-xs)',
            zIndex: 20,
          }}
        >
          {suggestions.map((s, idx) => {
            const active = idx === highlightIndex;
            return (
              <UnstyledButton
                key={s.key}
                data-active={active || undefined}
                onMouseEnter={() => setHighlightIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(s.value);
                }}
                style={{
                  width: '100%',
                  border: `1px solid ${active ? 'var(--ds-color-border)' : 'transparent'}`,
                  background: active
                    ? 'color-mix(in srgb, var(--ds-color-accent-weak) 30%, transparent)'
                    : 'transparent',
                  borderRadius: 'var(--ds-radius-sm)',
                  padding: 'var(--ds-space-xxs) var(--ds-space-xs)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background 120ms ease, border-color 120ms ease',
                }}
              >
                <Inline gap="xs" align="center">
                  {s.node}
                </Inline>
              </UnstyledButton>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
