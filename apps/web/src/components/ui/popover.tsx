'use client'

import { fitHeight } from '@/lib/fit'
import { cn } from '@/lib/utils'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import type * as React from 'react'

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor

function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  collisionPadding = 8,
  style,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        // Never taller than the room left on screen: what does not fit scrolls.
        style={{ maxHeight: fitHeight('--radix-popover-content-available-height', className), ...style }}
        className={cn(
          'z-50 w-72 overflow-y-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
