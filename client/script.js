const API_URL = 'http://192.168.0.215:3000/api';
let currentUser = null;
let isPlaying = false;
let mqttClient = null;
let activePlaylist = null;

// --- LOGOWANIE ZDARZEŃ ---
async function logEvent(message) {
    const now = new Date();
    const formattedDate = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0');
    
    const entry = `${formattedDate}: ${message}`;

    try {
        await fetch(`${API_URL}/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entry: entry })
        });
    } catch (e) {
        console.error("Błąd komunikacji z loggerem:", e);
    }
}

// --- MQTT ---
function setupMQTT(userId) {
    mqttClient = mqtt.connect(`ws://192.168.0.215:9001`);
    mqttClient.on('connect', () => {
        mqttClient.subscribe(`music/notify/${userId}`);
        mqttClient.subscribe(`music/player/${userId}`);
    });

    mqttClient.on('message', (topic, message) => {
        try {
            const data = JSON.parse(message.toString());
            
            // Obsługa powiadomień o playlistach
            if (topic.includes('notify')) {
                // Wyświetlenie alertu na każdym urządzeniu
                if (data.action === 'CREATED') {
                    alert(`Nowa playlista stworzona: ${data.name || ''}`);
                } else if (data.action === 'UPDATED') {
                    alert(`Playlista została zaktualizowana!`);
                } else if (data.action === 'DELETED') {
                    alert(`Playlista została usunięta.`);
                }

                // Odświeżenie danych w tle
                loadUserPlaylists(); 
                if (activePlaylist) {
                    refreshCurrentPlaylistSilently(activePlaylist.playlistId);
                }
            }

            // Obsługa synchronizacji odtwarzacza
            if (topic.includes('player')) {
                if (data.title) playSong(data.title, data.artist, true, data.isPlaying);
            }
        } catch (e) { console.error("MQTT Error:", e); }
    });
}

// --- AUTH ---
async function login() {
    const log = document.getElementById('loginInput').value;
    const pass = document.getElementById('passInput').value;
    try {
        const res = await fetch(`${API_URL}/accounts`);
        const users = await res.json();
        const user = users.find(u => u.login === log && u.password === pass);
        if (user) {
            currentUser = user;
            document.getElementById('loginPanel').classList.add('hidden');
            document.getElementById('playlistPanel').classList.remove('hidden');
            document.getElementById('authStatus').innerText = `Zalogowano: ${user.login}`;
            document.getElementById('userWelcome').innerText = `Witaj, ${user.login}`;
            setupMQTT(user.accountId);
            loadUserPlaylists();
            logEvent(`User<id: ${user.accountId}> (${user.login}) logged in from adres IP.`);
        } else alert("Błędne dane");
    } catch (e) { alert("Błąd API"); }
}

function logout() {
    if (currentUser) {
        logEvent(`User<id: ${currentUser.accountId}> (${currentUser.login}) logged out.`);
    }
    location.reload();
}

// --- PLAYLISTS ---
async function createPlaylist() {
    const nameInput = document.getElementById('newPlaylistName');
    const name = nameInput.value;
    if (!name || !currentUser) return;
    const res = await fetch(`${API_URL}/playlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            playlistName: name, 
            author: currentUser.login, 
            authorIdReference: currentUser.accountId, 
            songs: [] 
        })
    });
    if (res.ok) {
        const createdData = await res.json();
        nameInput.value = "";
        logEvent(`User created playlist<id: ${createdData.playlistId}> (${name})`);
    }
}

async function addSongToPlaylist() {
    const songIdInput = document.getElementById('songIdInput');
    const songId = parseInt(songIdInput.value);
    if (!songId || !activePlaylist) return;

    if (activePlaylist.songs.includes(songId)) {
        alert("Ten utwór jest już na tej playliście!");
        return;
    }

    const newSongs = [...activePlaylist.songs, songId];
    const res = await fetch(`${API_URL}/playlists/${activePlaylist.playlistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songs: newSongs })
    });
    if (res.ok) {
        songIdInput.value = "";
        logEvent(`User added song with id: ${songId} to playlist<id: ${activePlaylist.playlistId}> (${activePlaylist.playlistName})`);
    }
}

async function removeSong(songId) {
    if (!activePlaylist) return;
    const newSongs = activePlaylist.songs.filter(id => id !== songId);
    const res = await fetch(`${API_URL}/playlists/${activePlaylist.playlistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songs: newSongs })
    });
    if (res.ok) {
        logEvent(`User deleted song with id: ${songId} from playlist<id: ${activePlaylist.playlistId}> (${activePlaylist.playlistName})`);
    }
}

async function refreshCurrentPlaylistSilently(id) {
    try {
        const res = await fetch(`${API_URL}/playlists/${id}`);
        if (res.status === 404) {
            showSearch();
            return;
        }
        activePlaylist = await res.json();
        const isOwner = currentUser && activePlaylist.authorIdReference === currentUser.accountId;
        renderPlaylistSongs(isOwner);
    } catch (e) { console.error("Silent refresh error:", e); }
}

// --- UI & SEARCH ---
async function loadUserPlaylists() {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_URL}/playlists?authorIdReference=${currentUser.accountId}`);
        let playlists = await res.json();
        playlists = playlists.filter(p => p.authorIdReference === currentUser.accountId);
        const listCont = document.getElementById('myPlaylistsList');
        listCont.innerHTML = "";
        if (playlists.length === 0) {
            listCont.innerHTML = "<div style='font-size:0.8rem; color:#666;'>Nie masz jeszcze playlist.</div>";
            return;
        }
        playlists.forEach(p => {
            const div = document.createElement('div');
            div.className = 'user-playlist-item';
            div.innerText = `📁 ${p.playlistName}`;
            div.onclick = () => openPlaylist(p.playlistId);
            listCont.appendChild(div);
        });
    } catch (e) { console.error(e); }
}

