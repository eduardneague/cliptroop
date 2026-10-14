// The team's win streak (1.18.0): periods in a row with a goal reached, in
// the shortest period the goals use; the best run; days since the last win.
import { inARow, streakLine, streakUnit, winDay, winStreak, type StreakObjective, type StreakWin } from "../modules/objectives/lib/streak";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const obj = (id: string, period: string, createdDay: string, paused = false): StreakObjective => ({ id, period, createdDay, paused });
const win = (day: string, objectiveId = "w"): StreakWin => ({ objectiveId, day });

// The unit: the shortest period the active goals use.
ok(streakUnit([obj("a", "month", "2026-01-01"), obj("b", "week", "2026-01-01")]) === "week", "weeks beat months");
ok(streakUnit([obj("a", "day", "2026-01-01", true), obj("b", "week", "2026-01-01")]) === "week", "a paused daily goal doesn't make it daily");
ok(streakUnit([obj("a", "day", "2026-01-01", true)]) === "day", "all paused: still counted in their period");
ok(streakUnit([]) === null, "no goals, no streak");
ok(winStreak({ today: "2026-10-13", objectives: [], wins: [], off: [] }) === null, "no goals: null");

// Weeks (Monday to Sunday). Today: Tue Oct 13 2026, week of Oct 12.
const weekly = [obj("w", "week", "2026-08-31")];
// Won the weeks of Sep 14, Sep 21, (missed Sep 28), Oct 5; this week not yet.
const s1 = winStreak({ today: "2026-10-13", objectives: weekly, wins: [win("2026-09-15"), win("2026-09-24"), win("2026-10-06"), win("2026-10-09")], off: [] })!;
ok(s1.unit === "week", "weekly");
ok(s1.current === 1 && !s1.safe, `one week in a row, this one still open (got ${s1.current})`);
ok(s1.best === 2 && s1.bestBefore === 2, `best: the two weeks in September (got ${s1.best})`);
ok(s1.sinceLast === 4 && s1.lastWinDay === "2026-10-09", `4 days since the last win (got ${s1.sinceLast})`);
ok(s1.since === "2026-10-05", `the run started the week of Oct 5 (got ${s1.since})`);
ok(s1.slots.length === 7 && s1.slots[6].start === "2026-10-12" && s1.slots[6].state === "open" && s1.slots[6].current, "the strip ends with this week, open");
ok(s1.slots[5].state === "won" && s1.slots[4].state === "missed" && s1.slots[5].wins === 2, "last week won (twice), the one before missed");
ok(s1.slots[0].start === "2026-08-31" && s1.slots[0].label === "31" && s1.slots[0].title === "Week of Aug 31", `week labels (got ${s1.slots[0].label} / ${s1.slots[0].title})`);
ok(s1.daysLeft === 6, `6 days left this week (got ${s1.daysLeft})`);
ok(streakLine(s1) === "Win this week to keep it going (6 days left).", `line: ${streakLine(s1)}`);

// A win this week: safe, and the streak grows.
const s2 = winStreak({ today: "2026-10-13", objectives: weekly, wins: [win("2026-09-15"), win("2026-09-24"), win("2026-10-06"), win("2026-10-13")], off: [] })!;
ok(s2.safe && s2.current === 2 && s2.sinceLast === 0 && s2.thisPeriod === 1, `won today: 2 in a row (got ${s2.current})`);
ok(s2.best === 2 && s2.bestBefore === 2, "equal to the best isn't a new best");
ok(inARow(s2) === "2 weeks in a row" && streakLine(s2) === "Won this week.", `words (${inARow(s2)} / ${streakLine(s2)})`);

// A new best.
const s3 = winStreak({ today: "2026-10-13", objectives: weekly, wins: [win("2026-09-29"), win("2026-10-06"), win("2026-10-12")], off: [] })!;
ok(s3.current === 3 && s3.bestBefore === 2 && s3.best === 3, `3 in a row beats 2 (got ${s3.current}/${s3.bestBefore})`);

// Missed last week: the streak is gone (this week still open).
const s4 = winStreak({ today: "2026-10-13", objectives: weekly, wins: [win("2026-09-29")], off: [] })!;
ok(s4.current === 0 && s4.since === null && s4.best === 1, "a missed week ends it");
ok(streakLine(s4) === "Win this week to start a new one (6 days left).", `line: ${streakLine(s4)}`);

