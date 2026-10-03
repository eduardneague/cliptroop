"use client";

import { Ago } from "@/components/ui/ago";
import { compressImage, IMAGE_PRESETS, safeFileName, UPLOAD_CACHE_CONTROL } from "@/lib/image/compress";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CommentDeleteButton } from "./comment-delete-button";
import { initialsFor } from "@/lib/avatar";
import { ExpandIcon, CloseIcon, FileIcon } from "@/components/ui/icons";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { MentionInput } from "@/components/ui/mention-input";
import { MentionText } from "@/components/ui/mention-text";
import { RolePills } from "@/components/ui/role-pills";
import { useToast } from "@/components/ui/toast-provider";
import { createClient } from "@/lib/supabase/client";
import type { MentionTarget } from "@/lib/mentions";
import type { RoleId } from "@/lib/permissions/roles";

export type AttachmentDisplay = {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
};

export type CommentDisplay = {
  id: string;
  name: string;
  avatarColor: string;
  avatarUrl: string | null;
  roles: { name: string; color: string }[];
  createdAt: string;
  body: string;
  canDelete: boolean;
  attachments: AttachmentDisplay[];
  /** true while an optimistic (not yet saved) message is being sent */
  pending?: boolean;
};

/** The viewer, so their own message can be drawn before the server confirms it. */
export type CommentAuthor = {
  id: string;
  name: string;
  avatarColor: string;
  avatarUrl: string | null;
  roles: { name: string; color: string }[];
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function NotesPanel({
  stageLabel,
  comments,
  canComment,
  projectId,
  postAction,
  mentionCatalog,
  roleColors,
  me,
}: {
  stageLabel: string;
  comments: CommentDisplay[];
  canComment: boolean;
  projectId: string;
  postAction: (formData: FormData) => Promise<{ error?: string }>;
  mentionCatalog: MentionTarget[];
  roleColors: Record<RoleId, string>;
  me: CommentAuthor | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const toast = useToast();
  const supabase = createClient();
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const expandedListRef = useRef<HTMLDivElement>(null);
  const [, startSend] = useTransition();

  // Optimistic list: your message shows up the instant you hit send
  // (slightly faded, "Sending…"), then is swapped for the real saved
  // one when the server responds. If sending fails it just disappears
  // and a toast explains why — nothing to clean up by hand.
  const [visibleComments, addOptimistic] = useOptimistic(
    comments,
    (state: CommentDisplay[], added: CommentDisplay) => [...state, added]
  );

  // Live updates: if anyone else posts or deletes a note on this project
  // while you're looking at it, re-fetch so you see it without having to
  // refresh the page yourself.
  useEffect(() => {
    // Several events can arrive at once (e.g. a note + its attachments);
    // coalesce them into a single refresh.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    const channel = supabase
      .channel(`project-comments-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_comments", filter: `project_id=eq.${projectId}` },
        (payload) => {
          // Our own new note is already refreshed by the send action —
          // don't render the whole page a second time for it.
          const authorId = (payload.new as { author_id?: string } | null)?.author_id;
          if (payload.eventType === "INSERT" && me && authorId === me.id) return;
          scheduleRefresh();
        }
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  // Jump to the newest comment whenever the list changes (e.g. right
  // after sending) instead of leaving the scroll position wherever it
  // was, which is why it always felt stuck until you scrolled manually.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    expandedListRef.current?.scrollTo({ top: expandedListRef.current.scrollHeight, behavior: "smooth" });
  }, [visibleComments.length]);

  // Jump straight to the bottom the instant the fullscreen view opens —
  // otherwise it renders scrolled to the top and you have to scroll down
  // yourself every time.
  useEffect(() => {
    if (expanded) {
      expandedListRef.current?.scrollTo({ top: expandedListRef.current.scrollHeight });
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  function handleSend(text: string, files: File[], gifUrls: string[] = []) {
    const previewUrls: string[] = [];
    const optimisticAttachments: AttachmentDisplay[] = [
      ...files.map((file, i) => {
        const isImage = file.type.startsWith("image/");
        const url = isImage ? URL.createObjectURL(file) : "#";
        if (isImage) previewUrls.push(url);
        return { id: `tmp-file-${i}`, name: file.name, url, size: file.size, mimeType: file.type || "application/octet-stream" };
      }),
      ...gifUrls.map((url, i) => ({ id: `tmp-gif-${i}`, name: "GIF", url, size: 0, mimeType: "image/gif" })),
    ];

    if (files.length > 0) setUploading(true);

    startSend(async () => {
      if (me) {
        addOptimistic({
          id: `tmp-${crypto.randomUUID()}`,
          name: me.name,
          avatarColor: me.avatarColor,
          avatarUrl: me.avatarUrl,
          roles: me.roles,
          createdAt: new Date().toISOString(),
          body: text,
          canDelete: false,
          attachments: optimisticAttachments,
          pending: true,
        });
      }

      const uploaded: { name: string; path: string; size: number; type: string }[] = [];
      for (const original of files) {
        const file = await compressImage(original, IMAGE_PRESETS.attachment);
        const path = `${projectId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
        const { error } = await supabase.storage
          .from("comment-attachments")
          .upload(path, file, { cacheControl: UPLOAD_CACHE_CONTROL, contentType: file.type || undefined });
        if (error) {
          toast.error(`Couldn't upload ${file.name}.`);
          continue;
        }
        // Keep the ORIGINAL name for display/download; the stored copy may be compressed.
        uploaded.push({ name: original.name, path, size: file.size, type: file.type || "application/octet-stream" });
      }
      gifUrls.forEach((url) => {
        uploaded.push({ name: "GIF", path: url, size: 0, type: "image/gif" });
      });
      setUploading(false);

      const fd = new FormData();
      fd.set("body", text);
      fd.set("attachments", JSON.stringify(uploaded));
      const result = await postAction(fd);
      if (result?.error) toast.error(result.error);

      previewUrls.forEach((u) => URL.revokeObjectURL(u));
    });
  }

  function renderItems() {
    return (
      <>
        {visibleComments.length === 0 && (
          <p className="text-[12px] text-ink-faint">
            No notes on this stage yet.
          </p>
        )}
        {visibleComments.map((c) => (
          <div
            key={c.id}
            className={`relative flex gap-2 border-b border-line/10 pb-2.5 pr-5 last:border-none transition-opacity ${
              c.pending ? "opacity-60" : ""
            }`}
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 mt-0.5 overflow-hidden"
              style={{ background: c.avatarColor }}
            >
              {c.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                initialsFor(c.name)
              )}
            </span>
            <div className="text-[12.5px] min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold">{c.name}</span>
                <RolePills roles={c.roles} />
              </div>
              {c.body && (
                <div className="text-ink-soft leading-relaxed mt-0.5">
                  <MentionText text={c.body} catalog={mentionCatalog} roleColors={roleColors} />
                </div>
              )}
              {c.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {c.attachments.map((a) =>
                    a.mimeType.startsWith("image/") ? (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setLightbox({ url: a.url, name: a.name })}
                        className="block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img loading="lazy" decoding="async"
                          src={a.url}
                          alt={a.name}
                          className="max-w-[160px] max-h-[120px] rounded-lg border border-line/10 object-cover hover:opacity-90 transition-opacity"
                        />
                      </button>
                    ) : (
                      <a
                        key={a.id}
                        href={a.url}
                        download={a.name}
                        className="flex items-center gap-1.5 rounded-lg border border-line/15 bg-surface-2 px-2.5 py-1.5 text-[11.5px] font-medium hover:border-amber transition-colors"
                      >
                        <FileIcon className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" /> {a.name.length > 22 ? `${a.name.slice(0, 19)}…` : a.name}
                        <span className="text-ink-faint">{formatBytes(a.size)}</span>
                      </a>
                    )
                  )}
                </div>
              )}
              <div className="text-[10.5px] text-ink-soft mt-1">
                {c.pending ? "Sending…" : <Ago iso={c.createdAt} />}
              </div>
            </div>
            {c.canDelete && !c.pending && (
              <div className="absolute top-0 right-0">
                <CommentDeleteButton commentId={c.id} projectId={projectId} />
              </div>
            )}
          </div>
        ))}
      </>
    );
  }

  function renderComposer() {
    return canComment ? (
      <MentionInput
        catalog={mentionCatalog}
        roleColors={roleColors}
        placeholder={uploading ? "Uploading…" : "Leave a note… (@ to mention)"}
        onSubmit={handleSend}
      />
    ) : (
      <p className="text-[11px] text-ink-faint">
        Only people with a role for this stage (or the master) can post notes here.
      </p>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-line/10 bg-surface p-4 h-fit">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-display font-semibold">
            Notes & Q&A · {stageLabel}
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="text-ink-soft hover:text-ink transition-colors"
            aria-label="Expand notes"
            title="Expand"
          >
            <ExpandIcon className="w-[15px] h-[15px]" />
          </button>
        </div>
        <div ref={listRef} className="space-y-3 mb-3 pr-2 max-h-[360px] overflow-y-auto styled-scroll">
          {renderItems()}
        </div>
        {renderComposer()}
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4 sm:p-8"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-full max-w-2xl h-full max-h-[85vh] rounded-2xl bg-surface border border-line/10 shadow-2xl flex flex-col animate-[modalin_.15s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-line/10 flex-shrink-0">
              <div className="font-display font-semibold text-[16px]">
                Notes & Q&A · {stageLabel}
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="text-ink-soft hover:text-ink transition-colors"
                aria-label="Close"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            <div ref={expandedListRef} className="flex-1 overflow-y-auto styled-scroll px-5 py-4 space-y-3">
              {renderItems()}
            </div>
            <div className="px-5 py-4 border-t border-line/10 flex-shrink-0">
              {renderComposer()}
            </div>
          </div>
        </div>
      )}
      {lightbox && (
        <ImageLightbox url={lightbox.url} alt={lightbox.name} onClose={() => setLightbox(null)} />
      )}
    </>
  );
}
