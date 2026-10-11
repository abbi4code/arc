import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './primitives'

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
