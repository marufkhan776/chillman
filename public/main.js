// main.js – logic for index.html page

const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');

createBtn.addEventListener('click', async () => {
  const username = document.getElementById('createUsername').value.trim();
  const videoURL = document.getElementById('videoURL').value.trim();
  const errorElm = document.getElementById('createError');
  errorElm.textContent = '';

  if (!username || !videoURL) {
    errorElm.textContent = 'Please enter your name and video URL.';
    return;
  }

  try {
    const res = await fetch('/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoURL })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create room');

    const roomCode = data.roomCode;
    const params = new URLSearchParams({ room: roomCode, username, admin: '1' });
    window.location.href = `room.html?${params.toString()}`;
  } catch (err) {
    errorElm.textContent = err.message;
  }
});

joinBtn.addEventListener('click', async () => {
  const username = document.getElementById('joinUsername').value.trim();
  const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
  const errorElm = document.getElementById('joinError');
  errorElm.textContent = '';

  if (!username || !roomCode) {
    errorElm.textContent = 'Please enter your name and room code.';
    return;
  }

  try {
    const res = await fetch('/join-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Room not found');

    const params = new URLSearchParams({ room: roomCode, username, admin: '0' });
    window.location.href = `room.html?${params.toString()}`;
  } catch (err) {
    errorElm.textContent = err.message;
  }
});