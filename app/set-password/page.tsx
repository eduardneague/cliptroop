"use client";

import { compressImage, IMAGE_PRESETS, safeFileName, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateProfile, updateAvatar } from "@/app/(dashboard)/settings/actions";
import { initialsFor } from "@/lib/avatar";
import { Brand } from "@/components/ui/clip-logo";

export default function SetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  function handleAvatarPick(file: File | undefined) {
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password needs at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError("Username: 3–20 characters, letters/numbers/underscores only.");
      return;
    }

    setPending(true);

    const { data: userData, error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError || !userData.user) {
      setPending(false);
      setError("Couldn't set your password. Try again, or ask for a fresh invite.");
      return;
    }

    if (avatarFile) {
      const file = await compressImage(avatarFile, IMAGE_PRESETS.avatar);
      const path = `${userData.user.id}/avatar-${Date.now()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: file.type });
      if (!uploadError) {
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        await updateAvatar(data.publicUrl);
      }
    }

    const fd = new FormData();
    fd.set("username", username);
    fd.set("full_name", fullName);
    fd.set("bio", bio);
    const profileResult = await updateProfile(undefined, fd);

    setPending(false);

    if (profileResult?.error) {
      // Password is already set at this point — don't strand them, just
      // surface the profile issue and let them fix it from Settings.
      setError(`${profileResult.error} You can fix this from Settings after continuing.`);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-line/10 bg-surface p-8 shadow-sm">
        <Brand className="mb-6" />
        <h1 className="font-display text-2xl font-semibold mb-2">
          Set up your account
        </h1>
        <p className="text-sm text-ink-soft mb-7">
          A password and a few profile details, then you&rsquo;re in.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-full bg-amber flex items-center justify-center text-white font-bold text-xl overflow-hidden flex-shrink-0"
            >
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={avatarPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                initialsFor(fullName || username || "?")
              )}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-semibold text-amber"
            >
              Add a profile picture
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleAvatarPick(e.target.files?.[0])}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">Username</label>
            <div className="flex items-center rounded-lg border border-line/15 bg-transparent overflow-hidden focus-within:ring-2 focus-within:ring-amber">
              <span className="pl-3 text-ink-faint text-sm">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="yourname"
                className="flex-1 bg-transparent px-1.5 py-2.5 text-sm outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">Full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your real name (optional)"
              className="w-full rounded-lg border border-line/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              placeholder="A short line about you (optional)"
              className="w-full rounded-lg border border-line/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber resize-none"
            />
          </div>

          <div className="pt-1 border-t border-line/10" />

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-line/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">Confirm password</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-line/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber"
            />
          </div>

          {error && <p className="text-sm text-red font-medium">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-amber text-white font-semibold py-2.5 text-sm disabled:opacity-50 hover:brightness-110 transition-[filter]"
          >
            {pending ? "Setting up…" : "Finish"}
          </button>
        </form>
      </div>
    </main>
  );
}
