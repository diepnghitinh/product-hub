import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, GitBranch, Hash, Link2 } from 'lucide-react';
import {
  Button,
  Input,
  SaveButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import {
  BRANCH_NAME_MAX,
  issueBranchName,
  issueUrl,
  normalizeBranchName,
  typedBranchName,
} from './refs';

/** How long a button stays on ✓ before returning to its own icon. */
const FLASH_MS = 1500;

/**
 * Every button in the cluster. Deliberately smaller than a standard icon button:
 * these are secondary utilities parked in the page's corner, not actions anyone
 * came here for, so they read as chrome rather than competing with the title. Still
 * 28px — above the 24px floor where a pointer target starts getting fiddly.
 */
const COPY_BUTTON =
  // The glyph is sized from here, not on the icon: <Button> sets `[&_svg]:size-4`,
  // and a descendant selector outranks a class on the svg itself — set it there and
  // the icon silently stays 16px inside a 28px button.
  'size-7 shrink-0 text-muted-foreground hover:text-accent-foreground [&_svg]:size-3.5';

interface IssueCopyActionsProps {
  /** Resolved uuid — the fallback address for an issue minted before refs. */
  issueId: string;
  shortId?: string;
  title: string;
  /** The branch name the issue answers to, as the API reports it. Omit and it's
   *  derived here from the ref + title, which is what it would have been anyway. */
  branch?: string;
  /**
   * Saves a new branch name (`''` reverts to the derived default). Provide it —
   * together with `canWrite` — to turn the branch button into an editor;
   * without it the button stays a plain one-click copy. Reject with the API's
   * error (a 409 when the name is taken) and it's shown under the field.
   */
  onSaveBranchName?: (name: string) => Promise<unknown>;
  canWrite?: boolean;
  className?: string;
}

/**
 * The three things people copy out of an issue and paste somewhere else: its
 * URL (into chat), its ID (into a commit message or a standup note), and a git
 * branch name (into a terminal).
 *
 * Three buttons rather than a menu: these are the issue's *addresses*, wanted
 * mid-flow while looking at something else, and a menu costs two clicks and a
 * read for each of them. The icons carry the meaning (link · hash · branch) with
 * a tooltip naming each one, so nothing is a guessing game.
 *
 * The cluster is deliberately ungated: copying an address is a read, so a viewer
 * who can't edit the issue still gets it. Clicking flips that button to ✓ in
 * place — with three of them side by side, the confirmation has to say *which*
 * one landed on the clipboard.
 *
 * The branch button is the exception: it opens a small editor (see
 * {@link BranchNameEditor}) for anyone who can write, because a branch name is
 * the one address a team may want to *choose* rather than accept.
 */
export function IssueCopyActions({
  issueId,
  shortId,
  title,
  branch,
  onSaveBranchName,
  canWrite = false,
  className,
}: IssueCopyActionsProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function copy(key: string, value: string) {
    void navigator.clipboard?.writeText(value);
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), FLASH_MS);
  }

  const issue = { id: issueId, shortId, title, branch };
  const branchName = issueBranchName(issue);
  const editable = canWrite && !!onSaveBranchName;

  const actions: { key: string; label: string; icon: ReactNode; value: string }[] = [
    {
      key: 'url',
      label: t('issues.copyUrl'),
      icon: <Link2 aria-hidden />,
      value: issueUrl(issue),
    },
    {
      key: 'id',
      label: t('issues.copyId'),
      icon: <Hash aria-hidden />,
      value: shortId || issueId,
    },
    // Only when it's read-only — otherwise the branch renders as the editor below.
    ...(editable
      ? []
      : [
          {
            key: 'branch',
            label: t('issues.copyBranch'),
            icon: <GitBranch aria-hidden />,
            value: branchName,
          },
        ]),
  ];

  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)}>
      {actions.map(({ key, label, icon, value }) => {
        const done = copied === key;
        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={cn(COPY_BUTTON, done && 'text-primary hover:text-primary')}
                aria-label={label}
                onClick={() => copy(key, value)}
              >
                {done ? <Check aria-hidden /> : icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{done ? t('common.copied') : label}</TooltipContent>
          </Tooltip>
        );
      })}
      {editable && (
        <BranchNameEditor
          branch={branchName}
          derived={issueBranchName({ id: issueId, shortId, title })}
          onSave={onSaveBranchName}
        />
      )}
    </div>
  );
}

interface BranchNameEditorProps {
  /** The name in effect right now — what the field opens on. */
  branch: string;
  /** What the name would be with no override, shown as the "or leave it empty" hint. */
  derived: string;
  onSave: (name: string) => Promise<unknown>;
}

