const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { saveCharacter, getCharactersByOwner, getCharacterById, updateCharacterAvatar } = require("../database/characters");
const { chooseCharacterAvatar } = require("../ai/characterAvatar");
const { LimitError, reserveCreation } = require("../limits/requestLimits");

function avatarRetryRow(characterId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`character:avatar:retry:${characterId}`)
      .setLabel("Retry avatar lookup")
      .setStyle(ButtonStyle.Primary)
  );
}

async function handleCharacterAvatarRetry(interaction) {
  const prefix = "character:avatar:retry:";
  if (!interaction.customId.startsWith(prefix)) return;
  await interaction.deferUpdate();
  let release;
  try {
    release = reserveCreation(interaction.user.id);
    const id = interaction.customId.slice(prefix.length);
    const character = await getCharacterById(id, interaction.user.id);
    if (!character) {
      await interaction.editReply({ content: "This saved character is no longer available.", components: [] });
      return;
    }
    const avatarUrl = await chooseCharacterAvatar(character);
    if (!await updateCharacterAvatar(id, interaction.user.id, avatarUrl)) {
      await interaction.editReply({ content: "This saved character is no longer available.", components: [] });
      return;
    }
    await interaction.editReply({
      content: `Updated the avatar for ${character.name}.`,
      components: [],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    if (!(error instanceof LimitError)) console.error("Character avatar retry failed:", error);
    await interaction.editReply({
      content: error instanceof LimitError ? error.message
        : "I couldn't update the avatar. Your character information is still saved. You can retry the lookup.",
      allowedMentions: { parse: [] },
    });
  } finally {
    release?.();
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

    try {
      character.avatarUrl = await chooseCharacterAvatar(character);
    } catch (error) {
      console.error("Character avatar lookup failed; saving without an avatar:", error);
      character.avatarUrl = null;
    }
    const saved = await saveCharacter(character);
    await interaction.editReply({
      content: `Created ${character.name}. You can now chat with ${character.name} by using /character chat.`
        + (character.avatarUrl ? "" : " Avatar lookup failed, but your character information is saved. You can retry without filling out the form again."),
      ...(character.avatarUrl ? {} : { components: [avatarRetryRow(saved._id)] }),
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    if (!(error instanceof LimitError)) {
      console.error("Character creation failed:", error);
    }
    await interaction.editReply({
      content: error instanceof LimitError
        ? error.message
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

    await saveNewCharacter(interaction, character);
  }
}

module.exports = { handleCharacterModal, handleCharacterAvatarRetry };
