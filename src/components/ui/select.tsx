import * as React from "react"
import { cn } from "@/lib/utils"

function Select({ value, onValueChange, children, disabled }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      disabled={disabled}
    >
      {children}
    </select>
  )
}

function SelectGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return <option value={value}>{children}</option>
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
