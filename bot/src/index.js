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

      if (subcommand === "chat") {  // Handle the /character chat subcommand
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
            content: "Please select one of your saved characters.",
          });
          return;
        }

        await interaction.editReply({
          content: `Selected ${character.name}. Chat setup is working!`,
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
        const content = characters.length
          ? characters
              .map((character) => `${character.name} (ID: ${character._id})`)
              .join("\n")
          : "You have no saved characters yet. Use /character create to add one.";

        await interaction.reply({
          content,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
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