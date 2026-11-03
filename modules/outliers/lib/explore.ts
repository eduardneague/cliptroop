/*
 * The built-in explore niches (1.27.0): a little of every corner of YouTube,
 * collected for everyone, so "every niche" has formats to borrow even for a
 * team that follows one niche. Each is kept small (a few dozen channels).
 *
 * Since 1.29.0 each starts from well-known channels (`seeds`, their
 * @handles): YouTube's searches are scarce (100 a day for everything), a
 * channel's uploads aren't (1 unit for 50), so a niche fills from its seeds
 * within minutes and its keywords only add to it now and then. A handle
 * that doesn't answer, or answers with a small channel (someone else's
 * handle), is skipped.
 */

export type ExploreNiche = { slug: string; name: string; color: string; keywords: string[]; seeds: string[] };

export const EXPLORE: ExploreNiche[] = [
  { slug: "tech", name: "Tech and gadgets", color: "blue", keywords: ["tech review", "smartphone", "gadgets", "iphone"], seeds: ["@mkbhd", "@Mrwhosetheboss", "@LinusTechTips", "@UnboxTherapy", "@Dave2D", "@JerryRigEverything", "@ijustine", "@austinevans", "@SnazzyLabs", "@TheVerge", "@ShortCircuit", "@techlinked", "@GamersNexus", "@JayzTwoCents", "@HardwareCanucks", "@PhoneBuff", "@SuperSaf", "@MrMobile"] },
  { slug: "gaming", name: "Gaming", color: "violet", keywords: ["gaming", "minecraft", "fortnite", "gta"], seeds: ["@Markiplier", "@jacksepticeye", "@DanTDM", "@TheGameTheorists", "@IGN", "@Grian", "@MumboJumbo", "@CaptainSparklez", "@videogamedunkey", "@penguinz0", "@DigitalFoundry", "@SkillUp", "@MrBeastGaming", "@Ninja"] },
  { slug: "finance", name: "Personal finance", color: "green", keywords: ["personal finance", "investing", "make money", "stock market"], seeds: ["@GrahamStephan", "@AndreiJikh", "@MeetKevin", "@MinorityMindset", "@MoneyGuyShow", "@NateOBrien", "@HumphreyYang", "@MarkTilbury", "@ThePlainBagel", "@BenFelixCSI", "@CalebHammer", "@TheSwedishInvestor"] },
  { slug: "business", name: "Business", color: "teal", keywords: ["entrepreneur", "side hustle", "small business", "startup"], seeds: ["@AlexHormozi", "@garyvee", "@DanMartell", "@TheDiaryOfACEO", "@ColinandSamir", "@starterstory", "@VALUETAINMENT", "@HowMoneyWorks", "@CNBCMakeIt", "@BusinessInsider", "@ModernMBA"] },
  { slug: "food", name: "Food and cooking", color: "orange", keywords: ["cooking", "recipe", "food review", "street food"], seeds: ["@babishculinaryuniverse", "@JoshuaWeissman", "@NickDiGiovanni", "@GordonRamsay", "@JKenjiLopezAlt", "@EthanChlebowski", "@aragusea", "@SortedFood", "@bonappetit", "@MarkWiens", "@BestEverFoodReviewShow", "@GugaFoods", "@MaxtheMeatGuy"] },
  { slug: "fitness", name: "Fitness", color: "red", keywords: ["fitness", "workout", "gym", "weight loss"], seeds: ["@JeffNippard", "@athleanx", "@RenaissancePeriodization", "@WillTennyson", "@NatachaOceane", "@chloeting", "@GregDoucette", "@MattDoesFitness", "@JeremyEthier", "@FitnessFAQs", "@HybridCalisthenics"] },
  { slug: "travel", name: "Travel", color: "sky", keywords: ["travel vlog", "travel", "backpacking", "visiting"], seeds: ["@karaandnate", "@DrewBinsky", "@YesTheory", "@LostLeBlanc", "@EvaZuBeck", "@IndigoTraveller", "@baldandbankrupt", "@RickSteves", "@SamuelandAudrey", "@PeterSantenello"] },
  { slug: "science", name: "Science and learning", color: "indigo", keywords: ["science", "explained", "physics", "history documentary"], seeds: ["@veritasium", "@Vsauce", "@kurzgesagt", "@MarkRober", "@smartereveryday", "@CGPGrey", "@3blue1brown", "@minutephysics", "@SciShow", "@TomScottGo", "@RealEngineering", "@Wendoverproductions", "@pbsspacetime", "@StuffMadeHere", "@NileRed"] },
  { slug: "cars", name: "Cars", color: "slate", keywords: ["cars", "car review", "supercar", "car restoration"], seeds: ["@DougDeMuro", "@TheStraightPipes", "@SupercarBlondie", "@Shmee150", "@carwow", "@TopGear", "@DonutMedia", "@CleetusMcFarland", "@HooviesGarage", "@ChrisFix", "@EngineeringExplained", "@WhistlinDiesel", "@ThrottleHouse", "@mightycarmods"] },
  { slug: "diy", name: "DIY and building", color: "brown", keywords: ["diy", "woodworking", "home renovation", "building"], seeds: ["@colinfurze", "@LauraKampf", "@iliketomakestuff", "@JimmyDiResta", "@thisoldhouse", "@HomeRenoVisionDIY", "@EvanandKatelyn", "@AprilWilkerson", "@tested"] },
  { slug: "beauty", name: "Beauty and fashion", color: "pink", keywords: ["makeup", "skincare", "fashion haul", "outfit"], seeds: ["@jamescharles", "@NikkieTutorials", "@SafiyaNygaard", "@JackieAina", "@bretmanrock", "@mikaylanogueira", "@RobertWelsh", "@Hyram", "@AlexCosta", "@TeachingMensFashion", "@bestdressed"] },
  { slug: "challenges", name: "Challenges and entertainment", color: "gold", keywords: ["challenge", "last to leave", "experiment", "pranks"], seeds: ["@MrBeast", "@Airrack", "@RyanTrahan", "@BetaSquad", "@Sidemen", "@DudePerfect", "@MichelleKhare", "@ZHC", "@jesser", "@StokesTwins", "@Unspeakable"] },
  { slug: "true-crime", name: "True crime and mystery", color: "plum", keywords: ["true crime", "mystery", "unsolved", "documentary"], seeds: ["@BaileySarian", "@KendallRae", "@MrBallen", "@ThatChapter", "@Nexpo", "@BarelySociable", "@LEMMiNO", "@CoffeehouseCrime", "@JCSCriminalPsychology", "@Wendigoon", "@LazyMasquerade"] },
  { slug: "movies", name: "Movies and TV", color: "rose", keywords: ["movie review", "movie explained", "tv series", "film analysis"], seeds: ["@CinemaSins", "@Nerdwriter1", "@LessonsfromtheScreenplay", "@ChrisStuckmann", "@JeremyJahns", "@NewRockstars", "@CorridorCrew", "@RedLetterMedia", "@TheCriticalDrinker", "@ScreenRant", "@FoundFlix", "@CinemaWins", "@StudioBinder"] },
  { slug: "self-improvement", name: "Self-improvement", color: "mint", keywords: ["self improvement", "productivity", "motivation", "habits"], seeds: ["@aliabdaal", "@Thomasfrank", "@mattdavella", "@ImprovementPill", "@BetterIdeas", "@HealthyGamerGG", "@hubermanlab", "@Psych2go", "@theschooloflifetv", "@Charismaoncommand", "@IAmMarkManson"] },
  { slug: "real-estate", name: "Homes and real estate", color: "olive", keywords: ["real estate", "house tour", "tiny house", "apartment tour"], seeds: ["@EnesYilmazer", "@RyanSerhant", "@nevertoosmall", "@LivingBigInATinyHouse", "@Archdigest", "@kirstendirksen", "@kenmcelroy", "@BiggerPockets"] },
  { slug: "sports", name: "Sports", color: "navy", keywords: ["football", "basketball", "nba", "soccer"], seeds: ["@NBA", "@NFL", "@ESPN", "@BleacherReport", "@HouseofHighlights", "@JxmyHighroller", "@ThinkingBasketball", "@SecretBase", "@TifoFootball", "@FootballDaily", "@UFC"] },
  { slug: "animals", name: "Animals and nature", color: "lime", keywords: ["animals", "wildlife", "dog", "pets"], seeds: ["@TheDodo", "@BraveWilderness", "@Animalogic", "@zefrank1", "@NatGeoWild", "@bbcearth", "@JacksonGalaxy", "@thepetcollective"] },
  { slug: "music", name: "Music", color: "fuchsia", keywords: ["music producer", "guitar", "singing", "music theory"], seeds: ["@RickBeato", "@AdamNeely", "@12tone", "@AndrewHuang", "@MartyMusic", "@PaulDavids", "@NahreSol", "@CharlesCornell", "@Polyphonic", "@Genius", "@Tantacrul", "@ScottsBassLessons"] },
  { slug: "commentary", name: "Commentary and news", color: "coral", keywords: ["commentary", "drama", "internet culture", "news"], seeds: ["@penguinz0", "@InternetHistorian", "@Coffeezilla", "@PhilipDeFranco", "@SomeOrdinaryGamers", "@DannyGonzalez", "@DrewGooden", "@KurtisConner", "@EddyBurback", "@jarvis", "@johnnyharris", "@Vox"] },
  { slug: "art", name: "Art and design", color: "purple", keywords: ["art", "drawing", "painting", "graphic design"], seeds: ["@ProkoTV", "@Jazza", "@SinixDesign", "@thefutur", "@SatoriGraphics", "@WillPaterson", "@KaseyGolden", "@AlphonsoDunn", "@MarcBrunet"] },
  { slug: "film-making", name: "Photo and film-making", color: "cyan", keywords: ["photography", "filmmaking", "camera", "video editing"], seeds: ["@PeterMcKinnon", "@casey", "@MangoStreet", "@PotatoJet", "@MattiHaapoja", "@GeraldUndone", "@filmriot", "@KaiW", "@JamieWindsor", "@StudioBinder", "@SeanTucker"] },
  { slug: "outdoors", name: "Outdoors and survival", color: "aqua", keywords: ["survival", "camping", "bushcraft", "fishing"], seeds: ["@OutdoorBoys", "@TAOutdoors", "@MySelfReliance", "@CoalcrackerBushcraft", "@MeatEater", "@KentSurvival", "@JoeRobinet", "@JonB", "@LakeForkGuy", "@BlueGabe", "@CatfishandCarp"] },
  { slug: "ai", name: "AI and software", color: "yellow", keywords: ["ai tools", "coding", "programming", "chatgpt"], seeds: ["@TwoMinutePapers", "@Fireship", "@mreflow", "@aiexplained-official", "@WesRoth", "@aiadvantage", "@AndrejKarpathy", "@YannicKilcher", "@t3dotgg", "@NetworkChuck", "@TraversyMedia", "@freecodecamp", "@WebDevSimplified", "@TechWithTim", "@matthew_berman"] },
];

export const EXPLORE_BY_SLUG = new Map(EXPLORE.map((e) => [e.slug, e]));

/** A seed must be at least this big to be taken (a handle answered by a small channel is someone else's). */
export const SEED_MIN_SUBS = 100_000;

/** Colours a niche can have (the app's objective colours: they work in light and dark). */
export const NICHE_COLORS = ["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red", "teal", "sky", "indigo", "purple", "fuchsia", "rose", "peach", "lime", "mint", "cyan", "navy", "brown", "slate", "gold", "plum", "olive", "pink", "coral"] as const;

/** A niche colour as CSS (the objectives palette, else the app's own tokens). */
export function nicheColor(c: string | null | undefined): string {
  const known = new Set<string>(NICHE_COLORS);
  if (c === "pink") return "rgb(var(--pink))";
  if (c === "coral") return "rgb(var(--coral))";
  return known.has(c ?? "") ? `rgb(var(--obj-${c}))` : "rgb(var(--obj-blue))";
}
