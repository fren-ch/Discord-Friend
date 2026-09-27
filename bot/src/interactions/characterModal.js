// This file read and valdidate submitted forms


// reads the answers and sends a private confirmation 
const { MessageFlags } = require("discord.js");

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

  // Database saving will go here later.


  // send a private confirmation message to the user
  await interaction.reply({
    content:
      `Received the form for ${character.name}!\n` +
      "This is a form test. Your character has not been saved yet.",
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

module.exports = { handleCharacterModal };