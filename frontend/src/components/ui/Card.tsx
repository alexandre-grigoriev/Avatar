import React from "react";
import { cn } from "../../utils";

export const Card = React.forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string }>(
  function Card({ children, className }, ref) {
    return <div ref={ref} className={cn("cardLite", className)}>{children}</div>;
  }
);
