import test from "node:test";
import assert from "node:assert/strict";
import {
  amountToCents,
  centsToInput,
  expenseTotal,
  validMonth,
} from "../src/expense-ui.mjs";

test("money input stays exact across fractional amounts and credits", () => {
  assert.equal(amountToCents("0.29"), 29);
  assert.equal(amountToCents("-100.01"), -10001);
  assert.equal(
    expenseTotal({ salary: "0.10", fixed: "0.20", other1: "-0.29" }),
    1,
  );
  assert.equal(centsToInput(-10001), "-100.01");
});

test("incomplete or excessive precision never becomes a misleading total", () => {
  for (const value of ["-", "1.001", "1e2", "NaN", "900719925474099.99"])
    assert.equal(amountToCents(value), null);
  assert.equal(expenseTotal({ salary: "0.001" }), null);
  assert.equal(amountToCents(""), 0);
  assert.equal(amountToCents("12."), 1200);
});

test("month range accepts only real months in the supported years", () => {
  for (const value of ["2000-01", "2026-10", "2100-12"])
    assert.equal(validMonth(value), true);
  for (const value of [
    "1999-12",
    "2101-01",
    "2026-00",
    "2026-13",
    "2026-1",
    "",
  ])
    assert.equal(validMonth(value), false);
});
