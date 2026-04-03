import { useState, useCallback, useMemo } from "react";
import { LocaleContext } from "../hooks/useLocale";
import type { LocaleContextValue } from "../hooks/useLocale";
import { translations } from "../locales";
import type { Locale, TranslationKey } from "../locales";

const STORAGE_KEY = "app-locale";

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    return (localStorage.getItem(STORAGE_KEY) as Locale) || "zh-CN";
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      let text =
        translations[locale]?.[key as string] ??
        translations["zh-CN"]?.[key as string] ??
        (key as string);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return text;
    },
    [locale],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
