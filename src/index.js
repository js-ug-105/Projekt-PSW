// app.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();

const apiData = require('./data.json');


app.use(bodyParser.json());
app.use(cors());

/*let apiData = {
    "accounts": [
      { accountId: 1, login: 'Song 1', password: "password", email: "Author 1", playlists: [1] },
      { accountId: 2, login: 'Song 2', password: "password", email: "Author 2", playlists: [2] },
    ],
    "artists": [
      { artistId: 1, artistName: 'Author 1', albums: [1] },
      { artistId: 2, artistName: 'Author 2', albums: [2] },
    ],
    "playlists": [
      { playlistId: 1, playlistName: 'Playlist 1', author: "Author 1", authorIdReference: 1, songs: [1] },
      { playlistId: 2, playlistName: 'Playlist 2', author: "Author 2", authorIdReference: 2,  songs: [2] },
    ],
    "songs": [
      { songId: 1, songTitle: 'Song 1', artist: "Author 1", artistIdReference: 1, albumTitle: "Album 1", albumIdReference: 1 },
      { songId: 2, songTitle: 'Song 2', artist: "Author 2", artistIdReference: 2, albumTitle: "Album 2", albumIdReference: 2 },
    ],
  };*/

// Create (POST):

// Add a new account
app.post('/api/accounts/', (req, res) => {
  const accounts = apiData["accounts"]
  const { login, password, email, playlists } = req.body;
  const newAccount = { accountId: accounts.length + 1, login, password, email, playlists };
  accounts.push(newAccount);
  res.status(201).json(newAccount);
});
// Add a new artist
app.post('/api/artists/', (req, res) => {
  const artists = apiData["artists"]
  const { artistName, albums } = req.body;
  const newArtist = { artistId: artists.length + 1, artistName, albums };
  artists.push(newArtist);
  res.status(201).json(newArtist);
});
// Add a new playlist
app.post('/api/playlists/', (req, res) => {
  const playlists = apiData["playlists"]
  const { playlistName, author, authorIdReference, songs } = req.body;
  const newPlaylist = { playlistId: playlists.length + 1, playlistName, author, authorIdReference, songs };
  playlists.push(newPlaylist);
  res.status(201).json(newPlaylist);
});
// Add a new song
app.post('/api/songs/', (req, res) => {
  const songs = apiData["songs"]
  const { songTitle, author, authorId, albumTitle, albumId } = req.body;
  const newSong = { songId: songs.length + 1, songTitle , author, authorId, albumTitle, albumId};
  songs.push(newSong);
  res.status(201).json(newSong);
});

// Read (GET):

// API welcome
app.get('/api/', (req, res) => {
  res.send('Welcome to the Music API!');
});

// Search artists
app.get('/api/artists', (req, res) => {
  let artists = apiData.artists;

  const { id, name } = req.query;

  if (id) {
    artists = artists.filter(a => a.artistId === Number(id));
  }

  if (name) {
    artists = artists.filter(a =>
      a.artistName.toLowerCase().includes(name.toLowerCase())
    );
  }
  res.json(artists)
});

// Search playlists
app.get('/api/playlists', (req, res) => {
  let playlists = apiData.playlists;

  const {id, name, author} = req.query;
  if (id) {
    playlists = playlists.filter(p => p.playlistId === Number(id));
  }

  if (name) {
    playlists = playlists.filter(p => 
      p.playlistName.toLowerCase().includes(name.toLowerCase())
    );
  }

  if (author) {
    playlists = playlists.filter(p =>
      p.author.toLowerCase().includes(author.toLowerCase())
    );
  }

  res.json(playlists)

});

// Search songs
app.get('/api/songs', (req,res) => {
  let songs = apiData.songs

  const {id, title, author, album} = req.query

  if (id) {
    songs = songs.filter(s => s.songId === Number(id));
  }
  if (title) {
    songs = songs.filter(s => 
      s.songTitle.toLowerCase().includes(title.toLowerCase())
    );
  }
  if (author) {
    songs = songs.filter(s =>
      s.author.toLowerCase().includes(author.toLowerCase())
    );
  }
  if (album) {}
  res.json(songs)
});

// Get all songs
app.get('/api/:address/', (req, res) => {
  res.json(apiData[req.params.address])
})
// Get item by id
app.get('/api/:address/:id/', (req, res) => {
  const data = apiData[req.params.address];
  if (!data) return res.status(404).send("Invalid resource");
  const id = parseInt(req.params.id)
  const item = data.find(i => 
    i?.accountId === id ||
    i?.artistId === id ||
    i?.playlistId === id  ||
    i?.songId === id
  );
  if (!item) return res.status(404).send("Item not found");
  res.json(item);
});

// Update (PATCH):

app.patch('/api/:address/:id/', (req, res) => {
  const data = apiData[req.params.address];
  if (!data) return res.status(404).send("Invalid resource");
  const id = parseInt(req.params.id)
  const index = data.findIndex( i =>
    i?.accountId === id ||
    i?.artistId === id ||
    i?.playlistId === id  ||
    i?.songId === id
  );

  if (index === -1) return res.status(404).send("Item not found");
  data[index] = {
  ...data[index],
  ...req.body
  };
  res.json(data[index])
});

// Delete (DELETE)
app.delete('/api/:address/:id/', (req, res) => {
  const data = apiData[req.params.address];
  if (!data) return res.status(404).send("Invalid resource");
  const id = parseInt(req.params.id);
  const index = data.findIndex(i => 
    i?.accountId === id ||
    i?.artistId === id ||
    i?.playlistId === id  ||
    i?.songId === id
  );

  if (index === -1) return res.status(404).send("Item not found");
  data.splice(index, 1)
  res.send("Item deleted succesfully");
});


app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});