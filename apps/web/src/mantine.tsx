import {
  Combobox as MantineCombobox,
  useCombobox as useMantineCombobox,
  ActionIcon as MantineActionIcon,
  Skeleton as MantineSkeleton,
  Alert as MantineAlert,
  Anchor as MantineAnchor,
  Badge as MantineBadge,
  Blockquote as MantineBlockquote,
  Box as MantineBox,
  Breadcrumbs as MantineBreadcrumbs,
  Button as MantineButton,
  Card as MantineCard,
  Checkbox as MantineCheckbox,
  Code as MantineCode,
  createTheme,
  Divider as MantineDivider,
  Drawer as MantineDrawer,
  Grid as MantineGrid,
  Group as MantineGroup,
  Image as MantineImage,
  Indicator as MantineIndicator,
  List as MantineList,
  Loader as MantineLoader,
  MantineProvider as MantineProviderCore,
  Menu as MantineMenu,
  Modal as MantineModal,
  NumberInput as MantineNumberInput,
  Paper as MantinePaper,
  PasswordInput as MantinePasswordInput,
  Popover as MantinePopover,
  Radio as MantineRadio,
  ScrollArea as MantineScrollArea,
  SegmentedControl as MantineSegmentedControl,
  Select as MantineSelect,
  SimpleGrid as MantineSimpleGrid,
  Stack as MantineStack,
  Stepper as MantineStepper,
  Switch as MantineSwitch,
  Table as MantineTable,
  Text as MantineText,
  TextInput as MantineTextInput,
  Textarea as MantineTextarea,
  Title as MantineTitle,
  Tooltip as MantineTooltip,
  UnstyledButton as MantineUnstyledButton,
  type ActionIconProps,
  type AlertProps,
  type AnchorProps,
  type BadgeProps,
  type BlockquoteProps,
  type BoxProps,
  type BreadcrumbsProps,
  type ButtonProps,
  type CardProps,
  type CheckboxProps,
  type CodeProps,
  type CSSVariablesResolver,
  type DividerProps,
  type DrawerProps,
  type GridProps,
  type GroupProps,
  type ImageProps,
  type IndicatorProps,
  type ListProps,
  type LoaderProps,
  type MantineProviderProps,
  type MenuProps,
  type ModalProps,
  type NumberInputProps,
  type PaperProps,
  type PasswordInputProps,
  type PopoverProps,
  type RadioProps,
  type SegmentedControlProps,
  type SelectProps,
  type SimpleGridProps,
  type StackProps,
  type StepperProps,
  type SwitchProps,
  type TableProps,
  type TextInputProps,
  type TextProps,
  type TextareaProps,
  type TitleProps,
  type TooltipProps,
  type UnstyledButtonProps,
} from '@mantine/core';
import type { ReactElement } from 'react';
import { Link as RouterLink } from 'react-router-dom';

// Align Mantine's primary color with the design system's blue palette so
// variant="light" / variant="subtle" buttons use the correct accent color.
const theme = createTheme({
  primaryColor: 'blue',
  primaryShade: 6,
  colors: {
    blue: [
      '#eff6ff', // 0 — blue-50
      '#dbeafe', // 1 — blue-100 / accent-weak
      '#bfdbfe', // 2 — blue-200
      '#93c5fd', // 3 — blue-300
      '#60a5fa', // 4 — blue-400
      '#3b82f6', // 5 — blue-500
      '#2563eb', // 6 — blue-600 / --color-accent  ← primary
      '#1d4ed8', // 7 — blue-700 / --color-accent-strong
      '#1e40af', // 8 — blue-800
      '#1e3a8a', // 9 — blue-900
    ],
  },
});