/**
 * The branch button, with an editor behind it: click it and a popover shows the
 * name in a field with **Copy** beside **Save**.
 *
 * Copying costs one extra click compared with a plain copy button, and that's
 * the deliberate trade — reading the name and changing it are the same gesture
 * here, so there is exactly one place to go for either and no second control
 * hiding in an overflow menu. The field also *shows* the name, which the copy
 * button never did: you can check what you're about to paste.
 *
 * Typing is normalized live to what git will accept and what the API will store,
 * so the field is never showing something the save would quietly rewrite. An
 * empty field means "no override" — it saves as the derived name, which is how
 * you undo a rename. Uniqueness is the server's call (it's a per-workspace
 * index), so a clash comes back as a 409 and lands under the field.
 */
function BranchNameEditor({ branch, derived, onSave }: BranchNameEditorProps) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(branch);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // The filter can shorten what was typed ("!!" collapses to "-"), and React
  // writing a different string back to the input parks the caret at the end. Note
  // where it should land and put it back before the browser paints, so editing the
  // middle of a name doesn't fling you to the end of it.
  const inputRef = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const focused = useRef(false);
  useLayoutEffect(() => {
    if (caret.current === null || !inputRef.current) return;
    inputRef.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [value]);

  // What actually gets saved — and, when the field is empty, what the issue falls
  // back to. Shown on the Copy button so it can't copy a half-typed name.
  const next = normalizeBranchName(value);
  const effective = next || derived;

  async function save() {
    setError('');
    try {
      await onSave(next);
    } catch (e) {
      // The API's own words — "TSK-6HCUHKX already uses that branch name" says
      // more than any message this side could invent.
      setError((e as Error).message || t('issues.branchTaken'));
      throw e; // keeps SaveButton from flashing "Saved" over a failed write
    }
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // Reopening starts from what's saved, so an abandoned edit isn't waiting
        // there next time looking like it took.
        if (o) {
          setValue(branch);
          setError('');
          focused.current = false;
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverPrimitive.Trigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                COPY_BUTTON,
                'data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
              )}
              aria-label={t('issues.branchName')}
            >
              <GitBranch aria-hidden />
            </Button>
          </PopoverPrimitive.Trigger>
        </TooltipTrigger>
        <TooltipContent>{t('issues.branchName')}</TooltipContent>
      </Tooltip>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-3 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <label
            htmlFor={fieldId}
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            {t('issues.branchName')}
          </label>
          <Input
            id={fieldId}
            ref={(el) => {
              inputRef.current = el;
              if (!el || focused.current) return;
              // Focus by hand instead of `autoFocus`, which lands the caret at the
              // end and scrolls a long name out of view — leaving the field showing
              // its tail, when the first thing anyone does here is *read* it.
              focused.current = true;
              el.focus();
              el.setSelectionRange(0, 0);
              el.scrollLeft = 0;
            }}
            spellCheck={false}
            autoComplete="off"
            maxLength={BRANCH_NAME_MAX}
            className="font-mono text-xs aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive"
            placeholder={derived}
            value={value}
            aria-invalid={!!error}
            aria-describedby={`${fieldId}-hint`}
            onChange={(e) => {
              // Filtered as you type, so the field is a preview of the saved value
              // rather than a draft the server rewrites behind you — but only the
              // safe half of the rules (see `typedBranchName`); trimming the edges
              // here would eat the `/` and `-` the moment you pressed them.
              const raw = e.target.value;
              const clean = typedBranchName(raw);
              caret.current = Math.max(
                0,
                (e.target.selectionStart ?? raw.length) + clean.length - raw.length,
              );
              setValue(clean);
              setError('');
            }}
            // Leaving the field settles it to exactly what a save would store.
            onBlur={() => setValue(normalizeBranchName(value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void save().catch(() => {});
              }
            }}
          />
          <p
            id={`${fieldId}-hint`}
            className={cn('mt-1.5 text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
          >
            {error || (next ? t('issues.branchHint') : `${t('issues.branchDefault')} ${derived}`)}
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(effective);
                setCopied(true);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => setCopied(false), FLASH_MS);
              }}
            >
              {copied ? (
                <>
                  <Check className="size-4 text-success" aria-hidden />
                  {t('common.copied')}
                </>
              ) : (
                t('common.copy')
              )}
            </Button>
            {/* Nothing to save when the field already reads as the saved name —
                including the empty field on an issue that was never renamed. */}
            <SaveButton size="sm" onSave={save} disabled={effective === branch}>
              {t('common.save')}
            </SaveButton>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
