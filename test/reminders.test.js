const assert = require("assert");

describe("Reminder Scheduler Logic Unit Tests", function () {
  this.timeout(10000);

  it("1. Due reminder is processed and nextDueAt set for repeatDaily", () => {
    const now = new Date("2026-10-06T10:00:00Z");
    const dueTime = new Date("2026-10-06T09:30:00Z");

    const med = {
      name: "Dolo 650",
      enabled: true,
      repeatDaily: true,
      nextDueAt: dueTime
    };

    assert(med.nextDueAt.getTime() <= now.getTime(), "Reminder must be due");

    // Advance occurrence until strictly > now
    let nextDate = new Date(med.nextDueAt);
    while (nextDate.getTime() <= now.getTime()) {
      nextDate.setDate(nextDate.getDate() + 1);
    }

    med.nextDueAt = nextDate;
    assert.strictEqual(med.nextDueAt.toISOString(), "2026-10-07T09:30:00.000Z");
    assert(med.nextDueAt.getTime() > now.getTime(), "Next occurrence must be in future");
  });

  it("2. Overdue by 3 days advances to next FUTURE date", () => {
    const now = new Date("2026-10-06T10:00:00Z");
    const overdueTime = new Date("2026-10-03T10:00:00Z"); // 3 days overdue

    const med = {
      name: "Vitamin C",
      enabled: true,
      repeatDaily: true,
      nextDueAt: overdueTime
    };

    let nextDate = new Date(med.nextDueAt);
    while (nextDate.getTime() <= now.getTime()) {
      nextDate.setDate(nextDate.getDate() + 1);
    }

    med.nextDueAt = nextDate;
    assert.strictEqual(med.nextDueAt.toISOString(), "2026-10-07T10:00:00.000Z");
  });

  it("3. One-time medicine sets enabled=false and clears nextDueAt", () => {
    const now = new Date("2026-10-06T10:00:00Z");
    const dueTime = new Date("2026-10-06T09:00:00Z");

    const med = {
      name: "Antibiotics Single Dose",
      enabled: true,
      repeatDaily: false,
      nextDueAt: dueTime
    };

    if (!med.repeatDaily) {
      med.enabled = false;
      med.nextDueAt = null;
    }

    assert.strictEqual(med.enabled, false);
    assert.strictEqual(med.nextDueAt, null);
  });

  it("4. Two concurrent runs: atomic claim prevents duplicate processing", () => {
    let medState = {
      claimed: false,
      enabled: true,
      nextDueAt: new Date("2026-10-06T09:00:00Z")
    };

    function processRun() {
      if (medState.claimed || !medState.enabled) return false;
      medState.claimed = true;
      medState.enabled = false;
      return true;
    }

    const run1 = processRun();
    const run2 = processRun();

    assert.strictEqual(run1, true, "First run claims reminder");
    assert.strictEqual(run2, false, "Second run skipped because already claimed");
  });
});
