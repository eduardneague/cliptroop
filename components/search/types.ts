import type { PipelineStage } from "@/lib/permissions/roles";
import type { IconKey } from "@/lib/search/catalog";

export type SearchTeamRef = { id: string; name: string; color: string; logo_url: string | null };

/** How good the match is (0090): exact names score 3+, a #number 4. Missing on an older database. */
type Scored = { score?: number };

export type PersonResult = Scored & {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  email_name: string | null;
  is_self: boolean;
  is_teammate: boolean;
  /** Teams the SEARCHER is master of that this person already belongs to. */
  member_of: string[];
  /** …and ones they have a live pending invite to. */
  invited_to: string[];
};

export type ProjectResult = Scored & {
  id: string;
  entry_number: number;
  title: string;
  stage: PipelineStage;
  expected_date: string | null;
  matched_title: string | null;
  /** Found by its theme, hook, description or notes instead (0090), and the words around it. */
  matched_field?: "theme" | "subtheme" | "hook" | "description" | "notes" | null;
  matched_text?: string | null;
  thumbnail_path: string | null;
  /** Thumbnail Studio's winner (1.25.0, migration 0089): shown before the sketch. */
  winner_id?: string | null;
  team: SearchTeamRef;
};

export type ShortResult = Scored & {
  id: string;
  entry_number: number;
  title: string;
  stage: import("@/modules/short-videos/lib/constants").ShortStage;
  planned_date: string | null;
  posted_count: number;
  platform_count: number;
  /** Found by its caption (0090). */
  matched_field?: "caption" | null;
  matched_text?: string | null;
  team: SearchTeamRef;
};

export type TeamResult = SearchTeamRef & Scored & { is_master: boolean; member_count: number };

/** A script or research document with the words in it (0090). */
export type ScriptResult = Scored & {
  id: string;
  kind: "script" | "research";
  name: string;
  video_kind: "short" | "long";
  video_id: string;
  entry_number: number | null;
  video_title: string | null;
  snippet: string | null;
  team: SearchTeamRef;
};

export type MeetingResult = Scored & {
  id: string;
  title: string;
  starts_at: string;
  duration_min: number;
  status: "scheduled" | "cancelled";
  location: string;
  matched_field: "agenda" | "notes" | null;
  matched_text: string | null;
  team: SearchTeamRef;
};

export type ActionResult = Scored & {
  id: string;
  text: string;
  meeting_id: string;
  due_date: string | null;
  done: boolean;
  mine: boolean;
  owner_name: string | null;
  meeting_title: string;
  meeting_at: string;
  team: SearchTeamRef;
};

export type ObjectiveResult = Scored & {
  id: string;
  title: string;
  period: "day" | "week" | "month" | "quarter" | "year";
  color: string;
  paused: boolean;
  team: SearchTeamRef;
};

export type ProjectionResult = Scored & {
  id: string;
  title: string;
  deadline: string;
  color: string;
  achieved: boolean;
  ended: boolean;
  archived: boolean;
  team: SearchTeamRef;
};

export type SearchResponse = {
  people: PersonResult[];
  projects: ProjectResult[];
  shorts: ShortResult[];
  teams: TeamResult[];
  master_teams: SearchTeamRef[];
  scripts: ScriptResult[];
  meetings: MeetingResult[];
  actions: ActionResult[];
  objectives: ObjectiveResult[];
  projections: ProjectionResult[];
};

export const EMPTY_RESPONSE: SearchResponse = {
  people: [],
  projects: [],
  shorts: [],
  teams: [],
  master_teams: [],
  scripts: [],
  meetings: [],
  actions: [],
  objectives: [],
  projections: [],
};

/** What's remembered in "Recent": enough to draw the row without a query. */
export type RecentItem = {
  kind: "person" | "project" | "short" | "team" | "script" | "meeting" | "goal" | "page";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  imageUrl?: string | null;
  color?: string;
  square?: boolean;
  /** Pages, settings and actions: their icon. */
  icon?: IconKey;
  /** Goals live in a team: switch to it first. */
  teamId?: string;
};
