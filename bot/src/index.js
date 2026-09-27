
//This file conneccts Discord and route connections


require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
} = require("discord.js");



const { MessageFlags } = require("discord.js");
const { buildCharacterModal } = require("./commands/character");
const {
  handleCharacterModal,
} = require("./interactions/characterModal");

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
      } else {
        await interaction.reply({
          content: "This command is not implemented yet.",
          flags: MessageFlags.Ephemeral,
        });
      }

      return;
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




client.login(process.env.DISCORD_TOKEN);