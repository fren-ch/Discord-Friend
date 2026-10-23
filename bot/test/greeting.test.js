const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup({ answer = "The stars are bright tonight. Got a favorite constellation?", error, apiKey = "test" } = {}) {
  const calls = [];
  const warnings = [];
  let roll = 0;
  const context = {
    module: { exports: {} },
    process: { env: { GEMINI_API_KEY: apiKey } },
    console: { warn: (...args) => warnings.push(args) },
    require(name) {
      if (name === "node:crypto") return { randomInt: max => roll++ % max };
      if (name === "@google/genai") return { GoogleGenAI: class {} };
      if (name === "./checkInPolicy") return { getCheckInPolicy() {} };
      if (name === "../limits/requestLimits") return {
        async generateWithLimit(client, params, options) {
          calls.push({ params, options });
          if (error) throw error;
          return { output_text: answer };
        },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/ai/gemini.js"), "utf8"), context);
  return { ...context.module.exports, calls, warnings };
}

const character = {
  name: "Juuni", franchise: "Original", personality: "Curious and friendly",
  backstory: "An astronomy student", speakingStyle: "Thoughtful",
};

test("AI greeting uses the full profile and varies the opening guidance", async () => {
  const bot = setup();
  const greeting = await bot.generateCharacterGreeting(character);
  assert.equal(greeting, "The stars are bright tonight. Got a favorite constellation?");
  assert.deepEqual(JSON.parse(bot.calls[0].params.input), character);
  assert.equal(bot.calls[0].options.timeout, 15000);
  assert.match(bot.calls[0].params.system_instruction, /original greeting tailored to this individual character/);
  await bot.generateCharacterGreeting(character);
  assert.notEqual(bot.calls[0].params.system_instruction, bot.calls[1].params.system_instruction);
  assert.equal(bot.warnings.length, 0);
});

test("API failures, missing credentials, and unusable greetings return a fallback", async () => {
  for (const settings of [
    { error: new Error("Request timed out") },
    { error: new Error("The bot is busy") },
    { apiKey: "" },
    { answer: " \n " },
    { answer: null },
    { answer: "x".repeat(501) },
  ]) {
    const bot = setup(settings);
    const greeting = await bot.generateCharacterGreeting(character);
    assert.match(greeting, /Juuni/);
    assert.ok(greeting.length > 0 && greeting.length <= 500);
    assert.equal(bot.warnings.length, 1);
  }
});

test("fallback greetings are randomly selected and include each character's name", async () => {
  const bot = setup({ apiKey: "" });
  const greetings = new Set();
  for (let index = 0; index < 8; index++) {
    greetings.add(await bot.generateCharacterGreeting(character));
  }
  assert.equal(greetings.size, 8);
  assert.match(await bot.generateCharacterGreeting({ name: "Sonic" }), /Sonic/);
  assert.equal(bot.calls.length, 0);
});

test("a saved or custom greeting is reused without contacting Gemini", async () => {
  const bot = setup({ error: new Error("Must not contact Gemini") });
  assert.equal(await bot.generateCharacterGreeting({ ...character, greeting: "  A custom hello!  " }), "A custom hello!");
  assert.equal(bot.calls.length, 0);
  assert.equal(bot.warnings.length, 0);
});
