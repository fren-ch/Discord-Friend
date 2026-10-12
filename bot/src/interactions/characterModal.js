// This file read and valdidate submitted forms


// reads the answers and sends a private confirmation 
const { MessageFlags } = require("discord.js");
const { saveCharacter } = require("../database/characters");
const { chooseCharacterAvatar } = require("../ai/characterAvatar");

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

  if (!character.name || !character.personality) {
    await interaction.reply({
      content: "Please enter a name and personality, not just spaces.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  character.avatarUrl = await chooseCharacterAvatar(character);

  await saveCharacter(character);

  await interaction.editReply({
    content: `Saved ${character.name} with a selected avatar.`,
    allowedMentions: { parse: [] },
  });
}




module.exports = { handleCharacterModal };