// Emit all design-system CSS variables through Mantine's cssVariablesResolver so
// tokens.css is no longer needed as a static file. All 195 variable names are
// preserved exactly so existing component CSS continues to work unchanged.
const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    // border
    '--ds-border-width-none': '0',
    '--ds-border-width-hairline': '1px',
    '--ds-border-width-thick': '2px',
    '--ds-border-style-solid': 'solid',
    '--ds-border-style-dashed': 'dashed',
    // breakpoints
    '--ds-breakpoints-xs': '480px',
    '--ds-breakpoints-sm': '640px',
    '--ds-breakpoints-md': '768px',
    '--ds-breakpoints-lg': '1024px',
    '--ds-breakpoints-xl': '1280px',
    // color theme raw values (both light and dark are theme-independent constants)
    '--ds-color-theme-light-surface': '#ffffff',
    '--ds-color-theme-light-surfaceMuted': '#f6f8fb',
    '--ds-color-theme-light-text': '#0f172a',
    '--ds-color-theme-light-textMuted': '#475569',
    '--ds-color-theme-light-border': 'rgba(0, 0, 0, 0.06)',
    '--ds-color-theme-light-accentWeak': '#e0e7ff',
    '--ds-color-theme-light-accentStrong': '#1d4ed8',
    '--ds-color-theme-dark-surface': '#111827',
    '--ds-color-theme-dark-surfaceMuted': '#1f2937',
    '--ds-color-theme-dark-text': '#f8fafc',
    '--ds-color-theme-dark-textMuted': '#cbd5e1',
    '--ds-color-theme-dark-border': 'rgba(255, 255, 255, 0.08)',
    '--ds-color-theme-dark-accentWeak': '#1e40af',
    '--ds-color-theme-dark-accentStrong': '#93c5fd',
    // color categorical (both light and dark variants as separate names)
    '--ds-color-categorical-cat1-light': '#2563eb',
    '--ds-color-categorical-cat1-dark': '#93c5fd',
    '--ds-color-categorical-cat2-light': '#4f46e5',
    '--ds-color-categorical-cat2-dark': '#c7d2fe',
    '--ds-color-categorical-cat3-light': '#06b6d4',
    '--ds-color-categorical-cat3-dark': '#a5f3fc',
    '--ds-color-categorical-cat4-light': '#d97706',
    '--ds-color-categorical-cat4-dark': '#fcd34d',
    '--ds-color-categorical-cat5-light': '#a21caf',
    '--ds-color-categorical-cat5-dark': '#e9d5ff',
    '--ds-color-categorical-cat6-light': '#14b8a6',
    '--ds-color-categorical-cat6-dark': '#99f6e4',
    '--ds-color-categorical-cat7-light': '#475569',
    '--ds-color-categorical-cat7-dark': '#cbd5e1',
    '--ds-color-categorical-cat8-light': '#7c3aed',
    '--ds-color-categorical-cat8-dark': '#c4b5fd',
    '--ds-color-categorical-cat9-light': '#0284c7',
    '--ds-color-categorical-cat9-dark': '#bae6fd',
    '--ds-color-categorical-cat10-light': '#f59e0b',
    '--ds-color-categorical-cat10-dark': '#fcd34d',
    '--ds-color-categorical-cat11-light': '#6366f1',
    '--ds-color-categorical-cat11-dark': '#c7d2fe',
    '--ds-color-categorical-cat12-light': '#0ea5e9',
    '--ds-color-categorical-cat12-dark': '#bae6fd',
    // color scale
    '--ds-color-scale-blue-1': '#eff6ff',
    '--ds-color-scale-blue-2': '#bfdbfe',
    '--ds-color-scale-blue-3': '#60a5fa',
    '--ds-color-scale-blue-4': '#2563eb',
    '--ds-color-scale-blue-5': '#1d4ed8',
    '--ds-color-scale-purple-1': '#f5f3ff',
    '--ds-color-scale-purple-2': '#ddd6fe',
    '--ds-color-scale-purple-3': '#a78bfa',
    '--ds-color-scale-purple-4': '#7c3aed',
    '--ds-color-scale-purple-5': '#6d28d9',
    '--ds-color-scale-amber-1': '#fffbeb',
    '--ds-color-scale-amber-2': '#fef3c7',
    '--ds-color-scale-amber-3': '#fbbf24',
    '--ds-color-scale-amber-4': '#d97706',
    '--ds-color-scale-amber-5': '#b45309',
    // color semantic kpi
    '--ds-color-semantic-kpiText-positive-onLightSurface': '#529c74',
    '--ds-color-semantic-kpiText-positive-onDarkSurface': '#37bb65',
    '--ds-color-semantic-kpiText-neutral-onLightSurface': '#df9f37',
    '--ds-color-semantic-kpiText-neutral-onDarkSurface': '#df9f37',
    '--ds-color-semantic-kpiText-negative-onLightSurface': '#b94431',
    '--ds-color-semantic-kpiText-negative-onDarkSurface': '#cc2e48',
    // color semantic alert (light/dark variants as separate constant names)
    '--ds-color-semantic-alert-success-light-bg': '#ecfdf3',
    '--ds-color-semantic-alert-success-light-text': '#2f7456',
    '--ds-color-semantic-alert-success-dark-bg': '#064e3b',
    '--ds-color-semantic-alert-success-dark-text': '#d1fae5',
    '--ds-color-semantic-alert-info-light-bg': '#eef2ff',
    '--ds-color-semantic-alert-info-light-text': '#312e81',
    '--ds-color-semantic-alert-info-dark-bg': '#1e1b4b',
    '--ds-color-semantic-alert-info-dark-text': '#e0e7ff',
    '--ds-color-semantic-alert-warning-light-bg': '#fff7ed',
    '--ds-color-semantic-alert-warning-light-text': '#92400e',
    '--ds-color-semantic-alert-warning-dark-bg': '#431407',
    '--ds-color-semantic-alert-warning-dark-text': '#fed7aa',
    '--ds-color-semantic-alert-error-light-bg': '#fef2f2',
    '--ds-color-semantic-alert-error-light-text': '#b91c1c',
    '--ds-color-semantic-alert-error-dark-bg': '#7f1d1d',
    '--ds-color-semantic-alert-error-dark-text': '#fecdd3',
    // icon
    '--ds-icon-size-xs': '12px',
    '--ds-icon-size-sm': '16px',
    '--ds-icon-size-md': '20px',
    '--ds-icon-size-lg': '24px',
    '--ds-icon-size-xl': '32px',
    '--ds-icon-strokeWidth-default': '1.5',
    '--ds-icon-strokeWidth-strong': '2',
    // layout
    '--ds-layout-maxWidth-panel': '720px',
    '--ds-layout-maxWidth-narrow': '640px',
    '--ds-layout-maxWidth-page': '1100px',
    '--ds-layout-pagePadding': '16px',
    '--ds-layout-sectionPaddingY': '16px',
    '--ds-layout-sectionPaddingX': '0',
    '--ds-layout-gap-rowDefault': '12px',
    '--ds-layout-gap-stackDefault': '12px',
    '--ds-layout-gap-stackTitle': '20px',
    '--ds-layout-gap-stackSecondary': '16px',
    '--ds-layout-gap-stackTertiary': '12px',
    // motion
    '--ds-motion-duration-instant': '50ms',
    '--ds-motion-duration-fast': '120ms',
    '--ds-motion-duration-normal': '180ms',
    '--ds-motion-duration-slow': '250ms',
    '--ds-motion-duration-slower': '320ms',
    '--ds-motion-easing-standard': 'cubic-bezier(0.2, 0, 0, 1)',
    '--ds-motion-easing-emphasized': 'cubic-bezier(0.2, 0, 0, 1.2)',
    '--ds-motion-easing-decelerate': 'cubic-bezier(0, 0, 0, 1)',
    '--ds-motion-easing-accelerate': 'cubic-bezier(0.4, 0, 1, 1)',
    // opacity
    '--ds-opacity-disabled': '0.4',
    '--ds-opacity-muted': '0.7',
    '--ds-opacity-overlayLight': '0.1',
    '--ds-opacity-overlayMedium': '0.3',
    '--ds-opacity-overlayStrong': '0.6',
    // radius
    '--ds-radius-sm': '8px',
    '--ds-radius-md': '12px',
    '--ds-radius-pill': '999px',
    // shadow
    '--ds-shadow-light': '0 2px 10px rgba(0, 0, 0, 0.08)',
    '--ds-shadow-hover': '0 6px 18px rgba(0, 0, 0, 0.1)',
    '--ds-shadow-modal': '0 10px 30px rgba(0, 0, 0, 0.15)',
    // size control
    '--ds-size-control-sm-height': '28px',
    '--ds-size-control-sm-paddingX': '8px',
    '--ds-size-control-sm-footprint': '28px',
    '--ds-size-control-md-height': '32px',
    '--ds-size-control-md-paddingX': '12px',
    '--ds-size-control-md-footprint': '32px',
    '--ds-size-control-lg-height': '40px',
    '--ds-size-control-lg-paddingX': '16px',
    '--ds-size-control-lg-footprint': '40px',
    // size pill
    '--ds-size-pill-sm-height': '20px',
    '--ds-size-pill-sm-paddingX': '8px',
    '--ds-size-pill-md-height': '24px',
    '--ds-size-pill-md-paddingX': '10px',
    '--ds-size-pill-lg-height': '28px',
    '--ds-size-pill-lg-paddingX': '12px',
    // size table row
    '--ds-size-tableRow-dense': '28px',
    '--ds-size-tableRow-regular': '32px',
    '--ds-size-tableRow-relaxed': '40px',
    // space
    '--ds-space-xxs': '4px',
    '--ds-space-xs': '8px',
    '--ds-space-sm': '12px',
    '--ds-space-md': '16px',
    '--ds-space-lg': '20px',
    '--ds-space-xl': '24px',
    // textScale
    '--ds-textScale-1-fontSize': '8px',
    '--ds-textScale-1-lineHeight': '1.2',
    '--ds-textScale-2-fontSize': '10px',
    '--ds-textScale-2-lineHeight': '1.2',
    '--ds-textScale-3-fontSize': '12px',
    '--ds-textScale-3-lineHeight': '1.2',
    '--ds-textScale-4-fontSize': '14px',
    '--ds-textScale-4-lineHeight': '1.4',
    '--ds-textScale-5-fontSize': '16px',
    '--ds-textScale-5-lineHeight': '1.4',
    '--ds-textScale-6-fontSize': '18px',
    '--ds-textScale-6-lineHeight': '1.4',
    '--ds-textScale-7-fontSize': '20px',
    '--ds-textScale-7-lineHeight': '1.4',
    '--ds-textScale-8-fontSize': '24px',
    '--ds-textScale-8-lineHeight': '1.2',
    '--ds-textScale-9-fontSize': '28px',
    '--ds-textScale-9-lineHeight': '1.2',
    '--ds-textScale-10-fontSize': '34px',
    '--ds-textScale-10-lineHeight': '1.2',
    '--ds-textScale-11-fontSize': '40px',
    '--ds-textScale-11-lineHeight': '1.2',
    // typography
    '--ds-typography-fontFamily-display': '"Inter", sans-serif',
    '--ds-typography-fontFamily-heading': '"Inter", sans-serif',
    '--ds-typography-fontFamily-body': '"Inter", sans-serif',
    '--ds-typography-fontFamily-prose': '"Lora", serif',
    '--ds-typography-fontFamily-mono': '"Roboto Mono", monospace',
    '--ds-typography-fontFamily-meta': '"Inter", sans-serif',
    '--ds-typography-fontWeight-display': '800',
    '--ds-typography-fontWeight-heading': '700',
    '--ds-typography-fontWeight-body': '500',
    '--ds-typography-fontWeight-prose': '500',
    '--ds-typography-fontWeight-mono': '400',
    '--ds-typography-fontWeight-meta': '400',
    '--ds-typography-lineHeight-tight': '1.2',
    '--ds-typography-lineHeight-normal': '1.4',
    '--ds-typography-lineHeight-relaxed': '1.6',
    '--ds-typography-letterSpacing-normal': '0',
    // zIndex
    '--ds-zIndex-base': '0',
    '--ds-zIndex-dropdown': '1000',
    '--ds-zIndex-sticky': '1100',
    '--ds-zIndex-overlay': '1200',
    '--ds-zIndex-modal': '1300',
    '--ds-zIndex-toast': '1400',
    '--ds-zIndex-tooltip': '1500',
  },
  // Light-mode aliases: point the semantic tokens at the light theme values.
  light: {
    '--ds-color-surface': 'var(--ds-color-theme-light-surface)',
    '--ds-color-surface-muted': 'var(--ds-color-theme-light-surfaceMuted)',
    '--ds-color-text': 'var(--ds-color-theme-light-text)',
    '--ds-color-text-muted': 'var(--ds-color-theme-light-textMuted)',
    '--ds-color-border': 'var(--ds-color-theme-light-border)',
    '--ds-color-accent-weak': 'var(--ds-color-theme-light-accentWeak)',
    '--ds-color-accent-strong': 'var(--ds-color-theme-light-accentStrong)',
    // alert tone aliases (theme-aware)
    '--ds-color-alert-info-bg': 'var(--ds-color-semantic-alert-info-light-bg)',
    '--ds-color-alert-info-text': 'var(--ds-color-semantic-alert-info-light-text)',
    '--ds-color-alert-success-bg': 'var(--ds-color-semantic-alert-success-light-bg)',
    '--ds-color-alert-success-text': 'var(--ds-color-semantic-alert-success-light-text)',
    '--ds-color-alert-warning-bg': 'var(--ds-color-semantic-alert-warning-light-bg)',
    '--ds-color-alert-warning-text': 'var(--ds-color-semantic-alert-warning-light-text)',
    '--ds-color-alert-error-bg': 'var(--ds-color-semantic-alert-error-light-bg)',
    '--ds-color-alert-error-text': 'var(--ds-color-semantic-alert-error-light-text)',
    // badge / input-error tone aliases (reuse alert palette)
    '--ds-color-tone-neutral-bg': 'var(--ds-color-theme-light-surfaceMuted)',
    '--ds-color-tone-neutral-text': 'var(--ds-color-theme-light-textMuted)',
    '--ds-color-tone-info-bg': 'var(--ds-color-semantic-alert-info-light-bg)',
    '--ds-color-tone-info-text': 'var(--ds-color-semantic-alert-info-light-text)',
    '--ds-color-tone-success-bg': 'var(--ds-color-semantic-alert-success-light-bg)',
    '--ds-color-tone-success-text': 'var(--ds-color-semantic-alert-success-light-text)',
    '--ds-color-tone-warning-bg': 'var(--ds-color-semantic-alert-warning-light-bg)',
    '--ds-color-tone-warning-text': 'var(--ds-color-semantic-alert-warning-light-text)',
    '--ds-color-tone-danger-bg': 'var(--ds-color-semantic-alert-error-light-bg)',
    '--ds-color-tone-danger-text': 'var(--ds-color-semantic-alert-error-light-text)',
    '--ds-color-error-text': 'var(--ds-color-semantic-alert-error-light-text)',
  },
  // Dark-mode aliases: point the semantic tokens at the dark theme values.
  dark: {
    '--ds-color-surface': 'var(--ds-color-theme-dark-surface)',
    '--ds-color-surface-muted': 'var(--ds-color-theme-dark-surfaceMuted)',
    '--ds-color-text': 'var(--ds-color-theme-dark-text)',
    '--ds-color-text-muted': 'var(--ds-color-theme-dark-textMuted)',
    '--ds-color-border': 'var(--ds-color-theme-dark-border)',
    '--ds-color-accent-weak': 'var(--ds-color-theme-dark-accentWeak)',
    '--ds-color-accent-strong': 'var(--ds-color-theme-dark-accentStrong)',
    // alert tone aliases (theme-aware)
    '--ds-color-alert-info-bg': 'var(--ds-color-semantic-alert-info-dark-bg)',
    '--ds-color-alert-info-text': 'var(--ds-color-semantic-alert-info-dark-text)',
    '--ds-color-alert-success-bg': 'var(--ds-color-semantic-alert-success-dark-bg)',
    '--ds-color-alert-success-text': 'var(--ds-color-semantic-alert-success-dark-text)',
    '--ds-color-alert-warning-bg': 'var(--ds-color-semantic-alert-warning-dark-bg)',
    '--ds-color-alert-warning-text': 'var(--ds-color-semantic-alert-warning-dark-text)',
    '--ds-color-alert-error-bg': 'var(--ds-color-semantic-alert-error-dark-bg)',
    '--ds-color-alert-error-text': 'var(--ds-color-semantic-alert-error-dark-text)',
    // badge / input-error tone aliases (reuse alert palette)
    '--ds-color-tone-neutral-bg': 'var(--ds-color-theme-dark-surfaceMuted)',
    '--ds-color-tone-neutral-text': 'var(--ds-color-theme-dark-textMuted)',
    '--ds-color-tone-info-bg': 'var(--ds-color-semantic-alert-info-dark-bg)',
    '--ds-color-tone-info-text': 'var(--ds-color-semantic-alert-info-dark-text)',
    '--ds-color-tone-success-bg': 'var(--ds-color-semantic-alert-success-dark-bg)',
    '--ds-color-tone-success-text': 'var(--ds-color-semantic-alert-success-dark-text)',
    '--ds-color-tone-warning-bg': 'var(--ds-color-semantic-alert-warning-dark-bg)',
    '--ds-color-tone-warning-text': 'var(--ds-color-semantic-alert-warning-dark-text)',
    '--ds-color-tone-danger-bg': 'var(--ds-color-semantic-alert-error-dark-bg)',
    '--ds-color-tone-danger-text': 'var(--ds-color-semantic-alert-error-dark-text)',
    '--ds-color-error-text': 'var(--ds-color-semantic-alert-error-dark-text)',
  },
});

