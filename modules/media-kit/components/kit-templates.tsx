"use client";

import { useId, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { ChevronDownIcon, EditIcon, TemplateIcon, TrashIcon } from "@/components/ui/icons";
import { relativeTime } from "@/lib/relative-time";
import { createMediaKitTemplate, deleteMediaKitTemplate, openMediaKitTemplate, renameMediaKitTemplate, updateMediaKitTemplate } from "@/app/(dashboard)/analytics/media-kit-actions";
import { defaultKitSettings, TEMPLATE_NAME_MAX, templateName, templateSettings, type KitTemplateInfo, type MediaKitSettings } from "../lib/settings";

/*
 * The media kit's templates (1.40.0). The owner: "i want to be able to save templates as well for media kit, i want to
 * be able to set my things, then save it as a template. next time i can go into that template and just modify a few
 * things and so on, and i can save as many templates as i want".
 *
 * A template is a named copy of the setup (media_kit_templates, migration 0118). Opening one puts it on screen, where
 * it's changed and saved as you go like any setup; the template keeps what it had until it's updated ("Update
 * template" shows once the setup on screen differs from it). Opening one over a setup that isn't kept anywhere asks
 * first. Anyone who opens the kit uses them; each name once per team.
 */

/** The template the setup on screen was opened from, as it was then (or as last updated from here). */
export type TemplateBase = { id: string; settings: MediaKitSettings; updatedAt: string };

const key = (raw: unknown, teamId: string) => JSON.stringify(templateSettings(raw, teamId));

export function KitTemplates({
  teamId,
  me,
  ready,
  s,
  deferred,
  initial,
  initialBase,
  set,
  replace,
}: {
  teamId: string;
  me: string;
  /** Migration 0118 has run. */
  ready: boolean;
  /** The setup on screen, now and a beat behind (to compare without slowing the typing down). */
  s: MediaKitSettings;
  deferred: MediaKitSettings;
  initial: KitTemplateInfo[];
  initialBase: TemplateBase | null;
  set: (patch: Partial<MediaKitSettings>) => void;
  /** A template opened: its setup on screen, with its cover photo's link. */
  replace: (settings: MediaKitSettings, coverUrl: string | null) => void;
}) {
  const toast = useToast();
  const [list, setList] = useState(initial);
  const [base, setBase] = useState<TemplateBase | null>(initialBase);
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  const current = s.fromTemplate ? (list.find((t) => t.id === s.fromTemplate) ?? null) : null;
  const baseKey = useMemo(() => (base ? key(base.settings, teamId) : null), [base, teamId]);
  const nowKey = useMemo(() => key(deferred, teamId), [deferred, teamId]);
  const emptyKey = useMemo(() => key(defaultKitSettings(), teamId), [teamId]);
  /** Not what the template it came from has (or that can't be told). */
  const changed = !!current && (base?.id !== current.id || nowKey !== baseKey);
  /** The setup on screen is kept nowhere else: opening a template over it asks first. */
  const unkept = changed || (!current && nowKey !== emptyKey);

  /** A template that changed here goes to the top of the list (newest change first, as the page sorts them). */
  const put = (t: KitTemplateInfo) => setList((l) => [t, ...l.filter((x) => x.id !== t.id)]);

  async function update() {
    if (!current || updating) return;
    setUpdating(true);
    try {
      const r = await updateMediaKitTemplate(teamId, current.id, s, base?.id === current.id ? base.updatedAt : current.updatedAt);
      if (r.error !== undefined) return void toast.error(r.error);
      put(r.template);
      setBase({ id: current.id, settings: templateSettings(s, teamId), updatedAt: r.template.updatedAt });
      toast.success(`“${current.name}” updated`);
    } catch {
      toast.error("Couldn't update the template. Check your connection and try again.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={current ? `Templates: “${current.name}” is on screen` : "Templates"}
        className="inline-flex items-center gap-2 rounded-lg border border-line/15 bg-surface pl-3 pr-2.5 h-9 text-[13px] font-semibold hover:bg-surface-2 max-w-[16rem] min-w-0"
      >
        <TemplateIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />
        <span className="truncate">{current ? current.name : "Templates"}</span>
        {!current && list.length > 0 && <span className="text-[11.5px] font-bold tabular-nums text-ink-faint">{list.length}</span>}
        <ChevronDownIcon className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />
      </button>
      {changed && current && (
        <button
          type="button"
          onClick={() => void update()}
          disabled={updating}
          title={`Your changes are on screen and saved as you go; “${current.name}” keeps what it had until you update it.`}
          className="inline-flex items-center gap-2 rounded-lg border border-amber/40 bg-amber/10 text-amber px-3 h-9 text-[13px] font-semibold hover:bg-amber/15 disabled:opacity-60"
        >
          {updating ? <span className="w-3 h-3 rounded-full border-2 border-amber/30 border-t-amber animate-spin" aria-hidden /> : <span className="w-1.5 h-1.5 rounded-full bg-amber" aria-hidden />}
          {updating ? "Updating…" : "Update template"}
        </button>
      )}
      {open && (
        <TemplatesDialog
          teamId={teamId}
          me={me}
          ready={ready}
          s={s}
          list={list}
          current={current}
          changed={changed}
          unkept={unkept}
          updating={updating}
          onUpdate={() => void update()}
          onClose={() => setOpen(false)}
          onSaved={(t) => {
            put(t);
            setBase({ id: t.id, settings: templateSettings(s, teamId), updatedAt: t.updatedAt });
            set({ fromTemplate: t.id });
          }}
          onOpened={(t, settings, coverUrl, updatedAt) => {
            setList((l) => l.map((x) => (x.id === t.id ? { ...x, updatedAt } : x)));
            setBase({ id: t.id, settings: templateSettings(settings, teamId), updatedAt });
            replace(settings, coverUrl);
            setOpen(false);
          }}
          onRenamed={(t) => {
            setList((l) => l.map((x) => (x.id === t.id ? t : x)));
            setBase((b) => (b && b.id === t.id ? { ...b, updatedAt: t.updatedAt } : b));
          }}
          onDeleted={(id) => {
            setList((l) => l.filter((x) => x.id !== id));
            setBase((b) => (b?.id === id ? null : b));
            if (s.fromTemplate === id) set({ fromTemplate: null });
          }}
        />
      )}
    </>
  );
}

function TemplatesDialog({
  teamId,
  me,
  ready,
  s,
  list,
  current,
  changed,
  unkept,
  updating,
  onUpdate,
  onClose,
  onSaved,
  onOpened,
  onRenamed,
  onDeleted,
}: {
  teamId: string;
  me: string;
  ready: boolean;
  s: MediaKitSettings;
  list: KitTemplateInfo[];
  current: KitTemplateInfo | null;
  changed: boolean;
  unkept: boolean;
  updating: boolean;
  onUpdate: () => void;
  onClose: () => void;
  onSaved: (t: KitTemplateInfo) => void;
  onOpened: (t: KitTemplateInfo, settings: MediaKitSettings, coverUrl: string | null, updatedAt: string) => void;
  onRenamed: (t: KitTemplateInfo) => void;
  onDeleted: (id: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const nameId = useId();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** The template being opened, renamed or deleted (one at a time). */
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const taken = (n: string) => list.some((t) => t.name.toLowerCase() === n.toLowerCase());

  async function saveNew() {
    const nm = templateName(name);
    if (!nm || saving) return;
    if (taken(nm)) return setProblem(`There's already a template called “${nm}”. Pick another name.`);
    setSaving(true);
    setProblem(null);
    try {
      const r = await createMediaKitTemplate(teamId, nm, s);
      if (r.error !== undefined) return setProblem(r.error);
      onSaved(r.template);
      setName("");
      toast.success(`Saved as “${r.template.name}”`);
    } catch {
      setProblem("Couldn't save the template. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function openOne(t: KitTemplateInfo) {
    if (busy) return;
    const again = current?.id === t.id;
    if (unkept) {
      const ok = await confirm({
        title: again ? `Go back to “${t.name}” as saved?` : `Open “${t.name}”?`,
        description: again
          ? "The changes you made since it was saved come off the screen."
          : current
            ? `It replaces the setup on screen, with the changes you made to “${current.name}” since it was saved. Update “${current.name}” first to keep them.`
            : "It replaces the setup on screen. Save that as a template first if you'll want it again.",
        confirmLabel: again ? "Go back to it" : "Open it",
        danger: again,
      });
      if (!ok) return;
    }
    setBusy(t.id);
    try {
      const r = await openMediaKitTemplate(teamId, t.id);
      if (r.error !== undefined) {
        toast.error(r.error);
        if (r.error === "That template was deleted.") onDeleted(t.id);
        return;
      }
      onOpened(t, r.settings, r.coverUrl, r.updatedAt);
      toast.success(again ? `Back to “${t.name}” as saved` : `“${t.name}” is on screen`);
    } catch {
      toast.error("Couldn't open the template. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function rename(t: KitTemplateInfo, raw: string) {
    const nm = templateName(raw);
    if (!nm || nm === t.name) return setRenaming(null);
    if (list.some((x) => x.id !== t.id && x.name.toLowerCase() === nm.toLowerCase())) return toast.error(`There's already a template called “${nm}”. Pick another name.`);
    setBusy(t.id);
    try {
      const r = await renameMediaKitTemplate(teamId, t.id, nm);
      if (r.error !== undefined) return void toast.error(r.error);
      onRenamed(r.template);
      setRenaming(null);
      toast.success(`Renamed to “${r.template.name}”`);
    } catch {
      toast.error("Couldn't rename the template. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(t: KitTemplateInfo) {
    if (busy) return;
    const ok = await confirm({
      title: `Delete “${t.name}”?`,
      description: current?.id === t.id ? "The template goes for good. The setup on screen stays as it is." : "The template goes for good, for everyone on the team.",
      confirmLabel: "Delete template",
      danger: true,
    });
    if (!ok) return;
    setBusy(t.id);
    try {
      const r = await deleteMediaKitTemplate(teamId, t.id);
      if (r.error !== undefined) return void toast.error(r.error);
      onDeleted(t.id);
      toast.success(`“${t.name}” deleted`);
    } catch {
      toast.error("Couldn't delete the template. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Templates"
      description="Keep a setup to start from next time. Opening one puts it on screen, where you change what you need; the template keeps what it had until you update it."
      width="sm:max-w-xl"
    >
      <div className="space-y-5">
        {!ready ? (
          <p className="rounded-xl bg-coral/10 text-coral text-[13px] px-3.5 py-2.5">Run migration 0118 to keep templates.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveNew();
            }}
          >
            <label htmlFor={nameId} className="block text-[12.5px] font-semibold text-ink-soft mb-1.5">
              Save the setup on screen as a template
            </label>
            <div className="flex gap-2">
              <input
                id={nameId}
                value={name}
                maxLength={TEMPLATE_NAME_MAX}
                onChange={(e) => {
                  setName(e.target.value);
                  setProblem(null);
                }}
                placeholder="Its name, like Gaming brands"
                autoComplete="off"
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? `${nameId}-problem` : undefined}
                className={`flex-1 min-w-0 rounded-xl border bg-surface px-3.5 h-10 text-[14px] outline-none focus:ring-2 focus:ring-amber ${problem ? "border-coral/60" : "border-line/15"}`}
              />
              <button type="submit" disabled={!templateName(name) || saving} className="inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-4 h-10 text-[13.5px] disabled:opacity-50 hover:brightness-110 transition-[filter] flex-shrink-0">
                {saving && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
            {problem && (
              <p id={`${nameId}-problem`} role="alert" className="text-[12px] text-coral mt-1.5">
                {problem}
              </p>
            )}
            {current && changed && (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-amber/10 px-3.5 py-2.5">
                <p className="flex-1 min-w-0 text-[12.5px] text-ink-soft">
                  You changed <b className="text-ink">{current.name}</b> on screen. The template keeps what it had until you update it.
                </p>
                <button type="button" onClick={onUpdate} disabled={updating} className="rounded-lg bg-amber text-white font-bold px-3 h-8 text-[12.5px] disabled:opacity-60 flex-shrink-0">
                  {updating ? "Updating…" : "Update template"}
                </button>
              </div>
            )}
          </form>
        )}

        {ready && (
          <section aria-labelledby={`${nameId}-list`}>
            <h3 id={`${nameId}-list`} className="text-[12.5px] font-semibold text-ink-soft mb-1.5">
              {list.length ? `The team's templates (${list.length})` : "The team's templates"}
            </h3>
            {list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line/20 px-4 py-6 text-center text-[13px] text-ink-soft">
                None yet. Set the kit up the way you like it, give it a name above and save it: it&rsquo;s here next time.
              </p>
            ) : (
              <ul className="rounded-xl border border-line/15 divide-y divide-line/10 max-h-[min(22rem,50dvh)] overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll">
                {list.map((t) => {
                  const here = current?.id === t.id;
                  const by = t.byId === me ? "you" : t.by;
                  return (
                    <li key={t.id} className={`flex items-center gap-2 px-3 py-2.5 ${here ? "bg-amber/[0.06]" : ""}`}>
                      {renaming === t.id ? (
                        <RenameField
                          initial={t.name}
                          busy={busy === t.id}
                          onDone={(v) => (v === null ? setRenaming(null) : void rename(t, v))}
                        />
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="flex items-center gap-2 min-w-0">
                              <span className="text-[13.5px] font-semibold truncate">{t.name}</span>
                              {here && <span className="rounded-md bg-amber/15 text-amber px-1.5 py-px text-[11px] font-bold flex-shrink-0">{changed ? "On screen, changed" : "On screen"}</span>}
                            </p>
                            <p className="text-[11.5px] text-ink-faint truncate">{`Changed ${relativeTime(t.updatedAt)}${by ? ` by ${by}` : ""}`}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void openOne(t)}
                            disabled={!!busy || (here && !changed)}
                            title={here && !changed ? "It's on screen" : undefined}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold hover:bg-surface-2 disabled:opacity-50 flex-shrink-0"
                          >
                            {busy === t.id && <span className="w-3 h-3 rounded-full border-2 border-ink-faint/40 border-t-amber animate-spin" aria-hidden />}
                            {here ? (changed ? "Go back to it" : "Open") : "Open"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenaming(t.id)}
                            disabled={!!busy}
                            aria-label={`Rename “${t.name}”`}
                            title="Rename"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 disabled:opacity-50 flex-shrink-0"
                          >
                            <EditIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(t)}
                            disabled={!!busy}
                            aria-label={`Delete “${t.name}”`}
                            title="Delete"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:text-red hover:bg-red/10 disabled:opacity-50 flex-shrink-0"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}

/** A template's name, being changed: Enter keeps it, Esc leaves it as it was (the window stays open). */
function RenameField({ initial, busy, onDone }: { initial: string; busy: boolean; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  return (
    <form
      className="flex-1 flex items-center gap-2 min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(v);
      }}
    >
      <input
        value={v}
        autoFocus
        maxLength={TEMPLATE_NAME_MAX}
        onChange={(e) => setV(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onDone(null);
          }
        }}
        aria-label="The template's name"
        className="flex-1 min-w-0 rounded-lg border border-line/15 bg-surface px-2.5 h-8 text-[13.5px] outline-none focus:ring-2 focus:ring-amber"
      />
      <button type="submit" disabled={busy || !templateName(v)} className="rounded-lg bg-amber text-white font-bold px-3 h-8 text-[12.5px] disabled:opacity-50 flex-shrink-0">
        {busy ? "Saving…" : "Rename"}
      </button>
      <button type="button" onClick={() => onDone(null)} disabled={busy} className="rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 flex-shrink-0">
        Cancel
      </button>
    </form>
  );
}
