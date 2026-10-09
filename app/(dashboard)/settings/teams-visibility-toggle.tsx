"use client";

import { useState, useTransition } from "react";
import { updateTeamsVisibility } from "./actions";
import { useToast } from "@/components/ui/toast-provider";

export function TeamsVisibilityToggle({ initialValue }: { initialValue: boolean }) {
  const [visible, setVisible] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggle() {
    const next = !visible;
    setVisible(next);
    startTransition(async () => {
      const result = await updateTeamsVisibility(next);
      if (result?.error) {
        setVisible(!next);
        toast.error(result.error);
      } else toast.success(next ? "Your teams show on your public profile" : "Your teams are hidden from people outside them");
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      role="switch"
      aria-checked={visible}
      aria-label="Show my teams publicly"
      className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 disabled:opacity-50 ${
        visible ? "bg-amber" : "bg-line/20"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
          visible ? "translate-x-[18px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
