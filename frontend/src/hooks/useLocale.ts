import { createContext, useContext } from "react";
import type { Locale, TranslationKey } from "../locales";

export type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

export const LocaleContext = createContext<LocaleContextValue>(null!);

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
