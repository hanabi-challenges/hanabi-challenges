import {
  Prose,
  Heading,
  Text,
  Link,
  List,
  Table,
  Stack,
  CoreBox,
  CoreCode,
  CoreDivider,
  CoreAnchor,
  CoreCheckbox,
} from '../design-system';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root, Content, PhrasingContent, ListItem, Definition } from 'mdast';
import type { ReactNode } from 'react';
import { replaceEmojiShortcodes } from '../utils/emoji';
import { UserPill } from '../features/users/UserPill';

type DefinitionsMap = Map<string, Definition>;

export type MentionColorMap = Record<
  string,
  { color_hex?: string | null; text_color?: string | null }
>;

type MarkdownRendererProps = {
  markdown: string;
  /** Map of display_name → color data, used to colour @mention pills. */
  mentionColors?: MentionColorMap;
};

function applyTypographyReplacementsToText(value: string): string {
  return value.replaceAll('---', '\u2014').replaceAll('...', '\u2026');
}

function applyTypographyReplacements(tree: Root): Root {
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: string; value?: unknown; children?: unknown[] };

    if (n.type === 'text' && typeof n.value === 'string') {
      n.value = applyTypographyReplacementsToText(n.value);
    }

    if (n.type === 'code' || n.type === 'inlineCode') return;

    if (Array.isArray(n.children)) {
      for (const child of n.children) visit(child);
    }
  };

  visit(tree);
  return tree;
}

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function isSafeUrl(url: string): boolean {
  return !/^(javascript|data):/i.test(url.trim());
}

function normalizeDefinitionId(id: string): string {
  return id.trim().toLowerCase();
}

function collectDefinitions(tree: Root): DefinitionsMap {
  const defs: DefinitionsMap = new Map();

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as {
      type?: string;
      children?: unknown[];
      identifier?: unknown;
    };

    if (n.type === 'definition' && typeof n.identifier === 'string') {
      defs.set(normalizeDefinitionId(n.identifier), n as unknown as Definition);
      return;
    }

    if (Array.isArray(n.children)) {
      for (const child of n.children) visit(child);
    }
  };

  visit(tree);
  return defs;
}

/** Regex that matches an @mention token. Must stay in sync with the editor trigger. */
const MENTION_RE = /(@[\w.-]+)/;

/**
 * Splits a text value on @mention tokens and renders each piece as a proper
 * design-system component:
 *   - Text segments → <Text> (renders as <span>, valid inline anywhere)
 *   - @mentions     → <UserPill as="span"> (inline-flex span, valid inside <p>)
 *
 * Returning a mix of block-level elements (e.g. Pill's default <div>) inside a
 * paragraph causes browsers to silently restructure the DOM, which breaks both
 * layout and inline styles. Using span-only elements avoids that entirely.
 */
function renderTextWithMentions(
  text: string,
  key: string,
  mentionColors: MentionColorMap | undefined,
): ReactNode {
  const parts = text.split(MENTION_RE);
  if (parts.length === 1) return text; // fast path — no mentions, stay a plain string

  return parts.map((part, i) => {
    if (!part) return null;
    if (MENTION_RE.test(part)) {
      const username = part.slice(1); // strip leading '@'
      const colors = mentionColors?.[username];
      return (
        <UserPill
          key={`${key}-m-${i}`}
          as="span" // must be span so it stays inline inside <p>
          name={username}
          size="xs"
          color={colors?.color_hex}
          textColor={colors?.text_color}
          style={{ verticalAlign: 'middle' }}
        />
      );
    }
    return <Text key={`${key}-t-${i}`}>{part}</Text>;
  });
}

function renderInline(
  nodes: PhrasingContent[] | undefined,
  keyPrefix: string,
  definitions: DefinitionsMap,
  mentionColors: MentionColorMap | undefined,
): ReactNode[] {
  if (!nodes || nodes.length === 0) return [];

  return nodes.map((node, index) => {
    const key = `${keyPrefix}-inl-${index}`;
    switch (node.type) {
      case 'text':
        return renderTextWithMentions(node.value, key, mentionColors);
      case 'strong':
        return (
          <CoreBox key={key} component="span" fw={700}>
            {renderInline(node.children, key, definitions, mentionColors)}
          </CoreBox>
        );
      case 'emphasis':
        return (
          <CoreBox key={key} component="span" fs="italic">
            {renderInline(node.children, key, definitions, mentionColors)}
          </CoreBox>
        );
      case 'delete':
        return (
          <CoreBox key={key} component="span" td="line-through">
            {renderInline(node.children, key, definitions, mentionColors)}
          </CoreBox>
        );
      case 'inlineCode':
        return (
          <CoreCode key={key} fz="sm">
            {node.value}
          </CoreCode>
        );
      case 'image':
        // Images are not supported — no upload infrastructure exists and
        // external hotlinking causes privacy and link-rot problems.
        return null;
      case 'link': {
        if (!isSafeUrl(node.url)) return null;
        const content = renderInline(node.children, key, definitions, mentionColors);
        if (isExternalUrl(node.url)) {
          return (
            <CoreAnchor key={key} href={node.url} target="_blank" rel="noopener noreferrer">
              {content}
            </CoreAnchor>
          );
        }
        return (
          <Link key={key} to={node.url}>
            {content}
          </Link>
        );
      }
      case 'linkReference': {
        const def = definitions.get(normalizeDefinitionId(node.identifier));
        if (!def || !isSafeUrl(def.url))
          return renderInline(node.children, key, definitions, mentionColors);
        const content = renderInline(node.children, key, definitions, mentionColors);
        if (isExternalUrl(def.url)) {
          return (
            <CoreAnchor key={key} href={def.url} target="_blank" rel="noopener noreferrer">
              {content}
            </CoreAnchor>
          );
        }
        return (
          <Link key={key} to={def.url}>
            {content}
          </Link>
        );
      }
      case 'break':
        return <CoreBox key={key} component="br" />;
      default:
        return null;
    }
  });
}

