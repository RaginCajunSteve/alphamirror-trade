process.env.POLL_MS = "999999999";
const mod = await import("./keeper.mjs");
setTimeout(() => {
  console.log("Single keeper tick complete.");
  process.exit(0);
}, 3000);