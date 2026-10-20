import { fold } from "./text";

/*
 * Video formats (1.27.0): the shapes outlier titles come in ("Cheap vs
 * expensive", "I tested…", "30 days of…", "The truth about…"). Pure.
 *
 * Each format has:
 *   - a test on the folded title (lowercase, no accents, one kind of quote);
 *   - patterns to write new titles with (slots below), and hooks;
 *   - the Hub / Help / Hero type it usually is (the Ideate template's type).
 *
 * Slots in patterns and hooks: {topic} (the subject: "iPhone 17"),
 * {topics} (its plural), {low} / {high} (a cheap and a pricey price in the
 * niche: "$20" / "$2,000"), {n} (a count), {duration} ("30 Days"), {year}.
 *
 * `FORMAT_VERSION` goes up whenever a test changes: the collector works the
 * stored videos' formats out again.
 */

export const FORMAT_VERSION = 1;

export type FormatGroup = "compare" | "test" | "challenge" | "story" | "teach" | "list" | "reveal" | "react" | "build";
export type VideoType = "Hub" | "Help" | "Hero";

export type Format = {
  id: string;
  name: string;
  /** One line: what this kind of video is. */
  blurb: string;
  group: FormatGroup;
  type: VideoType;
  /** More specific formats first: a title's main format is the first that matches. */
  test: (t: string) => boolean;
  patterns: string[];
  hooks: string[];
};

const re = (...xs: RegExp[]) => (t: string) => xs.some((x) => x.test(t));
const all = (...xs: RegExp[]) => (t: string) => xs.every((x) => x.test(t));

const PRICE = String.raw`(?:[$€£]\s?\d[\d,.]*\s*(?:k|m)?|\d[\d,.]*\s*(?:k)?\s*(?:ron|lei|eur|usd|dollars?|euros?))`;

