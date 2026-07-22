const base = process.env.BASE_URL || "http://localhost:3000";

const createRes = await fetch(`${base}/api/chats`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    prompt:
      "Create a simple stopwatch with start, pause, and reset using Button and Card from shadcn.",
  }),
});

const createJson = await createRes.json();
if (!createRes.ok) {
  console.error("CREATE_FAIL", createJson);
  process.exit(1);
}

const chatId = createJson.chat.id;
console.log("CHAT_ID", chatId);

const chatRes = await fetch(`${base}/api/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chatId,
    isFirst: true,
    message: createJson.chat.messages[0].content,
  }),
});

console.log("CHAT_STATUS", chatRes.status);
if (!chatRes.ok) {
  console.error(await chatRes.text());
  process.exit(1);
}

const text = await chatRes.text();
console.log("LEN", text.length);
console.log(text.slice(0, 1200));
console.log("---HAS_FILE_EVENT---", /"type"\s*:\s*"file"/.test(text));
console.log("---HAS_DONE_EVENT---", /"type"\s*:\s*"done"/.test(text));
