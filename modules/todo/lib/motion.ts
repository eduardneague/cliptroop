/**
 * To Do's moments (1.53.3, app/globals.css "Off it goes"): a ticked-off to-do stays a moment (its tick pops, a shine,
 * its line struck), then zips away; a deleted one puffs away. The same in To Do, the quick panel and the dashboard's
 * To Do widget (To Do's own list since 1.53.4). The owner: "when you check something, i dont want the confirmation, and i want a cool outing animation,
 * and whne you delete something, i want the same thing".
 */
/** How long a just-ticked one stays where it was before it goes. */
export const HOLD_MS = 420;
/** Its zip, then its place closing (0.3 s after it starts, for 0.3 s). */
export const OUT_MS = 600;
/** A deleted one's puff, and its place closing (.is-gone: after 0.24 s, for 0.3 s). */
export const GONE_MS = 540;
