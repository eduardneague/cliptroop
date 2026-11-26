/** The sponsorships table's columns (1.56.0). The table and its skeleton (the loading screens) share them, so this
 * holds nothing else. 1.57.1: the product link is its domain, and the platform and its login are small icons, so the
 * name gets the room (the owner: "i want to be able to see more of the name"). 1.58.0: a company's products, under its
 * heading (which has the code, the platform and the login, once): the picture, the name, Verified or not, the code it
 * goes by and the deal, the videos, the link, ⋯. The same for everyone (only ⋯ holds more for managers). */
export const TABLE_COLS = {
  product:
    "md:grid-cols-[40px_minmax(0,1fr)_7rem_minmax(0,9rem)_5.5rem_44px] lg:grid-cols-[40px_minmax(0,1fr)_7rem_minmax(0,9rem)_5.5rem_minmax(0,14rem)_44px] xl:grid-cols-[44px_minmax(0,1fr)_7rem_minmax(0,9rem)_5.5rem_minmax(0,13rem)_minmax(0,9rem)_44px] 2xl:grid-cols-[48px_minmax(0,1fr)_7rem_minmax(0,9.5rem)_6rem_minmax(0,15rem)_minmax(0,10rem)_44px]",
} as const;

/** How far in the headings and the companies' rows start, and where a tick box goes then (on the picture). */
export const PRODUCT_INDENT = "pl-3 md:pl-11 [--pick-left:21px] md:[--pick-left:55px] xl:[--pick-left:57px] 2xl:[--pick-left:59px]";

/**
 * A company's products, further in (1.60.1, the owner: "make the table view so that the products start a bit from the
 * front like this: company / * product"): 24 px more on a phone, 32 px from md (the name's column takes it, so the
 * other columns stay under their headings), and their tick box with them.
 */
export const PRODUCT_TREE = "pl-9 md:pl-[76px] [--pick-left:45px] md:[--pick-left:87px] xl:[--pick-left:89px] 2xl:[--pick-left:91px]";

/**
 * …and a line from the company's picture down its products, with a short one to each (the last one ends there). On a
 * phone a product's picture sits at the top of its row (its row has more lines), so the short line goes there.
 */
export const TREE_LINES =
  "before:absolute before:top-0 before:bottom-0 before:w-px before:bg-line/20 before:left-[30px] md:before:left-[64px] xl:before:left-[66px] 2xl:before:left-[68px] last:before:bottom-auto last:before:h-[28px] md:last:before:h-1/2 after:absolute after:h-px after:bg-line/20 after:top-[28px] md:after:top-1/2 after:left-[30px] after:w-2 md:after:left-[64px] md:after:w-4 xl:after:left-[66px] 2xl:after:left-[68px]";
