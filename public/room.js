// room.js – logic for WatchTogether room page

//--------------------------------------------------
// Utility helpers
//--------------------------------------------------
function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function isYouTubeLink(url) {
  return /youtu(?:\.be|be\.com)/i.test(url);
}

function extractYouTubeID(url) {
  const regExp = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|watch)\/?|.*[?&]v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

//--------------------------------------------------
// Global state
//--------------------------------------------------
const roomCode = qs('room');

// Retrieve saved credentials for this room from localStorage (if any)
const saved = roomCode ? JSON.parse(localStorage.getItem(`wt_${roomCode}`) || 'null') : null;

let username = qs('username') || (saved && saved.username) || 'Anonymous';
let isAdmin = qs('admin') === '1' || (saved && saved.isAdmin);

// Persist (or update) into storage so that refresh retains identity
if (roomCode) {
  localStorage.setItem(`wt_${roomCode}`, JSON.stringify({ username, isAdmin }));
}

const socket = io();
let player; // YouTube player or HTML5 video element
let currentVideoURL = '';
let isRemoteUpdate = false; // Prevent feedback loops

//--------------------------------------------------
// DOM elements
//--------------------------------------------------
const roomTitle = document.getElementById('roomTitle');
roomTitle.textContent = `Room ${roomCode}`;

const playerContainer = document.getElementById('playerContainer');
const changeVideoSection = document.getElementById('changeVideoSection');
const newVideoURLInput = document.getElementById('newVideoURL');
const changeVideoBtn = document.getElementById('changeVideoBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');

const userListElm = document.getElementById('userList');
const chatMessagesElm = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

//--------------------------------------------------
// Initial setup
//--------------------------------------------------
if (isAdmin) {
  changeVideoSection.classList.remove('hidden');
}

