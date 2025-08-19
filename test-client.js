const io = require("socket.io-client");

// Connect to server
const socket = io("http://localhost:5001");

socket.on("connect", () => {
  console.log("✅ Connected to server:", socket.id);

  // Test join room
  const roomId = "29fd31fe-304f-4680-9f61-8848a37a13fa";
  const userId = "test-user-456";

  console.log(`🏠 Joining room: ${roomId}`);
  socket.emit("join-room", roomId, userId, { name: "Test User" });
});

socket.on("room-joined", (data) => {
  console.log("🎉 Successfully joined room:", data);
});

socket.on("user-connected", (data) => {
  console.log("👤 New user connected:", data);
});

socket.on("error", (error) => {
  console.error("❌ Socket error:", error);
});

socket.on("disconnect", () => {
  console.log("👋 Disconnected from server");
});

// Test for 10 seconds then disconnect
setTimeout(() => {
  console.log("🔚 Test completed, disconnecting...");
  socket.disconnect();
  process.exit(0);
}, 10000);
