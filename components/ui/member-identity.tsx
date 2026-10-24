import Link from "next/link";
import { initialsFor } from "@/lib/avatar";
import { profileHref } from "@/lib/profile-link";
import { AvatarImg } from "@/components/ui/avatar-img";

/**
 * Avatar + name, both linking to the person's profile. Used for every
 * member row so profiles are reachable for everyone — masters and
 * regular members alike.
 */
export function MemberAvatarLink({
  userId,
  username,
  name,
  avatarUrl,
  color,
  size = "w-8 h-8 text-[11px]",
}: {
  userId: string | null;
  username: string | null;
  name: string;
  avatarUrl: string | null;
  color: string;
  size?: string;
}) {
  const href = profileHref({ username, userId });
  const avatar = (
    <span
      className={`${size} rounded-full flex items-center justify-center font-bold text-white overflow-hidden flex-shrink-0 ${
        href ? "hover:opacity-85 transition-opacity" : ""
      }`}
      style={{ background: color }}
    >
      <AvatarImg src={avatarUrl} fallback={initialsFor(name)} />
    </span>
  );
  return href ? (
    <Link href={href} className="flex-shrink-0 rounded-full" aria-label={`${name}'s profile`}>
      {avatar}
    </Link>
  ) : (
    avatar
  );
}

export function MemberNameLink({
  userId,
  username,
  name,
}: {
  userId: string | null;
  username: string | null;
  name: string;
}) {
  const href = profileHref({ username, userId });
  return href ? (
    <Link href={href} className="hover:text-amber transition-colors truncate">
      {name}
    </Link>
  ) : (
    <span className="truncate">{name}</span>
  );
}
