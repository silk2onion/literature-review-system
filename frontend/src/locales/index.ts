import zhCN from "./zh-CN.json";
import en from "./en.json";

export type TranslationKey = keyof typeof zhCN;
export type Locale = "zh-CN" | "en";

export const translations: Record<Locale, Record<string, string>> = {
  "zh-CN": zhCN,
  en: en,
};
