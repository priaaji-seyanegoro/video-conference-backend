class Room {
  constructor(roomId, createdBy = null) {
    this.roomId = roomId;
    this.users = new Map(); // userId -> user object
    this.createdAt = new Date();
    this.createdBy = createdBy;
    this.isActive = true;
    this.maxUsers = 10; // Default max users
    this.settings = {
      allowScreenShare: true,
      allowChat: true,
      requirePassword: false,
      password: null,
      recordingEnabled: false
    };
  }

  // Add user with validation
  addUser(userId, userInfo) {
    if (this.users.size >= this.maxUsers) {
      throw new Error(`Room is full. Maximum ${this.maxUsers} users allowed.`);
    }
    
    if (this.users.has(userId)) {
      throw new Error('User already in room');
    }

    const user = {
      userId,
      name: userInfo.name || `User ${userId.slice(0, 8)}`,
      socketId: userInfo.socketId,
      joinedAt: new Date(),
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: false,
      role: this.users.size === 0 ? 'host' : 'participant' // First user is host
    };

    this.users.set(userId, user);
    return user;
  }

  // Remove user
  removeUser(userId) {
    const user = this.users.get(userId);
    if (user) {
      this.users.delete(userId);
      
      // If host leaves, assign new host
      if (user.role === 'host' && this.users.size > 0) {
        const newHost = this.users.values().next().value;
        newHost.role = 'host';
      }
      
      return user;
    }
    return null;
  }

  // Get user by socket ID
  getUserBySocketId(socketId) {
    for (const user of this.users.values()) {
      if (user.socketId === socketId) {
        return user;
      }
    }
    return null;
  }

  // Update user media status
  updateUserMedia(userId, mediaType, enabled) {
    const user = this.users.get(userId);
    if (user) {
      if (mediaType === 'audio') {
        user.isAudioEnabled = enabled;
      } else if (mediaType === 'video') {
        user.isVideoEnabled = enabled;
      } else if (mediaType === 'screen') {
        user.isScreenSharing = enabled;
      }
      return user;
    }
    return null;
  }

  // Get room info
  getRoomInfo() {
    return {
      roomId: this.roomId,
      userCount: this.users.size,
      maxUsers: this.maxUsers,
      isActive: this.isActive,
      createdAt: this.createdAt,
      settings: this.settings,
      users: Array.from(this.users.values()).map(user => ({
        userId: user.userId,
        name: user.name,
        role: user.role,
        isAudioEnabled: user.isAudioEnabled,
        isVideoEnabled: user.isVideoEnabled,
        isScreenSharing: user.isScreenSharing,
        joinedAt: user.joinedAt
      }))
    };
  }

  // Check if room is empty
  isEmpty() {
    return this.users.size === 0;
  }

  // Validate password
  validatePassword(password) {
    if (!this.settings.requirePassword) return true;
    return this.settings.password === password;
  }
}

module.exports = Room;