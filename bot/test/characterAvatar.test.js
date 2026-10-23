const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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
          const query = searches.at(-1).searchParams.get("q");
          return { results: Array.from({
            length: Number(searches.at(-1).searchParams.get("count")),
          }, (_, i) => ({
            thumbnail: {
              src: `https://imgs.search.brave.com/${
                query.includes("alternative")
                  ? (i === 0 ? 1 : i + 10)
                  : query.endsWith("pfp") ? i + 1 : i + 101
              }`,
            },
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

test("verifies and returns up to ten images from the pfp search", async () => {
  const bot = setup(["SpongeBob SquarePants from SpongeBob SquarePants pfp", "1, 10"]);
  assert.equal(
    (await bot.findCharacterAvatars(character)).join(","),
    "https://imgs.search.brave.com/1,https://imgs.search.brave.com/10"
  );
  assert.equal(bot.searches.length, 1);
  assert.equal(bot.searches[0].searchParams.get("q"), "SpongeBob SquarePants from SpongeBob SquarePants pfp");
  assert.equal(bot.searches[0].searchParams.get("count"), "10");
  assert.equal(bot.searches[0].searchParams.get("safesearch"), "strict");
  assert.equal(bot.searches[0].searchParams.get("spellcheck"), "true");
  assert.equal(bot.calls.length, 2);
  assert.equal(bot.thumbnails.length, 10);
  assert.match(bot.calls[1].system_instruction, /gameplay images/i);
  assert.equal(bot.calls[1].input.filter((part) => part.type === "image").length, 10);
});

test("broadens the search to artwork and screenshots when pfp yields no acceptable image", async () => {
  const bot = setup([
    "Joker from Persona 5 pfp",
    "none",
    "Joker from Persona 5 character portrait game screenshot",
    "1, 10",
  ]);
  assert.equal(
    (await bot.findCharacterAvatars({ name: "Joker", franchise: "Persona 5" })).join(","),
    "https://imgs.search.brave.com/101,https://imgs.search.brave.com/110"
  );
  assert.equal(bot.searches.length, 2);
  assert.match(bot.searches[1].searchParams.get("q"), /screenshot/);
  assert.match(bot.calls[2].system_instruction, /video game character/i);
});

test("fails when neither the pfp nor expanded search has a suitable image", async () => {
  const bot = setup([
    "SpongeBob from SpongeBob SquarePants pfp",
    "none",
    "SpongeBob from SpongeBob SquarePants character portrait artwork",
    "none",
  ]);
  await assert.rejects(bot.findCharacterAvatars(character), { name: "AvatarLookupError" });
  assert.equal(bot.calls.length, 4);
});

test("follow-up searches filter out image URLs already shown", async () => {
  const bot = setup([
    "Joker from Persona 5 pfp",
    "1, 2",
    "Joker from Persona 5 alternative artwork",
    "1, 3",
  ]);
  const firstBatch = await bot.findCharacterAvatars({ name: "Joker", franchise: "Persona 5" });
  const nextBatch = await bot.findCharacterAvatars(
    { name: "Joker", franchise: "Persona 5" },
    firstBatch
  );
  assert.equal(firstBatch.join(","), "https://imgs.search.brave.com/1,https://imgs.search.brave.com/2");
  assert.equal(nextBatch.join(","), "https://imgs.search.brave.com/11,https://imgs.search.brave.com/21");
  assert.match(bot.calls[2].system_instruction, /follow-up search/i);
  assert.match(bot.calls[2].system_instruction, /do not require a pfp.*any fixed category/i);
  assert.match(bot.calls[3].system_instruction, /prefer a varied spread across distinct images/i);
  assert.match(bot.calls[3].system_instruction, /merchandise, logos, or multi-character images/i);
  assert.match(bot.searches[1].searchParams.get("q"), /alternative/);
  assert.equal(bot.searches[1].searchParams.get("count"), "50");
  assert.equal(bot.searches[1].searchParams.get("safesearch"), "off");
  assert.equal(bot.thumbnails.length, 20);
});

test("does not broaden the search after a verification service error", async () => {
  const error = new Error("Unauthorized");
  const bot = setup(["SpongeBob from SpongeBob SquarePants pfp", error]);
  await assert.rejects(bot.findCharacterAvatars(character), (failure) => failure.cause === error);
  assert.equal(bot.calls.length, 2);
  assert.equal(bot.searches.length, 1);
  assert.equal(bot.thumbnails.length, 10);
});

test("remembers rejected images and excludes them before downloading on retry", async () => {
  const bot = setup([
    "Joker from Persona 5 pfp", "none",
    "Joker from Persona 5 character portrait artwork", "none",
    "Joker from Persona 5 alternative artwork", "1",
  ]);
  const checked = [];
  const remember = async urls => { checked.push(...urls); };
  await assert.rejects(bot.findCharacterAvatars(character, [], remember), { name: "AvatarLookupError" });
  assert.equal(checked.length, 20);
  const oldUrls = [...checked];
  const retryStart = bot.thumbnails.length;
  const selected = await bot.findCharacterAvatars(character, oldUrls, remember);
  assert.ok(selected.length > 0);
  assert.ok(bot.thumbnails.slice(retryStart).every(url => !oldUrls.includes(url)));
  assert.equal(checked.length, 30);
});

test("records checked candidates even if Gemini verification fails", async () => {
  const bot = setup(["Joker from Persona 5 pfp", new Error("Service unavailable")]);
  const checked = [];
  await assert.rejects(bot.findCharacterAvatars(character, [], async urls => checked.push(...urls)));
  assert.equal(checked.length, 10);
});

test("does not verify anything when all returned images were checked already", async () => {
  const bot = setup(["Joker from Persona 5 alternative artwork"]);
  const excluded = Array.from({ length: 60 }, (_, i) => `https://imgs.search.brave.com/${i}`);
  await assert.rejects(bot.findCharacterAvatars(character, excluded), { name: "AvatarLookupError" });
  assert.equal(bot.thumbnails.length, 0);
  assert.equal(bot.calls.length, 1);
});
