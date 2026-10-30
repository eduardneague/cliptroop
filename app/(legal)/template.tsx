/**
 * Every page of this part of the website starts fresh on each visit (1.46.0), so it comes in with its entrance
 * (site.css: main#page) instead of swapping in place.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return children;
}
