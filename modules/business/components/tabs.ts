/** Business's tabs (1.42.0), in the address as ?tab=… (the server picks the first one shown; the page switches the rest). */
export const BUSINESS_TABS = [
  { id: "overview", label: { en: "Overview", ro: "Pe scurt" } },
  { id: "cashbook", label: { en: "Cash book", ro: "Registrul-jurnal" } },
  { id: "fiscal", label: { en: "Fiscal register", ro: "Evidența fiscală" } },
  { id: "inventory", label: { en: "Inventory", ro: "Inventar" } },
  { id: "assets", label: { en: "Fixed assets", ro: "Mijloace fixe" } },
  { id: "settings", label: { en: "Settings", ro: "Setări" } },
] as const;
export type BusinessTab = (typeof BUSINESS_TABS)[number]["id"];
export const businessTab = (raw: string | null | undefined): BusinessTab => (BUSINESS_TABS.some((t) => t.id === raw) ? (raw as BusinessTab) : "overview");
