// Room page JavaScript with video sync and chat functionality

// Global variables
let socket = null;
let youtubePlayer = null;
let drivePlayer = null;
let currentRoom = null;
let isAdmin = false;
let currentUser = null;
let lastKnownTime = 0;
let syncTimeoutId = null;
let userListUpdateTimeout = null;

// DOM elements
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roomStatus = document.getElementById('roomStatus');
const adminControls = document.getElementById('adminControls');
const nonAdminMessage = document.getElementById('nonAdminMessage');
const newVideoURLInput = document.getElementById('newVideoURL');
const changeVideoBtn = document.getElementById('changeVideoBtn');
const copyRoomLinkBtn = document.getElementById('copyRoomLinkBtn');
const copyRoomLinkBtnNonAdmin = document.getElementById('copyRoomLinkBtnNonAdmin');
const youtubePlayerDiv = document.getElementById('youtubePlayer');
const drivePlayerElement = document.getElementById('drivePlayer');
const loadingMessage = document.getElementById('loadingMessage');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const usersList = document.getElementById('usersList');
const userCount = document.getElementById('userCount');
const usernameModal = document.getElementById('usernameModal');
const usernameInput = document.getElementById('usernameInput');
const joinRoomWithNameBtn = document.getElementById('joinRoomWithNameBtn');
const toast = document.getElementById('toast');

// Utility functions
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

function getRoomCodeFromURL() {
    const path = window.location.pathname;
    const match = path.match(/\/room\/([A-Z0-9]{6})/);
    return match ? match[1] : null;
}

function updateRoomStatus(status, type = 'info') {
    roomStatus.textContent = status;
    roomStatus.className = type === 'error' ? 'error-status' : '';
}

function updateUserList(users, adminId) {
    // Clear existing users
    usersList.innerHTML = '';
    userCount.textContent = users.length;
    
    // Add users
    users.forEach(user => {
        const userBadge = document.createElement('div');
        userBadge.className = `user-badge ${user.id === adminId ? 'admin' : ''}`;
        userBadge.textContent = user.name + (user.id === adminId ? ' 👑' : '');
        usersList.appendChild(userBadge);
    });
}

function scrollChatToBottom() {
    chatMessages.scrollTop = chatMessages.scrollTop + 1000;
}

function addChatMessage(messageData, isOwn = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    messageInfo.textContent = `${messageData.username} • ${messageData.timestamp}`;
    
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.textContent = messageData.message;
    
    messageDiv.appendChild(messageInfo);
    messageDiv.appendChild(messageText);
    chatMessages.appendChild(messageDiv);
    
    scrollChatToBottom();
}

function copyRoomLink() {
    const roomLink = window.location.href;
    
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(roomLink).then(() => {
            showToast('Room link copied to clipboard!', 'success');
        }).catch(() => {
            fallbackCopyTextToClipboard(roomLink);
        });
    } else {
        fallbackCopyTextToClipboard(roomLink);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showToast('Room link copied to clipboard!', 'success');
    } catch (err) {
        console.error('Failed to copy text: ', err);
        showToast('Failed to copy link. Please copy it manually.', 'error');
    }
    
    document.body.removeChild(textArea);
}

// YouTube player functions
function onYouTubeIframeAPIReady() {
    console.log('YouTube IFrame API ready');
}

function createYouTubePlayer(videoId) {
    if (youtubePlayer) {
        youtubePlayer.destroy();
    }
    
    youtubePlayer = new YT.Player('youtubePlayer', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
            autoplay: 0,
            controls: isAdmin ? 1 : 0,
            disablekb: !isAdmin,
            enablejsapi: 1,
            origin: window.location.origin,
            rel: 0,
            showinfo: 0
        },
        events: {
            onReady: onYouTubePlayerReady,
            onStateChange: onYouTubePlayerStateChange
        }
    });
}

function onYouTubePlayerReady(event) {
    console.log('YouTube player ready');
    loadingMessage.style.display = 'none';
    youtubePlayerDiv.style.display = 'block';
    
    // Sync to current time
    if (currentRoom && currentRoom.currentTime > 0) {
        youtubePlayer.seekTo(currentRoom.currentTime, true);
    }
    
    // Start playing if room is playing
    if (currentRoom && currentRoom.isPlaying) {
        youtubePlayer.playVideo();
    }
}

function onYouTubePlayerStateChange(event) {
    if (!isAdmin || !socket || !currentRoom) return;
    
    const state = event.data;
    const currentTime = youtubePlayer.getCurrentTime();
    
    // Only send control events if admin initiated the change
    if (state === YT.PlayerState.PLAYING) {
        socket.emit('videoControl', {
            roomCode: currentRoom.roomCode,
            action: 'play',
            time: currentTime
        });
    } else if (state === YT.PlayerState.PAUSED) {
        socket.emit('videoControl', {
            roomCode: currentRoom.roomCode,
            action: 'pause',
            time: currentTime
        });
    }
}