// Copy room link to clipboard
copyLinkBtn.addEventListener('click', () => {
  const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}&username=${encodeURIComponent(username)}&admin=${isAdmin ? '1' : '0'}`;
  navigator.clipboard.writeText(link).then(() => {
    copyLinkBtn.textContent = 'Copied!';
    setTimeout(() => (copyLinkBtn.textContent = 'Copy Room Link'), 1500);
  });
});

//--------------------------------------------------
// Socket.IO communication
//--------------------------------------------------
socket.emit('joinRoom', { roomCode, username, isAdmin });

socket.on('videoState', ({ videoURL, currentTime, isPlaying, adminId }) => {
  currentVideoURL = videoURL;
  loadVideo(videoURL, () => {
    if (isYouTubeLink(videoURL)) {
      player.seekTo(currentTime, true);
      if (isPlaying) player.playVideo();
    } else {
      player.currentTime = currentTime;
      if (isPlaying) player.play();
    }
  });
});

socket.on('videoControl', ({ action, currentTime, videoURL, adminId }) => {
  isRemoteUpdate = true;
  switch (action) {
    case 'play':
      if (isYouTubeLink(currentVideoURL)) player.playVideo();
      else player.play();
      break;
    case 'pause':
      if (isYouTubeLink(currentVideoURL)) player.pauseVideo();
      else player.pause();
      break;
    case 'seek':
      if (Math.abs(getCurrentTime() - currentTime) > 0.5) {
        seekTo(currentTime);
      }
      break;
    case 'changeVideo':
      currentVideoURL = videoURL;
      loadVideo(videoURL);
      break;
    case 'adminChange':
      // Update admin UI if needed
      if (adminId === socket.id) {
        // You are the new admin
        window.location.search = `?room=${roomCode}&username=${username}&admin=1`;
      }
      break;
  }
  setTimeout(() => (isRemoteUpdate = false), 200);
});

socket.on('userListUpdate', (users) => {
  userListElm.innerHTML = users.map((u) => `<li>${u.name}${u.id === socket.id ? ' (You)' : ''}${u.id === socket.id && isAdmin ? ' – Admin' : ''}</li>`).join('');
});

socket.on('chatMessage', ({ name, message, time }) => {
  const msgElm = document.createElement('div');
  msgElm.className = 'chat-message';
  msgElm.innerHTML = `<strong>${name}:</strong> ${message}`;
  chatMessagesElm.appendChild(msgElm);
  chatMessagesElm.scrollTop = chatMessagesElm.scrollHeight;
});

//--------------------------------------------------
// Chat
//--------------------------------------------------
function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chatMessage', { roomCode, message: text });
  chatInput.value = '';
}

sendChatBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

//--------------------------------------------------
// Admin: change video
//--------------------------------------------------
changeVideoBtn.addEventListener('click', () => {
  const url = newVideoURLInput.value.trim();
  if (!url) return;
  socket.emit('videoControl', { roomCode, action: 'changeVideo', videoURL: url });
  newVideoURLInput.value = '';
});

//--------------------------------------------------
// Video helpers
//--------------------------------------------------
function loadVideo(url, callback) {
  playerContainer.innerHTML = '';

  if (isYouTubeLink(url)) {
    const videoId = extractYouTubeID(url);
    if (!videoId) return alert('Invalid YouTube URL');

    // Load YT IFrame API if not present
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }

    // The API will call onYouTubeIframeAPIReady automatically (global), so we hook into it
    window.onYouTubeIframeAPIReady = () => createYouTubePlayer(videoId, callback);
    // If API already loaded
    if (window.YT && window.YT.Player) {
      createYouTubePlayer(videoId, callback);
    }
  } else {
    // Google Drive or generic video URL
    const videoElm = document.createElement('video');
    videoElm.src = url;
    videoElm.controls = isAdmin; // Non-admin cannot control
    videoElm.className = 'html5-video';
    playerContainer.appendChild(videoElm);
    player = videoElm;

    if (isAdmin) {
      videoElm.addEventListener('play', () => {
        if (!isRemoteUpdate) socket.emit('videoControl', { roomCode, action: 'play' });
      });
      videoElm.addEventListener('pause', () => {
        if (!isRemoteUpdate) socket.emit('videoControl', { roomCode, action: 'pause' });
      });
      videoElm.addEventListener('seeked', () => {
        if (!isRemoteUpdate) socket.emit('videoControl', { roomCode, action: 'seek', currentTime: videoElm.currentTime });
      });
    } else {
      // Disable user interaction
      videoElm.addEventListener('play', () => videoElm.pause());
    }

    if (callback) callback();
  }
}

function createYouTubePlayer(videoId, callback) {
  player = new YT.Player('playerContainer', {
    videoId,
    playerVars: {
      controls: isAdmin ? 1 : 0,
      // modestbranding, etc.
    },
    events: {
      onReady: () => {
        if (!isAdmin) player.getIframe().style.pointerEvents = 'none'; // Disable clicks
        if (callback) callback();
      },
      onStateChange: (event) => {
        if (!isAdmin || isRemoteUpdate) return;
        switch (event.data) {
          case YT.PlayerState.PLAYING:
            socket.emit('videoControl', { roomCode, action: 'play' });
            break;
          case YT.PlayerState.PAUSED:
            socket.emit('videoControl', { roomCode, action: 'pause' });
            break;
        }
      }
    }
  });

  // Detect manual seeking by admin (poll every 1s)
  if (isAdmin) {
    let lastTime = 0;
    setInterval(() => {
      if (!player || typeof player.getCurrentTime !== 'function') return;
      const t = player.getCurrentTime();
      if (!isRemoteUpdate && Math.abs(t - lastTime) > 1.2) {
        socket.emit('videoControl', { roomCode, action: 'seek', currentTime: t });
        lastTime = t;
      }
      lastTime = t;
    }, 1000);
  }
}

function getCurrentTime() {
  if (!player) return 0;
  if (isYouTubeLink(currentVideoURL)) return player.getCurrentTime();
  return player.currentTime;
}

function seekTo(time) {
  if (isYouTubeLink(currentVideoURL)) player.seekTo(time, true);
  else player.currentTime = time;
}