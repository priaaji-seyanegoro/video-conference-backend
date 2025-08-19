const io = require('socket.io-client');
const axios = require('axios');

// Configuration
const SERVER_URL = 'http://localhost:5001';
let ROOM_ID = null; // Will be set dynamically

function createUser(userId, userName) {
  const socket = io(SERVER_URL);

  socket.on("connect", () => {
    console.log(`✅ ${userName} connected:`, socket.id);

    // Join the existing room
    socket.emit("join-room", ROOM_ID, userId, { name: userName });
  });

  socket.on("room-joined", (data) => {
    console.log(`🎉 ${userName} joined room:`, {
      roomId: data.roomId,
      existingUsers: data.existingUsers.length,
      iceServers: data.iceServers.length,
      userInfo: data.user,
    });
  });

  socket.on("user-connected", (data) => {
    console.log(`👤 ${userName} sees new user:`, data.userId);
  });

  socket.on("offer", (data) => {
    console.log(`📞 ${userName} received offer from:`, data.sender);

    // Simulate answer with delay
    setTimeout(() => {
      socket.emit("answer", {
        target: data.sender,
        answer: {
          type: "answer",
          sdp: `mock-answer-sdp-${userName}-to-${data.sender}`,
        },
      });
    }, 500 + Math.random() * 1000); // Random delay 0.5-1.5s
  });

  socket.on("answer", (data) => {
    console.log(`📱 ${userName} received answer from:`, data.sender);
  });

  socket.on("ice-candidate", (data) => {
    console.log(`🧊 ${userName} received ICE candidate from:`, data.sender);
  });

  socket.on("error", (error) => {
    console.log(`❌ ${userName} error:`, error);
  });

  socket.on("disconnect", () => {
    console.log(`🔌 ${userName} disconnected`);
  });

  return socket;
}

async function checkRoomExists() {
  try {
    console.log('🏠 Creating new room...');
    const response = await axios.post(`${SERVER_URL}/api/rooms`, {
      settings: { maxUsers: 10 }
    });
    
    ROOM_ID = response.data.roomId; // Use the actual created room ID
    console.log('✅ Room created:', ROOM_ID);
    
    return true;
  } catch (error) {
    console.log('❌ Failed to create room:', error.message);
    return false;
  }
}

async function runTest() {
  console.log('🚀 Starting Enhanced WebRTC Test...');
  
  // Create room and get actual room ID
  const roomReady = await checkRoomExists();
  if (!roomReady) {
    console.log('❌ Cannot proceed without room');
    process.exit(1);
  }
  
  console.log(`🏠 Using room: ${ROOM_ID}`);
  console.log('\n👥 Creating users...');
  
  // Create 3 users with the actual room ID
  const user1 = createUser('user-1', 'Alice');
  const user2 = createUser('user-2', 'Bob');
  const user3 = createUser('user-3', 'Charlie');
  
  // Wait for connections and room joins
  setTimeout(() => {
    console.log("\n🔄 Starting WebRTC signaling simulation...");

    // User 1 offers to User 2
    user1.emit("offer", {
      target: "user-2",
      offer: {
        type: "offer",
        sdp: "mock-offer-sdp-alice-to-bob",
      },
    });

    // User 1 offers to User 3
    setTimeout(() => {
      user1.emit("offer", {
        target: "user-3",
        offer: {
          type: "offer",
          sdp: "mock-offer-sdp-alice-to-charlie",
        },
      });
    }, 1000);

    // User 2 offers to User 3
    setTimeout(() => {
      user2.emit("offer", {
        target: "user-3",
        offer: {
          type: "offer",
          sdp: "mock-offer-sdp-bob-to-charlie",
        },
      });
    }, 2000);

    // Simulate ICE candidates
    setTimeout(() => {
      console.log("\n🧊 Simulating ICE candidates...");

      user1.emit("ice-candidate", {
        target: "user-2",
        candidate: {
          candidate:
            "candidate:1 1 UDP 2130706431 192.168.1.100 54400 typ host",
          sdpMLineIndex: 0,
          sdpMid: "audio",
        },
      });

      user2.emit("ice-candidate", {
        target: "user-1",
        candidate: {
          candidate:
            "candidate:2 1 UDP 2130706431 192.168.1.101 54401 typ host",
          sdpMLineIndex: 0,
          sdpMid: "audio",
        },
      });
    }, 4000);
  }, 3000);

  // Check room stats during test
  setTimeout(async () => {
    try {
      const statsResponse = await axios.get(`${SERVER_URL}/api/webrtc/stats`);
      console.log("\n📊 WebRTC Stats:", statsResponse.data);

      const roomResponse = await axios.get(
        `${SERVER_URL}/api/webrtc/rooms/${ROOM_ID}`
      );
      console.log("\n🏠 Room WebRTC Info:", {
        userCount: roomResponse.data.userCount,
        totalConnections: roomResponse.data.totalConnections,
      });
    } catch (error) {
      console.log("⚠️ Could not fetch stats:", error.message);
    }
  }, 8000);

  // Cleanup after 15 seconds
  setTimeout(() => {
    console.log("\n🔚 Test completed, disconnecting...");
    user1.disconnect();
    user2.disconnect();
    user3.disconnect();

    setTimeout(() => {
      console.log("✅ All users disconnected");
      process.exit(0);
    }, 1000);
  }, 15000);
}

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n🛑 Test interrupted");
  process.exit(0);
});

// Run the test
runTest().catch((error) => {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
});
