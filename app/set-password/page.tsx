"use client";

import { compressImage, IMAGE_PRESETS, isPictureType, safeFileName, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import { pictureTooBig } from "@/lib/image/limits";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateProfile, updateAvatar } from "@/app/(dashboard)/settings/actions";
import { initialsFor } from "@/lib/avatar";
import { APP_NAME, MASCOT_NAME } from "@/lib/brand";
import { sounds } from "@/lib/sounds";
import { Brand } from "@/components/ui/clip-logo";
import { Mascot } from "@/components/ui/mascot";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "@/components/ui/icons";
import { InstallApp, PushSettings } from "@/components/pwa";
import { NewPasswordFields, newPasswordState } from "@/components/ui/new-password";
import { fromEmailLink, passwordSaveError } from "@/lib/auth/password-rules";

/*
 * First visit after an invite (or "Confirm signup"): four short steps.
 *   1 Password   2 About you   3 Your phone (optional)   4 All set
 * The password is saved before moving on, so closing the page halfway
 * never locks anyone out (they sign in and fix the rest in Settings).
 *
 * 1.31.10: the password follows the same rules as everywhere else
 * (lib/auth/password-rules.ts, a checklist as you type). Only a sign-in
 * that came from the email's link chooses it here; someone who signed in
 * with a password (and came back to this page) starts at About you, since
 * changing a password takes the current one (Settings → Account).
 */

type Step = "password" | "profile" | "phone" | "done";
const ORDER: Step[] = ["password", "profile", "phone", "done"];
const LABEL: Record<Step, string> = { password: "Password", profile: "About you", phone: "Your phone", done: "All set" };

const input =
  "w-full rounded-xl border border-line/15 bg-transparent px-3.5 h-11 text-[15px] outline-none focus:ring-2 focus:ring-amber focus:border-transparent";
const label = "block text-[12.5px] font-semibold text-ink-soft mb-1.5";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-semibold text-[15px] h-12 px-6 hover:brightness-110 disabled:opacity-60";
const quiet = "inline-flex items-center gap-1.5 rounded-xl px-3 h-12 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2";

function Spinner() {
  return <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />;
}

