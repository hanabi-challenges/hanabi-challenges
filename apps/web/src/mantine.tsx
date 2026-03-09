import {
  Combobox as MantineCombobox,
  useCombobox as useMantineCombobox,
  ActionIcon as MantineActionIcon,
  Alert as MantineAlert,
  Anchor as MantineAnchor,
  Badge as MantineBadge,
  Blockquote as MantineBlockquote,
  Box as MantineBox,
  Button as MantineButton,
  Card as MantineCard,
  Checkbox as MantineCheckbox,
  Code as MantineCode,
  Divider as MantineDivider,
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
  type ButtonProps,
  type CardProps,
  type CheckboxProps,
  type CodeProps,
  type DividerProps,
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

// Centralized Mantine wrappers with stable defaults so pages/features only invoke primitives.
export function MantineProvider(props: MantineProviderProps): ReactElement {
  return <MantineProviderCore {...props} />;
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
  return <MantineAnchor {...props} />;
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

// Preserve compound APIs (e.g., Menu.Target, Grid.Col, Table.Tbody, List.Item, Radio.Group).
export const Combobox = MantineCombobox;
export const useCombobox = useMantineCombobox;
export const Menu = MantineMenu;
export const Grid = MantineGrid;
export const Table = MantineTable;
export const List = MantineList;
export const Radio = MantineRadio;
export const Stepper = MantineStepper;

export type { MenuProps, GridProps, TableProps, ListProps, RadioProps, StepperProps };
