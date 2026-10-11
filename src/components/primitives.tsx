import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/ui'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'subtle' | 'danger'; size?: 'sm' | 'md' | 'icon' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'subtle', size = 'md', className, ...props }, ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
        size === 'sm' && 'h-7 px-2 text-xs',
        size === 'md' && 'h-9 px-3 text-sm md:h-8 md:text-[13px]',
        size === 'icon' && 'h-10 w-10 md:h-8 md:w-8',
        variant === 'primary' && 'bg-accent text-accent-fg hover:opacity-90',
        variant === 'subtle' && 'bg-panel-2 border border-line hover:border-line-strong text-fg',
        variant === 'ghost' && 'text-muted hover:text-fg hover:bg-panel-2',
        variant === 'danger' && 'text-danger hover:bg-danger/10',
        className,
      )}
      {...props}
    />
  )
})

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full min-w-0 rounded-md border border-line bg-panel-2 px-3 text-base placeholder:text-faint md:h-9 md:text-[13px] outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-[var(--ring)]',
        className,
      )}
      {...props}
    />
  )
})

/** Wraps a single input in a <label>; pass `group` for a set of buttons (a label would rename the first one). */
export function Field({ label, children, hint, group }: { label: string; children: ReactNode; hint?: string; group?: boolean }) {
  const content = (
    <>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </>
  )
  return group
    ? <div role="group" aria-label={label} className="grid min-w-0 grid-cols-1 gap-1.5">{content}</div>
    : <label className="grid min-w-0 grid-cols-1 gap-1.5">{content}</label>
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-panel-2 px-1 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  )
}

export function Sheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed z-50 inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-xl border border-line bg-panel p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl
                     sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[12vh] sm:w-[440px] sm:-translate-x-1/2 sm:rounded-xl"
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close"><X size={16} /></Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function Check({ checked, onChange, color, label }: { checked: boolean; onChange: () => void; color?: string; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange() }}
      className={cn(
        'relative grid size-5 shrink-0 place-items-center rounded-full border transition-all cursor-pointer before:absolute before:-inset-2.5 md:size-[18px]',
        checked ? 'border-transparent' : 'border-line-strong hover:border-muted',
      )}
      style={checked ? { background: color ?? 'var(--accent)' } : undefined}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="size-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M2.5 6.2l2.3 2.3 4.7-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
