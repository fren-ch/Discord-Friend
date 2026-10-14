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
      "Return the main reply first, without a name prefix.",
      "If the reply needs more than one message, put each continuation after",
      "the previous message, using this marker on its own line between every",
      "message. Use as many continuations as needed to complete the thought,",
      "but stop when it is complete and do not pad or repeat it:",
      "[[FOLLOW_UP]]",
      "Do not include the marker when the reply fits in one message.",
      "The marker is formatting and must not appear in the character's text.",
    ].join("\n"),

    input: transcript,

    // MongoDB will manage conversation history.
    store: false,

    generation_config: {
      thinking_level: "low",
      max_output_tokens: 1400,
    },
  });

  const output = response.output_text?.trim();

  if (!output) {
    throw new Error("Gemini did not return a text reply");
  }

  const replies = output
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\[\[FOLLOW_UP\]\]\s*\n/)
    .map((reply) => reply.trim())
    .filter(Boolean);

  if (replies.length === 0) {
    throw new Error("Gemini returned no usable reply messages");
  }

  return replies;
}

module.exports = { generateCharacterReply };