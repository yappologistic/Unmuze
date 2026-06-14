import { Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

function Spinner({ className }: { className?: string }) {
  return <Loader2Icon data-icon="inline-start" className={cn("animate-spin", className)} />
}

export { Spinner }
