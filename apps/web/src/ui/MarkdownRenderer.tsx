import {
  Anchor,
  Blockquote,
  Box,
  Checkbox,
  Code,
  Divider,
  Image,
  Link,
  List,
  Stack,
  Table,
  Text,
} from '../mantine';
import { Heading } from '../design-system';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root, Content, PhrasingContent, ListItem, Definition } from 'mdast';
import type { ReactNode } from 'react';
import { replaceEmojiShortcodes } from '../utils/emoji';

type DefinitionsMap = Map<string, Definition>;

type MarkdownRendererProps = {
  markdown: string;
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

function renderInline(
  nodes: PhrasingContent[] | undefined,
  keyPrefix: string,
  definitions: DefinitionsMap,
): ReactNode[] {
  if (!nodes || nodes.length === 0) return [];

  return nodes.map((node, index) => {
    const key = `${keyPrefix}-inl-${index}`;
    switch (node.type) {
      case 'text':
        return node.value;
      case 'strong':
        return (
          <Text key={key} span fw={700} inherit>
            {renderInline(node.children, key, definitions)}
          </Text>
        );
      case 'emphasis':
        return (
          <Text key={key} span fs="italic" inherit>
            {renderInline(node.children, key, definitions)}
          </Text>
        );
      case 'delete':
        return (
          <Text key={key} span td="line-through" inherit>
            {renderInline(node.children, key, definitions)}
          </Text>
        );
      case 'inlineCode':
        return (
          <Code key={key} fz="sm">
            {node.value}
          </Code>
        );
      case 'image': {
        if (!isSafeUrl(node.url)) return null;
        return (
          <Image
            key={key}
            src={node.url}
            alt={node.alt ?? ''}
            maw={480}
            radius="sm"
            mt="xs"
            mb="xs"
          />
        );
      }
      case 'link': {
        if (!isSafeUrl(node.url)) return null;
        const content = renderInline(node.children, key, definitions);
        if (isExternalUrl(node.url)) {
          return (
            <Anchor key={key} href={node.url} target="_blank" rel="noopener noreferrer">
              {content}
            </Anchor>
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
        if (!def || !isSafeUrl(def.url)) return renderInline(node.children, key, definitions);
        const content = renderInline(node.children, key, definitions);
        if (isExternalUrl(def.url)) {
          return (
            <Anchor key={key} href={def.url} target="_blank" rel="noopener noreferrer">
              {content}
            </Anchor>
          );
        }
        return (
          <Link key={key} to={def.url}>
            {content}
          </Link>
        );
      }
      case 'break':
        return <Box key={key} component="br" />;
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
): ReactNode {
  return (
    <Box key={key} mb="sm" style={{ overflowX: 'auto' }}>
      <Table withTableBorder withColumnBorders highlightOnHover={false}>
        <Table.Thead>
          <Table.Tr>
            {(node.children[0]?.children ?? []).map((cell, i) => (
              <Table.Th key={`${key}-th-${i}`}>
                {renderInline(cell.children, `${key}-th-${i}`, definitions)}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {node.children.slice(1).map((row, rowIndex) => (
            <Table.Tr key={`${key}-tr-${rowIndex}`}>
              {row.children.map((cell, colIndex) => (
                <Table.Td key={`${key}-td-${rowIndex}-${colIndex}`}>
                  {renderInline(cell.children, `${key}-td-${rowIndex}-${colIndex}`, definitions)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

function renderBlocks(
  nodes: Content[] | undefined,
  keyPrefix: string,
  definitions: DefinitionsMap,
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
          <Box key={key} mb="xs">
            <Heading level={level}>
              {renderInline(node.children as PhrasingContent[], key, definitions)}
            </Heading>
          </Box>,
        );
        return;
      }
      case 'paragraph':
        rendered.push(
          <Text key={key} component="p" mb="sm">
            {renderInline(node.children as PhrasingContent[], key, definitions)}
          </Text>,
        );
        return;
      case 'list':
        rendered.push(
          <List
            key={key}
            type={node.ordered ? 'ordered' : undefined}
            spacing="xs"
            mb="sm"
            withPadding
          >
            {node.children.map((item: ListItem, itemIndex: number) => (
              <List.Item
                key={`${key}-li-${itemIndex}`}
                icon={
                  isTaskListItem(item) ? (
                    <Checkbox checked={Boolean(listItemChecked(item))} readOnly tabIndex={-1} />
                  ) : undefined
                }
              >
                {renderBlocks(item.children as Content[], `${key}-li-${itemIndex}`, definitions)}
              </List.Item>
            ))}
          </List>,
        );
        return;
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
          ),
        );
        return;
      case 'blockquote':
        rendered.push(
          <Blockquote key={key} mb="sm">
            <Stack gap={0}>{renderBlocks(node.children, key, definitions)}</Stack>
          </Blockquote>,
        );
        return;
      case 'code':
        rendered.push(
          <Code key={key} block mb="sm">
            {node.value}
          </Code>,
        );
        return;
      case 'thematicBreak':
        rendered.push(<Divider key={key} my="sm" />);
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
  if (lastParsed !== null && lastParsed.markdown === markdown) return lastParsed.parsed;

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

export function MarkdownRenderer(props: MarkdownRendererProps) {
  const { tree, definitions } = parseMarkdown(props.markdown);
  return <Stack gap={0}>{renderBlocks(tree.children, 'md', definitions)}</Stack>;
}
