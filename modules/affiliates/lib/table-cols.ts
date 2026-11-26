/** The sponsorships table's columns (1.56.0): with a login (the people who manage sponsorships), and without. The
 * table and its skeleton (the loading screens) share them, so this holds nothing else. 1.57.1: the product link is its
 * domain, and the platform and its login are small icons in one narrow column, so the name gets the room (the owner:
 * "i want to be able to see more of the name"). */
export const TABLE_COLS = {
  manage:
    "md:grid-cols-[40px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_44px] lg:grid-cols-[40px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_minmax(0,14rem)_44px] xl:grid-cols-[44px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_minmax(0,13rem)_minmax(0,8.5rem)_4.5rem_44px] 2xl:grid-cols-[48px_minmax(0,1fr)_minmax(0,9rem)_6rem_minmax(0,14rem)_minmax(0,9.5rem)_4.5rem_44px]",
  view: "md:grid-cols-[40px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_44px] lg:grid-cols-[40px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_minmax(0,14rem)_44px] xl:grid-cols-[44px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_minmax(0,13rem)_minmax(0,8.5rem)_3rem_44px] 2xl:grid-cols-[48px_minmax(0,1fr)_minmax(0,9rem)_6rem_minmax(0,14rem)_minmax(0,9.5rem)_3rem_44px]",
} as const;
