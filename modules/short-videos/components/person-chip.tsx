import { initialsFor } from "@/lib/avatar";
import { AvatarImg } from "@/components/ui/avatar-img";

export function PersonAvatar({
  name,
  avatarUrl,
  color,
  className = "w-6 h-6 text-[9.5px]",
}: {
  name: string;
  avatarUrl: string | null;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={`${className} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`}
      style={{ background: color }}
    >
      <AvatarImg src={avatarUrl} fallback={initialsFor(name)} />
    </span>
  );
}
