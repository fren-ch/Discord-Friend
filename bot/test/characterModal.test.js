const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup({ avatarError, saveError } = {}) {
  const saved = [];
  const updated = [];
  let released = 0;
  class Builder {
    addComponents() { return this; }
    setCustomId() { return this; }
    setLabel() { return this; }
    setStyle() { return this; }
  }
  const context = {
    module: { exports: {} },
    console: { error() {} },
    require(name) {
      if (name === "node:crypto") return require(name);
      if (name === "discord.js") return {
        ActionRowBuilder: Builder, ButtonBuilder: Builder,
        ButtonStyle: { Primary: 1 }, MessageFlags: { Ephemeral: 64 },
      };
      if (name === "../database/characters") return {
        getCharactersByOwner: async () => [],
        getCharacterById: async (id, owner) => saved.find((character) => character._id === id && character.ownerUserId === owner),
        async updateCharacterAvatar(id, owner, avatarUrl) {
          updated.push({ id, owner, avatarUrl });
          return true;
        },
        async saveCharacter(character) {
          if (saveError) throw saveError;
          const document = { ...character, _id: "saved-character" };
          saved.push(document);
          return document;
        },
      };
      if (name === "../commands/character") return { buildCharacterDetailsModal() {} };
      if (name === "../ai/characterAvatar") return {
        async chooseCharacterAvatar() {
          if (avatarError) throw avatarError;
          return "https://example.com/avatar.png";
        },
      };
      if (name === "../limits/requestLimits") return {
        LimitError: class extends Error {},
        reserveCreation: () => () => { released++; },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/interactions/characterModal.js"), "utf8"), context);
  return { ...context.module.exports, saved, updated, released: () => released };
}

function interaction(backstory = "") {
  const replies = [];
  return {
    customId: "character:create",
    user: { id: "user" },
    fields: { getTextInputValue: (field) => ({ name: "Test", backstory }[field] || "") },
    replies,
    async deferReply() {},
    async reply(value) { replies.push(value); },
    async editReply(value) { replies.push(value); },
  };
}

test("blank and whitespace-only backstories save without a second prompt", async () => {
  for (const backstory of ["", " \n "]) {
    const bot = setup();
    const form = interaction(backstory);
    await bot.handleCharacterModal(form);
    assert.equal(bot.saved.length, 1);
    assert.equal(bot.saved[0].avatarUrl, "https://example.com/avatar.png");
    assert.equal(form.replies[0].content, "Created Test. You can now chat with Test by using /character chat.");
    assert.equal(form.replies[0].components, undefined);
    assert.equal(bot.released(), 1);
  }
});

test("avatar lookup failure still saves the character", async () => {
  const bot = setup({ avatarError: new Error("Lookup unavailable") });
  const form = interaction();
  await bot.handleCharacterModal(form);
  assert.equal(bot.saved.length, 1);
  assert.equal(bot.saved[0].avatarUrl, null);
  assert.match(form.replies[0].content, /Avatar lookup failed.*information is saved/);
  assert.match(form.replies[0].content, /chat with Test by using \/character chat/);
  assert.equal(form.replies[0].components.length, 1);
  assert.equal(bot.released(), 1);
});

test("retry updates the saved character without creating another character", async () => {
  const bot = setup();
  await bot.handleCharacterModal(interaction());
  const button = interaction();
  button.customId = "character:avatar:retry:saved-character";
  button.deferUpdate = async () => {};
  await bot.handleCharacterAvatarRetry(button);
  assert.equal(bot.saved.length, 1);
  assert.equal(bot.updated.length, 1);
  assert.equal(bot.updated[0].id, "saved-character");
  assert.equal(button.replies[0].content, "Updated the avatar for Test.");
  assert.equal(button.replies[0].components.length, 0);
});

test("failed retry preserves saved details and allows another retry", async () => {
  const bot = setup({ avatarError: new Error("Lookup unavailable") });
  await bot.handleCharacterModal(interaction());
  const button = interaction();
  button.customId = "character:avatar:retry:saved-character";
  button.deferUpdate = async () => {};
  await bot.handleCharacterAvatarRetry(button);
  assert.equal(bot.saved.length, 1);
  assert.equal(bot.updated.length, 0);
  assert.match(button.replies[0].content, /still saved/);
  assert.equal(button.replies[0].components, undefined);
});

test("retry cannot update another user's character", async () => {
  const bot = setup();
  await bot.handleCharacterModal(interaction());
  const button = interaction();
  button.user.id = "other-user";
  button.customId = "character:avatar:retry:saved-character";
  button.deferUpdate = async () => {};
  await bot.handleCharacterAvatarRetry(button);
  assert.equal(bot.updated.length, 0);
  assert.match(button.replies[0].content, /no longer available/);
});

test("a supplied backstory saves immediately without a second step", async () => {
  const bot = setup();
  const form = interaction("A character background");
  await bot.handleCharacterModal(form);
  assert.equal(bot.saved.length, 1);
  assert.equal(bot.saved[0].backstory, "A character background");
  assert.equal(form.replies[0].components, undefined);
  assert.match(form.replies[0].content, /chat with Test by using \/character chat/);
});

test("database failures still report that saving failed", async () => {
  const bot = setup({ saveError: new Error("Database unavailable") });
  const form = interaction();
  await bot.handleCharacterModal(form);
  assert.equal(bot.saved.length, 0);
  assert.match(form.replies[0].content, /couldn't save/);
  assert.equal(bot.released(), 1);
});