// Centralized Mantine wrappers with stable defaults so pages/features only invoke primitives.
export function MantineProvider(props: MantineProviderProps): ReactElement {
  return (
    <MantineProviderCore theme={theme} cssVariablesResolver={cssVariablesResolver} {...props} />
  );
}

export function Card(props: CardProps): ReactElement {
  const { style, ...rest } = props;
  return (
    <MantineCard
      radius="md"
      withBorder
      style={{
        background: 'var(--ds-color-surface)',
        borderColor: 'var(--ds-color-border)',
        ...(style ?? {}),
      }}
      {...rest}
    />
  );
}

export function Button(props: ButtonProps): ReactElement {
  return <MantineButton radius="md" {...props} />;
}

export function Alert(props: AlertProps): ReactElement {
  return <MantineAlert radius="md" {...props} />;
}

export function Stack(props: StackProps): ReactElement {
  return <MantineStack gap="sm" {...props} />;
}

export function Group(props: GroupProps): ReactElement {
  return <MantineGroup gap="sm" {...props} />;
}

export function Text(props: TextProps): ReactElement {
  return <MantineText {...props} />;
}

export function Title(props: TitleProps): ReactElement {
  return <MantineTitle {...props} />;
}

export function Modal(props: ModalProps): ReactElement {
  return <MantineModal radius="md" centered {...props} />;
}

