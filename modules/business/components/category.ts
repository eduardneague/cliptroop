import type { SelectOption } from "@/components/ui/select";
import { EXPENSE_NATURES, INCOME_NATURES, IN_KINDS, OUT_KINDS, kindHint, kindLabel, natureLabel, naturePct, type Direction, type Kind, type Lang } from "../lib/kinds";

/*
 * Business (1.42.0): what a line is, as one choice ("kind:nature"): an income or an expense by its nature (what the
 * fiscal register adds up), or money that isn't income or an expense (own money, loans, transfers, taxes…).
 */

export const catKey = (kind: string, nature: string) => `${kind}:${kind === "income" || kind === "expense" ? nature || "other" : ""}`;
export function parseCat(v: string): { kind: Kind; nature: string } {
  const [kind, nature = ""] = v.split(":");
  return { kind: kind as Kind, nature: kind === "income" || kind === "expense" ? nature || "other" : "" };
}

/** The words for a line's category ("Software and subscriptions", "Owner's contribution"). */
export function categoryText(e: { direction: Direction; kind: string; nature: string }, lang: Lang = "en") {
  if (e.kind === "income") return natureLabel("income", e.nature || "other", lang);
  if (e.kind === "expense") return natureLabel("expense", e.nature || "other", lang);
  return kindLabel(e.direction, e.kind, lang);
}

/**
 * The choices for what a line is. In English, each with its Romanian name under it (the register's word); in Romanian,
 * with what it means for the fiscal register.
 */
export function categoryOptions(direction: Direction, lang: Lang = "en"): SelectOption[] {
  const ro = lang === "ro";
  if (direction === "in")
    return [
      ...INCOME_NATURES.map((n) => ({ value: catKey("income", n), label: natureLabel("income", n, lang), hint: ro ? undefined : natureLabel("income", n, "ro"), group: ro ? "Venituri" : "Income" })),
      ...IN_KINDS.filter((k) => k !== "income").map((k) => ({ value: catKey(k, ""), label: kindLabel("in", k, lang), hint: kindHint("in", k, lang), group: ro ? "Nu sunt venituri" : "Not income" })),
    ];
  return [
    ...EXPENSE_NATURES.map((n) => ({
      value: catKey("expense", n),
      label: natureLabel("expense", n, lang),
      hint: ro ? (naturePct(n) < 100 ? `${naturePct(n)}% deductibil` : undefined) : naturePct(n) < 100 ? `${naturePct(n)}% deductible · ${natureLabel("expense", n, "ro")}` : natureLabel("expense", n, "ro"),
      group: ro ? "Cheltuieli deductibile" : "Deductible expenses",
    })),
    ...OUT_KINDS.filter((k) => k !== "expense").map((k) => ({ value: catKey(k, ""), label: kindLabel("out", k, lang), hint: kindHint("out", k, lang), group: ro ? "Nu sunt cheltuieli" : "Not an expense" })),
  ];
}

/** A tint for the category chip: income green, expenses neutral, the rest quiet, the non-deductible red. */
export function categoryTone(kind: string): "green" | "plain" | "red" | "blue" | "violet" | "amber" {
  if (kind === "income") return "green";
  if (kind === "nondeductible") return "red";
  if (kind === "tax") return "violet";
  if (kind === "asset") return "blue";
  if (kind === "expense") return "plain";
  return "amber";
}
