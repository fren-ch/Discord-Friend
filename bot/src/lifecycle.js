function createLifecycle({
  client,
  closeDatabase,
  drainMs = 25000,
  hardStopMs = 30000,
  processRef = process,
  logger = console,
}) {
  if (hardStopMs <= drainMs) {
    throw new Error("hardStopMs must leave time for cleanup after drainMs");
  }
  const active = new Set();
  let stopping = false;
  let shutdownPromise;

  function track(task) {
    const pending = Promise.resolve().then(task);
    active.add(pending);
    pending.then(
      () => active.delete(pending),
      error => {
        active.delete(pending);
        logger.error("Bot task failed:", error);
      }
    );
    return pending;
  }

  function handle(handler) {
    return (...args) => {
      if (stopping) return;
      return track(() => handler(...args));
    };
  }

  function shutdown(reason, requestedExitCode = 0) {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    shutdownPromise = (async () => {
      let exitCode = requestedExitCode;
      logger.log(`Shutting down (${reason}); waiting for ${active.size} task(s).`);
      const forceTimer = setTimeout(() => {
        logger.error("Shutdown deadline reached; forcing exit.");
        processRef.exit(1);
      }, hardStopMs);
      let drainTimer;
      try {
        const drained = await Promise.race([
          Promise.allSettled([...active]).then(() => true),
          new Promise(resolve => {
            drainTimer = setTimeout(() => resolve(false), drainMs);
          }),
        ]);
        clearTimeout(drainTimer);
        if (!drained) {
          exitCode = 1;
          logger.error(`Drain deadline reached; ${active.size} task(s) unfinished.`);
        }

        try {
          await client.destroy();
        } catch (error) {
          exitCode = 1;
          logger.error("Discord shutdown failed:", error);
        }
        try {
          await closeDatabase();
        } catch (error) {
          exitCode = 1;
          logger.error("MongoDB shutdown failed:", error);
        }
        logger.log("Bot shutdown complete.");
      } catch (error) {
        exitCode = 1;
        logger.error("Bot shutdown failed:", error);
      } finally {
        clearTimeout(drainTimer);
        clearTimeout(forceTimer);
        processRef.exit(exitCode);
      }
    })();
    return shutdownPromise;
  }

  return {
    handle,
    track,
    shutdown,
    get stopping() { return stopping; },
  };
}

module.exports = { createLifecycle };
