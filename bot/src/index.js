const { createLifecycle } = require("./lifecycle");
const { openCharacterChat, ChatSetupError } = require("./discord/chatRecovery");
const { LimitError, reserveChat } = require("./limits/requestLimits");
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
  WebhookClient,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");



const {
  sendCharacterMessage,
} = require("./discord/characterWebhooks");

const { buildCharacterModal } = require("./commands/character");
const {
  handleCharacterAvatarRetry,
  handleCharacterModal,
} = require("./interactions/characterModal");
const { buildCharacterInput } = require("./ai/characterInput");
const { generateCharacterReply } = require("./ai/gemini");
const { DEFAULT_AVATAR_URL } = require("./ai/characterAvatar");
const { getNextCheckInAt, startCheckInScheduler } = require("./discord/checkIns");
const {
  connectToDatabase,
  closeDatabase,
  getCharactersByOwner,
  getCharacterById,
  getConversationsByCharacter,
  deleteCharacterAndConversations,
  createConversation,
  getConversationByCharacter,
  getConversationByThread,
  recordCheckInActivity,
  saveConversationExchange,
} = require("./database/characters");


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const lifecycle = createLifecycle({ client, closeDatabase });

process.on("SIGTERM", () => { void lifecycle.shutdown("SIGTERM"); });
process.on("SIGINT", () => { void lifecycle.shutdown("SIGINT"); });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  lifecycle.track(() => startCheckInScheduler(client));
});



// Each thread processes one message at a time.
const openingConversations = new Set();
const conversationQueues = new Map();
const MAX_CHAT_MESSAGE_LENGTH = 420;
const sentenceSegmenter = new Intl.Segmenter(undefined, {
  granularity: "sentence",
});

