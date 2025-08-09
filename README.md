# WatchTogether

A simple but fully functional web app that allows users to create or join rooms to watch YouTube or Google Drive public videos together in perfect sync with real-time chat.

## 🚀 Features

- **Video Synchronization**: Watch YouTube and Google Drive videos in perfect sync
- **Real-time Chat**: Chat with other viewers while watching
- **Room Management**: Create rooms with unique codes or join existing ones
- **Admin Controls**: Room creators can control video playback and change videos
- **Responsive Design**: Works on desktop and mobile devices
- **No Database Required**: All data stored in memory for easy deployment

## 🛠️ Tech Stack

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Node.js with Express
- **Real-time Communication**: Socket.IO
- **Video APIs**: YouTube IFrame API, HTML5 video for Google Drive

## 📦 Installation & Setup

### Local Development

1. Clone or download the project
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open your browser and go to `http://localhost:10000`

### Deploy to Render

1. Push this code to a GitHub repository
2. Connect your GitHub repository to Render
3. Use the following settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node.js
   - **Port**: The app automatically uses `process.env.PORT` or defaults to 10000

No additional configuration needed! The app will work immediately after deployment.

## 🎮 How to Use

### Creating a Room
1. Go to the home page
2. Paste a YouTube or Google Drive video URL
3. Click "Create Room"
4. Share the room code or link with friends

### Joining a Room
1. Get a room code from a friend
2. Enter the code on the home page
3. Click "Join Room"
4. Enter your name to join the room

### Supported Video Formats
- ✅ YouTube videos (`youtube.com`, `youtu.be`)
- ✅ Google Drive public videos

### Admin Features
- Control video playback (play, pause, seek)
- Change the video URL in real-time
- Automatic admin transfer when the original admin leaves

## 🌐 Live Demo

After deploying to Render, your app will be available at your Render URL.

## 📁 Project Structure

```
/
├── public/
│   ├── index.html      # Home page
│   ├── room.html       # Room page
│   ├── styles.css      # All CSS styles
│   ├── main.js         # Home page functionality
│   └── room.js         # Room functionality & video sync
├── server.js           # Express server & Socket.IO
├── package.json        # Dependencies & scripts
└── README.md           # This file
```

## 🔧 Technical Details

### Video Synchronization
- **YouTube**: Uses YouTube IFrame API for precise control
- **Google Drive**: Uses HTML5 video element with manual sync
- **Sync Algorithm**: Automatically syncs within 2-second tolerance
- **Admin Control**: Only room admin can control playback

### Room Management
- **In-Memory Storage**: Rooms stored in server memory
- **Auto-Cleanup**: Rooms deleted when all users leave
- **Admin Transfer**: Automatic when admin disconnects
- **Real-time Updates**: Instant user list and chat updates

### Security Features
- URL validation for video links
- Input sanitization
- Rate limiting via Socket.IO
- CORS configuration

## 🚀 Deployment Notes

- **Environment**: Works on any Node.js hosting platform
- **Port Configuration**: Uses `process.env.PORT` for deployment
- **Static Files**: Served from `/public` directory
- **Memory Usage**: Scales with active rooms (ephemeral storage)

## 📱 Browser Compatibility

- Modern browsers with ES6+ support
- Chrome, Firefox, Safari, Edge
- Mobile browsers (iOS Safari, Chrome Mobile)

## 🆘 Troubleshooting

### Common Issues

1. **Video not loading**: Check if the video URL is public and accessible
2. **Sync issues**: Refresh the page to resync
3. **Can't join room**: Verify the room code is correct (6 characters)
4. **Chat not working**: Check internet connection and refresh

### Google Drive Videos
- Must be publicly accessible
- Direct video URLs work best
- Some restrictions may apply based on Google's policies

---

Built with ❤️ for watching videos together!