"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast-provider";
import { AlertIcon, DocumentIcon } from "@/components/ui/icons";
import { Ago } from "@/components/ui/ago";
import { deleteProject, getVideoWork, type VideoWork } from "@/app/(dashboard)/videos/[id]/actions";

/** Edited this recently: someone may still be writing in it. */
const LIVE_MS = 15 * 60 * 1000;

const n = (v: number, one: string, many: string) => `${v.toLocaleString("en-US")} ${v === 1 ? one : many}`;

/**
 * Deleting a long video from the list (1.27.5), in two steps so nothing goes
 * by mistake: first what it would take with it (the words in its scripts
 * and research and who wrote last, comments, editing ideas, edits,
 * thumbnails, notes), then its name typed to delete it.
 */
export function DeleteVideoDialog({
  video,
  onClose,
}: {
  video: { id: string; teamId: string; number: number; title: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [work, setWork] = useState<VideoWork | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const id = video?.id ?? null;

  useEffect(() => {
    setWork(null);
    setError(null);
    setStep(1);
    setTyped("");
    if (!id) return;
    let live = true;
    void getVideoWork(id).then((r) => {
      if (!live) return;
      if (r.error !== undefined) setError(r.error);
      else setWork(r);
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (!video) return null;
  const matches = typed.trim().toLowerCase() === video.title.trim().toLowerCase() && typed.trim() !== "";
  const close = () => !pending && onClose();
  const counts = work
    ? [
        work.comments ? n(work.comments, "open comment", "open comments") : null,
        work.ideas ? n(work.ideas, "editing idea", "editing ideas") : null,
        work.files ? n(work.files, "uploaded edit", "uploaded edits") : null,
        work.thumbnails ? n(work.thumbnails, "thumbnail", "thumbnails") : null,
        work.notes ? n(work.notes, "note", "notes") : null,
      ].filter((x): x is string => !!x)
    : [];
  const recent = work?.docs.find((d) => d.updatedAt && Date.now() - Date.parse(d.updatedAt) < LIVE_MS) ?? null;
  const empty = !!work && !work.docs.length && !counts.length;

  function remove() {
    if (!video || !matches) return;
    start(async () => {
      const r = await deleteProject(video.id, video.teamId, { stay: true, confirmTitle: typed });
      if (r && "error" in r && r.error) return void toast.error(r.error);
      toast.success(`#${video.number} “${video.title}” deleted`);
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open
      onClose={close}
      title={step === 1 ? `Delete #${video.number} “${video.title}”?` : "Type its name to delete it"}
      description={step === 1 ? "Everything below is deleted with it, and it can't be brought back." : `Type “${video.title}” below. This deletes the video and everything in it for good.`}
      footer={
        <>
          <button type="button" onClick={close} className="rounded-lg px-3.5 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Cancel
          </button>
          {step === 1 ? (
            <button
              type="button"
              disabled={!work}
              onClick={() => setStep(2)}
              className="rounded-lg border border-red/40 px-4 h-10 text-[13.5px] font-bold text-red hover:bg-red/10 disabled:opacity-50"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={!matches || pending}
              onClick={remove}
              className="inline-flex items-center gap-2 rounded-lg bg-red text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-45"
            >
              {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
              Delete forever
            </button>
          )}
        </>
      }
    >
      {step === 1 ? (
        <div className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-[13px] text-red">{error}</p>
          ) : !work ? (
            <div className="space-y-2" aria-busy="true" aria-label="Looking at what's in it">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : empty ? (
            <p className="text-[13.5px] text-ink-soft">Nothing has been written or uploaded for it yet.</p>
          ) : (
            <>
              {recent && (
                <p className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/[0.08] px-3 py-2 text-[13px]">
                  <AlertIcon className="w-4 h-4 mt-0.5 text-amber flex-shrink-0" />
                  <span>
                    {recent.name} was edited <Ago iso={recent.updatedAt!} />
                    {recent.by ? ` by ${recent.by}` : ""}: someone may still be writing in it.
                  </span>
                </p>
              )}
              {work.docs.length > 0 && (
                <ul className="rounded-xl border border-line/15 divide-y divide-line/10">
                  {work.docs.map((d) => (
                    <li key={`${d.research ? "r" : "s"}-${d.name}`} className="flex items-center gap-3 px-3 py-2.5">
                      <DocumentIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold truncate">
                          {d.research ? "Research · " : ""}
                          {d.name}
                        </span>
                        {d.updatedAt && (
                          <span className="block text-[11.5px] text-ink-soft truncate">
                            Edited <Ago iso={d.updatedAt} />
                            {d.by ? ` by ${d.by}` : ""}
                          </span>
                        )}
                      </span>
                      <span className="text-[12.5px] font-semibold tabular-nums text-ink whitespace-nowrap">{n(d.words, "word", "words")}</span>
                    </li>
                  ))}
                </ul>
              )}
              {counts.length > 0 && <p className="text-[13px] text-ink-soft">Also: {counts.join(", ")}.</p>}
            </>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            remove();
          }}
        >
          <label className="block text-[12.5px] font-semibold text-ink-soft mb-1.5" htmlFor="delete-video-name">
            The video&rsquo;s name
          </label>
          <input
            id="delete-video-name"
            data-autofocus
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={video.title}
            className="w-full rounded-lg border border-line/20 bg-surface px-3 h-11 text-[14px] focus:outline-none focus:border-red/60 focus:ring-2 focus:ring-red/20"
          />
          <p className={`mt-1.5 text-[12px] ${typed && !matches ? "text-red" : "text-ink-faint"}`}>{typed && !matches ? "That's not its name yet." : "Capitals don't matter."}</p>
        </form>
      )}
    </Dialog>
  );
}
