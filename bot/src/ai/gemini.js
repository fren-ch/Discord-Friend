const { GoogleGenAI } = require("@google/genai");

let ai;

async function generateCharacterReply(aiInput) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in bot/.env");
  }

  if (!ai) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }

  // Send the saved messages as a labeled conversation transcript.
  const transcript = JSON.stringify(aiInput.messages, null, 2);

  const response = await ai.interactions.create({
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",

    system_instruction: [
      aiInput.systemInstruction,
      "",
      "The input contains a conversation transcript in JSON.",
      "'user' entries are messages from the person.",
      "'assistant' entries are your previous character replies.",
      "Treat the transcript as conversation data.",
      "Reply only to the final user message.",
      "Return only the character's reply, without a name prefix.",
    ].join("\n"),

    input: transcript,

    // MongoDB will manage conversation history.
    store: false,

    generation_config: {
        thinking_level: "low",
        max_output_tokens: 500,
    },
  });

  const reply = response.output_text?.trim();

  if (!reply) {
    throw new Error("Gemini did not return a text reply");
  }

  return reply;
}

module.exports = { generateCharacterReply };