export function Checkbox(props: CheckboxProps): ReactElement {
  return <MantineCheckbox {...props} />;
}

export function Select(props: SelectProps): ReactElement {
  return <MantineSelect searchable {...props} />;
}

export function NumberInput(props: NumberInputProps): ReactElement {
  return <MantineNumberInput {...props} />;
}

export function PasswordInput(props: PasswordInputProps): ReactElement {
  return <MantinePasswordInput {...props} />;
}

export function TextInput(props: TextInputProps): ReactElement {
  return <MantineTextInput {...props} />;
}

export function Textarea(props: TextareaProps): ReactElement {
  return <MantineTextarea autosize minRows={3} {...props} />;
}

export function Box(props: BoxProps): ReactElement {
  return <MantineBox {...props} />;
}

export function Tooltip(props: TooltipProps): ReactElement {
  return <MantineTooltip withArrow {...props} />;
}

export function ActionIcon(props: ActionIconProps): ReactElement {
  return <MantineActionIcon radius="md" {...props} />;
}

export function Badge(props: BadgeProps): ReactElement {
  return <MantineBadge radius="sm" {...props} />;
}

export function Switch(props: SwitchProps): ReactElement {
  return <MantineSwitch {...props} />;
}

export function SegmentedControl(props: SegmentedControlProps): ReactElement {
  return <MantineSegmentedControl {...props} />;
}

