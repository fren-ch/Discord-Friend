require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");

const { buildCharacterModal } = require("./commands/character");
const { handleCharacterModal } = require("./interactions/characterModal");
const {
  connectToDatabase,
  getCharactersByOwner,
  getCharacterById,
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

client.on(Events.MessageCreate, (message) => {
  // Don't let the bot respond to itself
  if (message.author.bot) {
    return;
  }

  console.log(`${message.author.username}: ${message.content}`);

  if (message.content.toLowerCase() === "hello") {
    message.reply("gay");
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "character"
    ) {
      const subcommand = interaction.options.getSubcommand();

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

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content: "Something went wrong. Please try again.",
        flags: MessageFlags.Ephemeral,
      }).catch(console.error);
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