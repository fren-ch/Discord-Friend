const { test } = require("node:test");
const assert = require("node:assert/strict");
const { LimitError, reserveAvatarLookup, reserveCreation } = require("../src/limits/requestLimits");

test("avatar lookups can repeat immediately but cannot overlap for one user", () => {
  const userId = `avatar-lookup-${Date.now()}-${Math.random()}`;
  const releaseFirst = reserveAvatarLookup(userId);
  assert.throws(() => reserveAvatarLookup(userId), LimitError);
  releaseFirst();

  const releaseSecond = reserveAvatarLookup(userId);
  releaseSecond();

  const releaseThird = reserveAvatarLookup(userId);
  releaseThird();
});

test("avatar lookups do not inherit the character creation cooldown", () => {
  const userId = `avatar-after-create-${Date.now()}-${Math.random()}`;
  const releaseCreation = reserveCreation(userId);
  releaseCreation();

  const releaseAvatarLookup = reserveAvatarLookup(userId);
  releaseAvatarLookup();
  assert.throws(() => reserveCreation(userId), LimitError);
});
