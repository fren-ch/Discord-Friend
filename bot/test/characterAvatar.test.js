const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function setup(answers) {
  const calls = [];
  const searches = [];
  const thumbnails = [];
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === "@google/genai") return { GoogleGenAI: class {} };
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
    process: { env: { GEMINI_API_KEY: "test", BRAVE_SEARCH_API_KEY: "test" } },
    console: { log() {}, warn() {}, info() {} },
    URL, URLSearchParams, AbortSignal, Buffer,
    async fetch(url) {
      if (new URL(url).hostname === "api.search.brave.com") {
        searches.push(new URL(url));
        return { ok: true, async json() {
          return { results: Array.from({ length: 10 }, (_, i) => ({
            thumbnail: { src: `https://imgs.search.brave.com/${i + 1}` },
          })) };
        } };
      }
      thumbnails.push(String(url));
      return {
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        body: (async function* () { yield Buffer.from("test-image"); })(),
      };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/ai/characterAvatar.js"), "utf8"), context);
  return { ...context.module.exports, calls, searches, thumbnails };
}

const character = { name: "Spunkbob", franchise: "Spongebob" };

test("normalizes supplied names and searches the second batch after rejection", async () => {
  const bot = setup(["SpongeBob SquarePants from SpongeBob SquarePants pfp", "none", "Image ID: 2"]);
  assert.equal(await bot.chooseCharacterAvatar(character), "https://imgs.search.brave.com/7");
  assert.equal(bot.searches[0].searchParams.get("q"), "SpongeBob SquarePants from SpongeBob SquarePants pfp");
  assert.equal(bot.searches[0].searchParams.get("spellcheck"), "true");
  assert.equal(bot.calls.length, 3);
  const profile = JSON.parse(bot.calls[1].input[0].text);
  assert.equal(profile.name, "Spunkbob");
  assert.equal(profile.searchQuery, bot.searches[0].searchParams.get("q"));
});

test("stops after the first verified selection", async () => {
  const bot = setup(["SpongeBob from SpongeBob SquarePants pfp", "1"]);
  assert.equal(await bot.chooseCharacterAvatar(character), "https://imgs.search.brave.com/1");
  assert.equal(bot.thumbnails.length, 5);
});

test("still fails when neither batch contains a verified avatar", async () => {
  const bot = setup(["SpongeBob from SpongeBob SquarePants pfp", "none", "none"]);
  await assert.rejects(bot.chooseCharacterAvatar(character), { name: "AvatarLookupError" });
  assert.equal(bot.calls.length, 3);
});

test("does not retry authentication failures as candidate rejections", async () => {
  const error = new Error("Unauthorized");
  const bot = setup(["SpongeBob from SpongeBob SquarePants pfp", error]);
  await assert.rejects(bot.chooseCharacterAvatar(character), (failure) => failure.cause === error);
  assert.equal(bot.calls.length, 2);
  assert.equal(bot.thumbnails.length, 5);
});
