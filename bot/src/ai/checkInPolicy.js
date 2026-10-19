// Timing uses explicit profile traits and recent user requests, without another API call.
const POLICIES = {
  normal: { minMinutes: 60, maxMinutes: 1440 },
  needy: { minMinutes: 15, maxMinutes: 60 },
  obsessive: { minMinutes: 10, maxMinutes: 30 },
};

function attachmentStyle(text) {
  const sentences = String(text || "").toLowerCase().split(/[.!?;\n]+/);
  let style = "normal";
  for (const sentence of sentences) {
    // Avoid interpreting denied traits as requests for more contact.
    if (/\b(not|never|no|without|stop|don't|do not|less)\b/.test(sentence)) continue;
    if (/\b(obsessive|obsessed|possessive|yandere)\b/.test(sentence)) return "obsessive";
    if (/\b(needy|clingy|attached|attention.seeking)\b/.test(sentence)) style = "needy";
  }
  return style;
}

function getCheckInPolicy(character = {}, history = []) {
  let style = attachmentStyle([character.personality, character.speakingStyle].filter(Boolean).join(". "));
  for (const message of history.filter((entry) => entry.role === "user").slice(-12)) {
    const text = String(message.content || "").toLowerCase();
    if (/\b(stop checking|stop messaging|leave me alone|give me (some )?space|check in less|less often)\b/.test(text)) {
      style = "normal";
      continue;
    }
    // Only user requests about this relationship affect frequency, not assistant claims.
    if (/\b(be|act|become|want you|our relationship|with me|about me|over me|check in|message me)\b/.test(text)) {
      const requested = attachmentStyle(text);
      if (requested !== "normal") style = requested;
      else if (/\b(check in|message me)\s+(more often|frequently)\b/.test(text)) style = "needy";
    }
  }
  return { style, ...POLICIES[style] };
}

function getNextCheckInAt(from = new Date(), character = {}, history = []) {
  const latestUserMessage = history.filter((message) => message.role === "user").at(-1);
  if (shouldPauseCheckIns(latestUserMessage?.content)) return null;
  const { minMinutes, maxMinutes } = getCheckInPolicy(character, history);
  const delay = minMinutes * 60000 + Math.floor(Math.random() * ((maxMinutes - minMinutes) * 60000 + 1));
  return new Date(from.getTime() + delay);
}

function shouldPauseCheckIns(content) {
  const text = String(content || "").toLowerCase().replace(/[’]/g, "'");
  if (/\b(don't|do not|never|can't|cannot|won't)\s+stop\b/.test(text)) return false;
  return /\b(stop|pause|leave me alone|give me (some )?space|do not (message|contact|check)|don't (message|contact|check)|no more (messages|check.ins)|take a break)\b/.test(text);
}

module.exports = { getCheckInPolicy, getNextCheckInAt, shouldPauseCheckIns };
