const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");
const { randomUUID } = require("node:crypto");
const { saveCharacter, getCharactersByOwner, getCharacterById, updateCharacterAvatar } = require("../database/characters");
const { findCharacterAvatars } = require("../ai/characterAvatar");
const {
  LimitError,
  reserveAvatarLookup,
  reserveCreation,
} = require("../limits/requestLimits");

const pendingAvatarSelections = new Map();
const AVATAR_SELECTION_TTL = 15 * 60 * 1000;

function avatarRetryRow(characterId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`character:avatar:retry:${characterId}`)
      .setLabel("Retry avatar lookup")
      .setStyle(ButtonStyle.Primary)
  );
}

function avatarSelectionControls(selection, token, loading = false) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`character:avatar:select:${token}`)
    .setPlaceholder("Choose an avatar image")
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(loading)
    .addOptions(selection.avatarUrls.map((_, index) => ({
      label: `Image ${index + 1}`,
      value: String(index),
      description: "Previewed above",
    })));
  const moreButton = new ButtonBuilder()
    .setCustomId(`character:avatar:more:${token}`)
    .setLabel(loading ? "Loading images..." : "Show 10 different")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(loading);

  return {
    embeds: selection.avatarUrls.map((url, index) => ({
      title: `Avatar option ${index + 1}`,
      image: { url },
    })),
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(moreButton),
    ],
  };
}

function avatarSelectionMessage(characterId, ownerUserId, avatarUrls, seenAvatarUrls = avatarUrls) {
  const now = Date.now();
  for (const [token, selection] of pendingAvatarSelections) {
    if (selection.expiresAt <= now) pendingAvatarSelections.delete(token);
  }

  const token = randomUUID();
  pendingAvatarSelections.set(token, {
    characterId: String(characterId),
    ownerUserId,
    avatarUrls,
    seenAvatarUrls: [...new Set(seenAvatarUrls)],
    expiresAt: now + AVATAR_SELECTION_TTL,
  });

  return avatarSelectionControls(pendingAvatarSelections.get(token), token);
}

