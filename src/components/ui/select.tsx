import * as React from "react"
import { cn } from "@/lib/utils"

type SelectProps = Omit<React.ComponentProps<"select">, "onChange" | "value"> & {
  value: string
  onValueChange: (value: string) => void
}

function Select({ value, onValueChange, children, className, ...props }: SelectProps) {
  return (
    <select
      className={cn("unmuze-select h-11 w-full rounded-xl border border-input bg-card/70 px-3.5 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-card focus-visible:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", className)}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      {...props}
    >
      {children}
    </select>
  )
}

function SelectGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return <option className="bg-popover text-popover-foreground" value={value}>{children}</option>
}

function SelectTrigger({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(className)} {...props} />
}

function SelectValue({ placeholder }: { placeholder?: string }) {
  return <>{placeholder}</>
}

function SelectContent({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue }
