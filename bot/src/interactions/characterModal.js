const { randomUUID } = require("node:crypto");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { saveCharacter, getCharactersByOwner } = require("../database/characters");
const { buildCharacterDetailsModal } = require("../commands/character");
const {
  AvatarLookupError,
  chooseCharacterAvatar,
} = require("../ai/characterAvatar");
const { LimitError, reserveCreation } = require("../limits/requestLimits");

const pendingCharacterDetails = new Map();
const PENDING_CHARACTER_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_CHARACTERS = 1000;

function removeExpiredPendingCharacters(now = Date.now()) {
  for (const [token, pending] of pendingCharacterDetails) {
    if (pending.expiresAt <= now) pendingCharacterDetails.delete(token);
  }
}

async function saveNewCharacter(interaction, character) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let release;
  try {
    release = reserveCreation(interaction.user.id);
    const existing = await getCharactersByOwner(interaction.user.id);
    if (existing.length >= 10) {
      throw new LimitError("You can save up to 10 characters. Delete one before creating another.");
    }

    character.avatarUrl = await chooseCharacterAvatar(character);
    await saveCharacter(character);
    await interaction.editReply({
      content: `Saved ${character.name}.`,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    if (!(error instanceof LimitError)) {
      console.error("Character creation failed:", error);
    }
    await interaction.editReply({
      content: error instanceof LimitError
        ? error.message
        : error instanceof AvatarLookupError
          ? "I couldn't find and verify a suitable character avatar, or avatar lookup is temporarily busy. No character was created. Please try again later."
          : "I couldn't save that character. Please try again later.",
      allowedMentions: { parse: [] },
    });
  } finally {
    release?.();
  }
}

async function handleCharacterModal(interaction) {
  if (interaction.customId === "character:create") {
    const character = {
      ownerUserId: interaction.user.id,
      name: interaction.fields.getTextInputValue("name").trim(),
      personality: interaction.fields.getTextInputValue("personality").trim(),
      backstory: interaction.fields.getTextInputValue("backstory").trim(),
      franchise: interaction.fields.getTextInputValue("franchise").trim(),
    };

    if (!character.name) {
      await interaction.reply({
        content: "Please enter a character name.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    removeExpiredPendingCharacters();
    if (pendingCharacterDetails.size >= MAX_PENDING_CHARACTERS) {
      await interaction.reply({
        content: "Character creation is busy right now. Please try again shortly.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const token = randomUUID();
    pendingCharacterDetails.set(token, {
      userId: interaction.user.id,
      character,
      expiresAt: Date.now() + PENDING_CHARACTER_TTL_MS,
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`character:create:continue:${token}`)
        .setLabel("Continue")
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({
      content: "Your character details are saved for this form. Continue to the remaining optional fields.",
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const detailsPrefix = "character:create:details:";
  if (!interaction.customId.startsWith(detailsPrefix)) return;

  const token = interaction.customId.slice(detailsPrefix.length);
  const pending = pendingCharacterDetails.get(token);
  if (
    !pending ||
    pending.userId !== interaction.user.id ||
    pending.expiresAt <= Date.now()
  ) {
    if (pending?.expiresAt <= Date.now()) {
      pendingCharacterDetails.delete(token);
    }
    await interaction.reply({
      content: "This character form expired. Please run /character create again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  pendingCharacterDetails.delete(token);
  pending.character.speakingStyle =
    interaction.fields.getTextInputValue("speakingStyle").trim();
  pending.character.greeting =
    interaction.fields.getTextInputValue("greeting").trim();

  await saveNewCharacter(interaction, pending.character);
}

async function handleCharacterDetailsButton(interaction) {
  const prefix = "character:create:continue:";
  if (!interaction.customId.startsWith(prefix)) return;

  const token = interaction.customId.slice(prefix.length);
  const pending = pendingCharacterDetails.get(token);
  if (
    !pending ||
    pending.userId !== interaction.user.id ||
    pending.expiresAt <= Date.now()
  ) {
    if (pending?.expiresAt <= Date.now()) {
      pendingCharacterDetails.delete(token);
    }
    await interaction.reply({
      content: "This character form expired. Please run /character create again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await interaction.showModal(buildCharacterDetailsModal(token));
  } catch (error) {
    console.error("Could not open character details form:", error);
    await interaction.reply({
      content: "I couldn't open the next character form. Please run /character create again.",
      flags: MessageFlags.Ephemeral,
    }).catch(console.error);
  }
}

module.exports = { handleCharacterDetailsButton, handleCharacterModal };