// Drive player functions
function setupDrivePlayer(videoUrl) {
    drivePlayer = drivePlayerElement;
    drivePlayer.src = videoUrl;
    
    // Remove all previous event listeners
    const newPlayer = drivePlayer.cloneNode(true);
    drivePlayer.parentNode.replaceChild(newPlayer, drivePlayer);
    drivePlayer = newPlayer;
    
    loadingMessage.style.display = 'none';
    drivePlayer.style.display = 'block';
    
    // Only admin can control the video
    if (!isAdmin) {
        drivePlayer.controls = false;
        drivePlayer.style.pointerEvents = 'none';
    }
    
    // Add event listeners for admin
    if (isAdmin && socket && currentRoom) {
        drivePlayer.addEventListener('play', () => {
            socket.emit('videoControl', {
                roomCode: currentRoom.roomCode,
                action: 'play',
                time: drivePlayer.currentTime
            });
        });
        
        drivePlayer.addEventListener('pause', () => {
            socket.emit('videoControl', {
                roomCode: currentRoom.roomCode,
                action: 'pause',
                time: drivePlayer.currentTime
            });
        });
        
        drivePlayer.addEventListener('seeked', () => {
            socket.emit('videoControl', {
                roomCode: currentRoom.roomCode,
                action: 'seek',
                time: drivePlayer.currentTime
            });
        });
    }
    
    // Sync to current time
    drivePlayer.addEventListener('loadedmetadata', () => {
        if (currentRoom && currentRoom.currentTime > 0) {
            drivePlayer.currentTime = currentRoom.currentTime;
        }
        
        // Start playing if room is playing
        if (currentRoom && currentRoom.isPlaying) {
            drivePlayer.play().catch(err => {
                console.log('Autoplay prevented:', err);
                showToast('Click to start the video', 'info');
            });
        }
    });
}

// Video sync functions
function syncVideoState(data) {
    const { action, currentTime, isPlaying, videoURL, videoType, videoId } = data;
    
    console.log('Syncing video:', action, currentTime, isPlaying);
    
    // Handle video changes
    if (action === 'changeVideo') {
        loadVideo(videoType, videoId);
        return;
    }
    
    // Handle play/pause/seek for current video
    if (videoType === 'youtube' && youtubePlayer) {
        syncYouTubePlayer(action, currentTime, isPlaying);
    } else if (videoType === 'drive' && drivePlayer) {
        syncDrivePlayer(action, currentTime, isPlaying);
    }
}

function syncYouTubePlayer(action, currentTime, isPlaying) {
    if (!youtubePlayer || youtubePlayer.getPlayerState === undefined) return;
    
    try {
        const playerTime = youtubePlayer.getCurrentTime();
        const timeDiff = Math.abs(playerTime - currentTime);
        
        // Seek if time difference is significant (more than 2 seconds)
        if (timeDiff > 2) {
            youtubePlayer.seekTo(currentTime, true);
        }
        
        // Handle play/pause
        if (isPlaying && youtubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
            youtubePlayer.playVideo();
        } else if (!isPlaying && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
            youtubePlayer.pauseVideo();
        }
    } catch (error) {
        console.error('Error syncing YouTube player:', error);
    }
}

function syncDrivePlayer(action, currentTime, isPlaying) {
    if (!drivePlayer) return;
    
    try {
        const playerTime = drivePlayer.currentTime;
        const timeDiff = Math.abs(playerTime - currentTime);
        
        // Seek if time difference is significant (more than 2 seconds)
        if (timeDiff > 2) {
            drivePlayer.currentTime = currentTime;
        }
        
        // Handle play/pause
        if (isPlaying && drivePlayer.paused) {
            drivePlayer.play().catch(err => console.log('Play prevented:', err));
        } else if (!isPlaying && !drivePlayer.paused) {
            drivePlayer.pause();
        }
    } catch (error) {
        console.error('Error syncing Drive player:', error);
    }
}

function loadVideo(videoType, videoId) {
    // Hide all players
    youtubePlayerDiv.style.display = 'none';
    drivePlayer.style.display = 'none';
    loadingMessage.style.display = 'block';
    loadingMessage.textContent = 'Loading new video...';
    
    if (videoType === 'youtube') {
        createYouTubePlayer(videoId);
    } else if (videoType === 'drive') {
        setupDrivePlayer(videoId);
    }
}

// Chat functions
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || !socket || !currentRoom) return;
    
    socket.emit('chatMessage', {
        roomCode: currentRoom.roomCode,
        message: message
    });
    
    messageInput.value = '';
}

