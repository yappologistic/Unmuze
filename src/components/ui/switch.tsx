import * as React from "react"
import { cn } from "@/lib/utils"

function Switch({ checked, onCheckedChange, className, ...props }: Omit<React.ComponentProps<"button">, "onChange"> & { checked?: boolean; onCheckedChange?: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border bg-muted p-0.5 transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      data-state={checked ? "checked" : "unchecked"}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    >
      <span className={cn("pointer-events-none block size-5 rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-transform dark:bg-zinc-100", checked ? "translate-x-5" : "translate-x-0")} />
    </button>
  )
}

export { Switch }
