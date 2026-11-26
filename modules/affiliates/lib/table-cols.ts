/** The sponsorships table's columns (1.56.0). The table and its skeleton (the loading screens) share them, so this
 * holds nothing else. 1.57.1: the product link is its domain, and the platform and its login are small icons, so the
 * name gets the room (the owner: "i want to be able to see more of the name"). 1.58.0: a company's products, under its
 * heading (which has the code, the platform and the login, once): the picture, the name, Verified or not, the code it
 * goes by and the deal, the videos, the link, ⋯. The same for everyone (only ⋯ holds more for managers). */
export const TABLE_COLS = {
  product:
    "md:grid-cols-[40px_minmax(0,1fr)_7rem_minmax(0,9rem)_5.5rem_44px] lg:grid-cols-[40px_minmax(0,1fr)_7rem_minmax(0,9rem)_5.5rem_minmax(0,14rem)_44px] xl:grid-cols-[44px_minmax(0,1fr)_7rem_minmax(0,9rem)_5.5rem_minmax(0,13rem)_minmax(0,9rem)_44px] 2xl:grid-cols-[48px_minmax(0,1fr)_7rem_minmax(0,9.5rem)_6rem_minmax(0,15rem)_minmax(0,10rem)_44px]",
} as const;

/** How far in a company's products are drawn (under its name), and where their tick box goes then (on the picture). */
export const PRODUCT_INDENT = "pl-3 md:pl-11 [--pick-left:21px] md:[--pick-left:55px] xl:[--pick-left:57px] 2xl:[--pick-left:59px]";
