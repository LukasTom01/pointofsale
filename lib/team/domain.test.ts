// Testy doménové logiky modulu Tým: `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actualMinutes,
  attendanceTotals,
  canCheckIn,
  compareTasks,
  copyTargets,
  coverageByHour,
  doneAtFor,
  formatRange,
  isDueSoon,
  isOverdue,
  overlappingShiftIds,
  parseShiftTimes,
  parseTime,
  planDays,
  pragueInstant,
  pragueNow,
  quickTimes,
  reportPeriod,
  toHours,
  weekStart,
} from "./domain.ts";
import type { Task } from "./types.ts";

const task = (
  status: Task["status"],
  dueDate: string | null,
  createdAt: string,
  doneAt: string | null = null,
  dueTime: number | null = null,
): Task => ({
  id: createdAt, title: "t", note: null, status, dueDate, dueTime, eventId: null, assigneeIds: [], doneAt, createdAt, updatedAt: createdAt,
});

test("tasks: overdue, order, done_at", () => {
  const noon = { day: "2026-11-21", min: 12 * 60 };
  assert.equal(isOverdue({ status: "todo", dueDate: "2026-11-20", dueTime: null }, noon), true);
  assert.equal(isOverdue({ status: "todo", dueDate: "2026-11-21", dueTime: null }, noon), false);
  assert.equal(isOverdue({ status: "done", dueDate: "2026-11-01", dueTime: null }, noon), false);
  const sorted = [
    task("done", "2026-11-01", "1", "50"),
    task("todo", null, "5"),
    task("todo", "2026-11-30", "2"),
    task("doing", "2026-11-22", "3"),
    task("done", null, "1", "90"),
  ].sort(compareTasks);
  assert.deepEqual(sorted.map((t) => `${t.status}:${t.dueDate}`), [
    "doing:2026-11-22", "todo:2026-11-30", "todo:null", "done:null", "done:2026-11-01",
  ]);
  assert.equal(doneAtFor("done", null, "now"), "now");
  assert.equal(doneAtFor("done", "before", "now"), "before");
  assert.equal(doneAtFor("todo", "before", "now"), null);
});

test("shift times", () => {
  assert.equal(parseTime("8:00"), 480);
  assert.equal(parseTime("24:00"), 1440);
  assert.equal(parseTime("24:30"), null);
  assert.equal(formatRange(480, 840), "8:00–14:00");
  assert.deepEqual(parseShiftTimes("8:00", "14:00"), { startMin: 480, endMin: 840 });
  assert.equal(parseShiftTimes("14:00", "8:00"), null);
});

test("plan days", () => {
  assert.deepEqual(planDays({ eventFrom: "2027-06-19", eventTo: "2027-06-20", weekOf: "x" }), ["2027-06-19", "2027-06-20"]);
  assert.equal(planDays({ eventFrom: "2027-06-01", eventTo: "2027-07-30", weekOf: "x" }).length, 14);
  assert.equal(weekStart("2026-11-21"), "2026-11-16");
  assert.equal(planDays({ weekOf: "2026-11-21" })[6], "2026-11-22");
});

test("overlaps, quick times, coverage, copy", () => {
  const ids = overlappingShiftIds([
    { id: "a", staffId: "m", day: "d", startMin: 480, endMin: 840 },
    { id: "b", staffId: "m", day: "d", startMin: 800, endMin: 900 },
    { id: "c", staffId: "m", day: "d", startMin: 900, endMin: 960 },
    { id: "x", staffId: "n", day: "d", startMin: 480, endMin: 840 },
  ]);
  assert.deepEqual([...ids].sort(), ["a", "b"]);
  assert.deepEqual(
    quickTimes([{ startMin: 480, endMin: 840 }, { startMin: 840, endMin: 1200 }, { startMin: 480, endMin: 840 }]),
    [{ startMin: 480, endMin: 840 }, { startMin: 840, endMin: 1200 }],
  );
  const cov = coverageByHour([{ roleId: "bar", startMin: 480, endMin: 600 }, { roleId: "bar", startMin: 510, endMin: 540 }]);
  assert.deepEqual(cov.get("bar")?.slice(7, 11), [0, 2, 1, 0]);
  assert.deepEqual(copyTargets({ staffId: "m", day: "d1" }, ["m", "n"], ["2027-01-01"]), [
    { staffId: "m", day: "2027-01-01" },
    { staffId: "n", day: "2027-01-01" },
  ]);
  assert.deepEqual(copyTargets({ staffId: "m", day: "2027-01-01" }, [], ["2027-01-01"]), []);
});

