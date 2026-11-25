/** The affiliates table's columns (1.56.0): with a login column (the people who manage affiliates), and without. The
 * table and its skeleton (the loading screens) share them, so this holds nothing else. */
export const TABLE_COLS = {
  manage:
    "md:grid-cols-[40px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_44px] lg:grid-cols-[40px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_minmax(0,14rem)_44px] xl:grid-cols-[44px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_minmax(0,13rem)_minmax(0,12rem)_10.5rem_44px] 2xl:grid-cols-[48px_minmax(0,1fr)_minmax(0,9rem)_6rem_minmax(0,14rem)_minmax(0,13rem)_10.5rem_minmax(0,10rem)_44px]",
  view: "md:grid-cols-[40px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_44px] lg:grid-cols-[40px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_minmax(0,14rem)_44px] xl:grid-cols-[44px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_minmax(0,14rem)_minmax(0,14rem)_44px] 2xl:grid-cols-[48px_minmax(0,1fr)_minmax(0,9rem)_6rem_minmax(0,15rem)_minmax(0,15rem)_minmax(0,11rem)_44px]",
} as const;
