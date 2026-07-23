import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

// Legacy variant/size names used across the app, mapped onto the canonical set
// so existing call sites keep working while new code can use shadcn variants.
const legacyVariant = {
  primary: 'default',
  danger: 'destructive',
} as const;
const legacySize = { md: 'default' } as const;

type CanonicalVariant = VariantProps<typeof buttonVariants>['variant'];
type CanonicalSize = VariantProps<typeof buttonVariants>['size'];

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: CanonicalVariant | keyof typeof legacyVariant;
  size?: CanonicalSize | keyof typeof legacySize;
  asChild?: boolean;
  loading?: boolean;
}

/** The app's button. `asChild` renders the (single) child element instead —
 *  used to style router `<Link>`s as buttons. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'default',
    size = 'default',
    asChild = false,
    loading = false,
    disabled,
    children,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  const v = (legacyVariant[variant as keyof typeof legacyVariant] ??
    variant) as CanonicalVariant;
  const s = (legacySize[size as keyof typeof legacySize] ?? size) as CanonicalSize;

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant: v, size: s }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {/* Radix Slot demands exactly ONE element child — even a compiled
          `[false, children]` array crashes it — so asChild passes the child
          through bare (the spinner only ever belongs to a real <button>). */}
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
});
