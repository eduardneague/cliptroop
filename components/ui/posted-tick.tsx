import { CheckIcon } from "./icons";

/**
 * Posted: the filled teal tick (the colour of a finished step), the same in
 * every calendar (the Calendar page, the dashboard's Calendar widget, date
 * pickers), so a posted video reads the same everywhere (1.18.1).
 */
export function PostedTick({ size = "sm", className = "" }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={`${size === "md" ? "w-5 h-5" : "w-4 h-4"} rounded-md flex items-center justify-center text-white flex-shrink-0 ${className}`}
      style={{ background: "rgb(var(--teal))" }}
      role="img"
      aria-label="Posted"
      title="Posted"
    >
      <CheckIcon className={size === "md" ? "w-3 h-3" : "w-2.5 h-2.5"} />
    </span>
  );
}