// Split replies into short, sentence-sized messages rather than large blocks.
function splitDiscordReply(text) {
  const chunks = [];
  let chunk = "";

  const flush = () => {
    if (chunk) {
      chunks.push(chunk);
      chunk = "";
    }
  };

  const appendSentence = (sentence) => {
    const candidate = chunk ? `${chunk} ${sentence}` : sentence;
    if (
      candidate.length <= MAX_CHAT_MESSAGE_LENGTH &&
      (!chunk || Math.random() < 0.5)
    ) {
      chunk = candidate;
      return;
    }

    flush();

    if (sentence.length <= MAX_CHAT_MESSAGE_LENGTH) {
      chunk = sentence;
      return;
    }

    for (const word of sentence.match(/\S+/gu) || [sentence]) {
      if (word.length > MAX_CHAT_MESSAGE_LENGTH) {
        flush();
        const characters = Array.from(word);
        for (let index = 0; index < characters.length; index += MAX_CHAT_MESSAGE_LENGTH) {
          chunks.push(
            characters.slice(index, index + MAX_CHAT_MESSAGE_LENGTH).join("")
          );
        }
        continue;
      }

      const wordCandidate = chunk ? `${chunk} ${word}` : word;
      if (wordCandidate.length > MAX_CHAT_MESSAGE_LENGTH) {
        flush();
      }
      chunk = chunk ? `${chunk} ${word}` : word;
    }
    flush();
  };

  for (const paragraph of text.split(/\n+/u)) {
    for (const { segment } of sentenceSegmenter.segment(paragraph.trim())) {
      const sentence = segment.trim();
      if (sentence) {
        appendSentence(sentence);
      }
    }
    flush();
  }

  return chunks;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getCompositionDelay(text) {
  const typingRate = 10 + Math.random() * 4;
  return Math.min(7000, Math.max(700, 500 + text.length * typingRate));
}

async function generateReplyWhileTyping(channel, aiInput) {
  await channel.sendTyping();

  const typingRefresh = setInterval(() => {
    channel.sendTyping().catch((error) => {
      console.error("Typing indicator refresh failed:", error);
    });
  }, 8000);

  try {
    return await generateCharacterReply(aiInput);
  } finally {
    clearInterval(typingRefresh);
  }
}



client.on(Events.MessageCreate, lifecycle.handle(async (message) => {
  if (message.author.bot || message.webhookId) {
    return;
  }

  if (
    !message.inGuild() ||
    !message.channel.isThread() ||
    !message.content.trim()
  ) {
    return;
  }

  const threadId = message.channel.id;
  const receivedAt = performance.now();

  let releaseChat;
  try {
    // Check ownership before reserving a slot; reload history in the queue.
    const ownedConversation = await getConversationByThread(threadId, message.author.id);
    if (!ownedConversation) return;
    releaseChat = reserveChat(message.author.id);
    await recordCheckInActivity(
      threadId,
      message.author.id,
      getNextCheckInAt(message.createdAt)
    );
  } catch (error) {
    releaseChat?.();
    if (!(error instanceof LimitError)) {
      console.error("Chat admission failed:", error);
    }
    await message.channel.send({
      content: error instanceof LimitError
        ? error.message
        : "I couldn't check that conversation. Please try again later.",
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return;
  }
  const previousTask =
    conversationQueues.get(threadId) || Promise.resolve();

  const task = previousTask.catch(() => {}).then(async () => {
    let exchangeSaved = false;
    let stage = "loadConversation";
    const timings = { queueWaitMs: Math.round(performance.now() - receivedAt) };
    let stageStartedAt = performance.now();
    const finishStage = (nextStage) => {
      timings[`${stage}Ms`] = Math.round(performance.now() - stageStartedAt);
      stage = nextStage;
      stageStartedAt = performance.now();
    };

    try {
      // Load history after earlier messages have finished.
      const conversation = await getConversationByThread(
        threadId,
        message.author.id
      );
      finishStage("loadCharacter");

      if (!conversation) {
        return;
      }

      const character = await getCharacterById(
        conversation.characterId.toString(),
        message.author.id
      );
      finishStage("buildInput");

      if (!character) {
        return;
      }

      const aiInput = buildCharacterInput(
        character,
        conversation.messages || [],
        message.content
      );

      finishStage("thinking");
      if (Math.random() < 0.5) {
        await wait(700 + Math.floor(Math.random() * 1100));
      }
      finishStage("gemini");

      const replies = await generateReplyWhileTyping(message.channel, aiInput);
      const replyMessageGroups = replies.map(splitDiscordReply);
      finishStage("saveExchange");

      await saveConversationExchange({
        conversationId: conversation._id,
        ownerUserId: message.author.id,
        userMessage: message.content,
        assistantReplies: replyMessageGroups.flat(),
        userCreatedAt: message.createdAt,
      });
      finishStage("discordDelivery");

      exchangeSaved = true;







      for (
        let replyIndex = 0;
        replyIndex < replyMessageGroups.length;
        replyIndex += 1
      ) {
        const messages = replyMessageGroups[replyIndex];
        for (
          let messageIndex = 0;
          messageIndex < messages.length;
          messageIndex += 1
        ) {
          if (replyIndex > 0 || messageIndex > 0) {
            const isFollowUp = messageIndex === 0;
            const pause = isFollowUp
              ? 5640 + Math.floor(Math.random() * 1010)
              : 3650 + Math.floor(Math.random() * 1990);
            await wait(pause);
          }

          const content = messages[messageIndex];
          await message.channel.sendTyping();
          await wait(getCompositionDelay(content));
          await sendCharacterMessage(message.channel, {
            username: character.name,
            avatarURL: character.avatarUrl || DEFAULT_AVATAR_URL,
            content,
          });
        }
      }
      finishStage("complete");
      console.log("Character reply timing:", {
        messageId: message.id,
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
        ...timings,
        totalMs: Math.round(performance.now() - receivedAt),
      });
    } catch (error) {
      console.error("Character reply failed timing:", {
        messageId: message.id,
        failedStage: stage,
        ...timings,
        failedStageMs: Math.round(performance.now() - stageStartedAt),
        totalMs: Math.round(performance.now() - receivedAt),
      });
      console.error("Character conversation failed:", error);

      await message.channel.send({
        content: exchangeSaved
          ? "The reply was saved, but I couldn’t deliver it completely."
          : "I couldn’t complete that reply. Please try again.",
        allowedMentions: { parse: [] },
      }).catch(console.error);
    }
  });

  conversationQueues.set(threadId, task);

  try {
    await task;
  } finally {
    releaseChat();
    if (conversationQueues.get(threadId) === task) {
      conversationQueues.delete(threadId);
    }
  }
}));








client.on(Events.InteractionCreate, lifecycle.handle(async (interaction) => {
  try {
    if (
      interaction.isButton() &&
      interaction.customId.startsWith("character:avatar:retry:")
    ) {
      await handleCharacterAvatarRetry(interaction);
      return;
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("character:delete:")
    ) {
      const [, , action, ownerUserId, characterId] =
        interaction.customId.split(":");

      if (interaction.user.id !== ownerUserId) {
        await interaction.reply({
          content: "Only the user who started this deletion can confirm it.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (action === "cancel") {
        await interaction.update({
          content: "Character deletion canceled.",
          components: [],
        });
        return;
      }

      if (action !== "confirm") {
        return;
      }

      await interaction.deferUpdate();

      try {
        const character = await getCharacterById(characterId, ownerUserId);
        if (!character) {
          await interaction.editReply({
            content: "This character is no longer available to delete.",
            components: [],
          });
          return;
        }

        const conversations = await getConversationsByCharacter(
          ownerUserId,
          character._id
        );

        for (const conversation of conversations) {
          try {
            const guild = await client.guilds.fetch(conversation.guildId);
            const thread = await guild.channels.fetch(conversation.threadId);
            if (thread) {
              await thread.delete("Character deleted by its owner");
            }
          } catch (error) {
            if (error.code !== 10003) {
              throw error;
            }
          }
        }

        const deleted = await deleteCharacterAndConversations(
          characterId,
          ownerUserId
        );

        await interaction.editReply({
          content: deleted
            ? `Deleted **${character.name}**, its saved conversation history, and its chat threads.`
            : "This character was already deleted or is no longer available.",
          components: [],
        });
      } catch (error) {
        console.error("Character deletion failed:", error);
        await interaction.editReply({
          content:
            "Character deletion could not be completed. Some chat threads may already have been deleted; check your saved characters before retrying.",
          components: [],
        });
      }
      return;
    }

    // Let users select their own characters by name for chat and deletion.
    if (
      interaction.isAutocomplete() &&
      interaction.commandName === "character" &&
      ["chat", "delete"].includes(interaction.options.getSubcommand())
    ) {
      const search = interaction.options.getFocused().toLowerCase();
      const characters = await getCharactersByOwner(interaction.user.id);

      const choices = characters
        .filter((character) =>
          character.name.toLowerCase().includes(search)
        )
        .slice(0, 25)
        .map((character) => ({
          name: `${character.name} (${character._id.toString().slice(-6)})`,
          value: character._id.toString(),
        }));

      await interaction.respond(choices);
      return;
    }


    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "character"
    ) {
      const subcommand = interaction.options.getSubcommand();


      // Handle the /character subcommands: create, chat, list, view
      if (subcommand === "chat") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!interaction.inGuild() || interaction.channel?.type !== ChannelType.GuildText) {
          await interaction.editReply("Use this command in a regular server text channel.");
          return;
        }

        const characterId = interaction.options.getString("character", true);
        const openingKey = `${interaction.guildId}:${interaction.user.id}:${characterId}`;
        if (openingConversations.has(openingKey)) {
          await interaction.editReply("I'm already opening this character's chat. Please wait.");
          return;
        }
        openingConversations.add(openingKey);
        try {
          const character = await getCharacterById(characterId, interaction.user.id);
          if (!character) {
            await interaction.editReply("Please select one of your saved characters.");
            return;
          }
          const { thread, resumed, warning } = await openCharacterChat(interaction, character);
          await interaction.editReply({
            content: `${resumed ? "Continue your chat" : "Your chat is ready"} with ${character.name}: <#${thread.id}>` +
              (warning ? `\n${warning}` : ""),
            allowedMentions: { parse: [] },
          });
        } catch (error) {
          if (!(error instanceof ChatSetupError)) console.error("Chat setup failed:", error);
          await interaction.editReply({
            content: error instanceof ChatSetupError
              ? error.message
              : "I couldn't finish opening your chat. Check the bot logs and channel permissions.",
            allowedMentions: { parse: [] },
          }).catch(console.error);
        } finally {
          openingConversations.delete(openingKey);
        }
        return;
      }

      if (subcommand === "create") {
        await interaction.showModal(buildCharacterModal());
        return;
      }

      if (subcommand === "delete") {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });

        const characterId = interaction.options.getString("character", true);
        const character = await getCharacterById(
          characterId,
          interaction.user.id
        );
        if (!character) {
          await interaction.editReply({
            content: "I could not find that profile in your saved characters.",
          });
          return;
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `character:delete:confirm:${interaction.user.id}:${character._id}`
            )
            .setLabel("Delete character")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(
              `character:delete:cancel:${interaction.user.id}:${character._id}`
            )
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({
          content:
            `Are you sure you want to permanently delete **${character.name}**? ` +
            "This also deletes its saved conversation history and chat threads.",
          components: [row],
          allowedMentions: { parse: [] },
        });
        return;
      }

      if (subcommand === "list") {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });

        const characters = await getCharactersByOwner(interaction.user.id);
        if (!characters.length) {
          await interaction.editReply({
            content:
              "You have no saved characters yet. Use /character create to add one.",
            allowedMentions: { parse: [] },
          });
          return;
        }

        const messages = [];
        let currentMessage = "Your saved characters:\n";

        for (const character of characters) {
          const line = `${character.name} (ID: ${character._id})`;
          const nextMessage = `${currentMessage}${line}\n`;

          if (nextMessage.length > 2000) {
            messages.push(currentMessage.trimEnd());
            currentMessage = `${line}\n`;
          } else {
            currentMessage = nextMessage;
          }
        }

        messages.push(currentMessage.trimEnd());

        await interaction.editReply({
          content: messages[0],
          allowedMentions: { parse: [] },
        });

        for (const content of messages.slice(1)) {
          await interaction.followUp({
            content,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          });
        }
        return;
      }

      if (subcommand === "view") {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });

        const id = interaction.options.getString("id", true);
        const character = await getCharacterById(id, interaction.user.id);

        if (!character) {
          await interaction.editReply({
            content: "I could not find that profile in your saved characters.",
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(character.name)
          .setDescription(`Profile ID: ${character._id}`)
          .addFields(
            { name: "Franchise / source", value: character.franchise || "(not set)" },
            { name: "Personality", value: character.personality || "(not set)" },
            { name: "Backstory", value: character.backstory || "(not set)" },
            {
              name: "Speaking style",
              value: character.speakingStyle || "(not set)",
            },
            { name: "Greeting", value: character.greeting || "(not set)" }
          );

        await interaction.editReply({
          embeds: [embed],
          allowedMentions: { parse: [] },
        });
        return;
      }
    }

    if (
      interaction.isModalSubmit() &&
      (
        interaction.customId === "character:create" ||
        interaction.customId.startsWith("character:create:details:")
      )
    ) {
      await handleCharacterModal(interaction);
    }
  } catch (error) {
    console.error("Character interaction failed:", error);
    
    const errorReply = {
      content: "Something went wrong. Please try again.",
    };

    if (interaction.isRepliable()) {
      if (interaction.deferred) {
        await interaction.editReply(errorReply).catch(console.error);
      } else if (!interaction.replied) {
        await interaction.reply({
          ...errorReply,
          flags: MessageFlags.Ephemeral,
        }).catch(console.error);
      }
    }

  }
}));

async function startBot() {
  await connectToDatabase();
  // A signal may arrive while MongoDB is connecting.
  if (lifecycle.stopping) return;
  await client.login(process.env.DISCORD_TOKEN);
}

lifecycle.track(startBot).catch(() => {
  void lifecycle.shutdown("startup failure", 1);
});
