import {
  AlertIcon,
  AnalyticsIcon,
  BellIcon,
  BugIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  CodeIcon,
  CompassIcon,
  DocumentIcon,
  DownloadIcon,
  EyeIcon,
  FillIcon,
  FlagIcon,
  FlameIcon,
  GridIcon,
  HistoryIcon,
  HomeIcon,
  ImageIcon,
  LightbulbIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  LogoutIcon,
  MeetingIcon,
  MoneyIcon,
  MoonIcon,
  OutliersIcon,
  PlusIcon,
  PostingIcon,
  RetryIcon,
  SettingsIcon,
  ShortsIcon,
  SoundIcon,
  StarIcon,
  SunIcon,
  TargetIcon,
  TrashIcon,
  TrendIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
  WordIcon,
} from "@/components/ui/icons";
import type { IconKey } from "@/lib/search/catalog";

type IconComponent = (p: { className?: string }) => React.ReactNode;

const ICONS: Record<IconKey, IconComponent> = {
  home: HomeIcon,
  shorts: ShortsIcon,
  video: VideoIcon,
  calendar: CalendarIcon,
  meeting: MeetingIcon,
  posting: PostingIcon,
  analytics: AnalyticsIcon,
  outliers: OutliersIcon,
  target: TargetIcon,
  trend: TrendIcon,
  users: UsersIcon,
  settings: SettingsIcon,
  word: WordIcon,
  user: UserIcon,
  code: CodeIcon,
  flag: FlagIcon,
  lock: LockIcon,
  document: DocumentIcon,
  trash: TrashIcon,
  plus: PlusIcon,
  moon: MoonIcon,
  sun: SunIcon,
  sound: SoundIcon,
  bell: BellIcon,
  star: StarIcon,
  bug: BugIcon,
  lightbulb: LightbulbIcon,
  logout: LogoutIcon,
  link: LinkIcon,
  download: DownloadIcon,
  grid: GridIcon,
  list: ListIcon,
  clock: ClockIcon,
  money: MoneyIcon,
  compass: CompassIcon,
  alert: AlertIcon,
  check: CheckIcon,
  fill: FillIcon,
  retry: RetryIcon,
  history: HistoryIcon,
  eye: EyeIcon,
  trophy: TrophyIcon,
  image: ImageIcon,
  flame: FlameIcon,
};

/** The icon for a page, setting or action of the search catalog. */
export function EntryIcon({ icon, className = "w-4 h-4" }: { icon: IconKey | undefined; className?: string }) {
  const Icon = (icon && ICONS[icon]) || SettingsIcon;
  return <Icon className={className} />;
}

/** The same icon on a rounded square, like a row's picture. */
export function EntryTile({ icon, tone = "plain" }: { icon: IconKey | undefined; tone?: "plain" | "short" | "long" | "action" }) {
  const look =
    tone === "short"
      ? "bg-short/12 text-short"
      : tone === "long"
        ? "bg-long/12 text-long"
        : tone === "action"
          ? "bg-amber/12 text-amber"
          : "bg-surface-2 text-ink-soft";
  return (
    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${look}`} aria-hidden>
      <EntryIcon icon={icon} />
    </span>
  );
}
