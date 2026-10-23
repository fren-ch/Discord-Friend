const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sharp = require("sharp");

function setup(image, answer = '{"face_box":[333,700,500,800]}') {
  const calls = [];
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === "sharp") return sharp;
      if (name === "@google/genai") return { GoogleGenAI: class {} };
      if (name === "../limits/requestLimits") return {
        async generateWithLimit(client, params) {
          calls.push(params);
          if (answer instanceof Error) throw answer;
          return { output_text: answer };
        },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
    process: { env: { GEMINI_API_KEY: "test" } },
    console: { warn() {} },
    Buffer, URL, AbortSignal,
    async fetch() {
      return { ok: true, body: (async function* () { yield image; })() };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/ai/avatarCrop.js"), "utf8"), context);
  return { ...context.module.exports, calls };
}

const upload = { url: "https://cdn.discordapp.com/attachments/test.png", size: 1000 };
const character = { name: "Test" };

test("crop follows an off-center face rather than the image center", async () => {
  const image = await sharp({ create: { width: 1000, height: 600, channels: 3, background: "blue" } })
    .composite([{
      input: await sharp({ create: { width: 250, height: 250, channels: 3, background: "red" } }).png().toBuffer(),
      left: 625, top: 125,
    }]).png().toBuffer();
  const bot = setup(image);
  const result = await bot.cropUploadedAvatar(upload, character);
  assert.ok(Buffer.isBuffer(result));
  const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, info.height);
  assert.ok(info.width <= 512);
  assert.deepEqual([...data.subarray(0, 3)], [255, 0, 0]);
  assert.equal(bot.calls.length, 1);
  assert.equal(bot.calls[0].input[1].mime_type, "image/png");
});

test("square crops stay inside the image for faces along every edge", () => {
  const { faceCrop } = setup();
  for (const box of [[0, 0, 100, 100], [900, 900, 1000, 1000], [0, 900, 100, 1000], [900, 0, 1000, 100]]) {
    const crop = faceCrop(box, 1200, 800);
    assert.equal(crop.width, crop.height);
    assert.ok(crop.left >= 0 && crop.top >= 0);
    assert.ok(crop.left + crop.width <= 1200);
    assert.ok(crop.top + crop.height <= 800);
  }
});

test("rejects invalid boxes and boxes too wide for a square crop", () => {
  const { faceCrop } = setup();
  for (const box of [null, [], [0, 0, 0, 20], [-1, 0, 20, 20], [0, 0, 1001, 20], [0, 0, "100", 100], [0, 0, Infinity, 100], [0, 0, 1000, 1000]]) {
    assert.equal(faceCrop(box, 1000, 600), null);
  }
});

test("no face, malformed output, and Gemini errors keep the original", async () => {
  const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: "blue" } }).png().toBuffer();
  for (const answer of ['{"face_box":null}', "not JSON", new Error("Gemini unavailable")]) {
    assert.equal(await setup(image, answer).cropUploadedAvatar(upload, character), null);
  }
});

test("normalizes EXIF orientation before sending the image to Gemini", async () => {
  const image = await sharp({ create: { width: 800, height: 400, channels: 3, background: "red" } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const bot = setup(image, '{"face_box":[400,400,600,600]}');
  assert.ok(await bot.cropUploadedAvatar(upload, character));
  const preview = await sharp(Buffer.from(bot.calls[0].input[1].data, "base64")).metadata();
  assert.equal(preview.width, 400);
  assert.equal(preview.height, 800);
});

test("oversized, corrupt, and animated uploads bypass face detection", async () => {
  const bot = setup(Buffer.from("invalid image"));
  assert.equal(await bot.cropUploadedAvatar({ ...upload, size: 11 * 1024 * 1024 }, character), null);
  assert.equal(await bot.cropUploadedAvatar(upload, character), null);
  const gif = await sharp({ create: { width: 40, height: 80, channels: 3, background: "red" } })
    .raw().toBuffer();
  for (let i = 40 * 40 * 3; i < gif.length; i += 3) {
    gif[i] = 0;
    gif[i + 2] = 255;
  }
  const animated = await sharp(gif, { raw: { width: 40, height: 80, channels: 3, pageHeight: 40 } })
    .gif({ loop: 0, delay: [100, 100] }).toBuffer();
  const animationBot = setup(animated);
  assert.equal((await sharp(animated).metadata()).pages, 2);
  assert.equal(await animationBot.cropUploadedAvatar(upload, character), null);
  assert.equal(animationBot.calls.length, 0);
  assert.equal(bot.calls.length, 0);
});
