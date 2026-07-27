import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * A person shown as their avatar image, falling back to initials on a branded
 * disc when they have no photo (or it fails to load — Radix swaps in the fallback
 * automatically). One component so every avatar in the app reads the same: pass
 * `className` for the size, `fallbackClassName` for the initials' text size to
 * match it (the disc has no intrinsic type scale).
 */
export function UserAvatar({
  name,
  email = '',
  src,
  className,
  fallbackClassName,
}: {
  name: string;
  email?: string;
  src?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt={name} className="object-cover" /> : null}
      <AvatarFallback
        className={cn('bg-primary font-semibold text-primary-foreground', fallbackClassName)}
      >
        {initials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
