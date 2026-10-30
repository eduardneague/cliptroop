/**
 * Business (1.42.0): what the server says back (a save that couldn't happen, a check that failed), in the page's
 * language: the actions read it from the page's cookie (LANG_COOKIE). Pure, so tests/business.test.ts checks every
 * pair is whole.
 */
import { nOf, words } from "./i18n";

export const MSG = words({
  // Who's asking.
  migration: { en: "Run migration 0120 first.", ro: "Rulează mai întâi migrarea 0120." },
  noAccess: { en: "Only the team's owner and the people they choose open Business.", ro: "Contabilitatea o pot deschide doar proprietarul echipei și persoanele alese de acesta." },
  viewOnly: {
    en: "You can look at the registers, but not change them. Ask the team's owner for edit access.",
    ro: "Poți vedea registrele, dar nu le poți modifica. Cere-i proprietarului echipei drept de editare.",
  },
  session: { en: "Your session expired. Sign in again.", ro: "Sesiunea a expirat. Conectează-te din nou." },
  teamNotFound: { en: "Team not found.", ro: "Echipa nu a fost găsită." },
  accessCheck: { en: "Couldn't check your access. Try again.", ro: "Accesul nu s-a putut verifica. Încearcă din nou." },
  // Reading.
  someBooks: { en: "Some of the books couldn't be read. Refresh to try again.", ro: "Unele registre nu s-au putut citi. Reîncarcă pagina pentru a încerca din nou." },
  readTeam: { en: "Couldn't read the team.", ro: "Echipa nu s-a putut citi." },
  readAccess: { en: "Couldn't read who has access.", ro: "Nu s-a putut citi cine are acces." },
  readHistory: { en: "Couldn't read the history.", ro: "Istoricul nu s-a putut citi." },
  readBooks: { en: "Couldn't read the books. Try again.", ro: "Registrele nu s-au putut citi. Încearcă din nou." },
  // What the database said.
  closedYear: { en: "That year is closed. Reopen it in Business → Settings to change it.", ro: "Anul e închis. Redeschide-l din Contabilitate → Setări ca să-l poți modifica." },
  cantMove: { en: "That can't move to another team.", ro: "Nu se poate muta în altă echipă." },
  dupe: { en: "There's one like it already.", ro: "Există deja unul la fel." },
  missingRef: { en: "Something it points at isn't there any more. Refresh and try again.", ro: "Un element la care face referire nu mai există. Reîncarcă pagina și încearcă din nou." },
  notAllowed: { en: "Some of it isn't allowed. Check the fields and try again.", ro: "Unele valori nu sunt permise. Verifică câmpurile și încearcă din nou." },
  removeFailed: { en: "Couldn't remove it. Try again.", ro: "Nu s-a putut șterge. Încearcă din nou." },
  saveIt: { en: "Couldn't save it. Try again.", ro: "Nu s-a putut salva. Încearcă din nou." },
  changeIt: { en: "Couldn't change it. Try again.", ro: "Nu s-a putut modifica. Încearcă din nou." },
  // The PFA.
  pfaName: { en: "Write the PFA's name, as it is on its registration certificate.", ro: "Scrie denumirea PFA, așa cum apare pe certificatul de înregistrare." },
  cuiFormat: { en: "A CUI is 2 to 10 digits (RO in front only if it's VAT registered).", ro: "CUI-ul are între 2 și 10 cifre (cu RO în față doar dacă e plătitor de TVA)." },
  cashNegative: { en: "Cash on hand can't be below zero.", ro: "Numerarul din casă nu poate fi negativ." },
  entriesBefore: {
    en: (day: string, first: string) => `There are entries from before ${day}. Pick a day on or before the first one (${first}).`,
    ro: (day: string, first: string) => `Există operațiuni înainte de ${day}. Alege o zi care să nu fie după prima dintre ele (${first}).`,
  },
  openingClosed: { en: "The opening balances carry into a closed year. Reopen it first.", ro: "Soldurile inițiale se reportează într-un an închis. Redeschide-l mai întâi." },
  saveDetails: { en: "Couldn't save the details. Try again.", ro: "Datele nu s-au putut salva. Încearcă din nou." },
  caenLong: {
    en: "The activity is longer than this database takes (80 characters): run migration 0121, then save again.",
    ro: "Activitatea e mai lungă decât acceptă baza de date (80 de caractere): rulează migrarea 0121, apoi salvează din nou.",
  },
  // Income sources.
  sourceName: { en: "Give the source a name (“Content creation”, “Copyright”…).", ro: "Dă un nume sursei („Creare de conținut”, „Drepturi de autor”…)." },
  saveSource: { en: "Couldn't save the source. Try again.", ro: "Sursa nu s-a putut salva. Încearcă din nou." },
  sourceGone: { en: "That source isn't there any more.", ro: "Sursa nu mai există." },
  sourceInUse: {
    en: "Entries use this source, so it stays. Archive it instead: it's kept for them, not offered for new ones.",
    ro: "Sursa e folosită de operațiuni, așa că rămâne. Arhiveaz-o: se păstrează pentru ele, dar nu mai apare la cele noi.",
  },
  // Entries.
  checkEntry: { en: "Check the entry.", ro: "Verifică operațiunea." },
  addEntry: { en: "Couldn't add the entry. Try again.", ro: "Operațiunea nu s-a putut adăuga. Încearcă din nou." },
  entryGone: { en: "That entry isn't there any more.", ro: "Operațiunea nu mai există." },
  readEntry: { en: "Couldn't read the entry. Try again.", ro: "Operațiunea nu s-a putut citi. Încearcă din nou." },
  sayWhat: { en: "Say what it was (the register's Explanation).", ro: "Scrie ce a fost (rubrica Explicații din registru)." },
  yearClosedReopen: { en: (y: number) => `${y} is closed. Reopen it in Settings to change it.`, ro: (y: number) => `Anul ${y} e închis. Redeschide-l din Setări ca să-l poți modifica.` },
  saveChange: { en: "Couldn't save the change. Try again.", ro: "Modificarea nu s-a putut salva. Încearcă din nou." },
  reversedStays: {
    en: "A later line reverses this one, so its amount and column stay. Change the words, or reverse it and add it again.",
    ro: "O operațiune ulterioară o stornează, așa că suma și coloana rămân. Modifică doar explicațiile sau storneaz-o și adaug-o din nou.",
  },
  reversalOne: { en: "A later line reverses that one: remove the reversal too (or first).", ro: "O operațiune ulterioară o stornează: șterge și stornarea (sau mai întâi pe ea)." },
  reversalMany: {
    en: "Later lines reverse some of these: remove those reversals too (or first).",
    ro: "Unele dintre ele sunt stornate de operațiuni ulterioare: șterge și stornările (sau mai întâi pe ele).",
  },
  pickCorrectionDay: { en: "Pick the day of the correction.", ro: "Alege ziua stornării." },
  addCorrection: { en: "Couldn't add the correction. Try again.", ro: "Stornarea nu s-a putut adăuga. Încearcă din nou." },
  nothingToAdd: { en: "Nothing to add.", ro: "Nimic de adăugat." },
  tooManyLines: { en: "At most 2,000 lines at once. Paste them in parts.", ro: "Cel mult 2.000 de rânduri deodată. Lipește-le în mai multe etape." },
  lineProblem: { en: (line: number, problem: string) => `Line ${line}: ${problem}`, ro: (line: number, problem: string) => `Rândul ${line}: ${problem}` },
  linesNeedLook: { en: (n: number) => `${nOf("en", n, ["line needs", "lines need"], ["", ""])} a look.`, ro: (n: number) => `${nOf("ro", n, ["", ""], ["rând", "rânduri"])} de verificat.` },
  addedThen: { en: (n: number) => `${n} added; then: `, ro: (n: number) => `Adăugate: ${n}; apoi: ` },
  addThem: { en: "Couldn't add them. Try again.", ro: "Nu s-au putut adăuga. Încearcă din nou." },
  // BNR.
  pickCurrencyDay: { en: "Pick the currency and the day first.", ro: "Alege întâi moneda și ziua." },
  noFutureRate: { en: "BNR has no rate for a day that hasn't come yet.", ro: "BNR nu publică un curs pentru o zi viitoare." },
  noRate: {
    en: (cur: string) => `BNR doesn't publish a rate for ${cur} on that day. Type the rate yourself.`,
    ro: (cur: string) => `BNR nu publică un curs pentru ${cur} în acea zi. Scrie cursul de mână.`,
  },
  bnrDown: { en: "Couldn't reach BNR just now. Type the rate yourself, or try again.", ro: "BNR nu răspunde acum. Scrie cursul de mână sau încearcă din nou." },
  // Fixed assets.
  inventoryNo: { en: "Give it an inventory number (MF-1, 001…).", ro: "Dă-i un număr de inventar (MF-1, 001…)." },
  assetName: { en: "Name the asset.", ro: "Scrie denumirea mijlocului fix." },
  assetDates: { en: "When was it bought, and when did it go into use?", ro: "Când a fost cumpărat și când a fost pus în funcțiune?" },
  useBeforeBuy: { en: "It can't go into use before it was bought.", ro: "Nu poate fi pus în funcțiune înainte de a fi cumpărat." },
  entryValue: {
    en: "Its entry value, in lei (the invoice's, VAT included unless you're VAT registered).",
    ro: "Valoarea de intrare, în lei (cea de pe factură, cu TVA inclusă dacă nu ești plătitor de TVA).",
  },
  usefulLife: { en: "Its useful life, in months (from the catalogue: a laptop 24 to 48).", ro: "Durata normală de funcționare, în luni (din catalog: un laptop 24–48)." },
  degressiveLife: { en: "Declining balance needs a life of two years or more.", ro: "Amortizarea degresivă se aplică doar pentru o durată de cel puțin doi ani." },
  acceleratedLife: { en: "Accelerated needs a life of more than a year.", ro: "Amortizarea accelerată se aplică doar pentru o durată de peste un an." },
  leftBeforeUse: { en: "It can't leave before it went into use.", ro: "Nu poate ieși din gestiune înainte de punerea în funcțiune." },
  saveAsset: { en: "Couldn't save the asset. Try again.", ro: "Mijlocul fix nu s-a putut salva. Încearcă din nou." },
  invNoTaken: { en: (no: string) => `Inventory number ${no} is taken. Pick another.`, ro: (no: string) => `Numărul de inventar ${no} e deja folosit. Alege altul.` },
  assetGone: { en: "That asset isn't there any more.", ro: "Mijlocul fix nu mai există." },
  assetLinked: {
    en: "Entries point at this asset (its purchase or sale). Unlink them first, or write down that it left (sold or scrapped).",
    ro: "Există operațiuni legate de acest mijloc fix (cumpărarea sau vânzarea lui). Desfă mai întâi legătura sau înregistrează ieșirea din gestiune (vândut sau casat).",
  },
  // Inventories.
  pickInvDay: { en: "Pick the inventory's day.", ro: "Alege data inventarului." },
  startInventory: { en: "Couldn't start the inventory. Try again.", ro: "Inventarul nu s-a putut crea. Încearcă din nou." },
  invSameDay: { en: "There's an inventory on that day already.", ro: "Există deja un inventar la acea dată." },
  invLinesFailed: {
    en: "The inventory started, but its lines from the books didn't. Add them by hand.",
    ro: "Inventarul a fost creat, dar rândurile preluate din registre nu s-au adăugat. Adaugă-le manual.",
  },
  inventoryGone: { en: "That inventory isn't there any more.", ro: "Inventarul nu mai există." },
  whatCounted: { en: "What was counted?", ro: "Ce s-a inventariat?" },
  itemValue: { en: "Its value, in lei (zero or more).", ro: "Valoarea, în lei (zero sau mai mult)." },
  whichInventory: { en: "Which inventory?", ro: "Care inventar?" },
  saveLine: { en: "Couldn't save the line. Try again.", ro: "Rândul nu s-a putut salva. Încearcă din nou." },
  lineGone: { en: "That line isn't there any more.", ro: "Rândul nu mai există." },
  // The fiscal register's own lines, years.
  refLabel: { en: "Say what it is (“Products received from Brand X, at market value”).", ro: "Scrie ce este („Produse primite de la brandul X, la valoarea de piață”)." },
  refAmount: { en: "An amount in lei (below zero to correct one down).", ro: "O sumă în lei (negativă pentru o corectare în minus)." },
  whichYear: { en: "Which year?", ro: "Care an?" },
  whichSource: { en: "Which income source's page?", ro: "Pe pagina cărei surse de venit?" },
  changeYear: { en: "Couldn't change the year. Try again.", ro: "Anul nu s-a putut modifica. Încearcă din nou." },
  // Documents.
  fileFor: { en: "Which entry or asset is it for?", ro: "Pentru ce operațiune sau mijloc fix este?" },
  fileWrongPlace: { en: "That file isn't in the right place. Upload it again.", ro: "Fișierul nu e la locul potrivit. Încarcă-l din nou." },
  fileTypes: { en: "PDFs, pictures (JPEG, PNG, WebP, HEIC) and e-Factura XML only.", ro: "Doar PDF-uri, imagini (JPEG, PNG, WebP, HEIC) și XML e-Factura." },
  fileSize: { en: "At most 20 MB a file.", ro: "Cel mult 20 MB pe fișier." },
  keepFile: { en: "Couldn't keep the file. Try again.", ro: "Fișierul nu s-a putut păstra. Încearcă din nou." },
  fileGone: { en: "That file isn't there any more.", ro: "Fișierul nu mai există." },
  openFile: { en: "Couldn't open the file. Try again.", ro: "Fișierul nu s-a putut deschide. Încearcă din nou." },
  // Access.
  accessChange: { en: "Couldn't change that. Refresh and try again.", ro: "Nu s-a putut schimba. Reîncarcă pagina și încearcă din nou." },
  ownerDecides: { en: "Only the team's owner decides who sees Business.", ro: "Doar proprietarul echipei decide cine are acces la Contabilitate." },
  youreOwner: { en: "You're the owner: you always see and change it.", ro: "Ești proprietarul: ai oricând acces complet." },
  notOnTeam: { en: "They're not on the team any more.", ro: "Persoana nu mai face parte din echipă." },
  backupRead: { en: "Couldn't read everything for the backup. Try again.", ro: "Nu s-a putut citi tot pentru copia de siguranță. Încearcă din nou." },
});
