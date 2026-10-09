import "server-only";

/*
 * The daily word's answers, in the order they come up (one a day from
 * puzzle #1, then round again): 790 common five-letter words, nothing grim.
 * Our own list, not the New York Times' Wordle answers (those are their
 * puzzle, and using them would spoil Wordle for anyone who plays both).
 * Server only: the browser never gets the list.
 */
export const ANSWERS: readonly string[] = [
  "prior crawl print knife doubt kayak fancy grape broad cabin alarm robot heart decay shirt taste",
  "gleam stone crane topic comic board party asset vivid squad blend press speak salad scale least",
  "belly flash moist cloth check alone lemon fifty glare globe maybe chill cigar plead chord ocean",
  "proof pilot strap noble crash range humor forty image entry table pinch ought novel pedal plain",
  "haven first spray stage glass spend alter tower shiny cover quest raise depth speed cheap audit",
  "brown waist skirt sight chess slice tough among still drive diary model bench camel train shown",
  "minor peach bride pitch jewel chalk melon video haste bunch lease heavy crazy shift truth baker",
  "point groan grind mount quiet reply tutor force align thank quilt along doing cycle bagel chunk",
  "input visit quite blind skate hound phase green stack relay vocal flesh known troop sauce youth",
  "noise stove leave shake shock theme fluid worry break fruit drill olive small limit trick which",
  "ahead crest drank thumb essay merge adopt brush mango diner fresh dizzy power anger shelf arena",
  "blame candy lucky uncle prove mirth order smart prime study pause strip yacht offer blank cheer",
  "sugar prize eager found sweet pixel linen bless chief legal burst slate twice shine plumb earth",
  "daily queen clear token sunny cheek spell lodge coral bread while civic jolly rigid phone dryer",
  "bloom forum hover stamp ounce couch bonus stake buyer avoid elbow scope apple awful daisy nerve",
  "naive teach month quote punch flame stain field joint poser peace pouch juice creek perch delay",
  "honey child robin rouge forth bacon gauge penny sheep teeth ideal upset verse risky labor rinse",
  "trend crust boast grill tulip ready stare crowd suite horse armor scarf smell zebra ghost today",
  "eagle ultra title large panic twist woman march index wrist below catch hedge mouse total otter",
  "plate frame bound right dress dairy widen drain lover truly proud ridge round grave berry harsh",
  "crisp coach claim broom realm close click tiger given light style whale flock tried onion sweep",
  "greet batch laugh crown fifth yield logic local birth serve grand maple space cable rally wheat",
  "feast yeast magic unity pride nylon drift surge merit apart laser trial graph plant dough album",
  "every elite genre grade clash sharp award grasp blaze alert slide tribe track swamp apply black",
  "champ dream beast taken syrup fried adult truck reach spark mixer craft class wagon piece beard",
  "chain niece floor knock sound quota orbit drink enter snake stern fully spike amber fence river",
  "photo shore boost young funny whole write debut stand frost guest rumor motor faint choir brain",
  "straw vapor notch alive empty giant sense outer admit chest brook inner chase trail super float",
  "steam house exist width night elect start blade often glove stuck shade layer cloud level short",
  "three build world irony block store guard woven fetch oasis solid wheel steel court salon pluck",
  "amend think event route piano drama under hello smile group grass might error rebel react north",
  "argue vital match trust tempo oxide polar voice spine panel whisk venue storm ferry plume dealt",
  "dried after white quick third eight pulse urban angle owner alien sleep false fairy stick rival",
  "shell trunk hotel fight scene drone lunch probe curve draft glory shout beach extra cargo wedge",
  "toast adapt blink elder coast sword plane habit other comet brake where breed charm loyal threw",
  "lunar torch slope usage basin brick scoop usual chair paper watch bring rugby lower worth pupil",
  "about never digit again trade pearl lever great cobra forge radio angry tight carry maker fever",
  "later spare vault place flour hurry until ripen grove fault brave aware opera touch faith allow",
  "learn patch delta stock liver mouth guide viral spice state fable erase chart staff metal juicy",
  "grain badge sheet drawn minus treat donor scent ranch climb cause issue purse paint loose vigor",
  "equip silly plaza upper shark snack array spoon towel shape count acute wrong clean cliff agent",
  "water puppy merry scare pizza alike sweat thick fiber scrap seven clerk ruler cider mercy enjoy",
  "timer rapid arise trace cedar refer sport share clock eaten above aside flint steep equal cocoa",
  "swing relax ankle basic flood foggy weave blown favor jelly weary story money dense since easel",
  "rural focus setup price newly trait color moral booth rider stood angel crack fudge rocky porch",
  "pound agree guess built nurse midst roast thing drove ratio movie south thorn skill solve gravy",
  "human scout blast early smoke dance music royal arrow rough score media clamp major paste begin",
  "there grace medal happy flute brand being those brief canoe grant glide ivory dodge cross solar",
  "organ hobby going radar screw actor pasta mayor cream crumb stair final label hinge meter honor",
  "fleet vinyl audio swift exact judge",
]
  .join(" ")
  .split(" ");
