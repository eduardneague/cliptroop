import { Skeleton, SkeletonBack, SkeletonPage } from "@/components/ui/skeleton";

/**
 * New short. Needed so the shorts LIST skeleton (one folder up) doesn't
 * show while this form loads.
 */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-2xl">
      <SkeletonBack label="Short videos" className="mb-5" />
      <div aria-hidden>
        <h1 className="font-display text-[32px] font-semibold leading-tight mb-1.5">New short</h1>
        <p className="text-[14px] text-ink-faint mb-8">
          Starts in <b>Script</b>. You can change everything later.
        </p>
        <div className="space-y-7">
          <Field label="Title">
            <Skeleton className="h-12 w-full rounded-xl" />
          </Field>
          <Field label="Type">
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-28 rounded-xl" />
              ))}
            </div>
          </Field>
          <Field label="Post date">
            <Skeleton className="h-11 w-full rounded-xl" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {["Scripters", "Editor", "Reviewer", "Scheduler"].map((l) => (
              <Field key={l} label={l}>
                <Skeleton className="h-11 w-full rounded-xl" />
              </Field>
            ))}
          </div>
          <Field label="Post to">
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-24 rounded-xl" />
              ))}
            </div>
          </Field>
          <Skeleton className="h-12 w-40 rounded-xl" />
        </div>
      </div>
    </SkeletonPage>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-[12px] font-bold uppercase tracking-wide text-ink-faint mb-2">{label}</span>
      {children}
    </div>
  );
}