export const ScrollArea = MantineScrollArea;

export function Indicator(props: IndicatorProps): ReactElement {
  return <MantineIndicator {...props} />;
}

export function UnstyledButton(props: UnstyledButtonProps): ReactElement {
  return <MantineUnstyledButton {...props} />;
}

export function Loader(props: LoaderProps): ReactElement {
  return <MantineLoader {...props} />;
}

export function Divider(props: DividerProps): ReactElement {
  return <MantineDivider {...props} />;
}

export function Anchor(props: AnchorProps): ReactElement {
  return <MantineAnchor underline="hover" fw={500} {...props} />;
}

type LinkProps = Omit<AnchorProps, 'href' | 'component'> & { to: string };

export function Link({ to, ...props }: LinkProps): ReactElement {
  return <MantineAnchor component={RouterLink} to={to} underline="hover" fw={500} {...props} />;
}

export function Blockquote(props: BlockquoteProps): ReactElement {
  return <MantineBlockquote {...props} />;
}

export function Code(props: CodeProps): ReactElement {
  return <MantineCode {...props} />;
}

export function Image(props: ImageProps): ReactElement {
  return <MantineImage {...props} />;
}

export function Paper(props: PaperProps): ReactElement {
  return <MantinePaper radius="md" withBorder {...props} />;
}

export function SimpleGrid(props: SimpleGridProps): ReactElement {
  return <MantineSimpleGrid {...props} />;
}

export function Drawer(props: DrawerProps): ReactElement {
  return <MantineDrawer radius="md" {...props} />;
}

export function Breadcrumbs(props: BreadcrumbsProps): ReactElement {
  return <MantineBreadcrumbs {...props} />;
}

// Preserve compound APIs (e.g., Menu.Target, Grid.Col, Table.Tbody, List.Item, Radio.Group, Popover.Target).
export const Combobox = MantineCombobox;
export const useCombobox = useMantineCombobox;
export const Menu = MantineMenu;
export const Grid = MantineGrid;
export const Table = MantineTable;
export const List = MantineList;
export const Radio = MantineRadio;
export const Stepper = MantineStepper;
export const Popover = MantinePopover;
export const Skeleton = MantineSkeleton;

export type {
  MenuProps,
  GridProps,
  TableProps,
  ListProps,
  RadioProps,
  StepperProps,
  DrawerProps,
  BreadcrumbsProps,
  PopoverProps,
  LinkProps,
};
