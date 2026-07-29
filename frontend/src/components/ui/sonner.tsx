import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/lib/theme';

/** App-wide toast host. Reads the current theme so toasts match dark/light. */
function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          // `!` is load-bearing. Sonner injects its own stylesheet at runtime —
          // i.e. after ours — so its `[data-sonner-toast] [data-button]`
          // defaults win on source order and the action button renders as a
          // near-black pill instead of the brand colour. Sizing is repeated
          // here for the same reason, matching Button's `sm` size so a toast
          // action reads as the same control as everywhere else in the app.
          actionButton:
            'group-[.toast]:!h-8 group-[.toast]:!rounded-md group-[.toast]:!px-3 group-[.toast]:!text-xs group-[.toast]:!font-medium group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground group-[.toast]:hover:!bg-primary/90',
          cancelButton:
            'group-[.toast]:!h-8 group-[.toast]:!rounded-md group-[.toast]:!px-3 group-[.toast]:!text-xs group-[.toast]:!font-medium group-[.toast]:!bg-muted group-[.toast]:!text-muted-foreground group-[.toast]:hover:!bg-muted/80',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
