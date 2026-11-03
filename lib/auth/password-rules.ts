/*
 * Choosing a password (1.31.10): one set of rules for every place someone
 * picks one (setting up an invited account, a reset link, Settings →
 * Password), shown as a checklist while they type and checked again where
 * it's saved. Pure: the browser and the server use the same code.
 *
 * The rules are NIST SP 800-63B's: long enough; not longer than Supabase
 * keeps (72 bytes, the rest would be ignored); not one of the passwords
 * people use most, nor one of them dressed up (Password2026!, p@ssw0rd);
 * not the person's email, name or the app's name; not one character over
 * and over or a run along the keyboard (aaaaaaaa, 12345678, qwertyui).
 * No "a capital, a number and a symbol": those make passwords harder to
 * remember, not harder to guess.
 *
 * Supabase checks its own settings too (minimum length, leaked passwords
 * on Pro): `passwordSaveError()` turns its answers into plain words.
 */

export const PASSWORD_MIN = 8;
/** Supabase (bcrypt) keeps 72 bytes of a password and refuses longer ones. */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordRule = "length" | "max" | "guessable" | "personal";
export type PasswordCheck = { rule: PasswordRule; ok: boolean; text: string };
/** Who's choosing it: their email and names are off limits. */
export type PasswordAbout = { email?: string | null; names?: (string | null | undefined)[] };

/** The passwords people use most that are 8 characters or longer (shorter ones fail on length anyway), lowercase. */
const COMMON = new Set(
  (
    "12345678 123456789 1234567890 12345678910 0123456789 0987654321 987654321 87654321 11111111 00000000 88888888 " +
    "12341234 11223344 12121212 123123123 112233445566 147258369 159753456 789456123 741852963 123654789 963852741 " +
    "123456789a a123456789 123456abc abc123456 abcd1234 1234abcd abc12345 abcd12345 aa123456 a1234567 1a2b3c4d a1b2c3d4 " +
    "1q2w3e4r 1q2w3e4r5t 1q2w3e4r5t6y q1w2e3r4 q1w2e3r4t5 1qaz2wsx 1qazxsw2 zaq12wsx zaq1xsw2 qazwsxedc qwe123qwe " +
    "1234qwer qwer1234 qwertyui qwertyuiop asdfghjk asdfghjkl zxcvbnm1 zxcvbnma asdf1234 asdfasdf qwerqwer " +
    "iloveyou1 iloveyou2 trustno1 letmein1 letmein123 passw0rd p4ssw0rd p@ssw0rd p@ssword password1 password12 " +
    "password123 password1234 mypassword yourpassword newpassword nopassword secret12 secret123 changeme changeme1 " +
    "default1 welcome1 welcome12 welcome123 admin123 admin1234 administrator superman1 batman123 starwars1 " +
    "test1234 test12345 testtest testing1 testing123 hello123 hellohello lovelove babygirl1 princess1 football1 " +
    "baseball1 basketball soccer123 liverpool1 chelsea1 arsenal1 barcelona realmadrid manchester juventus " +
    "pokemon1 pokemon123 minecraft fortnite roblox123 naruto123 spiderman blink182 freedom1 internet computer1 " +
    "samsung1 google123 facebook instagram youtube1 tiktok123 whatever1 anything nothing1 something goodluck " +
    "iloveyou12 iloveyou123 sunshine1 chocolate butterfly1 jennifer1 michelle1 corvette1 mercedes1 ferrari1"
  ).split(" ")
);

/** Words people build passwords from ("sunshine2026!", "Qwerty123"): one of these with only numbers or symbols around it is common too. */
const BASES = new Set(
  (
    "password passwort motdepasse contrasena senha parola haslo wachtwoord qwerty qwertz azerty asdfgh zxcvbn " +
    "iloveyou loveyou letmein welcome admin administrator root login master shadow monkey dragon sunshine princess " +
    "football baseball soccer hockey basketball superman batman spiderman starwars pokemon minecraft summer winter " +
    "spring autumn freedom whatever trustno secret hello charlie michael jordan jennifer michelle daniel thomas " +
    "andrew jessica ashley hunter ranger killer master buster pepper ginger cookie cheese banana orange purple " +
    "flower hannah maggie mustang ferrari mercedes corvette tigger chelsea arsenal liverpool barcelona london " +
    "google facebook instagram youtube tiktok snapchat twitter samsung iphone apple microsoft windows computer " +
    "internet hacker gamer player family friends forever lovely angel baby babygirl sweety honey money dollar " +
    "change default guest test tester testing temp student school teacher office video videos editor creator " +
    "cliptroop vplanner youtuber shorts"
  ).split(" ")
);

