import * as React from "react"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{
  value: string
  setValue: (value: string) => void
  baseId: string
  triggerIdPrefix: string
  labelledByPrefixes: string[]
} | null>(null)

function tabIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_")
}

function Tabs({
  value,
  onValueChange,
  children,
  className,
  baseId,
  triggerIdPrefix = "default",
  labelledByPrefixes,
}: {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  className?: string
  baseId?: string
  triggerIdPrefix?: string
  labelledByPrefixes?: string[]
}) {
  const generatedBaseId = React.useId()
  const resolvedBaseId = baseId || generatedBaseId
  const resolvedLabelledByPrefixes = labelledByPrefixes || [triggerIdPrefix]
  return (
    <TabsContext.Provider value={{ value, setValue: onValueChange, baseId: resolvedBaseId, triggerIdPrefix, labelledByPrefixes: resolvedLabelledByPrefixes }}>
      <div className={cn("flex flex-col gap-4", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function triggerId(baseId: string, triggerIdPrefix: string, idPart: string) {
  return `${baseId}-trigger-${triggerIdPrefix}-${idPart}`
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="tablist" className={cn("inline-flex h-11 items-center justify-center rounded-2xl bg-muted p-1 text-muted-foreground", className)} {...props} />
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
      id={context ? triggerId(context.baseId, context.triggerIdPrefix, idPart) : undefined}
      role="tab"
      aria-selected={active}
      aria-controls={context ? `${context.baseId}-content-${idPart}` : undefined}
      tabIndex={active ? 0 : -1}
      className={cn("inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:selected-pill data-[state=active]:text-foreground", className)}
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
  const labelledBy = context.labelledByPrefixes.map((prefix) => triggerId(context.baseId, prefix, idPart)).join(" ")
  return (
    <div
      id={`${context.baseId}-content-${idPart}`}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className={cn("screen-enter", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
