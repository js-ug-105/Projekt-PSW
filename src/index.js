const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');

const mqttClient = mqtt.connect('mqtt://localhost:1883');
const apiData = require('./data.json');
const logFilePath = path.join(__dirname, '..', 'logs.txt');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// ==========================================
// 1. KONKRETNE TRASY POST
// ==========================================

app.post('/api/logs', (req, res) => {
    const { entry } = req.body;
    if (!entry) return res.status(400).send('Brak treści logu');

    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (ip === '::1') ip = '127.0.0.1';
    const cleanIp = ip.replace(/^.*:/, '');

    const finalEntry = entry.replace('adres IP', cleanIp);

    fs.appendFile(logFilePath, finalEntry + '\n', (err) => {
        if (err) return res.status(500).send('Błąd serwera');
        res.status(201).send('Zalogowano pomyślnie');
    });
});

app.post('/api/accounts/', (req, res) => {
    const accounts = apiData["accounts"];
    const { login, password, email, playlists } = req.body;
    const newAccount = { accountId: accounts.length + 1, login, password, email, playlists };
    accounts.push(newAccount);
    res.status(201).json(newAccount);
});

app.post('/api/playlists/', (req, res) => {
    const playlists = apiData["playlists"];
    const { playlistName, author, authorIdReference, songs } = req.body;
    
    // Generowanie nowego ID
    const newId = playlists.length > 0 ? Math.max(...playlists.map(p => p.playlistId)) + 1 : 1;
    
    const newPlaylist = { 
        playlistId: newId, 
        playlistName, 
        author, 
        authorIdReference, 
        songs: songs || [] 
    };

    playlists.push(newPlaylist);

    // MQTT: Powiadomienie o nowej playliście
    const topic = `music/notify/${newPlaylist.authorIdReference}`;
    mqttClient.publish(topic, JSON.stringify({ 
        type: 'REFRESH', 
        action: 'CREATED', 
        name: newPlaylist.playlistName 
    }));

    res.status(201).json(newPlaylist);
});

// ==========================================
// 2. KONKRETNE TRASY GET
// ==========================================

app.get('/api/playlists', (req, res) => {
    let playlists = apiData.playlists;
    const { id, name, author, authorIdReference } = req.query;

    if (id) playlists = playlists.filter(p => p.playlistId === Number(id));
    if (name) playlists = playlists.filter(p => p.playlistName.toLowerCase().includes(name.toLowerCase()));
    if (author) playlists = playlists.filter(p => p.author.toLowerCase().includes(author.toLowerCase()));
    if (authorIdReference) playlists = playlists.filter(p => p.authorIdReference === Number(authorIdReference));

    res.json(playlists);
});

app.get('/api/songs', (req, res) => {
    let songs = apiData.songs;
    const { id, title, author } = req.query;

    if (id) songs = songs.filter(s => s.songId === Number(id));
    if (title) songs = songs.filter(s => s.songTitle.toLowerCase().includes(title.toLowerCase()));
    if (author) songs = songs.filter(s => s.author.toLowerCase().includes(author.toLowerCase()));
    res.json(songs);
});

// ==========================================
// 3. TRASY OGÓLNE (Dynamiczne :address)
// ==========================================

app.get('/api/:address/', (req, res) => {
    const data = apiData[req.params.address];
    if (!data) return res.status(404).send("Invalid resource");
    res.json(data);
});

app.get('/api/:address/:id/', (req, res) => {
    const data = apiData[req.params.address];
    if (!data) return res.status(404).send("Invalid resource");
    const id = parseInt(req.params.id);
    const item = data.find(i => 
        i?.accountId === id || i?.artistId === id || i?.playlistId === id || i?.songId === id
    );
    if (!item) return res.status(404).send("Item not found");
    res.json(item);
});

app.patch('/api/:address/:id/', (req, res) => {
    const data = apiData[req.params.address];
    if (!data) return res.status(404).send("Invalid resource");
    const id = parseInt(req.params.id);
    const index = data.findIndex(i => 
        i?.accountId === id || i?.artistId === id || i?.playlistId === id || i?.songId === id
    );

    if (index === -1) return res.status(404).send("Item not found");

    // Aktualizacja obiektu
    data[index] = { ...data[index], ...req.body };

    // MQTT: Jeśli aktualizujemy playlistę, powiadamiamy właściciela
    if (req.params.address === 'playlists') {
        const userId = data[index].authorIdReference;
        const topic = `music/notify/${userId}`;
        mqttClient.publish(topic, JSON.stringify({ 
            type: 'REFRESH', 
            action: 'UPDATED', 
            id: id 
        }));
    }

    res.json(data[index]);
});

app.delete('/api/:address/:id/', (req, res) => {
    const data = apiData[req.params.address];
    if (!data) return res.status(404).send("Invalid resource");
    const id = parseInt(req.params.id);
    const index = data.findIndex(i => 
        i?.accountId === id || i?.artistId === id || i?.playlistId === id || i?.songId === id
    );

    if (index === -1) return res.status(404).send("Item not found");
    
    // Pobieramy ID właściciela przed usunięciem (jeśli to playlista)
    const ownerId = data[index].authorIdReference;
    const isPlaylist = req.params.address === 'playlists';

    data.splice(index, 1);

    if (isPlaylist && ownerId) {
        mqttClient.publish(`music/notify/${ownerId}`, JSON.stringify({ type: 'REFRESH', action: 'DELETED' }));
    }

    res.send("Item deleted successfully");
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});