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
    try {
        if (!users || !Array.isArray(users)) {
            console.error('Invalid users data:', users);
            return;
        }
        
        // Clear existing users
        usersList.innerHTML = '';
        userCount.textContent = users.length;
        
        // Add users
        users.forEach(user => {
            if (user && user.id && user.name) {
                const userBadge = document.createElement('div');
                userBadge.className = `user-badge ${user.id === adminId ? 'admin' : ''}`;
                userBadge.textContent = user.name + (user.id === adminId ? ' 👑' : '');
                userBadge.title = user.id === adminId ? 'Room Administrator' : 'Room Member';
                usersList.appendChild(userBadge);
            }
        });
    } catch (error) {
        console.error('Error updating user list:', error);
    }
}

function scrollChatToBottom() {
    // Smooth scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Fallback for browsers that don't support scrollHeight properly
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 100);
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
            onStateChange: onYouTubePlayerStateChange,
            onError: onYouTubePlayerError
        }
    });
}

function onYouTubePlayerReady(event) {
    console.log('YouTube player ready');
    loadingMessage.style.display = 'none';
    youtubePlayerDiv.style.display = 'block';
    
    try {
        // Sync to current time
        if (currentRoom && currentRoom.currentTime > 0) {
            youtubePlayer.seekTo(currentRoom.currentTime, true);
        }
        
        // Start playing if room is playing
        if (currentRoom && currentRoom.isPlaying) {
            youtubePlayer.playVideo();
        }
    } catch (error) {
        console.error('Error initializing YouTube player:', error);
        showToast('Video player initialization failed', 'error');
    }
}

function onYouTubePlayerError(event) {
    console.error('YouTube player error:', event.data);
    loadingMessage.textContent = 'Error loading YouTube video';
    loadingMessage.style.display = 'block';
    youtubePlayerDiv.style.display = 'none';
    
    const errorMessages = {
        2: 'Invalid video ID',
        5: 'HTML5 player error',
        100: 'Video not found or private',
        101: 'Video not allowed to be played in embedded players',
        150: 'Video not allowed to be played in embedded players'
    };
    
    const errorMessage = errorMessages[event.data] || 'Unknown video error';
    showToast(`Video Error: ${errorMessage}`, 'error');
}

let isPlayerSyncing = false; // Flag to prevent sync loops

function onYouTubePlayerStateChange(event) {
    if (!isAdmin || !socket || !currentRoom || isPlayerSyncing) return;
    
    const state = event.data;
    const currentTime = youtubePlayer.getCurrentTime();
    
    // Only send control events if admin initiated the change (not programmatic sync)
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
let isDrivePlayerSyncing = false; // Flag to prevent Drive player event loops

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
            if (!isDrivePlayerSyncing) {
                socket.emit('videoControl', {
                    roomCode: currentRoom.roomCode,
                    action: 'play',
                    time: drivePlayer.currentTime
                });
            }
        });
        
        drivePlayer.addEventListener('pause', () => {
            if (!isDrivePlayerSyncing) {
                socket.emit('videoControl', {
                    roomCode: currentRoom.roomCode,
                    action: 'pause',
                    time: drivePlayer.currentTime
                });
            }
        });
        
        drivePlayer.addEventListener('seeked', () => {
            if (!isDrivePlayerSyncing) {
                socket.emit('videoControl', {
                    roomCode: currentRoom.roomCode,
                    action: 'seek',
                    time: drivePlayer.currentTime
                });
            }
        });
    }
    
    // Add error handling for Drive player
    drivePlayer.addEventListener('error', (e) => {
        console.error('Drive player error:', e);
        loadingMessage.textContent = 'Error loading Google Drive video';
        loadingMessage.style.display = 'block';
        drivePlayer.style.display = 'none';
        showToast('Failed to load Google Drive video. Please check if the video is publicly accessible.', 'error');
    });
    
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
    if (!youtubePlayer || typeof youtubePlayer.getPlayerState !== 'function') return;
    
    try {
        // Ensure player is ready
        if (youtubePlayer.getPlayerState() === -1) {
            setTimeout(() => syncYouTubePlayer(action, currentTime, isPlaying), 500);
            return;
        }
        
        // Set sync flag to prevent event loops
        isPlayerSyncing = true;
        
        const playerTime = youtubePlayer.getCurrentTime();
        const timeDiff = Math.abs(playerTime - currentTime);
        
        // Handle specific actions
        if (action === 'seek' || timeDiff > 2) {
            youtubePlayer.seekTo(currentTime, true);
        }
        
        // Handle play/pause with debouncing to prevent conflicts
        if (action === 'play' || (isPlaying && youtubePlayer.getPlayerState() !== YT.PlayerState.PLAYING)) {
            youtubePlayer.playVideo();
        } else if (action === 'pause' || (!isPlaying && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING)) {
            youtubePlayer.pauseVideo();
        }
        
        // Clear sync flag after a delay
        setTimeout(() => {
            isPlayerSyncing = false;
        }, 1000);
    } catch (error) {
        console.error('Error syncing YouTube player:', error);
        isPlayerSyncing = false;
    }
}

