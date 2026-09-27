// This file handle create list, and view commands for the bot



// import discord tools 
const {
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");


// builds a 5 field form using discord.js moddal components
function buildCharacterModal() {
    // Create a new modal
    const modal = new ModalBuilder()
        .setCustomId("character:create")
        .setTitle("Create a New Character");

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
        label: "Personality",
        placeholder: "Friendly, curious, sarcastic but kind",
        required: true,
        maxLength: 1000,
        style: TextInputStyle.Paragraph,
        },
        {
        id: "backstory",
        label: "Backstory",
        placeholder: "A college student who loves astronomy",
        required: false,
        maxLength: 1000,
        style: TextInputStyle.Paragraph,
        },
        {
        id: "speakingStyle",
        label: "Speaking style",
        placeholder: "Short, casual replies with occasional jokes",
        required: false,
        maxLength: 500,
        style: TextInputStyle.Paragraph,
        },
        {
        id: "greeting",
        label: "Greeting",
        placeholder: "hey, what have you been up to?",
        required: false,
        maxLength: 500,
        style: TextInputStyle.Paragraph,
        },
    ];

    for (const field of fields) {
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

    return modal;
}

    // exports the buildCharacterModal function for use in other files
    module.exports = { buildCharacterModal };
    