function isTaskListItem(item: ListItem): boolean {
  const checked = (item as ListItem & { checked?: boolean | null }).checked;
  return typeof checked === 'boolean';
}

function listItemChecked(item: ListItem): boolean | null {
  return (item as ListItem & { checked?: boolean | null }).checked ?? null;
}

function renderTable(
  node: Content & {
    type: 'table';
    align?: Array<'left' | 'right' | 'center' | null>;
    children: Array<{
      type: 'tableRow';
      children: Array<{ type: 'tableCell'; children: PhrasingContent[] }>;
    }>;
  },
  key: string,
  definitions: DefinitionsMap,
  mentionColors: MentionColorMap | undefined,
): ReactNode {
  return (
    <CoreBox key={key} mb="sm" style={{ overflowX: 'auto' }}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            {(node.children[0]?.children ?? []).map((cell, i) => (
              <Table.Th key={`${key}-th-${i}`}>
                {renderInline(cell.children, `${key}-th-${i}`, definitions, mentionColors)}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {node.children.slice(1).map((row, rowIndex) => (
            <Table.Tr key={`${key}-tr-${rowIndex}`}>
              {row.children.map((cell, colIndex) => (
                <Table.Td key={`${key}-td-${rowIndex}-${colIndex}`}>
                  {renderInline(
                    cell.children,
                    `${key}-td-${rowIndex}-${colIndex}`,
                    definitions,
                    mentionColors,
                  )}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </CoreBox>
  );
}

function renderBlocks(
  nodes: Content[] | undefined,
  keyPrefix: string,
  definitions: DefinitionsMap,
  mentionColors: MentionColorMap | undefined,
): ReactNode[] {
  if (!nodes || nodes.length === 0) return [];

  const rendered: ReactNode[] = [];

  nodes.forEach((node, index) => {
    const key = `${keyPrefix}-blk-${index}`;
    switch (node.type) {
      case 'heading': {
        const depth = node.depth <= 1 ? 2 : node.depth;
        const level = Math.min(depth, 6) as 2 | 3 | 4 | 5 | 6;
        rendered.push(
          <CoreBox key={key} mb="xs">
            <Heading level={level}>
              {renderInline(node.children as PhrasingContent[], key, definitions, mentionColors)}
            </Heading>
          </CoreBox>,
        );
        return;
      }
      case 'paragraph':
        rendered.push(
          <CoreBox key={key} component="p" style={{ margin: '0 0 var(--ds-space-sm)' }}>
            {renderInline(node.children as PhrasingContent[], key, definitions, mentionColors)}
          </CoreBox>,
        );
        return;
      case 'list': {
        const items = node.children.map((item: ListItem, itemIndex: number) => ({
          key: `${key}-li-${itemIndex}`,
          content: renderBlocks(
            item.children as Content[],
            `${key}-li-${itemIndex}`,
            definitions,
            mentionColors,
          ),
          icon: isTaskListItem(item) ? (
            <CoreCheckbox checked={Boolean(listItemChecked(item))} readOnly tabIndex={-1} size="xs" />
          ) : undefined,
        }));
        rendered.push(
          <CoreBox key={key} mb="sm">
            <List items={items} type={node.ordered ? 'ordered' : 'unordered'} spacing="xs" />
          </CoreBox>,
        );
        return;
      }
      case 'table':
        rendered.push(
          renderTable(
            node as Content & {
              type: 'table';
              align?: Array<'left' | 'right' | 'center' | null>;
              children: Array<{
                type: 'tableRow';
                children: Array<{ type: 'tableCell'; children: PhrasingContent[] }>;
              }>;
            },
            key,
            definitions,
            mentionColors,
          ),
        );
        return;
      case 'blockquote':
        rendered.push(
          <CoreBox
            key={key}
            component="blockquote"
            mb="sm"
            style={{
              borderLeft: '3px solid var(--ds-color-border)',
              paddingLeft: 'var(--ds-space-sm)',
              margin: '0 0 var(--ds-space-sm)',
              color: 'var(--ds-color-text-muted)',
            }}
          >
            <Stack gap="none">
              {renderBlocks(node.children, key, definitions, mentionColors)}
            </Stack>
          </CoreBox>,
        );
        return;
      case 'code':
        rendered.push(
          <CoreCode key={key} block mb="sm">
            {node.value}
          </CoreCode>,
        );
        return;
      case 'thematicBreak':
        rendered.push(<CoreDivider key={key} my="sm" />);
        return;
      case 'definition':
      case 'html':
        return;
      default:
        return;
    }
  });

  return rendered;
}

type ParsedMarkdown = { tree: Root; definitions: DefinitionsMap };

let lastParsed: { markdown: string; parsed: ParsedMarkdown } | null = null;
function parseMarkdown(markdown: string): ParsedMarkdown {
  if (lastParsed?.markdown === markdown) return lastParsed.parsed;

  const parsedTree = applyTypographyReplacements(
    unified().use(remarkParse).use(remarkGfm).parse(replaceEmojiShortcodes(markdown)) as Root,
  );

  const parsed: ParsedMarkdown = {
    tree: parsedTree,
    definitions: collectDefinitions(parsedTree),
  };
  lastParsed = { markdown, parsed };
  return parsed;
}

export function MarkdownRenderer({ markdown, mentionColors }: MarkdownRendererProps) {
  const { tree, definitions } = parseMarkdown(markdown);
  return (
    <Prose>
      <Stack gap="none">
        {renderBlocks(tree.children, 'md', definitions, mentionColors)}
      </Stack>
    </Prose>
  );
}
