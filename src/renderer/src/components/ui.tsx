import * as RTooltip from '@radix-ui/react-tooltip'
import * as RSwitch from '@radix-ui/react-switch'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/util'

export function Tip({ label, children, side = 'bottom', shortcut }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; shortcut?: string }) {
  return (
    <RTooltip.Root delayDuration={220}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side={side} sideOffset={6} className="z-[80] flex items-center gap-2 rounded-md bg-ink px-2 py-1 text-[12px] font-medium text-ground">
          {label}
          {shortcut && <span className="opacity-50">{shortcut}</span>}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' | 'danger'; size?: 'sm' | 'md' }

/** Text buttons: white primary, hairline outline, or plain text. */
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ className, variant = 'outline', size = 'md', ...p }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'no-drag inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-35',
        size === 'md' ? 'h-8 px-3 text-[13px]' : 'h-7 px-2.5 text-[12px]',
        variant === 'primary' && 'bg-ink text-ground hover:bg-ink/85',
        variant === 'outline' && 'border border-line text-ink hover:bg-raised',
        variant === 'ghost' && 'text-muted hover:text-ink',
        variant === 'danger' && 'border border-live/40 text-live hover:bg-live/10',
        className
      )}
      {...p}
    />
  )
})

/** Bare icon button – no box, just colour on hover. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }>(function IconButton({ className, active, ...p }, ref) {
  return (
    <button
      ref={ref}
      className={cn('no-drag inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors', active ? 'text-ink' : 'text-faint hover:text-ink', className)}
      {...p}
    />
  )
})

export function Switch({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  return (
    <RSwitch.Root id={id} checked={checked} onCheckedChange={onChange} className="relative h-[18px] w-[32px] shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-ink">
      <RSwitch.Thumb className="block h-[14px] w-[14px] translate-x-[2px] rounded-full bg-ground transition-transform data-[state=checked]:translate-x-[16px] data-[state=unchecked]:bg-muted" />
    </RSwitch.Root>
  )
}

export function Avatar({ src, name, size = 32, className }: { src?: string; name: string; size?: number; className?: string }) {
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised font-medium text-muted', className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4) }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" draggable={false} /> : name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cn('no-drag h-8 w-full rounded-md border border-line bg-transparent px-2.5 text-[13px] text-ink placeholder:text-faint focus:border-muted', p.className)}
    />
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="font-sans text-[11px] text-faint">{children}</kbd>
}

/** Underlined text tabs */
export function Tabs<T extends string>({ value, items, onChange, className }: { value: T; items: [T, string][]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('flex gap-4', className)}>
      {items.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn('-mb-px whitespace-nowrap border-b py-2 text-[12.5px] font-medium transition-colors', value === id ? 'border-ink text-ink' : 'border-transparent text-faint hover:text-muted')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
