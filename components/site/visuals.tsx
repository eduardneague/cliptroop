import type { VisualId } from "@/lib/site/features";
import { MeasureVignette, PhoneVignette, PipelineVignette, PlanVignette, PostVignette, ReviewVignette, ScriptVignette } from "@/components/landing/vignettes";
import { OutliersFrame, StudioFrame } from "./frames";
import { DashboardVignette, LongVideoVignette, LookVignette, MediaKitVignette, MeetingVignette, ObjectivesVignette, ProfileVignette, ProjectionVignette, SearchVignette, TeamVignette } from "./scenes";

/* Each feature page's demo, by the name lib/site/features.ts gives it. */
export const VISUALS: Record<VisualId, () => React.ReactNode> = {
  plan: PlanVignette,
  longvideo: LongVideoVignette,
  meeting: MeetingVignette,
  script: ScriptVignette,
  pipeline: PipelineVignette,
  review: ReviewVignette,
  studio: StudioFrame,
  post: PostVignette,
  measure: MeasureVignette,
  objectives: ObjectivesVignette,
  projection: ProjectionVignette,
  mediakit: MediaKitVignette,
  outliers: OutliersFrame,
  team: TeamVignette,
  dashboard: DashboardVignette,
  profile: ProfileVignette,
  phone: PhoneVignette,
  search: SearchVignette,
  look: LookVignette,
};
