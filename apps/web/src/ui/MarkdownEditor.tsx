import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { MaterialIcon, Text } from '../design-system';
import { MarkdownRenderer } from './MarkdownRenderer';
import './MarkdownEditor.css';

// ── Public types ───────────────────────────────────────────────────────────────

export interface MentionUser {
  id: number;
  display_name: string;
  color_hex?: string | null;
  text_color?: string | null;
}

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  /** If provided, typing `@` (after whitespace or at start) opens a mention dropdown. */
  onMentionSearch?: (query: string) => Promise<MentionUser[]>;
}

// ── Caret position utility ─────────────────────────────────────────────────────

/**
 * Returns the viewport-space coordinates of the character at `index` inside
 * `ta`. Uses a hidden mirror div that replicates the textarea's typography so
 * the result accounts for word-wrap and scroll position.
 */
function getCaretCoords(ta: HTMLTextAreaElement, index: number): { top: number; left: number } {
  const cs = getComputedStyle(ta);
  const taRect = ta.getBoundingClientRect();

  const mirror = document.createElement('div');
  mirror.style.cssText = [
    'position:fixed',
    `top:${taRect.top}px`,
    `left:${taRect.left}px`,
    `width:${ta.clientWidth}px`,
    `height:${ta.clientHeight}px`,
    'visibility:hidden',
    'pointer-events:none',
    'overflow:auto',
    'white-space:pre-wrap',
    'word-break:break-word',
    'overflow-wrap:break-word',
    `font-family:${cs.fontFamily}`,
    `font-size:${cs.fontSize}`,
    `font-weight:${cs.fontWeight}`,
    `line-height:${cs.lineHeight}`,
    `padding-top:${cs.paddingTop}`,
    `padding-right:${cs.paddingRight}`,
    `padding-bottom:${cs.paddingBottom}`,
    `padding-left:${cs.paddingLeft}`,
    `box-sizing:${cs.boxSizing}`,
  ].join(';');

  mirror.textContent = ta.value.slice(0, index);
  const span = document.createElement('span');
  span.textContent = '\u200b'; // zero-width space marks the caret position
  mirror.appendChild(span);

  document.body.appendChild(mirror);
  mirror.scrollTop = ta.scrollTop;
  const spanRect = span.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    top: spanRect.bottom + 4, // 4px gap below the line
    left: Math.max(taRect.left, spanRect.left),
  };
}

// ── Editing operations ────────────────────────────────────────────────────────

interface ApplyResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

function applyWrap(
  ta: HTMLTextAreaElement,
  value: string,
  prefix: string,
  suffix: string,
  placeholder: string,
): ApplyResult {
  const { selectionStart: s, selectionEnd: e } = ta;
  const selected = value.slice(s, e) || placeholder;
  const newValue = value.slice(0, s) + prefix + selected + suffix + value.slice(e);
  return {
    value: newValue,
    selectionStart: s + prefix.length,
    selectionEnd: s + prefix.length + selected.length,
  };
}

function applyLinePrefix(
  ta: HTMLTextAreaElement,
  value: string,
  prefix: string,
  placeholder: string,
): ApplyResult {
  const { selectionStart: s } = ta;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const lineEndRaw = value.indexOf('\n', s);
  const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
  const line = value.slice(lineStart, lineEnd);
  const before = value.slice(0, lineStart);
  const after = value.slice(lineEnd);

  if (line.startsWith(prefix)) {
    const stripped = line.slice(prefix.length);
    const cursor = Math.max(lineStart, s - prefix.length);
    return { value: before + stripped + after, selectionStart: cursor, selectionEnd: cursor };
  }

  const text = line || placeholder;
  const newValue = before + prefix + text + after;
  const cursor = lineStart + prefix.length + text.length;
  return { value: newValue, selectionStart: cursor, selectionEnd: cursor };
}

function applyLink(ta: HTMLTextAreaElement, value: string): ApplyResult {
  const { selectionStart: s, selectionEnd: e } = ta;
  const selected = value.slice(s, e);
  const before = value.slice(0, s);
  const after = value.slice(e);

  if (selected) {
    const newValue = before + `[${selected}](url)` + after;
    const urlStart = s + selected.length + 3;
    return { value: newValue, selectionStart: urlStart, selectionEnd: urlStart + 3 };
  }

  const insert = '[text](url)';
  return { value: before + insert + after, selectionStart: s + 1, selectionEnd: s + 5 };
}

