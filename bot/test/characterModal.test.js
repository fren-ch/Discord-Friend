const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup({
  avatarError,
  saveError,
  avatarBatches,
  avatarExclusions,
  avatarGate,
} = {}) {
  const saved = [];
  const updated = [];
  let avatarCalls = 0;
  let released = 0;
  const activeLookups = new Set();
  class LimitError extends Error {}
  class Builder {
    constructor() { this.components = []; }
    addComponents(...components) { this.components.push(...components); return this; }
    setCustomId(value) { this.customId = value; return this; }
    setLabel(value) { this.label = value; return this; }
    setStyle(value) { this.style = value; return this; }
    setPlaceholder(value) { this.placeholder = value; return this; }
    setMinValues(value) { this.minValues = value; return this; }
    setMaxValues(value) { this.maxValues = value; return this; }
    setDisabled(value) { this.disabled = value; return this; }
    addOptions(options) { this.options = options; return this; }
  }
  const context = {
    module: { exports: {} },
    console: { error() {} },
    require(name) {
      if (name === "node:crypto") return require(name);
      if (name === "discord.js") return {
        ActionRowBuilder: Builder, ButtonBuilder: Builder,
        StringSelectMenuBuilder: Builder,
        ButtonStyle: { Primary: 1, Secondary: 2 }, MessageFlags: { Ephemeral: 64 },
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
        async findCharacterAvatars(character, excludedUrls) {
          const callIndex = avatarCalls++;
          if (avatarGate && callIndex > 0) await avatarGate;
          if (avatarError) throw avatarError;
          if (avatarBatches) {
            const batch = avatarBatches[callIndex];
            assert.equal(
              excludedUrls?.join(","),
              avatarExclusions
                ? avatarExclusions[callIndex]?.join(",")
                : callIndex > 0 ? avatarBatches[callIndex - 1].join(",") : undefined
            );
            return batch;
          }
          return [
            "https://example.com/avatar.png",
            "https://example.com/alternate.png",
          ];
        },
      };
      if (name === "../limits/requestLimits") return {
        LimitError,
        reserveCreation: () => () => { released++; },
        reserveAvatarLookup(userId) {
          if (activeLookups.has(userId)) {
            throw new LimitError("An avatar lookup is already in progress.");
          }
          activeLookups.add(userId);
          return () => {
            activeLookups.delete(userId);
            released++;
          };
        },
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
    async update(value) { replies.push(value); },
  };
}

function avatarCommandInteraction(characterId) {
  const command = interaction();
  command.options = {
    getString: (name, required) => {
      assert.equal(name, "character");
      assert.equal(required, true);
      return characterId;
    },
  };
  return command;
}

test("blank and whitespace-only backstories save without a second prompt", async () => {
  for (const backstory of ["", " \n "]) {
    const bot = setup();
    const form = interaction(backstory);
    await bot.handleCharacterModal(form);
    assert.equal(bot.saved.length, 1);
    assert.equal(bot.saved[0].avatarUrl, "https://example.com/avatar.png");
    assert.match(form.replies[0].content, /Created Test.*Choose an avatar image below/);
    assert.equal(form.replies[0].components.length, 2);
    assert.equal(form.replies[0].embeds.length, 2);
    assert.equal(form.replies[0].components[0].components[0].options.length, 2);
    assert.equal(form.replies[0].components[1].components[0].label, "Show 10 different");
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
  assert.match(button.replies[0].content, /Updated the avatar for Test.*Choose another option/);
  assert.equal(button.replies[0].components[0].components[0].options.length, 2);

  const menu = button.replies[0].components[0].components[0];
  const selection = interaction();
  selection.customId = menu.customId;
  selection.values = ["1"];
  selection.deferUpdate = async () => {};
  await bot.handleCharacterAvatarSelect(selection);
  assert.equal(bot.updated.length, 2);
  assert.equal(bot.updated[1].avatarUrl, "https://example.com/alternate.png");
  assert.equal(selection.replies[0].content, "Updated the avatar for Test.");
  assert.equal(selection.replies[0].components.length, 0);
});

test("avatar command previews choices and changes the picture only after selection", async () => {
  const originalBatch = [
    "https://example.com/current.png",
    "https://example.com/old-option.png",
  ];
  const newBatch = [
    "https://example.com/new-option.png",
    "https://example.com/another-option.png",
  ];
  const bot = setup({
    avatarBatches: [originalBatch, newBatch],
    avatarExclusions: [undefined, undefined],
  });
  await bot.handleCharacterModal(interaction());

  const command = avatarCommandInteraction("saved-character");
  await bot.handleCharacterAvatarCommand(command);
  assert.equal(command.replies[0].embeds[0].image.url, newBatch[0]);
  assert.match(command.replies[0].content, /current picture will stay until you select one/);
  assert.equal(bot.updated.length, 0);
  assert.equal(bot.saved[0].avatarUrl, originalBatch[0]);

  const menu = command.replies[0].components[0].components[0];
  const selection = interaction();
  selection.customId = menu.customId;
  selection.values = ["1"];
  selection.deferUpdate = async () => {};
  await bot.handleCharacterAvatarSelect(selection);
  assert.equal(bot.updated[0].avatarUrl, newBatch[1]);
});

test("showing more avatar choices excludes earlier images without changing the current avatar", async () => {
  const firstBatch = [
    "https://example.com/avatar.png",
    "https://example.com/alternate.png",
  ];
  const secondBatch = [
    "https://example.com/new-one.png",
    "https://example.com/new-two.png",
  ];
  const bot = setup({ avatarBatches: [firstBatch, secondBatch] });
  const form = interaction();
  await bot.handleCharacterModal(form);
  assert.equal(bot.saved[0].avatarUrl, firstBatch[0]);

  const moreButton = form.replies[0].components[1].components[0];
  const more = interaction();
  more.customId = moreButton.customId;
  await bot.handleCharacterAvatarMore(more);

  assert.equal(bot.saved[0].avatarUrl, firstBatch[0]);
  assert.match(more.replies[0].content, /Loading up to 10 different/);
  assert.equal(more.replies[0].components[0].components[0].disabled, true);
  assert.equal(more.replies[0].components[1].components[0].label, "Loading images...");
  assert.equal(more.replies[0].components[1].components[0].disabled, true);
  assert.equal(more.replies[1].embeds[0].image.url, secondBatch[0]);
  assert.match(more.replies[1].content, /2 more verified images/);

  const menu = more.replies[1].components[0].components[0];
  const selection = interaction();
  selection.customId = menu.customId;
  selection.values = ["1"];
  selection.deferUpdate = async () => {};
  await bot.handleCharacterAvatarSelect(selection);
  assert.equal(bot.updated[0].avatarUrl, secondBatch[1]);
});

test("loading state blocks repeated more-image clicks while lookup is pending", async () => {
  const firstBatch = [
    "https://example.com/avatar.png",
    "https://example.com/alternate.png",
  ];
  const secondBatch = [
    "https://example.com/new-one.png",
    "https://example.com/new-two.png",
  ];
  let releaseLookup;
  const avatarGate = new Promise((resolve) => { releaseLookup = resolve; });
  const bot = setup({ avatarBatches: [firstBatch, secondBatch], avatarGate });
  const form = interaction();
  await bot.handleCharacterModal(form);
  const customId = form.replies[0].components[1].components[0].customId;

  const firstClick = interaction();
  firstClick.customId = customId;
  const loading = bot.handleCharacterAvatarMore(firstClick);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(firstClick.replies[0].content, /Loading up to 10/);

  const repeatedClick = interaction();
  repeatedClick.customId = customId;
  await bot.handleCharacterAvatarMore(repeatedClick);
  assert.match(repeatedClick.replies[0].content, /already in progress/i);
  assert.equal(repeatedClick.replies.length, 1);

  releaseLookup();
  await loading;
  assert.match(firstClick.replies[1].content, /more verified images/);
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

test("avatar choices cannot be selected by another user", async () => {
  const bot = setup();
  const form = interaction();
  await bot.handleCharacterModal(form);
  const menu = form.replies[0].components[0].components[0];
  const selection = interaction();
  selection.customId = menu.customId;
  selection.values = ["1"];
  selection.user.id = "other-user";
  await bot.handleCharacterAvatarSelect(selection);
  assert.equal(bot.updated.length, 0);
  assert.match(selection.replies[0].content, /Only the character owner/);
});

test("a supplied backstory saves immediately without a second step", async () => {
  const bot = setup();
  const form = interaction("A character background");
  await bot.handleCharacterModal(form);
  assert.equal(bot.saved.length, 1);
  assert.equal(bot.saved[0].backstory, "A character background");
  assert.equal(form.replies[0].components.length, 2);
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