async function handleCharacterAvatarSelect(interaction) {
  const prefix = "character:avatar:select:";
  if (!interaction.customId.startsWith(prefix)) return;

  const token = interaction.customId.slice(prefix.length);
  const selection = pendingAvatarSelections.get(token);
  if (!selection || selection.expiresAt <= Date.now()) {
    pendingAvatarSelections.delete(token);
    await interaction.update({
      content: "These avatar choices expired. Retry the avatar lookup to get new options.",
      embeds: [],
      components: [],
    });
    return;
  }
  if (interaction.user.id !== selection.ownerUserId) {
    await interaction.reply({
      content: "Only the character owner can choose this avatar.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const index = Number(interaction.values[0]);
  if (!Number.isInteger(index) || index < 0 || index >= selection.avatarUrls.length) {
    await interaction.reply({
      content: "That avatar option is no longer available.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();
  const character = await getCharacterById(selection.characterId, interaction.user.id);
  if (!character || !await updateCharacterAvatar(
    selection.characterId,
    interaction.user.id,
    selection.avatarUrls[index]
  )) {
    pendingAvatarSelections.delete(token);
    await interaction.editReply({
      content: "This saved character is no longer available.",
      embeds: [],
      components: [],
    });
    return;
  }

  pendingAvatarSelections.delete(token);
  await interaction.editReply({
    content: `Updated the avatar for ${character.name}.`,
    embeds: [],
    components: [],
    allowedMentions: { parse: [] },
  });
}

async function handleCharacterAvatarMore(interaction) {
  const prefix = "character:avatar:more:";
  if (!interaction.customId.startsWith(prefix)) return;

  const token = interaction.customId.slice(prefix.length);
  const selection = pendingAvatarSelections.get(token);
  if (!selection || selection.expiresAt <= Date.now()) {
    pendingAvatarSelections.delete(token);
    await interaction.update({
      content: "These avatar choices expired. Retry the avatar lookup to get new options.",
      embeds: [],
      components: [],
    });
    return;
  }
  if (interaction.user.id !== selection.ownerUserId) {
    await interaction.reply({
      content: "Only the character owner can request more avatar choices.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let release;
  let acknowledged = false;
  try {
    release = reserveAvatarLookup(interaction.user.id);
  } catch (error) {
    await interaction.reply({
      content: error instanceof LimitError
        ? error.message
        : "I couldn't start another avatar lookup right now.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await interaction.update({
      content: "Loading up to 10 different verified avatar choices...",
      ...avatarSelectionControls(selection, token, true),
      allowedMentions: { parse: [] },
    });
    acknowledged = true;

    const character = await getCharacterById(selection.characterId, interaction.user.id);
    if (!character) {
      pendingAvatarSelections.delete(token);
      await interaction.editReply({
        content: "This saved character is no longer available.",
        embeds: [],
        components: [],
      });
      return;
    }

    const avatarUrls = await findCharacterAvatars(character, selection.seenAvatarUrls);
    pendingAvatarSelections.delete(token);
    const nextSelection = avatarSelectionMessage(
      selection.characterId,
      interaction.user.id,
      avatarUrls,
      [...selection.seenAvatarUrls, ...avatarUrls]
    );

    await interaction.editReply({
      content: `Here are ${avatarUrls.length} more verified images for ${character.name}. Choose one, or request 10 different images again.`,
      ...nextSelection,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    if (!(error instanceof LimitError)) console.error("More avatar choices failed:", error);
    const content = error instanceof LimitError
      ? error.message
      : "I couldn't find more verified images right now. Your current choices are still available; please try again.";
    if (acknowledged) {
      await interaction.editReply({
        content,
        ...avatarSelectionControls(selection, token),
        allowedMentions: { parse: [] },
      });
    } else {
      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }
  } finally {
    release?.();
  }
}

async function handleCharacterAvatarCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let release;
  try {
    const id = interaction.options.getString("character", true);
    const character = await getCharacterById(id, interaction.user.id);
    if (!character) {
      await interaction.editReply({
        content: "I could not find that profile in your saved characters.",
      });
      return;
    }

    const uploadedImage = interaction.options.getAttachment("image");
    if (uploadedImage) {
      if (!uploadedImage.contentType?.startsWith("image/")) {
        await interaction.editReply("Please upload an image file, such as PNG, JPG, or GIF.");
        return;
      }

      const updated = await updateCharacterAvatar(id, interaction.user.id, uploadedImage.url);
      if (!updated) {
        await interaction.editReply("I could not find that profile in your saved characters.");
        return;
      }

      await interaction.editReply({
        content: `Uploaded avatar updated for ${character.name}.`,
        embeds: [{
          image: { url: uploadedImage.url },
        }],
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (character.originalCharacter && !character.avatarUrl) {
      await interaction.editReply({
        content: `${character.name} is marked as an original character and has no avatar yet. Upload your own image by choosing this character and attaching an image with the image option.`,
        allowedMentions: { parse: [] },
      });
      return;
    }

    release = reserveAvatarLookup(interaction.user.id);
    const avatarUrls = await findCharacterAvatars(character);
    const selection = avatarSelectionMessage(id, interaction.user.id, avatarUrls);
    await interaction.editReply({
      content: `Choose a new profile picture for ${character.name}. Its current picture will stay until you select one.`,
      ...selection,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    if (!(error instanceof LimitError)) {
      console.error("Character avatar change failed:", error);
    }
    await interaction.editReply({
      content: error instanceof LimitError
        ? error.message
        : "I couldn't find new profile pictures right now. Your character's current picture is unchanged; please try again later.",
      allowedMentions: { parse: [] },
    });
  } finally {
    release?.();
  }
}

async function handleCharacterAvatarRetry(interaction) {
  const prefix = "character:avatar:retry:";
  if (!interaction.customId.startsWith(prefix)) return;
  await interaction.deferUpdate();
  let release;
  try {
    release = reserveAvatarLookup(interaction.user.id);
    const id = interaction.customId.slice(prefix.length);
    const character = await getCharacterById(id, interaction.user.id);
    if (!character) {
      await interaction.editReply({ content: "This saved character is no longer available.", components: [] });
      return;
    }
    const avatarUrls = await findCharacterAvatars(character);
    const avatarUrl = avatarUrls[0];
    if (!await updateCharacterAvatar(id, interaction.user.id, avatarUrl)) {
      await interaction.editReply({ content: "This saved character is no longer available.", components: [] });
      return;
    }
    const selection = avatarSelectionMessage(id, interaction.user.id, avatarUrls);
    await interaction.editReply({
      content: `Updated the avatar for ${character.name}. Choose another option below if you prefer one of these images.`,
      ...selection,
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

    let avatarUrls = [];
    if (character.originalCharacter) {
      character.avatarUrl = null;
    } else {
      try {
        avatarUrls = await findCharacterAvatars(character);
        character.avatarUrl = avatarUrls[0];
      } catch (error) {
        console.error("Character avatar lookup failed; saving without an avatar:", error);
        character.avatarUrl = null;
      }
    }
    const saved = await saveCharacter(character);
    const avatarSelection = avatarUrls.length
      ? avatarSelectionMessage(saved._id, interaction.user.id, avatarUrls)
      : null;
    await interaction.editReply({
      content: character.originalCharacter
        ? `Created ${character.name} as an original character. I skipped online avatar lookup. You can chat with ${character.name} using /character chat, and upload an avatar later with /character avatar.`
        : `Created ${character.name}. You can now chat with ${character.name} by using /character chat.`
          + (avatarSelection
            ? " Choose an avatar image below, or keep the first option."
            : " Avatar lookup failed, but your character information is saved. You can retry without filling out the form again."),
      ...(character.originalCharacter
        ? {}
        : avatarSelection || { components: [avatarRetryRow(saved._id)] }),
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
      originalCharacter: interaction.fields.getCheckbox?.("originalCharacter") ?? false,
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

module.exports = {
  handleCharacterModal,
  handleCharacterAvatarRetry,
  handleCharacterAvatarSelect,
  handleCharacterAvatarMore,
  handleCharacterAvatarCommand,
};
