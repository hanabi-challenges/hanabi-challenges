import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Box, TextInput, UnstyledButton } from '../../../../mantine';
import { Inline } from '../../layout/Inline/Inline';
import './SearchSelect.css';

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

  return (
    <Box className="ds-search-select">
      <Box className={`ds-search-select__control${isDisabled ? ' is-disabled' : ''}`}>
        {tokens.map((token, idx) => (
          <Box key={idx} className="ds-search-select__token" component="span">
            {token}
          </Box>
        ))}
        <TextInput
          ref={inputRef}
          className="ds-search-select__input"
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
        <Box className="ds-search-select__list" ref={listRef}>
          {suggestions.map((s, idx) => {
            const active = idx === highlightIndex;
            return (
              <UnstyledButton
                key={s.key}
                className={`ds-search-select__item${active ? ' is-active' : ''}`}
                data-active={active || undefined}
                onMouseEnter={() => setHighlightIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(s.value);
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
