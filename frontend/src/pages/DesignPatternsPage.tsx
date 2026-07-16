import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ColorSelect,
  Combobox,
  DatePicker,
  Dialog,
  Field,
  Input,
  Label,
  Menu,
  MultiSelect,
  ProgressBar,
  RadioGroup,
  RadioGroupItem,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TagInput,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';

/** One labelled block in the gallery, using the shared section-heading recipe. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

const badgeVariantList = [
  'default',
  'secondary',
  'outline',
  'success',
  'warning',
  'info',
  'muted',
  'destructive',
] as const;

const tableRows: Array<{
  name: string;
  type: string;
  status: string;
  variant: 'success' | 'destructive' | 'muted';
}> = [
  { name: 'Login flow', type: 'Functional', status: 'Passed', variant: 'success' },
  { name: 'Checkout', type: 'Integration', status: 'Failed', variant: 'destructive' },
  { name: 'Search bar', type: 'UI', status: 'Untested', variant: 'muted' },
];

const priorityOptions = [
  { value: 'low', label: 'Low', color: 'hsl(220 9% 46%)' },
  { value: 'medium', label: 'Medium', color: 'hsl(221 83% 53%)' },
  { value: 'high', label: 'High', color: 'hsl(35 92% 45%)' },
  { value: 'critical', label: 'Critical', color: 'hsl(0 72% 51%)' },
];

const assigneeOptions = [
  { value: 'ava', label: 'Ava Nguyen' },
  { value: 'liam', label: 'Liam Park' },
  { value: 'mia', label: 'Mia Chen' },
  { value: 'noah', label: 'Noah Kim' },
  { value: 'olivia', label: 'Olivia Tran' },
];

const labelOptions = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'ui', label: 'UI' },
  { value: 'backend', label: 'Backend' },
  { value: 'docs', label: 'Docs' },
];

const surfaces: Array<[string, string]> = [
  ['background', 'bg-background'],
  ['card', 'bg-card'],
  ['muted', 'bg-muted'],
  ['accent', 'bg-accent'],
  ['primary', 'bg-primary'],
  ['secondary', 'bg-secondary'],
  ['destructive', 'bg-destructive'],
];

/**
 * Canonical component reference — the living style guide for the shadcn/ui
 * abstraction layer. Build new screens from these primitives rather than raw
 * elements, and eyeball tokens/variants here.
 */
