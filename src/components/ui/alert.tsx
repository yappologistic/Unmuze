import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const alertVariants = cva("relative w-full rounded-2xl border p-4 text-sm shadow-sm", {
  variants: {
    variant: {
      default: "bg-card/70 text-foreground",
      destructive: "border-destructive/40 bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
})

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return <h5 className={cn("mb-1 font-semibold leading-none tracking-normal", className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-sm font-medium leading-5 text-muted-foreground [&_p]:leading-relaxed", className)} {...props} />
}

export { Alert, AlertTitle, AlertDescription }
