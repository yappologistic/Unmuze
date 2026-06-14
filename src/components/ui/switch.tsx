import * as React from "react"
import { cn } from "@/lib/utils"

function Switch({ checked, onCheckedChange, className, ...props }: Omit<React.ComponentProps<"button">, "onChange"> & { checked?: boolean; onCheckedChange?: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn("inline-flex h-6 w-11 items-center rounded-full border bg-input transition-colors data-[state=checked]:bg-primary", className)}
      data-state={checked ? "checked" : "unchecked"}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    >
      <span className={cn("pointer-events-none block size-5 rounded-full bg-background shadow-lg transition-transform", checked ? "translate-x-5" : "translate-x-0")} />
    </button>
  )
}

export { Switch }
