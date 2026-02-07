// worldChat.js - Isolated world chat module

const worldMessages = []; // Stores the last 50 messages
const userRateLimits = new Map(); // Tracks user rate limits

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

    // Clean up on disconnect
    socket.on("disconnect", () => {
      userRateLimits.delete(socket.id);
    });
  });
};