import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex w-full resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted/80 focus:border-spruce/40 focus:ring-2 focus:ring-spruce/10 disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
