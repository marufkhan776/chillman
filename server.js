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
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Simple rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

function rateLimit(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  if (!rateLimitMap.has(clientIp)) {
    rateLimitMap.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const clientData = rateLimitMap.get(clientIp);
  
  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  if (clientData.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  
  clientData.count++;
  next();
}

// Apply rate limiting to API endpoints
app.use('/create-room', rateLimit);
app.use('/join-room', rateLimit);

// In-memory room storage
const rooms = {};

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimitMap.entries()) {
    if (now > data.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

// Clean up stale rooms periodically (rooms older than 24 hours with no users)
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [roomCode, room] of Object.entries(rooms)) {
    if (room.users.length === 0 && (now - room.createdAt.getTime()) > maxAge) {
      delete rooms[roomCode];
      console.log(`Cleaned up stale room: ${roomCode}`);
    }
  }
}, 60 * 60 * 1000); // Check every hour

// Helper function to generate random room code
function generateRoomCode() {
  let code;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    attempts++;
  } while (rooms[code] && attempts < maxAttempts);
  
  // If we can't generate a unique code after 10 attempts, add timestamp
  if (rooms[code]) {
    code = (Math.random().toString(36).substring(2, 8) + Date.now().toString(36)).toUpperCase().substring(0, 6);
  }
  
  return code;
}

// Helper function to extract video ID from YouTube URL
function getYouTubeVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Helper function to check if URL is a Google Drive video
function isGoogleDriveVideo(url) {
  return url.includes('drive.google.com') && 
         (url.includes('/file/d/') || 
          url.includes('id=') || 
          url.includes('open?id=') ||
          url.includes('/d/'));
}

// Helper function to convert Google Drive URL to direct video URL
function getGoogleDriveDirectUrl(url) {
  let fileId = '';
  
  try {
    if (url.includes('/file/d/')) {
      fileId = url.split('/file/d/')[1].split('/')[0];
    } else if (url.includes('id=')) {
      fileId = url.split('id=')[1].split('&')[0];
    } else if (url.includes('open?id=')) {
      fileId = url.split('open?id=')[1].split('&')[0];
    }
    
    // Clean up any query parameters from fileId
    if (fileId.includes('?')) {
      fileId = fileId.split('?')[0];
    }
    
    return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null;
  } catch (error) {
    console.error('Error parsing Google Drive URL:', error);
    return null;
  }
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
  
  if (typeof videoURL !== 'string' || videoURL.length > 2000) {
    return res.status(400).json({ error: 'Video URL is invalid or too long' });
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
  
  if (typeof roomCode !== 'string' || roomCode.length !== 6 || !/^[A-Z0-9]+$/.test(roomCode)) {
    return res.status(400).json({ error: 'Invalid room code format' });
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

  // Error handling for socket
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  // Join room event
  socket.on('joinRoom', (data) => {
    try {
      if (!data || !data.roomCode) {
        socket.emit('error', 'Invalid room data');
        return;
      }
      
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
  } catch (error) {
    console.error('Error in joinRoom:', error);
    socket.emit('error', 'Failed to join room');
  }
  });

  // Chat message event
  socket.on('chatMessage', (data) => {
    try {
      if (!data || !data.roomCode || !data.message) {
        return;
      }
      
      const { roomCode, message } = data;
      
      if (!rooms[roomCode]) {
        return;
      }

      const room = rooms[roomCode];
      const user = room.users.find(u => u.id === socket.id);
      
      if (!user) {
        return;
      }

      // Sanitize message (basic)
      const sanitizedMessage = message.trim().substring(0, 500);
      
      if (!sanitizedMessage) {
        return;
      }

      const chatMessage = {
        id: Date.now(),
        username: user.name,
        message: sanitizedMessage,
        timestamp: new Date().toLocaleTimeString()
      };

      // Broadcast message to all users in room
      io.to(roomCode).emit('newChatMessage', chatMessage);
    } catch (error) {
      console.error('Error in chatMessage:', error);
    }
  });

  // Video control events (only admin can control)
  socket.on('videoControl', (data) => {
    try {
      if (!data || !data.roomCode || !data.action) {
        return;
      }
      
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
  } catch (error) {
    console.error('Error in videoControl:', error);
    socket.emit('error', 'Failed to control video');
  }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id}, reason: ${reason}`);
    
    try {
      if (socket.roomCode && rooms[socket.roomCode]) {
        const room = rooms[socket.roomCode];
        const wasAdmin = socket.id === room.adminSocketId;
        
        // Remove user from room
        const initialUserCount = room.users.length;
        room.users = room.users.filter(user => user.id !== socket.id);
        
        // Verify user was actually removed
        if (room.users.length === initialUserCount) {
          console.log(`Warning: User ${socket.id} was not in room ${socket.roomCode} user list`);
          return;
        }
        
        console.log(`User removed from room ${socket.roomCode}. Remaining users: ${room.users.length}`);
        
        // If admin left, assign new admin
        if (wasAdmin && room.users.length > 0) {
          room.adminSocketId = room.users[0].id;
          console.log(`New admin assigned in room ${socket.roomCode}: ${room.adminSocketId}`);
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
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the app at http://localhost:${PORT}`);
});