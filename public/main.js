// Main JavaScript for home page functionality

// DOM elements
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const videoURLInput = document.getElementById('videoURL');
const roomCodeInput = document.getElementById('roomCodeInput');
const errorMessage = document.getElementById('errorMessage');
const createRoomResult = document.getElementById('createRoomResult');
const roomCodeDisplay = document.getElementById('roomCode');
const shareLinkInput = document.getElementById('shareLink');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const joinCreatedRoomBtn = document.getElementById('joinCreatedRoomBtn');

// Utility functions
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    
    // Auto-hide error after 5 seconds
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

function hideError() {
    errorMessage.style.display = 'none';
}

function setButtonLoading(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const btnLoading = button.querySelector('.btn-loading');
    
    if (isLoading) {
        button.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
    } else {
        button.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

function validateVideoURL(url) {
    if (!url) {
        return { valid: false, error: 'Please enter a video URL' };
    }

    // Basic URL format validation
    try {
        new URL(url);
    } catch (e) {
        return { valid: false, error: 'Please enter a valid URL format' };
    }

    // Check for YouTube URLs
    const youtubeRegex = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/i;
    const youtubeMatch = url.match(youtubeRegex);
    
    if (youtubeMatch && youtubeMatch[2].length === 11) {
        return { valid: true, type: 'youtube' };
    }

    // Check for Google Drive URLs (more comprehensive)
    if (url.includes('drive.google.com') && 
        (url.includes('/file/d/') || url.includes('id=') || url.includes('open?id='))) {
        return { valid: true, type: 'drive' };
    }

    return { 
        valid: false, 
        error: 'Please enter a valid YouTube or Google Drive video URL' 
    };
}

function validateRoomCode(code) {
    if (!code) {
        return { valid: false, error: 'Please enter a room code' };
    }

    if (code.length !== 6) {
        return { valid: false, error: 'Room code must be 6 characters long' };
    }

    if (!/^[A-Z0-9]+$/.test(code.toUpperCase())) {
        return { valid: false, error: 'Room code can only contain letters and numbers' };
    }

    return { valid: true };
}

// Create room functionality
async function createRoom() {
    hideError();
    
    const videoURL = videoURLInput.value.trim();
    const validation = validateVideoURL(videoURL);
    
    if (!validation.valid) {
        showError(validation.error);
        return;
    }

    setButtonLoading(createRoomBtn, true);

    try {
        const response = await fetch('/create-room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ videoURL: videoURL })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create room');
        }

        // Show room creation result
        roomCodeDisplay.textContent = data.roomCode;
        shareLinkInput.value = data.shareLink;
        createRoomResult.style.display = 'block';
        
        // Add fade-in animation
        createRoomResult.classList.add('fade-in');

        // Store room code for easy joining
        localStorage.setItem('lastCreatedRoom', data.roomCode);

    } catch (error) {
        console.error('Error creating room:', error);
        showError(error.message || 'Failed to create room. Please try again.');
    } finally {
        setButtonLoading(createRoomBtn, false);
    }
}

// Join room functionality
async function joinRoom(roomCode = null) {
    hideError();
    
    const code = roomCode || roomCodeInput.value.trim().toUpperCase();
    const validation = validateRoomCode(code);
    
    if (!validation.valid) {
        showError(validation.error);
        return;
    }

    const targetButton = roomCode ? joinCreatedRoomBtn : joinRoomBtn;
    setButtonLoading(targetButton, true);

    try {
        const response = await fetch('/join-room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ roomCode: code })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to join room');
        }

        // Redirect to room page
        window.location.href = data.redirectUrl;

    } catch (error) {
        console.error('Error joining room:', error);
        showError(error.message || 'Failed to join room. Please check the room code and try again.');
    } finally {
        setButtonLoading(targetButton, false);
    }
}

// Copy link functionality
function copyShareLink() {
    const shareLink = shareLinkInput.value;
    
    if (navigator.clipboard && window.isSecureContext) {
        // Use modern clipboard API
        navigator.clipboard.writeText(shareLink).then(() => {
            showCopySuccess();
        }).catch(() => {
            fallbackCopyTextToClipboard(shareLink);
        });
    } else {
        // Fallback for older browsers
        fallbackCopyTextToClipboard(shareLink);
    }
}

function fallbackCopyTextToClipboard(text) {
    // Create a temporary input element
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Make it invisible
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showCopySuccess();
    } catch (err) {
        console.error('Failed to copy text: ', err);
        showError('Failed to copy link. Please copy it manually.');
    }
    
    document.body.removeChild(textArea);
}

function showCopySuccess() {
    const originalText = copyLinkBtn.textContent;
    copyLinkBtn.textContent = 'Copied!';
    copyLinkBtn.style.background = '#28a745';
    
    setTimeout(() => {
        copyLinkBtn.textContent = originalText;
        copyLinkBtn.style.background = '';
    }, 2000);
}

// Event listeners
createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', () => joinRoom());
copyLinkBtn.addEventListener('click', copyShareLink);
joinCreatedRoomBtn.addEventListener('click', () => {
    const roomCode = roomCodeDisplay.textContent;
    joinRoom(roomCode);
});

// Handle Enter key presses
videoURLInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        createRoom();
    }
});

roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoom();
    }
});

// Auto-format room code input
roomCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

// Handle paste events for video URL
videoURLInput.addEventListener('paste', (e) => {
    // Give browser time to paste content, then validate
    setTimeout(() => {
        const url = e.target.value.trim();
        if (url) {
            const validation = validateVideoURL(url);
            if (!validation.valid) {
                e.target.style.borderColor = '#dc3545';
                showError(validation.error);
            } else {
                e.target.style.borderColor = '#28a745';
                hideError();
            }
        }
    }, 100);
});

// Reset input styles when user starts typing
videoURLInput.addEventListener('input', () => {
    videoURLInput.style.borderColor = '';
    hideError();
});

roomCodeInput.addEventListener('input', () => {
    roomCodeInput.style.borderColor = '';
    hideError();
});

// Check if there's a room code in the URL (for direct links)
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomCodeFromURL = urlParams.get('room');
    
    if (roomCodeFromURL) {
        // Sanitize and validate room code
        const sanitizedCode = roomCodeFromURL.replace(/[^A-Z0-9]/g, '').substring(0, 6).toUpperCase();
        if (sanitizedCode.length === 6) {
            roomCodeInput.value = sanitizedCode;
            // Auto-focus the join button
            joinRoomBtn.scrollIntoView({ behavior: 'smooth' });
        }
    }
    
    // Check if user was redirected from a room (with error)
    const error = urlParams.get('error');
    if (error) {
        // Sanitize error message to prevent XSS
        const sanitizedError = decodeURIComponent(error).replace(/<[^>]*>/g, '').substring(0, 200);
        showError(sanitizedError);
    }
});

// Add some helpful keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to create room when focused on video URL
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.activeElement === videoURLInput) {
        createRoom();
    }
});

// Progressive enhancement: Add visual feedback for better UX
document.addEventListener('DOMContentLoaded', () => {
    // Add smooth scrolling behavior
    document.documentElement.style.scrollBehavior = 'smooth';
    
    // Add focus indicators for better accessibility
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            input.parentElement.style.transform = 'scale(1.02)';
        });
        
        input.addEventListener('blur', () => {
            input.parentElement.style.transform = 'scale(1)';
        });
    });
});

console.log('WatchTogether - Home page loaded successfully!');