async function performSearch() {
    const query = document.getElementById('searchInput').value;
    const body = document.getElementById('resultsBody');
    body.innerHTML = '<tr><td colspan="3">Szukanie...</td></tr>';
    try {
        const [songs, playlists] = await Promise.all([
            fetch(`${API_URL}/songs?title=${query}`).then(r => r.json()),
            fetch(`${API_URL}/playlists?name=${query}`).then(r => r.json())
        ]);
        body.innerHTML = '';
        songs.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${s.songId}</td><td><span class="clickable" onclick="playSong('${s.songTitle}', '${s.artist}')">${s.songTitle}</span><br><small>${s.artist}</small></td><td><span class="type-badge">Piosenka</span></td>`;
            body.appendChild(tr);
        });
        playlists.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>-</td><td><span class="clickable" style="color:var(--primary)" onclick="openPlaylist(${p.playlistId})">${p.playlistName}</span></td><td><span class="type-badge">Playlista</span></td>`;
            body.appendChild(tr);
        });
    } catch (e) { body.innerHTML = '<tr><td>Błąd ładowania</td></tr>'; }
}

// --- PLAYER ---
function playSong(title, artist, fromRemote = false, shouldPlay = true) {
    document.getElementById('playerTitle').innerText = title;
    document.getElementById('playerArtist').innerText = artist;
    isPlaying = shouldPlay;
    updatePlayerUI();
    if (!fromRemote && mqttClient && currentUser) {
        mqttClient.publish(`music/player/${currentUser.accountId}`, JSON.stringify({ title, artist, isPlaying }));
    }
}

function togglePlay() {
    const title = document.getElementById('playerTitle').innerText;
    const artist = document.getElementById('playerArtist').innerText;
    if (title === "Wybierz utwór") return;
    isPlaying = !isPlaying;
    updatePlayerUI();
    if (mqttClient && currentUser) {
        mqttClient.publish(`music/player/${currentUser.accountId}`, JSON.stringify({ title, artist, isPlaying }));
    }
}

function updatePlayerUI() {
    const btn = document.getElementById('playBtn');
    btn.innerText = isPlaying ? "⏸" : "▶";
    document.getElementById('playerStatus').innerText = isPlaying ? "Odtwarzanie..." : "Zatrzymano";
    btn.style.background = isPlaying ? "#fff" : "var(--primary)";
}

async function openPlaylist(id) {
    const res = await fetch(`${API_URL}/playlists/${id}`);
    activePlaylist = await res.json();
    document.getElementById('searchView').classList.add('hidden');
    document.getElementById('playlistDetailView').classList.remove('hidden');
    document.getElementById('detName').innerText = activePlaylist.playlistName;
    document.getElementById('detAuthor').innerText = activePlaylist.author;
    const isOwner = currentUser && activePlaylist.authorIdReference === currentUser.accountId;
    document.getElementById('editTools').classList.toggle('hidden', !isOwner);
    renderPlaylistSongs(isOwner);
}

async function renderPlaylistSongs(isOwner) {
    const body = document.getElementById('detSongsBody');
    const currentSongs = activePlaylist.songs;
    if (currentSongs.length === 0) {
        body.innerHTML = "<tr><td colspan='3'>Brak utworów</td></tr>";
        return;
    }
    body.innerHTML = "<tr><td colspan='3'>Ładowanie utworów...</td></tr>";
    try {
        const songPromises = currentSongs.map(sId => fetch(`${API_URL}/songs/${sId}`).then(r => r.ok ? r.json() : null));
        const songsData = await Promise.all(songPromises);
        let htmlRows = "";
        songsData.forEach(s => {
            if (s) {
                htmlRows += `<tr><td>${s.songId}</td><td class="clickable" onclick="playSong('${s.songTitle}', '${s.artist}')">${s.songTitle}</td><td>${isOwner ? `<button onclick="removeSong(${s.songId})" style="background:red; width:auto; padding:5px 10px;">Usuń</button>` : '-'}</td></tr>`;
            }
        });
        body.innerHTML = htmlRows;
    } catch (e) { body.innerHTML = "<tr><td colspan='3'>Błąd ładowania listy.</td></tr>"; }
}

function showSearch() {
    activePlaylist = null;
    document.getElementById('searchView').classList.remove('hidden');
    document.getElementById('playlistDetailView').classList.add('hidden');
}