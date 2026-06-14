import * as React from "react"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{ value: string; setValue: (value: string) => void } | null>(null)

function Tabs({ value, onValueChange, children, className }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <TabsContext.Provider value={{ value, setValue: onValueChange }}>
      <div className={cn("flex flex-col gap-4", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className)} {...props} />
}

function TabsTrigger({ value, className, ...props }: React.ComponentProps<"button"> & { value: string }) {
  const context = React.useContext(TabsContext)
  const active = context?.value === value
  return (
    <button
      type="button"
      className={cn("inline-flex items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm", className)}
      data-state={active ? "active" : "inactive"}
      onClick={() => context?.setValue(value)}
      {...props}
    />
  )
}

function TabsContent({ value, className, ...props }: React.ComponentProps<"div"> & { value: string }) {
  const context = React.useContext(TabsContext)
  if (context?.value !== value) return null
  return <div className={cn("outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