function syncDrivePlayer(action, currentTime, isPlaying) {
    if (!drivePlayer || drivePlayer.readyState < 1) return;
    
    try {
        // Set sync flag to prevent event loops
        isDrivePlayerSyncing = true;
        
        const playerTime = drivePlayer.currentTime;
        const timeDiff = Math.abs(playerTime - currentTime);
        
        // Handle specific actions
        if (action === 'seek' || timeDiff > 2) {
            drivePlayer.currentTime = currentTime;
        }
        
        // Handle play/pause with error handling
        if (action === 'play' || (isPlaying && drivePlayer.paused)) {
            drivePlayer.play().catch(err => {
                console.log('Play prevented:', err);
                showToast('Click the video to enable autoplay', 'info');
            });
        } else if (action === 'pause' || (!isPlaying && !drivePlayer.paused)) {
            drivePlayer.pause();
        }
        
        // Clear sync flag after a delay
        setTimeout(() => {
            isDrivePlayerSyncing = false;
        }, 1000);
    } catch (error) {
        console.error('Error syncing Drive player:', error);
        isDrivePlayerSyncing = false;
    }
}

function loadVideo(videoType, videoId) {
    try {
        // Hide all players
        youtubePlayerDiv.style.display = 'none';
        drivePlayer.style.display = 'none';
        loadingMessage.style.display = 'block';
        loadingMessage.textContent = 'Loading video...';
        
        if (!videoId) {
            throw new Error('Invalid video ID');
        }
        
        if (videoType === 'youtube') {
            createYouTubePlayer(videoId);
        } else if (videoType === 'drive') {
            setupDrivePlayer(videoId);
        } else {
            throw new Error('Unsupported video type');
        }
    } catch (error) {
        console.error('Error loading video:', error);
        loadingMessage.textContent = 'Error loading video. Please try again.';
        showToast('Failed to load video', 'error');
        
        // Hide loading message after 3 seconds
        setTimeout(() => {
            loadingMessage.style.display = 'none';
        }, 3000);
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
        
        // Rejoin room if we were previously connected
        if (currentRoom && currentUser) {
            socket.emit('joinRoom', {
                roomCode: currentRoom.roomCode,
                username: currentUser
            });
        }
    });
    
    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        updateRoomStatus('Disconnected - Attempting to reconnect...', 'error');
        
        // Disable chat input during disconnection
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;
    });
    
    socket.on('reconnect', () => {
        console.log('Reconnected to server');
        showToast('Reconnected successfully!', 'success');
        
        // Re-enable chat input
        messageInput.disabled = false;
        sendMessageBtn.disabled = false;
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
            showToast('You are the room admin!', 'success');
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
        // All users should sync, but admins should not sync to their own events
        // We'll handle this prevention in the sync functions with flags
        syncVideoState(data);
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
    
    // Basic URL validation
    try {
        new URL(newURL);
    } catch (e) {
        showToast('Please enter a valid URL', 'error');
        return;
    }
    
    // Check if it's a supported video URL
    const isYouTube = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/i.test(newURL);
    const isDrive = newURL.includes('drive.google.com');
    
    if (!isYouTube && !isDrive) {
        showToast('Please enter a YouTube or Google Drive video URL', 'error');
        return;
    }
    
    showToast('Changing video...', 'info');
    
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
    
    if (username.length > 20) {
        showToast('Name must be 20 characters or less', 'error');
        return;
    }
    
    if (username.length < 2) {
        showToast('Name must be at least 2 characters', 'error');
        return;
    }
    
    // Basic sanitization - allow letters, numbers, spaces, and basic punctuation
    if (!/^[a-zA-Z0-9\s\-_.]+$/.test(username)) {
        showToast('Name can only contain letters, numbers, spaces, and basic punctuation', 'error');
        return;
    }
    
    joinRoom(username);
});

usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const username = usernameInput.value.trim();
        if (username && username.length >= 2 && username.length <= 20 && /^[a-zA-Z0-9\s\-_.]+$/.test(username)) {
            joinRoom(username);
        } else {
            // Trigger the button click to show proper validation messages
            joinRoomWithNameBtn.click();
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
    
    // Handle visibility changes (page focus/blur)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && socket && !socket.connected) {
            // Page became visible and socket is disconnected, try to reconnect
            socket.connect();
        }
    });
    
    console.log('WatchTogether - Room page loaded successfully!');
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.disconnect();
    }
});

// Periodic sync for video time (to handle manual seeking by admin)
let syncInterval = setInterval(() => {
    if (isAdmin && socket && socket.connected && currentRoom) {
        let currentTime = 0;
        
        try {
            if (youtubePlayer && typeof youtubePlayer.getCurrentTime === 'function') {
                currentTime = youtubePlayer.getCurrentTime() || 0;
            } else if (drivePlayer && !drivePlayer.paused && !isNaN(drivePlayer.currentTime)) {
                currentTime = drivePlayer.currentTime;
            }
            
            // Only sync if there's a significant time change and time is valid
            if (currentTime > 0 && Math.abs(currentTime - lastKnownTime) > 1) {
                socket.emit('videoControl', {
                    roomCode: currentRoom.roomCode,
                    action: 'seek',
                    time: currentTime
                });
                lastKnownTime = currentTime;
            }
        } catch (error) {
            console.error('Error in periodic sync:', error);
        }
    }
}, 2000); // Check every 2 seconds

// Clean up interval on page unload
window.addEventListener('beforeunload', () => {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
});