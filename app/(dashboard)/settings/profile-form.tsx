"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { updateProfile } from "./actions";

const USERNAME = /^[a-zA-Z0-9_]{3,20}$/;
const USERNAME_RULE = "Usernames are 3–20 characters: letters, numbers, underscores only.";

/**
 * Settings → Profile. What you typed always stays in the boxes (a failed
 * save never empties them), the username is checked as you type, and
 * every save answers with a toast (and its sound).
 */
export function ProfileForm({ username, fullName, bio }: { username: string | null; fullName: string | null; bio: string | null }) {
  const toast = useToast();
  const router = useRouter();
  const start0 = { username: username ?? "", fullName: fullName ?? "", bio: bio ?? "" };
  const [values, setValues] = useState(start0);
  const [saved, setSaved] = useState(start0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const name = values.username.trim();
  const badName = name !== "" && !USERNAME.test(name);
  const dirty = values.username !== saved.username || values.fullName !== saved.fullName || values.bio !== saved.bio;
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setError(null);
  };

  function submit(e: React.FormEvent) {
    // Not a form action: React would reset every box after it, even on an error.
    e.preventDefault();
    if (pending || !dirty) return;
    if (badName) {
      setError(USERNAME_RULE);
      toast.error(USERNAME_RULE);
      return;
    }
    const fd = new FormData();
    fd.set("username", values.username);
    fd.set("full_name", values.fullName);
    fd.set("bio", values.bio);
    start(async () => {
      const r = await updateProfile(undefined, fd);
      if (r?.error) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      const clean = { username: name, fullName: values.fullName.trim(), bio: values.bio.trim() };
      setValues(clean);
      setSaved(clean);
      setError(null);
      toast.success("Profile saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="profile-username" className="block text-xs font-semibold text-ink-soft mb-1.5">
          Username
        </label>
        <div
          className={`flex items-center rounded-lg border bg-surface overflow-hidden focus-within:ring-2 ${
            badName ? "border-red/50 focus-within:ring-red/40" : "border-line/15 focus-within:ring-amber"
          }`}
        >
          <span className="pl-3 text-ink-faint text-sm">@</span>
          <input
            id="profile-username"
            name="username"
            value={values.username}
            onChange={set("username")}
            placeholder="yourname"
            autoComplete="username"
            aria-invalid={badName}
            aria-describedby="profile-username-hint"
            className="flex-1 bg-transparent px-1.5 py-2 text-sm outline-none"
          />
        </div>
        <p id="profile-username-hint" className={`text-[11px] mt-1 ${badName ? "text-red font-medium" : "text-ink-faint"}`}>
          {badName ? `${USERNAME_RULE}${/\s/.test(name) ? " No spaces." : ""}` : "3 to 20 letters, numbers or underscores. Shown instead of your email."}
        </p>
      </div>

      <div>
        <label htmlFor="profile-name" className="block text-xs font-semibold text-ink-soft mb-1.5">
          Full name
        </label>
        <input
          id="profile-name"
          name="full_name"
          value={values.fullName}
          onChange={set("fullName")}
          placeholder="Your real name (optional)"
          autoComplete="name"
          className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber"
        />
      </div>

      <div>
        <label htmlFor="profile-bio" className="block text-xs font-semibold text-ink-soft mb-1.5">
          Bio
        </label>
        <textarea
          id="profile-bio"
          name="bio"
          value={values.bio}
          onChange={set("bio")}
          rows={3}
          placeholder="A short line about you (optional)"
          className="w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber resize-none"
        />
      </div>

      {error && !badName && (
        <p role="alert" className="text-sm text-red font-medium">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-semibold px-4 py-2 text-sm disabled:opacity-50 hover:brightness-110 transition-[filter]"
        >
          {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
          {pending ? "Saving…" : "Save changes"}
        </button>
        {dirty && !pending && (
          <button type="button" onClick={() => { setValues(saved); setError(null); }} className="text-[12.5px] font-semibold text-ink-soft hover:text-ink">
            Undo changes
          </button>
        )}
      </div>
    </form>
  );
}
