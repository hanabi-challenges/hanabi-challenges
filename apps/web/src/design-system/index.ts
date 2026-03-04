export { Card } from './components/layout/Card/Card';
export { CardHeader, CardBody, CardFooter } from './components/layout/Card/CardSections';
export { SectionCard } from './components/layout/SectionCard/SectionCard';
export { PageHeader } from './components/layout/PageHeader/PageHeader';
export { CardContainer } from './components/layout/CardContainer/CardContainer';
export { PageContainer } from './components/layout/PageContainer/PageContainer';
export { Section } from './components/layout/Section/Section';
export { Subsection } from './components/layout/Subsection/Subsection';
export { Stack } from './components/layout/Stack/Stack';
export { Inline } from './components/layout/Inline/Inline';
export { Grid } from './components/layout/Grid/Grid';
export { Main } from './components/layout/Main/Main';
export { Button } from './components/inputs/Button/Button';
export { Checkbox } from './components/inputs/Checkbox/Checkbox';
export { Radio } from './components/inputs/Radio/Radio';
export { Alert } from './components/feedback/Alert/Alert';
export { Input } from './components/inputs/Input/Input';
export { Pill } from './components/data-display/Pill/Pill';
export { Badge } from './components/data-display/Badge/Badge';
export { MaterialIcon } from './components/data-display/MaterialIcon/MaterialIcon';
export { Table } from './components/data-display/Table/Table';
export { KPIText } from './components/data-display/KPIText/KPIText';
export { List } from './components/data-display/List/List';
export { Heading } from './components/typography/Heading/Heading';
export { Prose } from './components/typography/Prose/Prose';
export { Text } from './components/typography/Text/Text';
export { FormContainer } from './components/inputs/FormContainer/FormContainer';
export { InputContainer } from './components/inputs/InputContainer/InputContainer';
export { Select } from './components/inputs/Select/Select';
export { ToggleSwitch } from './components/inputs/ToggleSwitch/ToggleSwitch';
export { DatePicker } from './components/inputs/DatePicker/DatePicker';
export { NumberInput } from './components/inputs/NumberInput/NumberInput';
export { RadioGroup } from './components/inputs/RadioGroup/RadioGroup';
export { ButtonGroup } from './components/inputs/ButtonGroup/ButtonGroup';
export { SearchSelect } from './components/inputs/SearchSelect/SearchSelect';
export { Tabs } from './components/navigation/Tabs/Tabs';
export { Breadcrumbs } from './components/navigation/Breadcrumbs/Breadcrumbs';
export { Pagination } from './components/navigation/Pagination/Pagination';
export { Modal } from './components/overlay/Modal/Modal';
export { Popover } from './components/overlay/Popover/Popover';
export { Drawer } from './components/overlay/Drawer/Drawer';
export { Tooltip } from './components/overlay/Tooltip/Tooltip';
export { ActionIcon, Indicator, Menu, PasswordInput, ScrollArea, SimpleGrid } from '../mantine';

// Core wrapper exports for pages/features that need lower-level primitives.
// Use these via design-system (not direct ../mantine imports) to preserve a single UI boundary.
export {
  ActionIcon as CoreActionIcon,
  Alert as CoreAlert,
  Anchor as CoreAnchor,
  Badge as CoreBadge,
  Box as CoreBox,
  Button as CoreButton,
  Card as CoreCard,
  Checkbox as CoreCheckbox,
  Code as CoreCode,
  Divider as CoreDivider,
  Grid as CoreGrid,
  Group as CoreGroup,
  Image as CoreImage,
  Indicator as CoreIndicator,
  Loader as CoreLoader,
  Menu as CoreMenu,
  Modal as CoreModal,
  NumberInput as CoreNumberInput,
  Paper as CorePaper,
  PasswordInput as CorePasswordInput,
  Radio as CoreRadio,
  ScrollArea as CoreScrollArea,
  SegmentedControl as CoreSegmentedControl,
  Select as CoreSelect,
  SimpleGrid as CoreSimpleGrid,
  Stack as CoreStack,
  Stepper as CoreStepper,
  Switch as CoreSwitch,
  Table as CoreTable,
  Text as CoreText,
  TextInput as CoreTextInput,
  Textarea as CoreTextarea,
  Title as CoreTitle,
  Tooltip as CoreTooltip,
  UnstyledButton as CoreUnstyledButton,
} from '../mantine';
