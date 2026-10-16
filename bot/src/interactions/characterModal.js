const { MessageFlags } = require("discord.js");
const { saveCharacter, getCharactersByOwner } = require("../database/characters");
const { chooseCharacterAvatar } = require("../ai/characterAvatar");
const { LimitError, reserveCreation } = require("../limits/requestLimits");

async function handleCharacterModal(interaction) {
  const character = {
    ownerUserId: interaction.user.id,
    name: interaction.fields.getTextInputValue("name").trim(),
    personality: interaction.fields.getTextInputValue("personality").trim(),
    backstory: interaction.fields.getTextInputValue("backstory").trim(),
    speakingStyle: interaction.fields.getTextInputValue("speakingStyle").trim(),
    greeting: interaction.fields.getTextInputValue("greeting").trim(),
  };

  if (!character.name || !character.personality) {
    await interaction.reply({
      content: "Please enter a name and personality, not just spaces.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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
        : "I couldn't save that character. Please try again later.",
      allowedMentions: { parse: [] },
    });
  } finally {
    release?.();
  }
}

module.exports = { handleCharacterModal };