// Socket.IO functions
function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        updateRoomStatus('Connected');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateRoomStatus('Disconnected - Attempting to reconnect...', 'error');
    });
    
    socket.on('roomJoined', (data) => {
        console.log('Joined room:', data);
        currentRoom = data;
        isAdmin = data.isAdmin;
        
        // Update UI
        roomCodeDisplay.textContent = data.roomCode;
        updateRoomStatus(`Connected to room ${data.roomCode}`);
        
        // Show admin controls
        if (isAdmin) {
            adminControls.style.display = 'flex';
            nonAdminMessage.style.display = 'none';
        } else {
            adminControls.style.display = 'none';
            nonAdminMessage.style.display = 'flex';
        }
        
        // Enable chat
        messageInput.disabled = false;
        sendMessageBtn.disabled = false;
        
        // Load video
        loadVideo(data.videoType, data.videoId);
        
        // Update user list
        updateUserList(data.users, data.adminId);
        
        // Hide username modal
        usernameModal.style.display = 'none';
    });
    
    socket.on('userListUpdate', (data) => {
        updateUserList(data.users, data.adminId);
    });
    
    socket.on('newChatMessage', (messageData) => {
        const isOwn = messageData.username === currentUser;
        addChatMessage(messageData, isOwn);
    });
    
    socket.on('videoSync', (data) => {
        if (!isAdmin) { // Only non-admins should sync to events
            syncVideoState(data);
        }
    });
    
    socket.on('newAdmin', (newAdminId) => {
        isAdmin = (socket.id === newAdminId);
        
        if (isAdmin) {
            adminControls.style.display = 'flex';
            nonAdminMessage.style.display = 'none';
            showToast('You are now the room admin!', 'success');
            
            // Re-enable video controls
            if (youtubePlayer) {
                youtubePlayer.destroy();
                createYouTubePlayer(currentRoom.videoId);
            } else if (drivePlayer) {
                drivePlayer.controls = true;
                drivePlayer.style.pointerEvents = 'auto';
            }
        } else {
            adminControls.style.display = 'none';
            nonAdminMessage.style.display = 'flex';
        }
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        showToast(error, 'error');
    });
}

function joinRoom(username) {
    const roomCode = getRoomCodeFromURL();
    if (!roomCode) {
        showToast('Invalid room URL', 'error');
        window.location.href = '/';
        return;
    }
    
    currentUser = username;
    
    socket.emit('joinRoom', {
        roomCode: roomCode,
        username: username
    });
}

// Event listeners
sendMessageBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

changeVideoBtn.addEventListener('click', () => {
    const newURL = newVideoURLInput.value.trim();
    if (!newURL) {
        showToast('Please enter a video URL', 'error');
        return;
    }
    
    socket.emit('videoControl', {
        roomCode: currentRoom.roomCode,
        action: 'changeVideo',
        newVideoURL: newURL
    });
    
    newVideoURLInput.value = '';
});

copyRoomLinkBtn.addEventListener('click', copyRoomLink);
copyRoomLinkBtnNonAdmin.addEventListener('click', copyRoomLink);

joinRoomWithNameBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (!username) {
        showToast('Please enter your name', 'error');
        return;
    }
    
    joinRoom(username);
});

usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const username = usernameInput.value.trim();
        if (username) {
            joinRoom(username);
        }
    }
});

// Auto-focus username input
usernameInput.addEventListener('input', () => {
    joinRoomWithNameBtn.disabled = !usernameInput.value.trim();
});

// Initialize the room
window.addEventListener('load', () => {
    const roomCode = getRoomCodeFromURL();
    
    if (!roomCode) {
        showToast('Invalid room URL', 'error');
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
        return;
    }
    
    // Show username modal
    usernameModal.style.display = 'flex';
    usernameInput.focus();
    
    // Initialize socket connection
    initializeSocket();
    
    console.log('WatchTogether - Room page loaded successfully!');
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.disconnect();
    }
});

// Periodic sync for video time (to handle manual seeking by admin)
setInterval(() => {
    if (isAdmin && socket && currentRoom) {
        let currentTime = 0;
        
        if (youtubePlayer && youtubePlayer.getCurrentTime) {
            currentTime = youtubePlayer.getCurrentTime();
        } else if (drivePlayer && !drivePlayer.paused) {
            currentTime = drivePlayer.currentTime;
        }
        
        // Only sync if there's a significant time change
        if (Math.abs(currentTime - lastKnownTime) > 1) {
            socket.emit('videoControl', {
                roomCode: currentRoom.roomCode,
                action: 'seek',
                time: currentTime
            });
            lastKnownTime = currentTime;
        }
    }
}, 2000); // Check every 2 seconds