// A week every weekly goal was switched off for doesn't break it.
const two = [obj("w", "week", "2026-08-31"), obj("v", "week", "2026-08-31")];
const s5 = winStreak({ today: "2026-10-13", objectives: two, wins: [win("2026-09-29"), win("2026-10-12")], off: [{ objectiveId: "w", start: "2026-10-05" }, { objectiveId: "v", start: "2026-10-05" }] })!;
ok(s5.current === 2 && s5.slots[5].state === "off", `a week off: still 2 in a row (got ${s5.current})`);
const s6 = winStreak({ today: "2026-10-13", objectives: two, wins: [win("2026-09-29"), win("2026-10-12")], off: [{ objectiveId: "w", start: "2026-10-05" }] })!;
ok(s6.current === 1 && s6.slots[5].state === "missed", "only one of them off: that week still counts as missed");

// Before the first weekly goal: neither breaks nor counts.
const late = [obj("w", "week", "2026-10-01")];
const s7 = winStreak({ today: "2026-10-13", objectives: late, wins: [win("2026-09-16"), win("2026-10-01"), win("2026-10-06"), win("2026-10-12")], off: [] })!;
ok(s7.current === 3 && s7.best === 3 && s7.slots[2].state === "before" && s7.slots[2].wins === 1 && s7.slots[3].state === "before" && s7.slots[4].state === "won", `starts with the goal (got ${s7.current}, ${s7.slots.map((x) => x.state).join(",")})`);

// Days: this week's days, Monday to Sunday, the rest to come.
const daily = [obj("d", "day", "2026-10-01"), obj("w", "week", "2026-09-01")];
const s8 = winStreak({ today: "2026-10-13", objectives: daily, wins: [win("2026-10-10"), win("2026-10-11"), win("2026-10-12")], off: [] })!;
ok(s8.unit === "day" && s8.current === 3 && !s8.safe, `3 days in a row, today open (got ${s8.current})`);
ok(s8.slots.map((x) => x.label).join("") === "MTWTFSS" && s8.slots[0].start === "2026-10-12", "Monday to Sunday");
ok(s8.slots[0].state === "won" && s8.slots[1].state === "open" && s8.slots[2].state === "future" && s8.slots[6].state === "future", s8.slots.map((x) => x.state).join(","));
ok(streakLine(s8) === "Win today to keep it going (until midnight).", `line: ${streakLine(s8)}`);
// A weekly goal reached today counts for the day too.
const s9 = winStreak({ today: "2026-10-13", objectives: daily, wins: [win("2026-10-12"), win("2026-10-13", "w")], off: [] })!;
ok(s9.current === 2 && s9.safe, "any win counts");
// A day off (the daily goal switched off) keeps it.
const s10 = winStreak({ today: "2026-10-13", objectives: [obj("d", "day", "2026-10-01")], wins: [win("2026-10-10"), win("2026-10-12")], off: [{ objectiveId: "d", start: "2026-10-11" }] })!;
ok(s10.current === 2, `a day off doesn't break it (got ${s10.current})`);
// Today switched off: it waits.
const s11 = winStreak({ today: "2026-10-13", objectives: [obj("d", "day", "2026-10-01")], wins: [win("2026-10-12")], off: [{ objectiveId: "d", start: "2026-10-13" }] })!;
ok(s11.current === 1 && streakLine(s11) === "Off today: the streak waits.", `today off (${streakLine(s11)})`);

// No win yet.
const s12 = winStreak({ today: "2026-10-13", objectives: weekly, wins: [], off: [] })!;
ok(s12.current === 0 && s12.best === 0 && s12.sinceLast === null && s12.total === 0, "nothing yet");
ok(streakLine(s12) === "The first goal reached starts it.", `line: ${streakLine(s12)}`);

// Months and the 30 days.
const s13 = winStreak({ today: "2026-10-13", objectives: [obj("m", "month", "2026-01-15")], wins: [win("2026-07-02"), win("2026-08-30"), win("2026-09-20"), win("2026-10-01")], off: [] })!;
ok(s13.unit === "month" && s13.current === 4 && s13.slots.length === 6 && s13.slots[5].label === "Oct", `4 months in a row (got ${s13.current})`);
ok(s13.wins30 === 2 && s13.total === 4, `2 wins in the last 30 days (got ${s13.wins30})`);

// A win day stays inside its period.
ok(winDay("2026-10-12", "2026-10-05", "2026-10-11") === "2026-10-11", "late numbers: the period's last day");
ok(winDay("2026-10-07", "2026-10-05", "2026-10-11") === "2026-10-07", "inside: that day");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("streak: all good");
