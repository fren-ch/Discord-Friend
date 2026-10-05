// This file read and valdidate submitted forms


// reads the answers and sends a private confirmation 
const { MessageFlags } = require("discord.js");
const { saveCharacter } = require("../database/characters");

async function handleCharacterModal(interaction) {

    // collect the answers into one object 
  const character = {
    ownerUserId: interaction.user.id,
    name: interaction.fields.getTextInputValue("name").trim(), 
    personality: interaction.fields
      .getTextInputValue("personality")
      .trim(),
    backstory: interaction.fields
      .getTextInputValue("backstory")
      .trim(),
    speakingStyle: interaction.fields
      .getTextInputValue("speakingStyle")
      .trim(),
    greeting: interaction.fields
      .getTextInputValue("greeting")
      .trim(),
  };

  if (!character.name || !character.personality) {
    await interaction.reply({
      content: "Please enter a name and personality, not just spaces.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await saveCharacter(character);

  await interaction.reply({
    content: `Saved ${character.name} to your character profiles.`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

module.exports = { handleCharacterModal };