export const FORMATS: Format[] = [
  {
    id: "cheap-vs-expensive",
    name: "Cheap vs expensive",
    blurb: "The budget one against the pricey one, side by side",
    group: "compare",
    type: "Hero",
    test: re(
      new RegExp(`${PRICE}.{0,40}\\b(vs\\.?|versus|or)\\s+${PRICE}`),
      /\b(cheap(est)?|budget|\$1)\b.{0,40}\b(vs\.?|versus)\b.{0,40}\b(expensive|luxury|premium|pricey|most expensive)\b/,
      /\b(expensive|luxury|premium)\b.{0,40}\b(vs\.?|versus)\b.{0,40}\b(cheap(est)?|budget)\b/
    ),
    patterns: ["{low} vs {high} {topic}", "Cheap vs Expensive {topic}", "I Bought a {low} {topic} and a {high} {topic}", "Is a {high} {topic} Really Better Than a {low} One?", "{low} {topic} vs {high} {topic}: The Difference Shocked Me"],
    hooks: ["One of these cost {low}. The other cost {high}. By the end of this video you'll know if the difference is worth it.", "I bought the cheapest {topic} I could find and the most expensive one. Only one of them deserves your money."],
  },
  {
    id: "fake-vs-real",
    name: "Fake vs real",
    blurb: "A copy against the original: can anyone tell?",
    group: "compare",
    type: "Hero",
    test: re(/\b(fake|counterfeit|knock-?offs?|replicas?|clones?|dupes?|bootleg)\b/),
    patterns: ["Real vs Fake {topic}: Can You Tell?", "I Bought a {low} Fake {topic}", "This Fake {topic} Fooled Everyone", "Can You Spot the Fake {topic}?", "I Tested a Fake {topic} (It Was Actually Good)"],
    hooks: ["This is a {topic}, and this is another {topic}. One of them is fake. Can you tell which one?", "This {topic} cost me {low}. The real one costs {high}. Let's find out how close they really are."],
  },
  {
    id: "beginner-vs-pro",
    name: "Beginner vs pro",
    blurb: "The same task by a beginner and an expert",
    group: "compare",
    type: "Hero",
    test: re(/\b(beginners?|noobs?|amateurs?|newbies?|novices?)\b.{0,40}\b(vs\.?|versus)\b.{0,40}\b(pros?|experts?|masters?|professionals?)\b/, /\b(pros?|experts?|professionals?)\b.{0,40}\b(vs\.?|versus)\b.{0,40}\b(beginners?|noobs?|amateurs?)\b/),
    patterns: ["Beginner vs Pro: {topic}", "Can a Beginner Beat a Pro at {topic}?", "{topic}: Beginner vs Expert", "I Challenged a Pro to {topic}"],
    hooks: ["One of them has never done this before. The other does it for a living. The result is closer than you think."],
  },
  {
    id: "n-vs-n",
    name: "Numbers vs numbers",
    blurb: "1 vs 100, 10 people vs 1: a crowd against one",
    group: "challenge",
    type: "Hero",
    test: re(/\b\d+\s+(vs\.?|versus)\s+\d+\b/, /\b\d+\s+(people|strangers|subscribers|kids|youtubers|players|guys|girls|men|women|fans|experts)\b/),
    patterns: ["1 vs 100 {topics}", "{n} People Tried {topic}", "I Asked {n} People About {topic}", "{n} {topics} vs 1 {topic}"],
    hooks: ["I put {n} people against one {topic}. Only one of them made it to the end."],
  },
  {
    id: "versus",
    name: "Head to head",
    blurb: "Two things compared until one wins",
    group: "compare",
    type: "Help",
    test: re(/\b(vs\.?|versus)\b/),
    patterns: ["{topic} vs the Competition: Which One Wins?", "{topic} vs {topic} Pro: Don't Choose Wrong", "Which {topic} Should You Buy?", "{topic} Head to Head: The Winner Surprised Me"],
    hooks: ["Everyone asks me which one to get. Today we settle it with real tests, not opinions."],
  },
  {
    id: "cheapest",
    name: "The cheapest one",
    blurb: "Buying the cheapest version there is",
    group: "test",
    type: "Hero",
    test: re(/\bcheapest\b/, /\b(i bought|buying) (a|the) \$\d/),
    patterns: ["I Bought the Cheapest {topic} on Amazon", "The Cheapest {topic} in the World", "I Tested the Cheapest {topic} I Could Find", "Is the Cheapest {topic} Any Good?"],
    hooks: ["This is the cheapest {topic} I could find. It cost {low}. Let's see what you actually get."],
  },
  {
    id: "most-expensive",
    name: "The most expensive one",
    blurb: "The priciest version, and whether it's worth it",
    group: "test",
    type: "Hero",
    test: re(/\bmost expensive\b/, /\bworld'?s (most )?expensive\b/, /\b(million|billion)[- ]dollar\b/),
    patterns: ["I Bought the Most Expensive {topic}", "The Most Expensive {topic} in the World", "Is a {high} {topic} Worth It?", "Inside the World's Most Expensive {topic}"],
    hooks: ["This {topic} costs {high}. I wanted to know what that kind of money actually gets you."],
  },
  {
    id: "time-challenge",
    name: "Days of…",
    blurb: "Doing one thing for a set number of days or hours",
    group: "challenge",
    type: "Hero",
    test: re(/\b(for|in|after|over)\s+(\d+|one|a|two|three|seven|ten|thirty|hundred)\s+(hours?|days?|weeks?|months?|years?|minutes?|nights?)\b/, /\b\d+\s+(hours?|days?|weeks?|months?)\s+(of|with|in|living|eating|using|without)\b/),
    patterns: ["I Tried {topic} for {duration}", "{duration} of {topic}: Here's What Happened", "I Only Used {topic} for {duration}", "{duration} With {topic}. Was It Worth It?"],
    hooks: ["For the next {duration} I'm using nothing but {topic}. Here's what happened to me."],
  },
  {
    id: "last-to-leave",
    name: "Last to leave",
    blurb: "Whoever lasts longest wins",
    group: "challenge",
    type: "Hero",
    test: re(/\blast to (leave|stop|survive|let go|stay|lose)\b/, /\blast one (to|standing)\b/),
    patterns: ["Last to Leave the {topic} Wins", "Last to Stop Using {topic} Wins {high}", "Last One Standing: {topic} Edition"],
    hooks: ["Whoever stays the longest wins {high}. Nobody expected it to take this long."],
  },
  {
    id: "survive",
    name: "Survival",
    blurb: "Can someone make it through it?",
    group: "challenge",
    type: "Hero",
    test: re(/\bsurviv(e|ed|ing|al)\b/),
    patterns: ["I Survived {duration} With Only {topic}", "Can You Survive on {topic} Alone?", "Surviving {duration} in a {topic}"],
    hooks: ["I gave myself {duration} and nothing but {topic}. Day one went wrong almost immediately."],
  },
  {
    id: "living-on",
    name: "Living on a budget",
    blurb: "Getting by on a tiny amount",
    group: "challenge",
    type: "Hero",
    test: re(/\bliving on \$|\bon \$\d+ a day\b|\b\$\d+ a day\b|\bsurviving on\b|\bwith (only )?\$\d+\b|\bon a \$?\d*\s?budget\b|\bunder \$\d+\b/),
    patterns: ["Living on {low} of {topic} for a Week", "The Best {topic} Under {low}", "I Built a {topic} Setup With Only {low}", "{topic} on a {low} Budget"],
    hooks: ["I had {low}. That's it. Here's how far that gets you with {topic}."],
  },
  {
    id: "challenge",
    name: "Challenge",
    blurb: "A dare with rules and stakes",
    group: "challenge",
    type: "Hero",
    test: re(/\bchallenge\b/, /\bi dare\b/),
    patterns: ["The {topic} Challenge", "I Tried the Viral {topic} Challenge", "{topic} Challenge: Winner Takes {high}"],
    hooks: ["The rules are simple. The first one to finish the {topic} challenge takes everything."],
  },
  {
    id: "i-tested",
    name: "I tested it",
    blurb: "Putting a claim or product through real tests",
    group: "test",
    type: "Help",
    test: re(/\b(i|we) (tested|test)\b/, /^testing\b/, /\btesting (viral|tiktok|amazon|cheap|every|the)\b/),
    patterns: ["I Tested {topic} So You Don't Have To", "I Tested Every {topic}", "Testing Viral {topic} Hacks", "I Tested a {low} {topic}", "I Tested {topic} for {duration}"],
    hooks: ["Everyone says {topic} is worth it. I tested it properly, and the numbers say something else."],
  },
  {
    id: "i-tried",
    name: "I tried it",
    blurb: "Trying something yourself and reporting back",
    group: "test",
    type: "Help",
    test: re(/\b(i|we) tried\b/, /^trying\b/, /\btrying (every|the|viral|out)\b/),
    patterns: ["I Tried {topic} for the First Time", "I Tried the Viral {topic}", "I Tried Every {topic} So You Don't Have To", "I Tried {topic} for {duration}"],
    hooks: ["I'd never tried {topic} before today. By the end I understood why everyone's talking about it."],
  },
  {
    id: "every",
    name: "Every single one",
    blurb: "Trying, ranking or buying all of them",
    group: "list",
    type: "Hero",
    test: re(/\b(tried|tested|ranking|ranked|rating|rated|reviewing|reviewed|bought|buying|eating|ate|trying|testing|played|playing|unboxing) every\b/, /\bevery [a-z0-9]+ (ever|in the world|ranked)\b/),
    patterns: ["I Tried Every {topic}", "Ranking Every {topic} From Worst to Best", "I Bought Every {topic} on Amazon", "Every {topic} Ever Made, Ranked"],
    hooks: ["I bought every single {topic} I could find. One of them was so much better than the rest."],
  },
  {
    id: "tier-list",
    name: "Tier list / ranking",
    blurb: "From worst to best, with a verdict for each",
    group: "list",
    type: "Hub",
    test: re(/\btier list\b/, /\branking\b/, /\branked\b/, /\b(i|we) rank(ed)?\b/, /\bworst to best\b/, /\bbest to worst\b/),
    patterns: ["{topic} Tier List", "Ranking Every {topic} From Worst to Best", "I Ranked {n} {topics}", "{topics} Ranked: The Winner Isn't Who You Think"],
    hooks: ["I ranked every {topic} from worst to best. Number one is going to start arguments."],
  },
  {
    id: "top-n",
    name: "Top list",
    blurb: "A numbered list: things, reasons, ways",
    group: "list",
    type: "Help",
    test: re(/^(top )?\d{1,3}\s+(best|worst|things|ways|reasons|mistakes|tips|signs|facts|secrets|habits|items|products|gadgets|apps|games|movies|places|tricks|hacks|rules|lessons|myths|features|settings|accessories|tools)\b/, /^top \d+/),
    patterns: ["{n} {topic} Tips Nobody Tells You", "{n} Things I Wish I Knew Before Buying a {topic}", "{n} {topic} Mistakes Everyone Makes", "Top {n} {topics} of {year}"],
    hooks: ["Number {n} on this list is the one almost everyone gets wrong."],
  },
  {
    id: "mistakes",
    name: "Mistakes",
    blurb: "What people get wrong, and how not to",
    group: "teach",
    type: "Help",
    test: re(/\bmistakes?\b/, /\bdon'?t make\b/, /\bstop doing\b/, /\byou'?re doing it wrong\b/, /\bdoing it wrong\b/),
    patterns: ["{n} {topic} Mistakes Everyone Makes", "Stop Making These {topic} Mistakes", "You're Using Your {topic} Wrong", "The Biggest {topic} Mistake (and How to Fix It)"],
    hooks: ["If you own a {topic}, you're probably making at least one of these mistakes. I was too."],
  },
  {
    id: "dont-buy",
    name: "Don't buy until…",
    blurb: "A warning before someone spends money",
    group: "teach",
    type: "Help",
    test: re(/\bdon'?t buy\b/, /\bdo not buy\b/, /\bbefore you buy\b/, /\bwatch (this )?before (you )?(buy|buying)\b/, /\bstop buying\b/),
    patterns: ["Don't Buy a {topic} Before Watching This", "Watch This Before You Buy a {topic}", "Stop Buying {topics}", "Don't Make This {topic} Mistake"],
    hooks: ["Before you spend {high} on a {topic}, give me two minutes. It could save you a lot."],
  },
  {
    id: "worth-it",
    name: "Is it worth it?",
    blurb: "An honest verdict on whether to bother",
    group: "teach",
    type: "Help",
    test: re(/\bworth it\b/, /\bis it worth\b/, /\bworth (the|buying|the money|the hype)\b/, /\boverrated\b/, /\bunderrated\b/),
    patterns: ["Is the {topic} Worth It in {year}?", "{topic}: Worth the Hype?", "Is {topic} Overrated?", "{topic} After {duration}: Was It Worth It?"],
    hooks: ["Everyone's buying a {topic} right now. After living with one, here's my honest answer."],
  },
  {
    id: "review",
    name: "Honest review",
    blurb: "A real verdict after real use",
    group: "test",
    type: "Help",
    test: re(/\breview\b/, /\bhonest (opinion|thoughts)\b/, /\bafter \d+ (days|weeks|months|years)\b/, /\blong[- ]term\b/),
    patterns: ["{topic} Review: The Honest Truth", "{topic} After {duration}: My Honest Review", "{topic} Long-Term Review", "The {topic} Review Nobody Else Will Give You"],
    hooks: ["I've used the {topic} every day for {duration}. Here's what the other reviews didn't tell you."],
  },
  {
    id: "unboxing",
    name: "Unboxing",
    blurb: "Opening something new on camera",
    group: "test",
    type: "Hub",
    test: re(/\bunbox(ing|ed)?\b/, /\bmystery box\b/),
    patterns: ["Unboxing the {topic}", "I Bought a {topic} Mystery Box", "Unboxing the Cheapest vs Most Expensive {topic}"],
    hooks: ["This box showed up this morning and I have no idea what's inside. Let's open it together."],
  },
  {
    id: "truth",
    name: "The truth about…",
    blurb: "What's really going on behind something",
    group: "reveal",
    type: "Help",
    test: re(/\b(the )?truth about\b/, /\bthe real reason\b/, /\bwhat (they|nobody|no one) (don'?t |won'?t )?tells? you\b/, /\bnobody (talks|tells)\b/, /\bthe dark side\b/, /\bthe problem with\b/),
    patterns: ["The Truth About {topic}", "The Real Reason {topics} Are So Expensive", "What Nobody Tells You About {topic}", "The Problem With {topic}"],
    hooks: ["There's something about {topic} that almost nobody talks about. Once you see it, you can't unsee it."],
  },
  {
    id: "scam",
    name: "Scam / exposed",
    blurb: "Calling out a scam or a lie",
    group: "reveal",
    type: "Help",
    test: re(/\bscams?\b/, /\bscammers?\b/, /\bexpos(ed|ing)\b/, /\bfraud\b/, /\bripped off\b/, /\bthey lied\b/),
    patterns: ["The {topic} Scam Nobody Talks About", "I Got Scammed Buying a {topic}", "Exposing the {topic} Industry", "Don't Fall for This {topic} Scam"],
    hooks: ["Thousands of people fall for this {topic} scam every day. Here's exactly how it works."],
  },
  {
    id: "secrets",
    name: "Secrets / hidden features",
    blurb: "Things most people don't know about",
    group: "reveal",
    type: "Help",
    test: re(/\bsecrets?\b/, /\bhidden (features?|tricks?|settings?|gems?)\b/, /\bnobody knows\b/, /\byou didn'?t know\b/, /\bdidn'?t know (about|existed)\b/),
    patterns: ["{n} Hidden {topic} Features You Didn't Know", "{topic} Secrets the Pros Use", "The Secret {topic} Trick Nobody Uses", "Things Your {topic} Can Do That You Didn't Know"],
    hooks: ["Your {topic} has a setting most people never find. It changes everything."],
  },
  {
    id: "hacks",
    name: "Hacks and tips",
    blurb: "Quick tricks that make something better",
    group: "teach",
    type: "Help",
    test: re(/\bhacks?\b/, /\btips\b/, /\btricks\b/, /\blife ?hacks?\b/),
    patterns: ["{n} {topic} Hacks That Actually Work", "{topic} Tips I Wish I Knew Sooner", "Testing Viral {topic} Hacks", "{n} Genius {topic} Tricks"],
    hooks: ["I tested the most viral {topic} hacks. Most of them don't work. These do."],
  },
  {
    id: "how-to",
    name: "How to",
    blurb: "A tutorial: how to do it, step by step",
    group: "teach",
    type: "Help",
    test: re(/^how to\b/, /\bhow to (make|get|use|fix|build|start|choose|clean|grow|cook|learn|save|win|beat|set up|setup)\b/, /\btutorial\b/, /\bstep[- ]by[- ]step\b/, /\bguide\b/),
    patterns: ["How to Choose the Right {topic}", "How to Get the Most Out of Your {topic}", "The Complete {topic} Guide for Beginners", "How to Use a {topic} Like a Pro"],
    hooks: ["By the end of this video you'll know exactly how to get the most out of your {topic}, even if you're starting from zero."],
  },
  {
    id: "how-works",
    name: "How it works",
    blurb: "Explaining how something is made or works",
    group: "teach",
    type: "Help",
    test: re(/\bhow (does |do )?[a-z0-9' ]+ (work|works|is made|are made|really works)\b/, /\bhow it'?s made\b/, /\binside (the|a|an)\b/),
    patterns: ["How Does a {topic} Actually Work?", "How {topics} Are Made", "Inside a {topic}: How It Really Works", "What's Inside a {low} {topic}?"],
    hooks: ["You use a {topic} every day, but have you ever wondered what's actually happening inside?"],
  },
  {
    id: "explained",
    name: "Explained",
    blurb: "Making a complicated thing simple",
    group: "teach",
    type: "Help",
    test: re(/\bexplained\b/, /\bexplain(ing|s)?\b/, /\bin \d+ minutes\b/, /\bsimply\b/),
    patterns: ["{topic} Explained in {n} Minutes", "{topic} Explained Simply", "Everything You Need to Know About {topic}", "{topic}, Explained"],
    hooks: ["{topic} sounds complicated. In the next few minutes it won't be."],
  },
  {
    id: "why",
    name: "Why…?",
    blurb: "Answering a big why question",
    group: "teach",
    type: "Help",
    test: re(/^why\b/, /\bwhy (you|i|we|nobody|no one|everyone|people|this|these|is|are|do|does|did)\b/),
    patterns: ["Why Everyone Is Buying {topics}", "Why {topics} Are So Expensive", "Why I Stopped Using My {topic}", "Why Nobody Talks About {topic}"],
    hooks: ["There's a reason everyone is suddenly talking about {topic}, and it isn't the one you think."],
  },
  {
    id: "what-happens",
    name: "What happens if…",
    blurb: "An experiment with a big question",
    group: "challenge",
    type: "Hero",
    test: re(/\bwhat happens (if|when)\b/, /\bwhat if\b/, /\bwhat would happen\b/),
    patterns: ["What Happens If You Use a {topic} Every Day?", "What Happens When You Buy the Cheapest {topic}?", "What If You Only Used a {topic} for {duration}?"],
    hooks: ["I always wondered what would happen if you pushed a {topic} to the limit. So I did."],
  },
  {
    id: "experiment",
    name: "Experiment",
    blurb: "Setting something up and seeing what happens",
    group: "challenge",
    type: "Hero",
    test: re(/\bexperiment\b/, /\bi (let|asked|gave|paid|made) (my|a|an|\d+|strangers|people|subscribers)\b/, /\bsocial experiment\b/),
    patterns: ["I Let My Subscribers Choose My {topic}", "I Gave Strangers a {topic}", "The {topic} Experiment", "I Asked {n} Experts About {topic}"],
    hooks: ["I set up a simple experiment with {topic}. The results were not what anyone expected."],
  },
  {
    id: "i-paid",
    name: "I paid / I hired",
    blurb: "Paying someone (often cheap vs pricey) to do it",
    group: "test",
    type: "Hero",
    test: re(/\bi (paid|hired)\b/, /\bfiverr\b/, /\bhired (a|an)\b/),
    patterns: ["I Paid {low} vs {high} for a {topic}", "I Hired a Pro to Fix My {topic}", "I Paid Strangers on Fiverr to Make My {topic}"],
    hooks: ["I paid three people very different amounts for the same {topic}. The cheapest one surprised me."],
  },
  {
    id: "i-built",
    name: "I built it",
    blurb: "Making something from scratch",
    group: "build",
    type: "Hero",
    test: re(/^(i|we) (built|made|created|designed|turned|converted)\b/, /\b(i|we) built\b/, /\bdiy\b/, /\bfrom scratch\b/, /\bhomemade\b/),
    patterns: ["I Built My Own {topic}", "I Turned a {low} {topic} Into a {high} One", "Building the Ultimate {topic}", "I Made a {topic} From Scratch"],
    hooks: ["I had {duration} and a budget of {low} to build the best {topic} I could. Here's how it went."],
  },
  {
    id: "transformation",
    name: "Transformation",
    blurb: "Before and after: an upgrade or makeover",
    group: "build",
    type: "Hero",
    test: re(/\btransform(ation|ed|ing)?\b/, /\bmakeover\b/, /\bbefore (and|&) after\b/, /\bglow[- ]?up\b/, /\bupgrad(e|ed|ing)\b/),
    patterns: ["{topic} Transformation: Before and After", "I Upgraded My {topic} for {low}", "The Ultimate {topic} Makeover", "Turning a Cheap {topic} Into a Dream {topic}"],
    hooks: ["This is what my {topic} looked like last week. Wait until you see it at the end."],
  },
  {
    id: "restoration",
    name: "Restoration / repair",
    blurb: "Bringing something broken back to life",
    group: "build",
    type: "Hero",
    test: re(/\brestor(e|ed|ing|ation)\b/, /\brebuil(d|t|ding)\b/, /\brepair(ing|ed)?\b/, /\bfix(ing|ed)? (a|my|this|the|an)\b/, /\babandoned\b/),
    patterns: ["Restoring a Broken {topic}", "I Fixed a {topic} Everyone Gave Up On", "Can I Repair This {low} {topic}?", "Rebuilding an Abandoned {topic}"],
    hooks: ["Someone was about to throw this {topic} away. Let's see if it can be saved."],
  },
  {
    id: "story",
    name: "Story / rise and fall",
    blurb: "How it began, what happened, how it ended",
    group: "story",
    type: "Hero",
    test: re(/\brise and fall\b/, /\bthe story of\b/, /\bwhat happened to\b/, /\bdownfall\b/, /\buntold\b/, /\bthe (insane|crazy|strange|bizarre|tragic) story\b/, /\bhow (a|one|this) .{0,40} (became|destroyed|built|lost)\b/),
    patterns: ["The Rise and Fall of {topic}", "What Happened to {topic}?", "The Untold Story of {topic}", "How {topic} Took Over the World"],
    hooks: ["A few years ago everyone wanted a {topic}. Then something happened that nobody saw coming."],
  },
  {
    id: "day-in-life",
    name: "A day in the life",
    blurb: "Following someone through their day",
    group: "story",
    type: "Hub",
    test: re(/\bday in (the|my) life\b/, /\b24 hours (with|as|in|at)\b/, /\bmy (morning|night|daily) routine\b/),
    patterns: ["A Day in the Life of a {topic} Owner", "24 Hours With a {topic}", "My Daily {topic} Routine"],
    hooks: ["This is what a real day with a {topic} looks like, from the moment I wake up."],
  },
  {
    id: "worlds-biggest",
    name: "World's biggest / first",
    blurb: "A record: the biggest, smallest, fastest, first",
    group: "challenge",
    type: "Hero",
    test: re(/\bworld'?s (biggest|largest|smallest|first|fastest|strongest|longest|tallest|heaviest|loudest|hottest|deadliest|best|worst|most)\b/, /\bthe (biggest|largest|smallest|fastest) [a-z0-9]+ (ever|in the world)\b/, /\bgiant\b/),
    patterns: ["I Made the World's Biggest {topic}", "The World's Smallest {topic}", "The Fastest {topic} Ever Made", "World's First {topic} Like This"],
    hooks: ["Nobody has ever made a {topic} this big. We're about to find out why."],
  },
  {
    id: "guess",
    name: "Can you tell?",
    blurb: "A guessing game the viewer plays along with",
    group: "challenge",
    type: "Hub",
    test: re(/\bcan you (tell|guess|spot|find|beat|solve|pass|name)\b/, /\bguess (the|which|who|what|how)\b/, /\bquiz\b/, /\bspot the\b/, /\bwhich one is\b/),
    patterns: ["Can You Tell Which {topic} Is Fake?", "Guess the Price of These {topics}", "Spot the Real {topic}", "Only 1% Can Tell Which {topic} Is Better"],
    hooks: ["Pause the video and make your guess now. Most people get this one wrong."],
  },
  {
    id: "reaction",
    name: "Reaction",
    blurb: "Watching something and reacting to it",
    group: "react",
    type: "Hub",
    test: re(/\breact(s|ing|ed)? to\b/, /\breactions?\b/, /\bresponding to\b/, /\bresponds? to\b/),
    patterns: ["Reacting to the Worst {topic} Advice", "Pro Reacts to Viral {topic} Videos", "Responding to {topic} Comments"],
    hooks: ["Someone sent me this {topic} video and I can't stay quiet about it."],
  },
  {
    id: "myth",
    name: "Myths busted",
    blurb: "Checking whether common beliefs are true",
    group: "reveal",
    type: "Help",
    test: re(/\bmyths?\b/, /\bdebunk(ed|ing)?\b/, /\bdoes it (really|actually) work\b/, /\bactually works?\b/, /\bfact or fiction\b/),
    patterns: ["{topic} Myths That Need to Die", "Does {topic} Actually Work?", "Debunking {n} {topic} Myths", "{topic}: Fact or Fiction?"],
    hooks: ["You've probably heard at least one of these {topic} myths. I tested them all."],
  },
  {
    id: "buying-guide",
    name: "Buying guide",
    blurb: "Which one to get, for whom, at what price",
    group: "teach",
    type: "Help",
    test: re(/\bbuying guide\b/, /\bwhich [a-z0-9 ]+ should (you|i) (buy|get|choose)\b/, /\bbest [a-z0-9 ]+ (in|for|of) (19|20)\d\d\b/, /\bbest [a-z0-9 ]+ to buy\b/, /\b(what|which) to buy\b/),
    patterns: ["Best {topic} to Buy in {year}", "Which {topic} Should You Buy?", "The Only {topic} Buying Guide You Need", "Best {topics} for Every Budget"],
    hooks: ["There are dozens of {topics} out there. By the end of this video you'll know which one is right for you."],
  },
  {
    id: "first-time",
    name: "First time",
    blurb: "Doing something for the very first time",
    group: "story",
    type: "Hub",
    test: re(/\bfirst time\b/, /\bfor the first time\b/, /\bnever (done|tried|seen) (this|it|a) before\b/),
    patterns: ["Trying {topic} for the First Time", "My First Time With a {topic}", "First Time Using a {topic} (Honest Reaction)"],
    hooks: ["I've never touched a {topic} before today. Let's see how bad this goes."],
  },
  {
    id: "impossible",
    name: "Impossible",
    blurb: "Attempting something that sounds impossible",
    group: "challenge",
    type: "Hero",
    test: re(/\bimpossible\b/, /\bcan'?t be (done|beaten|broken)\b/, /\bnobody can\b/),
    patterns: ["The Impossible {topic} Challenge", "Doing the Impossible With a {topic}", "They Said This {topic} Was Impossible"],
    hooks: ["Everyone told me this was impossible with a {topic}. I had to try anyway."],
  },
  {
    id: "news",
    name: "News and leaks",
    blurb: "What just happened, or what's coming",
    group: "react",
    type: "Hub",
    test: re(/\bnews\b/, /\bleak(ed|s)?\b/, /\bjust (announced|dropped|got|happened|changed)\b/, /\bbreaking\b/, /\bis (finally )?here\b/, /\bit'?s over\b/),
    patterns: ["The {topic} News Nobody Expected", "{topic} Just Changed Everything", "Everything Leaked About the New {topic}", "It's Official: {topic} Is Here"],
    hooks: ["Something big just happened with {topic}, and it affects more people than you think."],
  },
  {
    id: "quit",
    name: "I quit / switched",
    blurb: "Leaving something, or switching to something else",
    group: "story",
    type: "Hub",
    test: re(/\bi quit\b/, /\bquitting\b/, /\bi'?m (leaving|done|switching)\b/, /\bi switched\b/, /\bgoodbye\b/, /\bwhy i (left|stopped|switched|quit|sold)\b/),
    patterns: ["Why I Switched From My {topic}", "I Quit Using My {topic}. Here's Why", "Goodbye {topic}", "I Sold My {topic} After {duration}"],
    hooks: ["After {duration} with my {topic}, I'm done. Here's what finally made me switch."],
  },
  {
    id: "hidden-details",
    name: "Details you missed",
    blurb: "Spotting the small things everyone missed",
    group: "reveal",
    type: "Hub",
    test: re(/\bdetails? (you|everyone) missed\b/, /\beaster eggs?\b/, /\bthings you missed\b/, /\byou (probably )?missed\b/, /\bhidden details?\b/),
    patterns: ["{n} {topic} Details You Missed", "Hidden Details in the New {topic}", "Things You Missed About {topic}"],
    hooks: ["Everyone looked at the {topic}, but almost nobody noticed this."],
  },
  {
    id: "story-time",
    name: "Story time / POV",
    blurb: "A personal story told straight to camera",
    group: "story",
    type: "Hub",
    test: re(/\bstory ?time\b/, /\bpov\b/, /\bthe time i\b/, /\bi was (scammed|robbed|fired|banned|arrested)\b/),
    patterns: ["Story Time: My Worst {topic} Experience", "POV: You Just Bought a {topic}", "The Time a {topic} Almost Ruined My Life"],
    hooks: ["This happened to me last month, and I still can't believe how it ended."],
  },
];

export const FORMAT_BY_ID = new Map(FORMATS.map((f) => [f.id, f]));

/** Every format a title matches, most specific first (at most 4). */
export function detectFormats(title: string): string[] {
  const t = fold(title);
  const out: string[] = [];
  for (const f of FORMATS) {
    if (out.length >= 4) break;
    // A generic "vs" is only a format when nothing more specific already says it's a comparison.
    if (f.id === "versus" && out.some((x) => ["cheap-vs-expensive", "fake-vs-real", "beginner-vs-pro", "n-vs-n"].includes(x))) continue;
    if (f.test(t)) out.push(f.id);
  }
  return out;
}

export const formatName = (id: string) => FORMAT_BY_ID.get(id)?.name ?? id;

export const GROUP_NAME: Record<FormatGroup, string> = {
  compare: "Comparisons",
  test: "Tests and reviews",
  challenge: "Challenges",
  story: "Stories",
  teach: "Explainers and how-tos",
  list: "Lists and rankings",
  reveal: "Reveals",
  react: "Reactions and news",
  build: "Builds and makeovers",
};

// ---------------------------------------------------------------------------
// Title traits: little facts about a title, kept as bits on each video
// ---------------------------------------------------------------------------

export type Trait = { id: string; bit: number; name: string; test: (raw: string, t: string) => boolean };

const SUPERLATIVES = /\b(best|worst|cheapest|biggest|smallest|fastest|strongest|craziest|richest|scariest|hardest|easiest|longest|most|least|ultimate|greatest|insane|worst)\b/;
const NEGATIVE = /\b(never|don'?t|stop|worst|mistakes?|wrong|fail(ed|s)?|scams?|avoid|warning|regret|ruined|dead|dying|over|broke|bad|terrible|horrible|lied?)\b/;
const CURIOSITY = /\b(this|secret|truth|nobody|no one|actually|finally|revealed|hidden|weird|strange|why|shocking|surprising|unexpected|crazy|insane)\b|\.\.\.|…/;

export const TRAITS: Trait[] = [
  { id: "number", bit: 1 << 0, name: "A number", test: (_r, t) => /\d/.test(t) },
  { id: "money", bit: 1 << 1, name: "A price", test: (_r, t) => /[$€£¥₹]\s?\d|\b\d[\d,.]*\s?(k\s)?(ron|lei|eur|usd|dollars?|euros?|bucks)\b/.test(t) },
  { id: "question", bit: 1 << 2, name: "A question", test: (_r, t) => t.includes("?") },
  { id: "exclaim", bit: 1 << 3, name: "An exclamation mark", test: (_r, t) => t.includes("!") },
  { id: "brackets", bit: 1 << 4, name: "Brackets", test: (_r, t) => /[([][^)\]]{2,}[)\]]/.test(t) },
  { id: "caps", bit: 1 << 5, name: "A word in CAPS", test: (r) => /\b[A-Z]{3,}\b/.test(r.replace(/\b(USA|UK|EU|PC|TV|AI|NBA|NFL|GTA|DIY|ASMR|CEO|FBI|CIA|NASA|USB|HDMI|RGB|LED|OLED|SSD|GPU|CPU|RAM|VR|AR|EV|SUV|PS\d|IOS|MRBEAST)\b/g, "")) },
  { id: "first", bit: 1 << 6, name: "I / my", test: (_r, t) => /(^|\s)(i|i'm|i've|i'd|my|me|we|our)\b/.test(t) },
  { id: "you", bit: 1 << 7, name: "You / your", test: (_r, t) => /\b(you|your|you're|yourself)\b/.test(t) },
  { id: "vs", bit: 1 << 8, name: "vs", test: (_r, t) => /\b(vs\.?|versus)\b/.test(t) },
  { id: "superlative", bit: 1 << 9, name: "A superlative", test: (_r, t) => SUPERLATIVES.test(t) },
  { id: "time", bit: 1 << 10, name: "A time span", test: (_r, t) => /\b\d+\s?(hours?|days?|weeks?|months?|years?|minutes?|h)\b/.test(t) },
  { id: "year", bit: 1 << 11, name: "A year", test: (_r, t) => /\b(19[5-9]\d|20[0-4]\d)\b/.test(t) },
  { id: "split", bit: 1 << 12, name: "Two parts (: or -)", test: (_r, t) => /\s[-|:]\s|:\s/.test(t) },
  { id: "emoji", bit: 1 << 13, name: "An emoji", test: (r) => /\p{Extended_Pictographic}/u.test(r) },
  { id: "negative", bit: 1 << 14, name: "A warning word", test: (_r, t) => NEGATIVE.test(t) },
  { id: "curiosity", bit: 1 << 15, name: "A curiosity word", test: (_r, t) => CURIOSITY.test(t) },
  { id: "starts-question-word", bit: 1 << 16, name: "Starts with how / why / what", test: (_r, t) => /^(how|why|what|who|which|when|where|can|is|are|do|does|should)\b/.test(t) },
  { id: "hashtag", bit: 1 << 17, name: "A hashtag", test: (_r, t) => /#[a-z]/.test(t) },
  { id: "starts-number", bit: 1 << 18, name: "Starts with a number", test: (_r, t) => /^(top )?\d/.test(t) },
  { id: "short-title", bit: 1 << 19, name: "Short (under 40 characters)", test: (r) => r.trim().length < 40 },
  { id: "long-title", bit: 1 << 20, name: "Long (70+ characters)", test: (r) => r.trim().length >= 70 },
];

export const TRAIT_BY_ID = new Map(TRAITS.map((t) => [t.id, t]));

/** A title's traits as one number (each trait one bit). */
export function traitBits(title: string): number {
  const t = fold(title);
  let bits = 0;
  for (const tr of TRAITS) if (tr.test(title, t)) bits |= tr.bit;
  return bits;
}

/** The traits a number stands for. */
export function traitsOf(bits: number): Trait[] {
  return TRAITS.filter((t) => (bits & t.bit) !== 0);
}
