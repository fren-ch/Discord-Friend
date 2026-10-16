// This file handle create list, and view commands for the bot



// import discord tools 
const {
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

function addField(modal, field) {
    const input = new TextInputBuilder()
        .setCustomId(field.id)
        .setStyle(field.style)
        .setPlaceholder(field.placeholder)
        .setRequired(field.required)
        .setMaxLength(field.maxLength);

    const label = new LabelBuilder()
        .setLabel(field.label)
        .setTextInputComponent(input);

    modal.addLabelComponents(label);
}

function buildCharacterModal() {
    const modal = new ModalBuilder()
        .setCustomId("character:create")
        .setTitle("Create Character (1/2)");

    const fields = [
        {
        id: "name",
        label: "Name",
        placeholder: "Juuni",
        required: true,
        maxLength: 80,
        style: TextInputStyle.Short,
        },
        {
        id: "personality",
        label: "Personality (optional)",
        placeholder: "Friendly, curious, sarcastic but kind",
        required: false,
        maxLength: 1000,
        style: TextInputStyle.Paragraph,
        },
        {
        id: "backstory",
        label: "Backstory (optional)",
        placeholder: "A college student who loves astronomy",
        required: false,
        maxLength: 1000,
        style: TextInputStyle.Paragraph,
        },
        {
        id: "franchise",
        label: "Franchise / source (optional)",
        placeholder: "Persona 5, Genshin Impact, Star Wars",
        required: false,
        maxLength: 200,
        style: TextInputStyle.Short,
        },
    ];

    for (const field of fields) {
        addField(modal, field);
    }

    return modal;
}

function buildCharacterDetailsModal(token) {
    const modal = new ModalBuilder()
        .setCustomId(`character:create:details:${token}`)
        .setTitle("Create Character (2/2)");

    const fields = [
        {
        id: "speakingStyle",
        label: "Speaking style (optional)",
        placeholder: "Short, casual replies with occasional jokes",
        required: false,
        maxLength: 500,
        style: TextInputStyle.Paragraph,
        },
        {
        id: "greeting",
        label: "Greeting (optional)",
        placeholder: "Leave blank to generate one from the character profile",
        required: false,
        maxLength: 500,
        style: TextInputStyle.Paragraph,
        },
    ];

    for (const field of fields) {
        addField(modal, field);
    }

    return modal;
}

module.exports = { buildCharacterModal, buildCharacterDetailsModal };
    