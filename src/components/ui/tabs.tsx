import * as React from "react"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{ value: string; setValue: (value: string) => void; baseId: string } | null>(null)

function tabIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_")
}

function Tabs({ value, onValueChange, children, className }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode; className?: string }) {
  const baseId = React.useId()
  return (
    <TabsContext.Provider value={{ value, setValue: onValueChange, baseId }}>
      <div className={cn("flex flex-col gap-4", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="tablist" className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className)} {...props} />
}

function TabsTrigger({ value, className, ...props }: React.ComponentProps<"button"> & { value: string }) {
  const context = React.useContext(TabsContext)
  const active = context?.value === value
  const idPart = tabIdPart(value)
  const moveFocus = (event: React.KeyboardEvent<HTMLButtonElement>, direction: number) => {
    const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
    const currentIndex = tabs.indexOf(event.currentTarget)
    if (currentIndex === -1 || tabs.length === 0) return
    const next = tabs[(currentIndex + direction + tabs.length) % tabs.length]
    next.focus()
    next.click()
  }
  return (
    <button
      type="button"
      id={context ? `${context.baseId}-trigger-${idPart}` : undefined}
      role="tab"
      aria-selected={active}
      aria-controls={context ? `${context.baseId}-content-${idPart}` : undefined}
      tabIndex={active ? 0 : -1}
      className={cn("inline-flex items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm", className)}
      data-state={active ? "active" : "inactive"}
      {...props}
      onClick={(event) => {
        props.onClick?.(event)
        if (!event.defaultPrevented) context?.setValue(value)
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault()
          moveFocus(event, 1)
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault()
          moveFocus(event, -1)
        } else if (event.key === "Home" || event.key === "End") {
          const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
          const next = event.key === "Home" ? tabs[0] : tabs[tabs.length - 1]
          if (next) {
            event.preventDefault()
            next.focus()
            next.click()
          }
        }
        props.onKeyDown?.(event)
      }}
    />
  )
}

function TabsContent({ value, className, ...props }: React.ComponentProps<"div"> & { value: string }) {
  const context = React.useContext(TabsContext)
  if (context?.value !== value) return null
  const idPart = tabIdPart(value)
  return (
    <div
      id={`${context.baseId}-content-${idPart}`}
      role="tabpanel"
      aria-labelledby={`${context.baseId}-trigger-${idPart}`}
      tabIndex={0}
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
