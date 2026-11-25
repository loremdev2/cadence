import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
  {
    variants: {
      variant: {
        neutral: "border-line bg-[#F4F1E9] text-ink-soft",
        outline: "border-line bg-transparent text-muted",
        spruce: "border-transparent bg-[#E9F0EB] text-spruce",
        success: "border-transparent bg-[#E7F1EA] text-[#2A6B4F]",
        warning: "border-transparent bg-[#FAF0DA] text-[#8A6413]",
        danger: "border-transparent bg-[#F8E7E0] text-[#93401F]",
        clay: "border-transparent bg-[#F8E9E1] text-clay",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
