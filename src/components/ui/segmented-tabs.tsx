import * as React from "react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

function SegmentedTabsList({ className, ...props }: React.ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      className={cn(
        "!h-8 !min-h-8 !max-h-8 items-center gap-1 rounded-xl border border-border bg-muted/40 p-[3px]",
        className,
      )}
      {...props}
    />
  );
}

function SegmentedTabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        "!h-6 !min-h-6 !max-h-6 min-w-0 self-center items-center justify-center rounded-lg border-transparent px-3 !py-0 text-xs font-medium !leading-none after:hidden",
        "data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export { SegmentedTabsList, SegmentedTabsTrigger };