function applyCode(ta: HTMLTextAreaElement, value: string): ApplyResult {
  const { selectionStart: s, selectionEnd: e } = ta;
  const selected = value.slice(s, e);

  if (selected.includes('\n')) {
    const before = value.slice(0, s);
    const after = value.slice(e);
    const newValue = before + '```\n' + selected + '\n```' + after;
    return { value: newValue, selectionStart: s + 4, selectionEnd: s + 4 + selected.length };
  }

  return applyWrap(ta, value, '`', '`', 'code');
}

// ── Component ─────────────────────────────────────────────────────────────────

type Tab = 'write' | 'preview';

// Matches `@query` at the end of a string when preceded by start-of-string or whitespace.
const MENTION_TRIGGER = /(?:^|[\s\n])(@([\w.-]*)$)/;

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 6,
  disabled,
  onMentionSearch,
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<Tab>('write');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Mention state ────────────────────────────────────────────────────────────
  const [mentionAtIndex, setMentionAtIndex] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeMention = useCallback(() => {
    setMentionAtIndex(null);
    setMentionQuery('');
    setSuggestions([]);
    setActiveSuggestion(0);
    setDropdownPos(null);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  }, []);

  const selectSuggestion = useCallback(
    (user: MentionUser) => {
      if (mentionAtIndex === null) return;
      const ta = textareaRef.current;
      if (!ta) return;

      const insertEnd = mentionAtIndex + 1 + mentionQuery.length;
      const before = value.slice(0, mentionAtIndex);
      const after = value.slice(insertEnd);
      const insert = `@${user.display_name}`;
      const newValue = before + insert + ' ' + after;
      onChange(newValue);

      const newCursor = mentionAtIndex + insert.length + 1;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newCursor, newCursor);
      });

      closeMention();
    },
    [mentionAtIndex, mentionQuery, value, onChange, closeMention],
  );

  const apply = useCallback(
    (fn: (ta: HTMLTextAreaElement, val: string) => ApplyResult) => {
      const ta = textareaRef.current;
      if (!ta) return;
      closeMention();
      const result = fn(ta, value);
      onChange(result.value);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(result.selectionStart, result.selectionEnd);
      });
    },
    [value, onChange, closeMention],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newVal = e.target.value;
      onChange(newVal);

      if (!onMentionSearch) return;

      const cursor = e.target.selectionStart;
      const before = newVal.slice(0, cursor);
      const match = MENTION_TRIGGER.exec(before);

      if (match) {
        const atOffset = before.length - match[1].length; // index of '@' in newVal
        const query = match[2];
        setDropdownPos(getCaretCoords(e.target, atOffset));
        setMentionAtIndex(atOffset);
        setMentionQuery(query);
        setActiveSuggestion(0);

        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
          onMentionSearch(query)
            .then((users) => setSuggestions(users))
            .catch(() => setSuggestions([]));
        }, 150);
      } else {
        closeMention();
      }
    },
    [onChange, onMentionSearch, closeMention],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Mention dropdown navigation takes priority
      if (mentionAtIndex !== null && suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveSuggestion((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          selectSuggestion(suggestions[activeSuggestion]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMention();
          return;
        }
      }

      // Formatting shortcuts
      if (!e.ctrlKey && !e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          apply((ta, val) => applyWrap(ta, val, '**', '**', 'bold text'));
          break;
        case 'i':
          e.preventDefault();
          apply((ta, val) => applyWrap(ta, val, '_', '_', 'italic text'));
          break;
        case 'k':
          e.preventDefault();
          apply(applyLink);
          break;
        case 'e':
          e.preventDefault();
          apply(applyCode);
          break;
      }
    },
    [apply, mentionAtIndex, suggestions, activeSuggestion, selectSuggestion, closeMention],
  );

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const mentionDropdownOpen =
    mentionAtIndex !== null && dropdownPos !== null && suggestions.length > 0;

  return (
    <div className={`md-editor${disabled ? ' md-editor--disabled' : ''}`}>
      {/* Tab strip */}
      <div className="md-editor__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'write'}
          className={`md-editor__tab${tab === 'write' ? ' md-editor__tab--active' : ''}`}
          onClick={() => setTab('write')}
        >
          Write
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'preview'}
          className={`md-editor__tab${tab === 'preview' ? ' md-editor__tab--active' : ''}`}
          onClick={() => setTab('preview')}
        >
          Preview
        </button>
      </div>

      {tab === 'write' ? (
        <>
          {/* Formatting toolbar */}
          <div className="md-editor__toolbar" aria-label="Formatting tools">
            <div className="md-editor__toolbar-group">
              <ToolbarButton
                label="Bold (Ctrl+B)"
                icon="format_bold"
                onClick={() => apply((ta, val) => applyWrap(ta, val, '**', '**', 'bold text'))}
              />
              <ToolbarButton
                label="Italic (Ctrl+I)"
                icon="format_italic"
                onClick={() => apply((ta, val) => applyWrap(ta, val, '_', '_', 'italic text'))}
              />
              <ToolbarButton
                label="Strikethrough"
                icon="strikethrough_s"
                onClick={() =>
                  apply((ta, val) => applyWrap(ta, val, '~~', '~~', 'strikethrough text'))
                }
              />
              <ToolbarButton label="Code (Ctrl+E)" icon="code" onClick={() => apply(applyCode)} />
              <ToolbarButton label="Link (Ctrl+K)" icon="link" onClick={() => apply(applyLink)} />
            </div>
            <div className="md-editor__toolbar-sep" aria-hidden="true" />
            <div className="md-editor__toolbar-group">
              <ToolbarButton
                label="Heading"
                icon="title"
                onClick={() => apply((ta, val) => applyLinePrefix(ta, val, '## ', 'Heading'))}
              />
              <ToolbarButton
                label="Unordered list"
                icon="format_list_bulleted"
                onClick={() => apply((ta, val) => applyLinePrefix(ta, val, '- ', 'List item'))}
              />
              <ToolbarButton
                label="Ordered list"
                icon="format_list_numbered"
                onClick={() => apply((ta, val) => applyLinePrefix(ta, val, '1. ', 'List item'))}
              />
              <ToolbarButton
                label="Blockquote"
                icon="format_quote"
                onClick={() => apply((ta, val) => applyLinePrefix(ta, val, '> ', 'Quoted text'))}
              />
            </div>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            className="md-editor__textarea"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={closeMention}
            onScroll={closeMention}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            aria-label="Markdown content"
            aria-multiline="true"
            aria-autocomplete={onMentionSearch ? 'list' : undefined}
            aria-expanded={mentionDropdownOpen || undefined}
          />

          {/* Mention dropdown — rendered in a portal so it escapes any overflow:hidden ancestors */}
          {mentionDropdownOpen
            ? createPortal(
                <div
                  className="md-mention-dropdown"
                  style={{ top: dropdownPos!.top, left: dropdownPos!.left }}
                  onMouseDown={(e) => e.preventDefault()} // keep textarea focused
                >
                  {suggestions.map((user, i) => (
                    <button
                      key={user.id}
                      type="button"
                      className={`md-mention-option${i === activeSuggestion ? ' md-mention-option--active' : ''}`}
                      onMouseEnter={() => setActiveSuggestion(i)}
                      onClick={() => selectSuggestion(user)}
                    >
                      <span
                        className="md-mention-avatar"
                        style={
                          user.color_hex
                            ? { background: user.color_hex, borderColor: user.color_hex }
                            : undefined
                        }
                        aria-hidden="true"
                      />
                      <Text variant="body">{user.display_name}</Text>
                    </button>
                  ))}
                </div>,
                document.body,
              )
            : null}
        </>
      ) : (
        <div className="md-editor__preview" aria-label="Preview">
          {value.trim() ? (
            <MarkdownRenderer markdown={value} />
          ) : (
            <span className="md-editor__preview-empty">Nothing to preview.</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Toolbar button ────────────────────────────────────────────────────────────

function ToolbarButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="md-editor__toolbar-btn"
      aria-label={label}
      title={label}
      onClick={onClick}
      tabIndex={-1} /* keep tab order on the textarea, not the toolbar */
    >
      <MaterialIcon name={icon} size={16} />
    </button>
  );
}
