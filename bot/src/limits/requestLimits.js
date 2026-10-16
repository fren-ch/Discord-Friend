class LimitError extends Error {}

const users = new Map();
const MAX_GEMINI_ACTIVE = 10;
const MAX_GEMINI_WAITING = 30;
let geminiActive = 0;
const geminiWaiting = [];

function userState(userId) {
  if (!users.has(userId)) {
    users.set(userId, {
      lastChat: -Infinity,
      lastCreation: -Infinity,
      pendingChats: 0,
      creating: false,
      touchedAt: Date.now(),
    });
  }
  const state = users.get(userId);
  state.touchedAt = Date.now();
  return state;
}

function reserveChat(userId) {
  const state = userState(userId);
  if (state.pendingChats >= 3) {
    throw new LimitError("You already have 3 chat requests pending. Please wait.");
  }
  const remaining = 1000 - (Date.now() - state.lastChat);
  if (remaining > 0) {
    throw new LimitError(`Please wait ${Math.ceil(remaining / 1000)} second(s) before sending another message.`);
  }
  state.lastChat = Date.now();
  state.pendingChats += 1;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      state.pendingChats -= 1;
    }
  };
}

function reserveCreation(userId) {
  const state = userState(userId);
  if (state.creating) {
    throw new LimitError("Your previous character is still being created.");
  }
  const remaining = 60000 - (Date.now() - state.lastCreation);
  if (remaining > 0) {
    throw new LimitError(`Please wait ${Math.ceil(remaining / 1000)} second(s) before creating another character.`);
  }
  state.lastCreation = Date.now();
  state.creating = true;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      state.creating = false;
    }
  };
}

async function withGeminiSlot(task) {
  if (geminiActive < MAX_GEMINI_ACTIVE) {
    geminiActive += 1;
  } else {
    if (geminiWaiting.length >= MAX_GEMINI_WAITING) {
      throw new LimitError("The bot is busy. Please try again shortly.");
    }
    await new Promise((resolve, reject) => {
      const entry = { resolve, timer: undefined };
      entry.timer = setTimeout(() => {
        const index = geminiWaiting.indexOf(entry);
        if (index !== -1) {
          geminiWaiting.splice(index, 1);
          reject(new LimitError("The bot is busy. Please try again shortly."));
        }
      }, 30000);
      geminiWaiting.push(entry);
    });
  }

  try {
    return await task();
  } finally {
    const next = geminiWaiting.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve(); // Transfer this slot to the next waiting request.
    } else {
      geminiActive -= 1;
    }
  }
}

function generateWithLimit(client, params, options = {}) {
  return withGeminiSlot(() => client.interactions.create(params, {
    ...options,
    timeout: options.timeout ?? 30000,
    maxRetries: 0,
  }));
}

// Discard idle user records without resetting active requests or cooldowns.
setInterval(() => {
  for (const [id, state] of users) {
    if (!state.creating && state.pendingChats === 0 &&
        Date.now() - state.touchedAt > 120000) {
      users.delete(id);
    }
  }
}, 60000).unref();

module.exports = { LimitError, reserveChat, reserveCreation, generateWithLimit };