test("attendance", () => {
  assert.equal(pragueInstant("2026-11-28", 480).toISOString(), "2026-11-28T07:00:00.000Z");
  assert.equal(pragueInstant("2027-06-19", 480).toISOString(), "2027-06-19T06:00:00.000Z");
  assert.equal(actualMinutes("2027-06-19T06:00:00Z", "2027-06-19T12:30:00Z"), 390);
  assert.equal(actualMinutes("2027-06-19T06:00:00Z", null), null);
  const totals = attendanceTotals([
    { staffId: "m", startMin: 480, endMin: 840, attendance: "present", checkInAt: "2027-06-19T06:05:00Z", checkOutAt: "2027-06-19T12:05:00Z" },
    { staffId: "m", startMin: 840, endMin: 1200, attendance: "absent", checkInAt: null, checkOutAt: null },
  ]).get("m");
  assert.deepEqual(totals, { staffId: "m", shifts: 2, plannedMin: 720, actualMin: 360, absent: 1 });
  assert.equal(toHours(90), 1.5);
  assert.equal(canCheckIn({ day: "2027-06-19", checkInAt: null }, "2027-06-19"), true);
  assert.equal(canCheckIn({ day: "2027-06-20", checkInAt: null }, "2027-06-19"), false);
  assert.deepEqual(reportPeriod({}, "2026-11-21", null), { from: "2026-11-01", to: "2026-11-21" });
  assert.deepEqual(reportPeriod({}, "2026-11-21", { dateFrom: "2027-06-19", dateTo: "2027-06-20" }), {
    from: "2027-06-19", to: "2027-06-20",
  });
});

test("tasks: due time, due soon, order by time", () => {
  const noon = { day: "2026-11-21", min: 12 * 60 };
  // s časem: po termínu od té minuty
  assert.equal(isOverdue({ status: "todo", dueDate: "2026-11-21", dueTime: 11 * 60 }, noon), true);
  assert.equal(isOverdue({ status: "todo", dueDate: "2026-11-21", dueTime: 12 * 60 }, noon), true);
  assert.equal(isOverdue({ status: "todo", dueDate: "2026-11-21", dueTime: 14 * 60 }, noon), false);
  // brzy: dnes (ještě v čase) až za 3 dny; ne po termínu, ne hotové, ne bez termínu
  assert.equal(isDueSoon({ status: "todo", dueDate: "2026-11-21", dueTime: 14 * 60 }, noon), true);
  assert.equal(isDueSoon({ status: "todo", dueDate: "2026-11-24", dueTime: null }, noon), true);
  assert.equal(isDueSoon({ status: "todo", dueDate: "2026-11-25", dueTime: null }, noon), false);
  assert.equal(isDueSoon({ status: "todo", dueDate: "2026-11-21", dueTime: 9 * 60 }, noon), false);
  assert.equal(isDueSoon({ status: "done", dueDate: "2026-11-22", dueTime: null }, noon), false);
  assert.equal(isDueSoon({ status: "todo", dueDate: null, dueTime: null }, noon), false);
  // stejný den: dřívější čas první, bez času na konec dne
  const order = [
    task("todo", "2026-11-22", "a"),
    task("todo", "2026-11-22", "b", null, 15 * 60),
    task("todo", "2026-11-22", "c", null, 9 * 60),
  ].sort(compareTasks).map((t) => t.id);
  assert.deepEqual(order, ["c", "b", "a"]);
});

test("pragueNow: den a minuta v české zóně", () => {
  // 21. 11. 2026 23:30 UTC = 22. 11. 0:30 v Praze (zimní čas)
  assert.deepEqual(pragueNow(new Date("2026-11-21T23:30:00Z")), { day: "2026-11-22", min: 30 });
  // léto: 1. 7. 10:15 UTC = 12:15 v Praze
  assert.deepEqual(pragueNow(new Date("2026-07-01T10:15:00Z")), { day: "2026-07-01", min: 12 * 60 + 15 });
});
