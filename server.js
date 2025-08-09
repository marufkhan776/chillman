// server.js
// Backend for WatchTogether application
// ------------------------------------
// Serves static frontend from /public and handles real-time room logic via Socket.IO.
// All data is kept in memory – good enough for small hobby deployments.

const path = require('path');
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: '*'
  }
});

const PORT = process.env.PORT || 10000;

// In-memory room store. Resets whenever the server restarts.
const rooms = {};

app.use(express.json()); // Parse JSON request bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend

//--------------------------------------------------
// Helper utilities
//--------------------------------------------------
function generateRoomCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Skip ambiguous characters
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure uniqueness (extremely unlikely clash but just in case)
  return rooms[code] ? generateRoomCode(length) : code;
}

//--------------------------------------------------
// REST endpoints
//--------------------------------------------------
// Create a new room. Expects { videoURL }
app.post('/create-room', (req, res) => {
  const { videoURL } = req.body;
  if (!videoURL || typeof videoURL !== 'string') {
    return res.status(400).json({ error: 'Invalid video URL.' });
  }

  const roomCode = generateRoomCode();
  rooms[roomCode] = {
    videoURL,
    currentTime: 0,
    isPlaying: false,
    adminSocketId: null, // Assigned when creator joins via Socket.IO
    users: []
  };
  res.json({ roomCode });
});

// Join an existing room by code – simple validation route.
app.post('/join-room', (req, res) => {
  const { roomCode } = req.body;
  if (!roomCode || !rooms[roomCode]) {
    return res.status(404).json({ error: 'Room not found.' });
  }
  res.json({ success: true });
});

//--------------------------------------------------
// Socket.IO real-time logic
//--------------------------------------------------
io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);

  socket.on('joinRoom', ({ roomCode, username, isAdmin }) => {
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('errorMessage', 'Room does not exist.');
      return;
    }

    // Store user
    const randomTag = Math.random().toString(36).substring(2, 7);
    const user = { id: socket.id, name: username || `User-${randomTag}` };
    room.users.push(user);

    // Assign admin socket if not set and this user created room
    if (isAdmin || !room.adminSocketId) {
      room.adminSocketId = socket.id;
    }

    socket.join(roomCode);

    // Send current video state to the newly joined user
    socket.emit('videoState', {
      videoURL: room.videoURL,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      adminId: room.adminSocketId,
    });

    // Notify everyone in the room about updated user list
    io.to(roomCode).emit('userListUpdate', room.users);

    console.log(`${username} joined room ${roomCode}`);
  });

  // Handle incoming chat messages
  socket.on('chatMessage', ({ roomCode, message }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const user = room.users.find((u) => u.id === socket.id);
    if (!user) return;
    io.to(roomCode).emit('chatMessage', {
      name: user.name,
      message,
      time: new Date().toISOString(),
    });
  });

  // Video control events from admin
  socket.on('videoControl', ({ roomCode, action, currentTime, videoURL }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (socket.id !== room.adminSocketId) return; // Only admin can control

    switch (action) {
      case 'play':
        room.isPlaying = true;
        if (typeof currentTime === 'number') room.currentTime = currentTime;
        break;
      case 'pause':
        room.isPlaying = false;
        if (typeof currentTime === 'number') room.currentTime = currentTime;
        break;
      case 'seek':
        room.currentTime = currentTime;
        break;
      case 'changeVideo':
        if (videoURL) {
          room.videoURL = videoURL;
          room.currentTime = 0;
          room.isPlaying = false;
        }
        break;
      default:
        return;
    }

    // Broadcast the control event to all users (including admin for consistency)
    io.to(roomCode).emit('videoControl', {
      action,
      currentTime: room.currentTime,
      videoURL: room.videoURL,
      adminId: room.adminSocketId,
    });
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    // Find the room(s) this socket was part of
    for (const [code, room] of Object.entries(rooms)) {
      const idx = room.users.findIndex((u) => u.id === socket.id);
      if (idx !== -1) {
        const [removed] = room.users.splice(idx, 1);

        // If admin left, promote next user (if any) to admin
        if (socket.id === room.adminSocketId) {
          room.adminSocketId = room.users.length ? room.users[0].id : null;
          // Notify remaining users of new admin via videoControl broadcast
          io.to(code).emit('videoControl', {
            action: 'adminChange',
            adminId: room.adminSocketId,
          });
        }

        // Update user list for room
        io.to(code).emit('userListUpdate', room.users);
        console.log(`${removed.name} left room ${code}`);
      }

      // Cleanup empty rooms to free memory
      if (room.users.length === 0) {
        delete rooms[code];
      }
    }
  });
});

//--------------------------------------------------
// Start server
//--------------------------------------------------
http.listen(PORT, () => {
  console.log(`WatchTogether server listening on port ${PORT}`);
});