export default function SetUpAccountPage() {
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const [step, setStep] = useState<Step>("password");
  const [me, setMe] = useState<{ id: string; email: string; link: boolean } | null | undefined>(undefined);
  const [invites, setInvites] = useState(0);

  // Password
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Profile
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      const user = data.user;
      if (!user) return setMe(null);
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!alive) return;
      const link = fromEmailLink(aal?.currentAuthenticationMethods);
      setMe({ id: user.id, email: user.email ?? "", link });
      // Signed in with a password already: it's chosen (a new one is Settings' job).
      if (!link) setStep((s) => (s === "password" ? "profile" : s));
      const [{ data: p }, { count }, { data: page }] = await Promise.all([
        supabase.from("profiles").select("username, full_name, bio, avatar_url").eq("id", user.id).maybeSingle(),
        supabase.from("team_invites").select("id", { count: "exact", head: true }).eq("invited_user_id", user.id).eq("status", "pending"),
        // The bio lives on the profile page since 1.28.0 (0093).
        supabase.from("profile_pages").select("bio").eq("user_id", user.id).maybeSingle(),
      ]);
      if (!alive) return;
      if (p) {
        setUsername((p.username as string | null) ?? "");
        setFullName((p.full_name as string | null) ?? "");
        setBio(((page?.bio as string | null | undefined) ?? (p.bio as string | null)) ?? "");
        setAvatarUrl((p.avatar_url as string | null) ?? null);
      }
      setInvites(count ?? 0);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const goTo = (s: Step) => {
    setError(null);
    setStep(s);
    window.scrollTo({ top: 0 });
  };

  // Their email and names are off limits in a password.
  const about = { email: me?.email ?? null, names: [fullName, username] };

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const state = newPasswordState(password, confirm, about);
    if (!state.ready) return setError(state.error);
    setPending(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setPending(false);
    // Same as before (came back to this page): that's fine, carry on.
    if (err && !/same_password|should be different/i.test(`${err.code ?? ""} ${err.message}`)) {
      sounds.error();
      return setError(passwordSaveError(err));
    }
    sounds.advance();
    goTo("profile");
  }

  function pickAvatar(file: File | undefined) {
    if (!file) return;
    const tooBig = pictureTooBig(file);
    if (tooBig) return setError(tooBig);
    setError(null);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) return setError("Usernames are 3 to 20 letters, numbers or underscores.");
    if (!me) return;
    setPending(true);
    if (avatarFile) {
      try {
        const file = await compressImage(avatarFile, IMAGE_PRESETS.avatar);
        const path = `${me.id}/avatar-${Date.now()}-${safeFileName(file.name)}`;
        // Only a picture the avatars take (1.31.1); anything else is skipped, the rest still saves.
        const { error: upErr } = isPictureType(file.type) ? await supabase.storage.from("avatars").upload(path, file, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: file.type }) : { error: new Error("not a picture") };
        if (!upErr) {
          const { data } = supabase.storage.from("avatars").getPublicUrl(path);
          await updateAvatar(data.publicUrl);
          setAvatarUrl(data.publicUrl);
          setAvatarFile(null);
        }
      } catch {}
    }
    const fd = new FormData();
    fd.set("username", username.trim());
    fd.set("full_name", fullName.trim());
    fd.set("bio", bio.trim());
    const r = await updateProfile(undefined, fd);
    setPending(false);
    if (r?.error) {
      sounds.error();
      return setError(r.error);
    }
    sounds.advance();
    goTo("phone");
  }

  function finish() {
    sounds.celebrate();
    goTo("done");
  }

  if (me === null) {
    return (
      <Shell>
        <h1 className="font-display text-[26px] font-semibold mb-2">Your link has expired</h1>
        <p className="text-[14.5px] text-ink-soft mb-6">Open the newest email again, or sign in if you already have a password.</p>
        <Link href="/login" className={primary}>
          Go to sign in
        </Link>
      </Shell>
    );
  }

  const idx = ORDER.indexOf(step);
  const firstName = (fullName.trim().split(/\s+/)[0] || username || "").trim();
  const photo = avatarPreview ?? avatarUrl;

  return (
    <Shell>
      {/* Progress */}
      <ol className="flex items-center gap-1.5 mb-7" aria-label="Setup steps">
        {ORDER.map((s, i) => (
          <li key={s} className="flex-1 min-w-0">
            <span className={`block h-1.5 rounded-[3px] transition-colors duration-500 ${i <= idx ? "bg-amber" : "bg-line/15"}`} />
            <span className={`mt-1.5 block truncate text-[11px] font-semibold ${i === idx ? "text-ink" : "text-ink-faint"}`} aria-current={i === idx ? "step" : undefined}>
              {LABEL[s]}
            </span>
          </li>
        ))}
      </ol>

      {step === "password" && (
        <form onSubmit={savePassword} className="motion-step">
          <div className="flex items-end gap-3 mb-4">
            <Mascot size={76} className="-ml-1.5 -mb-1 flex-shrink-0" />
            <p className="mb-2 rounded-2xl rounded-bl-md bg-amber/12 px-3.5 py-2 text-[13px] font-medium">
              Hi! I&rsquo;m {MASCOT_NAME}. Let&rsquo;s get you set up.
            </p>
          </div>
          <h1 className="font-display text-[26px] leading-tight font-semibold mb-1.5">Choose a password</h1>
          <p className="text-[14px] text-ink-soft mb-6">
            You&rsquo;ll sign in with {me?.email ? <b className="text-ink font-semibold break-all">{me.email}</b> : "your email"} and this password.
          </p>
          <NewPasswordFields
            value={password}
            confirm={confirm}
            onValue={(v) => {
            setPassword(v);
            setError(null);
          }}
            onConfirm={(v) => {
            setConfirm(v);
            setError(null);
          }}
            about={about}
            inputClass={input}
            labelClass={label}
            label="Password"
            id="pw"
            autoFocus
          />
          {error && <p className="mt-4 text-[13.5px] text-red font-medium">{error}</p>}
          <div className="mt-7 flex justify-end">
            <button type="submit" disabled={pending || !me} className={`${primary} w-full sm:w-auto`}>
              {pending ? <Spinner /> : null}
              Continue
              {!pending && <ArrowRightIcon className="w-4 h-4" />}
            </button>
          </div>
        </form>
      )}

      {step === "profile" && (
        <form onSubmit={saveProfile} className="motion-step">
          <h1 className="font-display text-[26px] leading-tight font-semibold mb-1.5">Tell your team who you are</h1>
          <p className="text-[14px] text-ink-soft mb-6">This is what they see next to your name, comments and tasks. You can change it any time in Settings.</p>
          <div className="flex items-center gap-4 mb-5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-20 h-20 rounded-full bg-amber flex items-center justify-center text-white font-bold text-2xl overflow-visible flex-shrink-0"
              aria-label="Choose a profile photo"
            >
              <span className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                ) : (
                  initialsFor(fullName || username || me?.email || "?")
                )}
              </span>
              <span className="absolute -right-0.5 -bottom-0.5 w-7 h-7 rounded-full bg-surface ring-2 ring-surface text-ink flex items-center justify-center shadow">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </span>
            </button>
            <div>
              <button type="button" onClick={() => fileRef.current?.click()} className="text-[14px] font-semibold text-amber hover:underline">
                {photo ? "Change photo" : "Add a photo"}
              </button>
              <p className="text-[12.5px] text-ink-faint">Optional. A face helps people know who&rsquo;s who.</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0])} />
          </div>
          <div className="space-y-4">
            <div>
              <label className={label} htmlFor="fn">
                Your name
              </label>
              <input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="First and last name" autoComplete="name" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="un">
                Username
              </label>
              <div className="flex items-center rounded-xl border border-line/15 overflow-hidden focus-within:ring-2 focus-within:ring-amber focus-within:border-transparent">
                <span className="pl-3.5 text-ink-faint text-[15px]">@</span>
                <input
                  id="un"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ""))}
                  placeholder="yourname"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="flex-1 min-w-0 bg-transparent px-1.5 h-11 text-[15px] outline-none"
                />
              </div>
              <p className="mt-1 text-[12px] text-ink-faint">For @mentions. 3 to 20 letters, numbers or underscores.</p>
            </div>
            <div>
              <label className={label} htmlFor="bio">
                A line about you <span className="font-normal text-ink-faint">(optional)</span>
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={2}
                placeholder="Editor, coffee first"
                className="w-full rounded-xl border border-line/15 bg-transparent px-3.5 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-amber focus:border-transparent resize-none"
              />
            </div>
          </div>
          {error && <p className="mt-4 text-[13.5px] text-red font-medium">{error}</p>}
          <div className="mt-7 flex items-center justify-between gap-2">
            <button type="button" onClick={() => goTo("phone")} className={quiet}>
              Skip
            </button>
            <button type="submit" disabled={pending} className={primary}>
              {pending ? <Spinner /> : null}
              Continue
              {!pending && <ArrowRightIcon className="w-4 h-4" />}
            </button>
          </div>
        </form>
      )}

      {step === "phone" && me && (
        <div className="motion-step">
          <h1 className="font-display text-[26px] leading-tight font-semibold mb-1.5">Get {APP_NAME} on your phone</h1>
          <p className="text-[14px] text-ink-soft mb-6">
            It works like an app, without the App Store. Turn notifications on and you&rsquo;ll know the moment it&rsquo;s your turn. Optional: you can do it later in Settings → Notifications &amp; app.
          </p>
          <section className="rounded-2xl border border-line/10 bg-paper/60 p-4 mb-3">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-faint mb-3">1 · Install it</h2>
            <InstallApp />
          </section>
          <section className="rounded-2xl border border-line/10 bg-paper/60 p-4">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-faint mb-3">2 · Notifications</h2>
            <PushSettings userId={me.id} />
          </section>
          <div className="mt-7 flex items-center justify-between gap-2">
            <button type="button" onClick={() => goTo("profile")} className={quiet}>
              <ArrowLeftIcon className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-1">
              <button type="button" onClick={finish} className={quiet}>
                Later
              </button>
              <button type="button" onClick={finish} className={primary}>
                Done
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="motion-step text-center">
          <Mascot mood="celebrate" size={128} className="mx-auto mb-2" />
          <h1 className="font-display text-[28px] leading-tight font-semibold mb-2">You&rsquo;re all set{firstName ? `, ${firstName}` : ""}!</h1>
          <p className="text-[14.5px] text-ink-soft mb-5 max-w-sm mx-auto">
            {invites > 0
              ? `You have ${invites === 1 ? "a team invite" : `${invites} team invites`} waiting. Open the bell at the top of your dashboard to say yes.`
              : "Your team will add you to their space. You'll get a notification when they do."}
          </p>
          <ul className="text-left max-w-sm mx-auto space-y-2.5 mb-7 text-[13.5px]">
            {[
              ["Your dashboard", "everything on your plate, in one place."],
              ["Tasks", "what you're asked to do shows up there, with dates."],
              ["The bell", "news from your team (and on your phone, if you turned it on)."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-2.5">
                <span className="mt-0.5 w-5 h-5 rounded-md bg-green/15 text-green flex items-center justify-center flex-shrink-0">
                  <CheckIcon className="w-3 h-3" />
                </span>
                <span>
                  <b>{t}</b>: {d}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              router.push("/dashboard");
              router.refresh();
            }}
            className={`${primary} w-full sm:w-auto`}
          >
            Go to my dashboard
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-start sm:items-center justify-center p-4 sm:p-6 bg-paper">
      <div className="w-full max-w-md rounded-3xl border border-line/10 bg-surface p-6 sm:p-9 shadow-sm my-4">
        <Brand className="mb-6" />
        {children}
      </div>
    </main>
  );
}
