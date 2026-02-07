// worldChat.js - Isolated world chat module

const worldMessages = []; // Stores the last 50 messages
const userRateLimits = new Map(); // Tracks user rate limits
const onlineUsers = new Map(); // displayName -> socket.id

module.exports = (io) => {
  io.on("connection", (socket) => {
    // Send last 50 messages to the client
    socket.emit("world:init", worldMessages);

    // Handle new world messages
    socket.on("world:message", (data) => {
      const { sender, message } = data;

      // Basic sanitize message (remove HTML tags)
      const sanitizedMessage = message.trim().replace(/<[^>]*>/g, '');
      if (!sanitizedMessage) return; // Reject empty messages

      // Rate limit enforcement
      const now = Date.now();
      const lastMessageTime = userRateLimits.get(socket.id) || 0;
      if (now - lastMessageTime < 2000) return; // 2-second limit
      userRateLimits.set(socket.id, now);

      // Update online users map
      onlineUsers.set(sender, socket.id);

      // Create message object
      const newMessage = {
        type: "world",
        sender,
        message: sanitizedMessage,
        timestamp: now,
      };

      // Add to message history and trim
      worldMessages.push(newMessage);
      if (worldMessages.length > 50) worldMessages.shift();

      // Broadcast to all clients
      io.emit("world:message", newMessage);
    });

    // Handle whisper messages
    socket.on("whisper:send", (data) => {
      const { sender, message } = data;

      // Parse whisper format: @name: message
      const whisperRegex = /^@([^:]+):\s*(.+)$/;
      const match = message.match(whisperRegex);
      if (!match) return; // Not a whisper, ignore

      const targetName = match[1].trim();
      const whisperMessage = match[2].trim();
      if (!whisperMessage) return; // Empty message

      const now = Date.now();

      // Rate limit enforcement (same as world chat)
      const lastMessageTime = userRateLimits.get(socket.id) || 0;
      if (now - lastMessageTime < 2000) return;
      userRateLimits.set(socket.id, now);

      // Update online users map
      onlineUsers.set(sender, socket.id);

      // Find target socket
      const targetSocketId = onlineUsers.get(targetName);
      if (!targetSocketId) {
        // Target not online, send system message to sender
        const systemMessage = {
          type: "whisper",
          from: "System",
          to: sender,
          message: "Player is offline or does not exist",
          timestamp: now,
        };
        socket.emit("whisper:receive", systemMessage);
        return;
      }

      // Create whisper message
      const whisperData = {
        type: "whisper",
        from: sender,
        to: targetName,
        message: whisperMessage,
        timestamp: now,
      };

      // Send to sender and target
      socket.emit("whisper:receive", whisperData);
      io.to(targetSocketId).emit("whisper:receive", whisperData);
    });

    // Clean up on disconnect
    socket.on("disconnect", () => {
      userRateLimits.delete(socket.id);
      // Note: Not removing from onlineUsers as displayName might be reused
      // TODO: Implement proper user tracking for logout
    });
  });
};