import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spruce/25 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-spruce text-[#F7F5EF] shadow-sm hover:bg-[#162e27] active:translate-y-px",
        secondary:
          "border border-line bg-white text-ink shadow-sm hover:border-line-strong hover:bg-[#FCFBF7]",
        outline:
          "border border-line bg-transparent text-ink-soft hover:border-line-strong hover:bg-white",
        ghost: "text-ink-soft hover:bg-black/[0.045]",
        subtle: "bg-[#EDF1EE] text-spruce hover:bg-[#E2EAE5]",
        danger: "bg-[#F7E8E2] text-[#8A3E23] hover:bg-[#F1D8CF]",
        link: "text-spruce underline underline-offset-2 hover:text-[#162e27]",
      },
      size: {
        default: "h-9 px-3.5 text-[12.5px]",
        sm: "h-8 px-3 text-[12px]",
        xs: "h-7 px-2.5 text-[11px]",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7",
        lg: "h-10 px-5 text-[13px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
