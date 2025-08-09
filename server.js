const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// In-memory room storage
const rooms = {};

// Helper function to generate random room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper function to extract video ID from YouTube URL
function getYouTubeVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Helper function to check if URL is a Google Drive video
function isGoogleDriveVideo(url) {
  return url.includes('drive.google.com') && (url.includes('/file/d/') || url.includes('id='));
}

// Helper function to convert Google Drive URL to direct video URL
function getGoogleDriveDirectUrl(url) {
  let fileId = '';
  
  if (url.includes('/file/d/')) {
    fileId = url.split('/file/d/')[1].split('/')[0];
  } else if (url.includes('id=')) {
    fileId = url.split('id=')[1].split('&')[0];
  }
  
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null;
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room/:roomCode', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Create room endpoint
app.post('/create-room', (req, res) => {
  const { videoURL } = req.body;
  
  if (!videoURL) {
    return res.status(400).json({ error: 'Video URL is required' });
  }

  // Validate video URL
  const youtubeId = getYouTubeVideoId(videoURL);
  const isDriveVideo = isGoogleDriveVideo(videoURL);
  
  if (!youtubeId && !isDriveVideo) {
    return res.status(400).json({ error: 'Invalid video URL. Please provide a YouTube or Google Drive video link.' });
  }

  const roomCode = generateRoomCode();
  
  // Create room
  rooms[roomCode] = {
    videoURL: videoURL,
    videoType: youtubeId ? 'youtube' : 'drive',
    videoId: youtubeId || getGoogleDriveDirectUrl(videoURL),
    currentTime: 0,
    isPlaying: false,
    adminSocketId: null,
    users: [],
    createdAt: new Date()
  };

  console.log(`Room ${roomCode} created with video: ${videoURL}`);

  res.json({
    roomCode: roomCode,
    shareLink: `${req.protocol}://${req.get('host')}/room/${roomCode}`
  });
});

// Join room endpoint
app.post('/join-room', (req, res) => {
  const { roomCode } = req.body;
  
  if (!roomCode) {
    return res.status(400).json({ error: 'Room code is required' });
  }

  if (!rooms[roomCode]) {
    return res.status(404).json({ error: 'Room not found' });
  }

  res.json({
    success: true,
    redirectUrl: `/room/${roomCode}`
  });
});

// Get room info endpoint
app.get('/api/room/:roomCode', (req, res) => {
  const { roomCode } = req.params;
  
  if (!rooms[roomCode]) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const room = rooms[roomCode];
  res.json({
    roomCode: roomCode,
    videoURL: room.videoURL,
    videoType: room.videoType,
    videoId: room.videoId,
    currentTime: room.currentTime,
    isPlaying: room.isPlaying,
    users: room.users
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join room event
  socket.on('joinRoom', (data) => {
    const { roomCode, username } = data;
    
    if (!rooms[roomCode]) {
      socket.emit('error', 'Room not found');
      return;
    }

    const room = rooms[roomCode];
    
    // Set admin if this is the first user
    if (room.users.length === 0) {
      room.adminSocketId = socket.id;
    }

    // Add user to room
    const user = {
      id: socket.id,
      name: username || `User${Math.floor(Math.random() * 1000)}`
    };

    room.users.push(user);
    socket.join(roomCode);
    socket.roomCode = roomCode;

    console.log(`${user.name} joined room ${roomCode}`);

    // Send current room state to the new user
    socket.emit('roomJoined', {
      roomCode: roomCode,
      videoURL: room.videoURL,
      videoType: room.videoType,
      videoId: room.videoId,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      isAdmin: socket.id === room.adminSocketId,
      users: room.users
    });

    // Notify all users about updated user list
    io.to(roomCode).emit('userListUpdate', {
      users: room.users,
      adminId: room.adminSocketId
    });
  });

  // Chat message event
  socket.on('chatMessage', (data) => {
    const { roomCode, message } = data;
    
    if (!rooms[roomCode]) {
      return;
    }

    const room = rooms[roomCode];
    const user = room.users.find(u => u.id === socket.id);
    
    if (!user) {
      return;
    }

    const chatMessage = {
      id: Date.now(),
      username: user.name,
      message: message,
      timestamp: new Date().toLocaleTimeString()
    };

    // Broadcast message to all users in room
    io.to(roomCode).emit('newChatMessage', chatMessage);
  });

  // Video control events (only admin can control)
  socket.on('videoControl', (data) => {
    const { roomCode, action, time, newVideoURL } = data;
    
    if (!rooms[roomCode]) {
      return;
    }

    const room = rooms[roomCode];
    
    // Only admin can control video
    if (socket.id !== room.adminSocketId) {
      socket.emit('error', 'Only the room admin can control the video');
      return;
    }

    switch (action) {
      case 'play':
        room.isPlaying = true;
        room.currentTime = time || room.currentTime;
        break;
      case 'pause':
        room.isPlaying = false;
        room.currentTime = time || room.currentTime;
        break;
      case 'seek':
        room.currentTime = time;
        break;
      case 'changeVideo':
        if (newVideoURL) {
          const youtubeId = getYouTubeVideoId(newVideoURL);
          const isDriveVideo = isGoogleDriveVideo(newVideoURL);
          
          if (youtubeId || isDriveVideo) {
            room.videoURL = newVideoURL;
            room.videoType = youtubeId ? 'youtube' : 'drive';
            room.videoId = youtubeId || getGoogleDriveDirectUrl(newVideoURL);
            room.currentTime = 0;
            room.isPlaying = false;
          } else {
            socket.emit('error', 'Invalid video URL');
            return;
          }
        }
        break;
    }

    console.log(`Video control in room ${roomCode}: ${action}`);

    // Broadcast video control to all users in room
    io.to(roomCode).emit('videoSync', {
      action: action,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      videoURL: room.videoURL,
      videoType: room.videoType,
      videoId: room.videoId
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    if (socket.roomCode && rooms[socket.roomCode]) {
      const room = rooms[socket.roomCode];
      
      // Remove user from room
      room.users = room.users.filter(user => user.id !== socket.id);
      
      // If admin left, assign new admin
      if (socket.id === room.adminSocketId && room.users.length > 0) {
        room.adminSocketId = room.users[0].id;
        io.to(socket.roomCode).emit('newAdmin', room.adminSocketId);
      }
      
      // If no users left, delete room
      if (room.users.length === 0) {
        delete rooms[socket.roomCode];
        console.log(`Room ${socket.roomCode} deleted - no users remaining`);
      } else {
        // Update user list for remaining users
        io.to(socket.roomCode).emit('userListUpdate', {
          users: room.users,
          adminId: room.adminSocketId
        });
      }
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the app at http://localhost:${PORT}`);
});