/** Rows along the keyboard and the alphabet (and back): 8 of them in a row is a run. */
const RUNS = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm", "abcdefghijklmnopqrstuvwxyz", "qazwsxedcrfvtgbyhnujmikolp"];

/** Mail providers whose name says nothing about the person (their domain is fine to have in a password). */
const MAIL_HOSTS = new Set(["gmail", "googlemail", "yahoo", "outlook", "hotmail", "live", "icloud", "me", "mac", "proton", "protonmail", "aol", "mail", "gmx", "yandex", "zoho", "fastmail", "msn"]);

/** UTF-8 length: what Supabase counts. */
export function passwordBytes(pw: string): number {
  return new TextEncoder().encode(pw).length;
}

/** Characters as people count them (an emoji is one). */
const length = (pw: string) => Array.from(pw).length;

/** Leetspeak undone: p@ssw0rd → password. */
const unleet = (s: string) => s.replace(/[@4]/g, "a").replace(/3/g, "e").replace(/[1!|]/g, "i").replace(/0/g, "o").replace(/[$5]/g, "s").replace(/7/g, "t").replace(/8/g, "b");

/** The letters at its heart: numbers and symbols at either end taken off ("Password2026!" → "password"). */
const heart = (s: string) => s.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");

/** Pieces of the person's email and names worth refusing: 4 letters or more. */
function personalWords(about: PasswordAbout): string[] {
  const out = new Set<string>();
  const add = (s: string | null | undefined) => {
    for (const w of (s ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (Array.from(w).length >= 4 && !/^\d+$/.test(w)) out.add(w);
  };
  const email = (about.email ?? "").trim().toLowerCase();
  if (email) {
    const [local, domain = ""] = email.split("@");
    add(local);
    // The whole name before the @ too (edu.ard → eduard).
    add(local.replace(/[^\p{L}\p{N}]+/gu, ""));
    const org = domain.split(".")[0];
    if (org && !MAIL_HOSTS.has(org)) add(org);
  }
  for (const n of about.names ?? []) {
    add(n);
    add((n ?? "").replace(/[^\p{L}\p{N}]+/gu, ""));
  }
  return [...out];
}

/** One character over and over (or nearly: 3 different at most), or a run along the keyboard or the alphabet. Six or more. */
function isPattern(lower: string): boolean {
  const chars = Array.from(lower);
  if (chars.length < 6) return false;
  if (new Set(chars).size <= 3) return true;
  for (const row of RUNS) {
    const back = Array.from(row).reverse().join("");
    if (row.includes(lower) || back.includes(lower)) return true;
  }
  // Steps of one all the way (13579 is fine; 2345678 isn't).
  const codes = chars.map((c) => c.codePointAt(0) ?? 0);
  return codes.every((c, i) => i === 0 || c - codes[i - 1] === 1) || codes.every((c, i) => i === 0 || codes[i - 1] - c === 1);
}

/** The first half of something said twice (passwordpassword → password). */
const halfOf = (s: string) => (s.length >= 6 && s.length % 2 === 0 && s.slice(0, s.length / 2) === s.slice(s.length / 2) ? s.slice(0, s.length / 2) : null);

/** Common, or a common one dressed up (Password2026!, p@ssw0rd, mypassword, passwordpassword), or a pattern. */
function isGuessable(pw: string): boolean {
  const lower = pw.toLowerCase().normalize("NFKC");
  if (COMMON.has(lower) || isPattern(lower)) return true;
  const core = heart(lower);
  // Nothing but numbers and symbols (12345678!, 2026-2026): a run of its numbers is still a run.
  if (core === "") return isPattern(lower.replace(/[^\p{N}]/gu, ""));
  const cores = new Set([core, unleet(core)]);
  for (const c of [...cores]) {
    const half = halfOf(c);
    if (half) cores.add(half).add(heart(half));
  }
  for (const c of cores) {
    if (!c) continue;
    if (COMMON.has(c) || BASES.has(c) || isPattern(c)) return true;
    // A common word with a letter or three around it (mypassword, passwordx).
    for (const b of BASES) if (b.length >= 5 && c.includes(b) && c.length - b.length <= 3) return true;
  }
  return false;
}

function isPersonal(pw: string, about: PasswordAbout): boolean {
  const lower = pw.toLowerCase().normalize("NFKC");
  const email = (about.email ?? "").trim().toLowerCase();
  if (email && lower.includes(email)) return true;
  const forms = [lower, unleet(lower)];
  // Each word as written and with its leetspeak undone (edu4rd → eduard).
  const words = personalWords(about).flatMap((w) => [w, unleet(w)]);
  return words.some((w) => forms.some((f) => f.includes(w)));
}

const TEXT: Record<PasswordRule, { check: string; error: string }> = {
  length: { check: `At least ${PASSWORD_MIN} characters`, error: `Use at least ${PASSWORD_MIN} characters.` },
  max: { check: `At most ${PASSWORD_MAX_BYTES} characters`, error: `Use at most ${PASSWORD_MAX_BYTES} characters (fewer with emoji or accents): the rest wouldn't be kept.` },
  guessable: { check: "Not a common password or a run like 12345678", error: "That's one people use a lot (or a run like 12345678). Pick something less common: a few unrelated words work well." },
  personal: { check: "Not your email or name", error: "Leave your email and your name out of it: they're the first things someone would try." },
};

/**
 * How a password does on each rule. `checks` is what the page lists (the
 * 72-byte one only when it's broken); `error` is the first problem, in the
 * order people fix them; `ok` when there's none.
 */
export function checkPassword(pw: string, about: PasswordAbout = {}): { ok: boolean; error: string | null; checks: PasswordCheck[] } {
  const rules: { rule: PasswordRule; ok: boolean }[] = [
    { rule: "length", ok: length(pw) >= PASSWORD_MIN },
    { rule: "max", ok: passwordBytes(pw) <= PASSWORD_MAX_BYTES },
    { rule: "guessable", ok: pw.length > 0 && !isGuessable(pw) },
    { rule: "personal", ok: pw.length > 0 && !isPersonal(pw, about) },
  ];
  const first = rules.find((r) => !r.ok);
  return {
    ok: !first,
    error: first ? TEXT[first.rule].error : null,
    checks: rules.filter((r) => r.rule !== "max" || !r.ok).map((r) => ({ rule: r.rule, ok: r.ok, text: TEXT[r.rule].check })),
  };
}

/**
 * What Supabase's answer to saving a password means, in plain words (null: it was saved). `from`: where the
 * sign-in came from, for what an expired one says (an email's link, or Settings).
 */
export function passwordSaveError(
  error: { code?: string; message?: string; status?: number; name?: string; reasons?: string[] } | null | undefined,
  from: "link" | "settings" = "link"
): string | null {
  if (!error) return null;
  const text = `${error.code ?? ""} ${error.name ?? ""} ${error.message ?? ""}`;
  if (/same_password|should be different/i.test(text)) return "That's the password you have now. Choose a new one.";
  if (/weak_password|pwned|leaked|weak and easy/i.test(text)) {
    const reasons = error.reasons ?? [];
    if (reasons.includes("pwned") || /pwned|leaked|known to be weak/i.test(text)) return "That password has turned up in a data leak, so it's on the lists people try first. Choose another one.";
    if (reasons.includes("characters") || /contain at least one character/i.test(text)) return "Your team's sign-in settings ask for more kinds of characters (capitals, numbers or symbols). Add some and try again.";
    const min = /at least (\d+) characters/i.exec(text)?.[1];
    return min ? `Your team's sign-in settings ask for at least ${min} characters.` : "That password is too easy to guess. Choose a longer one.";
  }
  if (/longer than 72/i.test(text)) return TEXT.max.error;
  if (/reauthentication_needed|requires reauthentication/i.test(text)) return "For your safety, sign in again before changing your password.";
  if (/current_password_(required|mismatch)|current password required/i.test(text)) return "Your current password isn't right.";
  if (error.status === 429 || /over_request_rate_limit|rate limit|too many/i.test(text)) return "Too many tries right now. Wait a minute and try again.";
  if (/session_not_found|session_expired|AuthSessionMissing|auth session missing|jwt expired|not authenticated/i.test(text) || error.status === 401 || error.status === 403) {
    return from === "link" ? "Your link has expired. Ask for a new one." : "Your session expired. Sign in again.";
  }
  return "Couldn't save your password. Try again in a minute.";
}

/**
 * Whether this sign-in came from an email link (an invite, a reset, a
 * magic link): Supabase's own record of how the session started (the
 * token's `amr`). Such a session may choose a password without knowing
 * the old one (it proved the email); one that signed in with a password
 * changes it in Settings, with the current one.
 */
export const LINK_METHODS = ["otp", "recovery", "invite", "magiclink", "email/signup"] as const;
export function fromEmailLink(methods: readonly (string | { readonly method?: string; readonly timestamp?: number })[] | null | undefined): boolean {
  return (methods ?? []).some((m) => (LINK_METHODS as readonly string[]).includes(typeof m === "string" ? m : (m?.method ?? "")));
}
