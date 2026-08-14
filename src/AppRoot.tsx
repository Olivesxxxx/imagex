import { Toaster } from "sonner";
import { useEffect } from "react";

import App from "@/App";
import { SeoContent } from "@/components/seo-content";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useI18n, LanguageProvider, type Language } from "@/lib/i18n";

function SkipToContent() {
  const { copy } = useI18n();
  return (
    <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-background focus:px-3 focus:py-1 focus:shadow">
      {copy.skipToContent}
    </a>
  );
}

function AutoHideScrollbars() {
  useEffect(() => {
    const timers = new WeakMap<HTMLElement, number>();

    function handleScroll(event: Event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const container = target.closest<HTMLElement>(".standard-scrollbar");
      if (!container) return;

      container.classList.add("is-scrolling");
      const previousTimer = timers.get(container);
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);
      timers.set(container, window.setTimeout(() => {
        container.classList.remove("is-scrolling");
        timers.delete(container);
      }, 700));
    }

    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, []);

  return null;
}

export function AppRoot({ initialLanguage }: { initialLanguage?: Language } = {}) {
  return (
    <TooltipProvider>
      <LanguageProvider initialLanguage={initialLanguage}>
        <AutoHideScrollbars />
        <SkipToContent />
        <SeoContent />
        <App />
      </LanguageProvider>
      <Toaster richColors position="top-right" theme="light" />
    </TooltipProvider>
  );
}
