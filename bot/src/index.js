require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
  WebhookClient,
} = require("discord.js");

const characterWebhook = new WebhookClient({
  url: process.env.CHARACTER_WEBHOOK_URL,
});


const { buildCharacterModal } = require("./commands/character");
const { handleCharacterModal } = require("./interactions/characterModal");
const { buildCharacterInput } = require("./ai/characterInput");
const { generateCharacterReply } = require("./ai/gemini");
const { DEFAULT_AVATAR_URL } = require("./ai/characterAvatar");
const {
  connectToDatabase,
  getCharactersByOwner,
  getCharacterById,
  createConversation,
  getConversationByCharacter,
  getConversationByThread,
  saveConversationExchange,
} = require("./database/characters");


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});



// Each thread processes one message at a time.
const conversationQueues = new Map();

// Split long replies into messages that fit Discord's limit.
function splitDiscordReply(text) {
  const chunks = [];
  let chunk = "";

  for (const character of text) {
    if (chunk.length + character.length > 2000) {
      chunks.push(chunk);
      chunk = "";
    }

    chunk += character;
  }

  if (chunk) {
    chunks.push(chunk);
  }

  return chunks;
}



client.on(Events.MessageCreate, async (message) => {
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
  const previousTask =
    conversationQueues.get(threadId) || Promise.resolve();

  const task = previousTask.catch(() => {}).then(async () => {
    let exchangeSaved = false;

    try {
      // Load history after earlier messages have finished.
      const conversation = await getConversationByThread(
        threadId,
        message.author.id
      );

      if (!conversation) {
        return;
      }

      const character = await getCharacterById(
        conversation.characterId.toString(),
        message.author.id
      );

      if (!character) {
        return;
      }

      const aiInput = buildCharacterInput(
        character,
        conversation.messages || [],
        message.content
      );

      await message.channel.sendTyping().catch(() => {});

      const reply = await generateCharacterReply(aiInput);

      await saveConversationExchange({
        conversationId: conversation._id,
        ownerUserId: message.author.id,
        userMessage: message.content,
        assistantReply: reply,
        userCreatedAt: message.createdAt,
      });

      exchangeSaved = true;

      for (const chunk of splitDiscordReply(reply)) {
        await characterWebhook.send({
          threadId,
          username: character.name,
          avatarURL:
            character.avatarUrl || DEFAULT_AVATAR_URL,
          content: chunk,
          allowedMentions: { parse: [] },
        });
      }
    } catch (error) {
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
    if (conversationQueues.get(threadId) === task) {
      conversationQueues.delete(threadId);
    }
  }
});








client.on(Events.InteractionCreate, async (interaction) => {
  try {


    // Handle autocomplete for the /character chat subcommand
    // This allows users to search for their characters by name when using the chat command
    // displays a list of matching characters for the user to select from
    if (
      interaction.isAutocomplete() &&
      interaction.commandName === "character" &&
      interaction.options.getSubcommand() === "chat"
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
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });

        if (
          !interaction.inGuild() ||
          interaction.channel?.type !== ChannelType.GuildText
        ) {
          await interaction.editReply({
            content: "Use this command in a regular server text channel.",
          });
          return;
        }

        const characterId = interaction.options.getString("character", true);

        const character = await getCharacterById(
          characterId,
          interaction.user.id
        );

        if (!character) {
          await interaction.editReply({
            content: "Please select one of your saved characters.",
          });
          return;
        }

        const existingConversation = await getConversationByCharacter({
          ownerUserId: interaction.user.id,
          characterId: character._id,
          guildId: interaction.guildId,
        });

        if (existingConversation) {
          let existingThread;

          try {
            existingThread = await interaction.guild.channels.fetch(
              existingConversation.threadId
            );
          } catch (error) {
            // Discord error 10003 means the channel was deleted.
            if (error.code !== 10003) {
              throw error;
            }
          }

          if (
            !existingThread ||
            existingThread.type !== ChannelType.PrivateThread
          ) {
            await interaction.editReply({
              content:
                "Your saved conversation's thread is unavailable. " +
                "Your conversation data is still saved.",
            });
            return;
          }

          if (existingThread.archived) {
            await existingThread.setArchived(false);
          }

          await existingThread.members.add(interaction.user.id);

          await interaction.editReply({
            content:
              `Continue your chat with ${character.name}: ` +
              `<#${existingThread.id}>`,
            allowedMentions: { parse: [] },
          });
          return;
        }

        const greeting =
          character.greeting?.trim() ||
          `Hi! I'm ${character.name}. What would you like to talk about?`;

        const thread = await interaction.channel.threads.create({
          name: `Chat with ${character.name}`.slice(0, 100),
          type: ChannelType.PrivateThread,
          autoArchiveDuration: 1440,
          invitable: false,
        });

        await thread.members.add(interaction.user.id);

        await createConversation({
          threadId: thread.id,
          guildId: interaction.guildId,
          ownerUserId: interaction.user.id,
          characterId: character._id,
          greeting,
        });

        await characterWebhook.send({
          threadId: thread.id,
          username: character.name,
          avatarURL: "https://i.pinimg.com/736x/6a/c2/70/6ac2705ea2a0a9a5a905f50a3cf4a405.jpg",
          content: greeting,
          allowedMentions: { parse: [] },
        });

        await interaction.editReply({
          content: `Your chat with ${character.name} is ready: <#${thread.id}>`,
          allowedMentions: { parse: [] },
        });

        return;
      }







      if (subcommand === "create") {
        await interaction.showModal(buildCharacterModal());
        return;
      }

      if (subcommand === "list") {
        const characters = await getCharactersByOwner(interaction.user.id);
        if (!characters.length) {
          await interaction.reply({
            content:
              "You have no saved characters yet. Use /character create to add one.",
            flags: MessageFlags.Ephemeral,
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

        await interaction.reply({
          content: messages[0],
          flags: MessageFlags.Ephemeral,
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
        const id = interaction.options.getString("id", true);
        const character = await getCharacterById(id, interaction.user.id);

        if (!character) {
          await interaction.reply({
            content: "I could not find that profile in your saved characters.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(character.name)
          .setDescription(`Profile ID: ${character._id}`)
          .addFields(
            { name: "Personality", value: character.personality || "(not set)" },
            { name: "Backstory", value: character.backstory || "(not set)" },
            {
              name: "Speaking style",
              value: character.speakingStyle || "(not set)",
            },
            { name: "Greeting", value: character.greeting || "(not set)" }
          );

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
        return;
      }
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId === "character:create"
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
});

async function startBot() {
  await connectToDatabase();
  await client.login(process.env.DISCORD_TOKEN);
}

startBot().catch((error) => {
  console.error("Bot startup failed:", error);
  process.exitCode = 1;
});
