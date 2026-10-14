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
      "If a separate follow-up fits naturally, put it after the main reply",
      "on a new line using exactly this marker on its own line:",
      "[[FOLLOW_UP]]",
      "Do not include that marker when there is no follow-up.",
      "The marker is formatting and must not appear in the character's text.",
    ].join("\n"),

    input: transcript,

    // MongoDB will manage conversation history.
    store: false,

    generation_config: {
      thinking_level: "low",
      max_output_tokens: 700,
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

  if (replies.length === 0 || replies.length > 2) {
    throw new Error("Gemini returned an invalid number of reply messages");
  }

  return replies;
}

module.exports = { generateCharacterReply };