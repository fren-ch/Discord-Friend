const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(answers) {
  const calls = [];
  const context = {
    module: { exports: {} },
    process: { env: { GEMINI_API_KEY: "test" } },
    require(name) {
      if (name === "node:crypto") return { randomInt: () => 0 };
      if (name === "@google/genai") return { GoogleGenAI: class {} };
      if (name === "./checkInPolicy") return require("../src/ai/checkInPolicy");
      if (name === "../limits/requestLimits") return {
        async generateWithLimit(client, params) {
          calls.push(params);
          const answer = answers.shift();
          if (answer instanceof Error) throw answer;
          return { output_text: answer };
        },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/ai/gemini.js"), "utf8"), context);
  return { ...context.module.exports, calls };
}

const character = { name: "Juuni", personality: "Curious and friendly" };
const previous = "Hey, how has your day been going?";
const fresh = "If you could visit any planet, which one would you pick?";

test("separate check-in memory prevents repeats after chat history moves on", async () => {
  const bot = setup([previous, fresh]);
  const history = Array.from({ length: 30 }, (_, i) => ({ role: "user", content: `New conversation ${i}` }));
  assert.equal(await bot.generateCharacterCheckIn(character, history, [{ content: previous }]), fresh);
  assert.equal(bot.calls.length, 2);
  assert.ok(bot.calls[0].system_instruction.includes(previous));
  assert.match(bot.calls[1].system_instruction, /Rejected duplicate drafts/);
});

test("case, punctuation, and small wording changes are rejected", async () => {
  const bot = setup(["HEY! HOW HAS YOUR DAY BEEN GOING...", "Hey, how has your day been going today?", fresh]);
  assert.equal(await bot.generateCharacterCheckIn(character, [], [{ content: previous }]), fresh);
  assert.equal(bot.calls.length, 3);
});

test("skips sending when all three generated drafts repeat", async () => {
  const bot = setup([previous, previous, previous]);
  await assert.rejects(bot.generateCharacterCheckIn(character, [], [{ content: previous }]), /duplicate character check-in/);
  assert.equal(bot.calls.length, 3);
});

test("older conversations without separate memory avoid recent assistant replies", async () => {
  const bot = setup([previous, fresh]);
  assert.equal(await bot.generateCharacterCheckIn(character, [{ role: "assistant", content: previous }]), fresh);
  assert.equal(bot.calls.length, 2);
});

test("new conversations accept a fresh draft without retrying", async () => {
  const bot = setup([fresh]);
  assert.equal(await bot.generateCharacterCheckIn(character, []), fresh);
  assert.equal(bot.calls.length, 1);
});

test("service failures still reach the scheduler instead of sending a fallback", async () => {
  const bot = setup([new Error("Service unavailable")]);
  await assert.rejects(bot.generateCharacterCheckIn(character, []), /Service unavailable/);
  assert.equal(bot.calls.length, 1);
});