export function DesignPatternsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [priority, setPriority] = useState('high');
  const [notify, setNotify] = useState('email');
  const [assignee, setAssignee] = useState('');
  const [labels, setLabels] = useState<string[]>(['bug', 'ui']);
  const [tags, setTags] = useState<string[]>(['design', 'urgent']);
  const [date, setDate] = useState('');
  const [selectDemo, setSelectDemo] = useState('');

  return (
    <div>
      <PageHeader
        title="Design patterns"
        subtitle="The shadcn/ui component library — the reference for every screen."
      />

      {/* Buttons */}
      <Section title="Buttons">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button loading>Saving…</Button>
            <Button variant="secondary" loading>
              Loading
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </Section>

      {/* Badges */}
      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          {badgeVariantList.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Section>

      {/* Alerts */}
      <Section title="Alerts">
        <div className="max-w-xl space-y-3">
          <Alert>
            <Info />
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>A neutral, informational message.</AlertDescription>
          </Alert>
          <Alert variant="success">
            <CheckCircle2 />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>Your changes were stored successfully.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Careful</AlertTitle>
            <AlertDescription>Double-check this before continuing.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>We couldn’t complete that request.</AlertDescription>
          </Alert>
        </div>
      </Section>

      {/* Card */}
      <Section title="Card">
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Project Alpha</CardTitle>
            <CardDescription>A sample card surface.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Cards group related content on the elevated surface with a hairline border and
            subtle shadow.
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
            <Button size="sm">Save</Button>
          </CardFooter>
        </Card>
      </Section>

      {/* Form controls */}
      <Section title="Form controls">
        <div className="grid max-w-2xl grid-cols-1 gap-x-6 sm:grid-cols-2">
          <Field label="Text input" htmlFor="dp-input">
            <Input id="dp-input" placeholder="Type something…" />
          </Field>
          <Field label="Select" htmlFor="dp-select">
            <Select
              id="dp-select"
              value={selectDemo}
              onValueChange={setSelectDemo}
              placeholder="Choose…"
              options={[
                { value: 'a', label: 'Option A' },
                { value: 'b', label: 'Option B' },
              ]}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Textarea" htmlFor="dp-textarea">
              <Textarea id="dp-textarea" placeholder="Multiple lines…" />
            </Field>
          </div>
          <Field label="With error" htmlFor="dp-err" error="This field is required">
            <Input id="dp-err" aria-invalid placeholder="Invalid value" />
          </Field>
        </div>
      </Section>

      {/* Advanced form controls */}
      <Section title="Advanced form controls">
        <div className="grid max-w-2xl grid-cols-1 gap-x-6 sm:grid-cols-2">
          <Field label="Combobox (searchable)" htmlFor="dp-combobox">
            <Combobox
              id="dp-combobox"
              options={assigneeOptions}
              value={assignee}
              onChange={setAssignee}
              placeholder="Assign to…"
              searchPlaceholder="Search people…"
            />
          </Field>
          <Field label="Multi-select" htmlFor="dp-multi">
            <MultiSelect
              id="dp-multi"
              options={labelOptions}
              value={labels}
              onChange={setLabels}
              placeholder="Add labels…"
            />
          </Field>
          <Field label="Date picker" htmlFor="dp-date">
            <DatePicker id="dp-date" value={date} onChange={setDate} placeholder="Pick a date" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Tag input" htmlFor="dp-tags">
              <TagInput id="dp-tags" value={tags} onChange={setTags} />
            </Field>
          </div>
        </div>
      </Section>

      {/* Toggles */}
      <Section title="Toggles">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-2">
            <Switch id="dp-switch" checked={switchOn} onCheckedChange={setSwitchOn} />
            <Label htmlFor="dp-switch" className="cursor-pointer font-normal">
              Notifications {switchOn ? 'on' : 'off'}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="dp-check"
              checked={checked}
              onCheckedChange={(c) => setChecked(c === true)}
            />
            <Label htmlFor="dp-check" className="cursor-pointer font-normal">
              Accept terms
            </Label>
          </div>
        </div>
      </Section>

      {/* Radio group */}
      <Section title="Radio group">
        <RadioGroup value={notify} onValueChange={setNotify}>
          {[
            { value: 'email', label: 'Email' },
            { value: 'sms', label: 'SMS' },
            { value: 'push', label: 'Push notification' },
          ].map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <RadioGroupItem value={opt.value} id={`dp-radio-${opt.value}`} />
              <Label htmlFor={`dp-radio-${opt.value}`} className="cursor-pointer font-normal">
                {opt.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </Section>

      {/* Progress */}
      <Section title="Progress">
        <div className="max-w-md space-y-3">
          <ProgressBar value={25} />
          <ProgressBar value={60} />
          <ProgressBar value={92} />
        </div>
      </Section>

      {/* Tabs */}
      <Section title="Tabs">
        <Tabs defaultValue="overview" className="max-w-xl">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="text-sm text-muted-foreground">
            The overview panel summarises the current state.
          </TabsContent>
          <TabsContent value="activity" className="text-sm text-muted-foreground">
            Recent activity shows up here.
          </TabsContent>
          <TabsContent value="settings" className="text-sm text-muted-foreground">
            Configuration and preferences live on this tab.
          </TabsContent>
        </Tabs>
      </Section>

      {/* Table */}
      <Section title="Table">
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test case</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.type}</TableCell>
                  <TableCell>
                    <Badge variant={row.variant}>{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      {/* Tooltip */}
      <Section title="Tooltip">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">
              Hover me
            </Button>
          </TooltipTrigger>
          <TooltipContent>A helpful hint appears here</TooltipContent>
        </Tooltip>
      </Section>

      {/* Dialog */}
      <Section title="Dialog">
        <Button variant="secondary" onClick={() => setDialogOpen(true)}>
          Open dialog
        </Button>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Example dialog"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            Dialogs render in a portal with a focus trap, scroll lock, and Esc / overlay
            to close.
          </p>
        </Dialog>
      </Section>

      {/* Menu */}
      <Section title="Menu">
        <Menu
          trigger={
            <Button variant="outline" size="sm">
              Open menu ⋯
            </Button>
          }
          items={[
            { label: 'Edit', onClick: () => {} },
            { label: 'Duplicate', onClick: () => {} },
            { label: 'Delete', onClick: () => {}, danger: true },
          ]}
        />
      </Section>

      {/* Color select */}
      <Section title="Color select">
        <div className="max-w-xs">
          <ColorSelect
            ariaLabel="Priority"
            value={priority}
            options={priorityOptions}
            onChange={setPriority}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Colour-coded picker — the trigger and every open option carry the value’s colour
            (visible in the list on all browsers).
          </p>
        </div>
      </Section>

      {/* Surfaces & tokens */}
      <Section title="Surfaces & tokens">
        <div className="grid max-w-2xl grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7">
          {surfaces.map(([name, cls]) => (
            <div key={name} className="flex flex-col gap-1.5">
              <div className={`h-14 w-full rounded-md border ${cls}`} />
              <span className="text-xs text-muted-foreground">{name}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
