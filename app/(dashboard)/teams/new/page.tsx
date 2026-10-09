"use client";

import { startTransition, useActionState } from "react";
import Link from "next/link";
import { createTeam } from "./actions";
import { ArrowLeftIcon } from "@/components/ui/icons";

export default function NewTeamPage() {
  const [state, formAction, pending] = useActionState(createTeam, undefined);

  return (
    <div className="min-h-[calc(100vh-57px)] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink mb-6"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back
        </Link>

        <h1 className="font-display text-3xl font-semibold mb-2">
          Name your team
        </h1>
        <p className="text-sm text-ink-soft mb-8 leading-relaxed">
          A team is a channel or workspace. Your first one might be your
          main channel. You&rsquo;ll be its owner, and you can invite
          teammates and create more teams later.
        </p>

        <form
          // Not a form action: React would empty the name after an error.
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => formAction(fd));
          }}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="name"
              className="block text-xs font-semibold text-ink-soft mb-1.5"
            >
              Team name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoFocus
              placeholder="e.g. Viverro"
              className="w-full rounded-lg border border-line/15 bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red font-medium">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-amber text-white font-semibold py-2.5 text-sm disabled:opacity-50 transition-opacity"
          >
            {pending ? "Creating…" : "Create team"}
          </button>
        </form>
      </div>
    </div>
  );
}
