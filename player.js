// ============================================================
// Mario Kart World Radio - Enhanced Player v2.1
// Features: Loop modes, Download, Favorites, Custom Playlists,
//           Search, Keyboard Shortcuts, Mute, Toast notifications
// ============================================================

// ---------- ELEMENTS ----------
const audioPlayer    = document.getElementById('audioPlayer');
const titleEl        = document.getElementById('title');
const gameEl         = document.getElementById('game');
const artworkEl      = document.getElementById('artwork');
const playBtn        = document.getElementById('playBtn');
const prevBtn        = document.getElementById('prevBtn');
const nextBtn        = document.getElementById('nextBtn');
const progressBar    = document.getElementById('progressBar');
const timeDisplay    = document.getElementById('timeDisplay');
const volumeSlider   = document.getElementById('volumeSlider');
const tracklistContainer = document.getElementById('tracklist');
const loopBtn        = document.getElementById('loopBtn');
const favoriteBtn    = document.getElementById('favoriteBtn');

// ---------- STATE ----------
let cd1Tracks = [], cd2Tracks = [], cd3Tracks = [], cd4Tracks = [];
let tracks = [], currentTrack = 0;
let playInOrder = false, pendingUpdate = false;
let excludedTracks = new Set(), history = [], historyPointer = -1;
let shufflePool = [];
let loopMode = 'off'; // 'off' | 'all' | 'one'
let favorites = new Set(JSON.parse(localStorage.getItem('mkwr_favorites') || '[]'));
let playlists = JSON.parse(localStorage.getItem('mkwr_playlists') || '[]');
let activePlaylistId = null;
let currentTab = 'all';
let openPlaylistId = null;
let isMuted = false;

// ---------- PERSIST ----------
function saveFavorites() { localStorage.setItem('mkwr_favorites', JSON.stringify([...favorites])); }
function savePlaylists() { localStorage.setItem('mkwr_playlists', JSON.stringify(playlists)); }

// ---------- TOAST ----------
let toastTimeout;
function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => t.classList.remove('show'), 2500);
}

// ---------- ENCODE URL (handles [ ] & # spaces in filenames) ----------
function encodeTrackUrl(url) {
    return url.split('/').map((seg, i) => i === 0 ? seg : encodeURIComponent(seg)).join('/');
}

// ---------- LOOP ----------
function cycleLoop() {
    if (loopMode === 'off') loopMode = 'all';
    else if (loopMode === 'all') loopMode = 'one';
    else loopMode = 'off';
    updateLoopBtn();
    showToast(loopMode === 'off' ? 'Loop off' : loopMode === 'all' ? 'Loop all' : 'Loop one');
}
window.cycleLoop = cycleLoop;

function updateLoopBtn() {
    if (!loopBtn) return;
    loopBtn.classList.remove('loop-off', 'loop-all', 'loop-one');
    const icon = loopBtn.querySelector('i');
    if (loopMode === 'off') {
        loopBtn.classList.add('loop-off');
        loopBtn.title = 'Loop: Off (L)';
        icon.className = 'fa-solid fa-repeat';
    } else if (loopMode === 'all') {
        loopBtn.classList.add('loop-all');
        loopBtn.title = 'Loop: All (L)';
        icon.className = 'fa-solid fa-repeat';
    } else {
        loopBtn.classList.add('loop-one');
        loopBtn.title = 'Loop: One (L)';
        icon.className = 'fa-solid fa-1';
    }
}

// ---------- MUTE ----------
function toggleMute() {
    isMuted = !isMuted;
    audioPlayer.muted = isMuted;
    const btn = document.getElementById('muteBtn');
    if (btn) {
        btn.querySelector('i').className = isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
        btn.classList.toggle('muted', isMuted);
    }
    showToast(isMuted ? 'Muted' : 'Unmuted');
}
window.toggleMute = toggleMute;

// Download system moved to bottom of file

// ---------- FAVORITES ----------
function toggleFavoriteCurrentTrack() {
    if (!tracks.length || currentTrack == null) return;
    const url = tracks[currentTrack] && tracks[currentTrack].url;
    if (!url) return;
    toggleFavorite(url);
}
window.toggleFavoriteCurrentTrack = toggleFavoriteCurrentTrack;

function toggleFavorite(url) {
    if (favorites.has(url)) { favorites.delete(url); showToast('Removed from favorites'); }
    else { favorites.add(url); showToast('Added to favorites'); }
    saveFavorites();
    updateFavoriteBtn();
    renderFavoritesList();
    document.querySelectorAll('li[data-url] .fav-btn').forEach(btn => {
        if (btn.closest('li') && btn.closest('li').dataset.url === url) {
            btn.classList.toggle('active', favorites.has(url));
            btn.innerHTML = favorites.has(url) ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
        }
    });
}

function updateFavoriteBtn() {
    if (!favoriteBtn) return;
    const url = tracks[currentTrack] && tracks[currentTrack].url;
    const isFav = !!(url && favorites.has(url));
    favoriteBtn.innerHTML = isFav ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
    favoriteBtn.classList.toggle('active', isFav);
    favoriteBtn.title = isFav ? 'Remove from favorites (F)' : 'Add to favorites (F)';
}

function renderFavoritesList() {
    const list = document.getElementById('favoriteslist');
    const empty = document.getElementById('favoritesEmpty');
    if (!list) return;
    const allTracks = [...cd1Tracks, ...cd2Tracks, ...cd3Tracks, ...cd4Tracks];
    const favTracks = allTracks.filter(t => favorites.has(t.url));
    list.innerHTML = '';
    if (favTracks.length === 0) {
        if (empty) empty.style.display = '';
        list.style.display = 'none';
        return;
    }
    if (empty) empty.style.display = 'none';
    list.style.display = '';
    favTracks.forEach(track => list.appendChild(createTrackLi(track, false)));
    updateActiveTrack();
}

// ---------- PLAYLISTS ----------
function openPlaylistModal(id = null) {
    const modal = document.getElementById('playlistModal');
    const input = document.getElementById('playlistNameInput');
    const modalTitle = document.getElementById('modalTitle');
    const btn = document.getElementById('modalConfirmBtn');
    modal.style.display = 'flex';
    if (id) {
        const pl = playlists.find(p => p.id === id);
        modalTitle.textContent = 'Rename Playlist';
        input.value = pl ? pl.name : '';
        btn.textContent = 'Save';
        btn.onclick = () => { renamePlaylist(id, input.value.trim()); closePlaylistModal(); };
    } else {
        modalTitle.textContent = 'New Playlist';
        input.value = '';
        btn.textContent = 'Create';
        btn.onclick = () => { createPlaylist(input.value.trim()); closePlaylistModal(); };
    }
    setTimeout(() => input.focus(), 50);
    input.onkeydown = e => { if (e.key === 'Enter') btn.click(); if (e.key === 'Escape') closePlaylistModal(); };
}
window.openPlaylistModal = openPlaylistModal;

function closePlaylistModal() { document.getElementById('playlistModal').style.display = 'none'; }
window.closePlaylistModal = closePlaylistModal;

function createPlaylist(name) {
    if (!name) { showToast('Enter a playlist name!'); return; }
    playlists.push({ id: Date.now().toString(), name, trackUrls: [] });
    savePlaylists(); renderPlaylistManager();
    showToast('Playlist "' + name + '" created!');
}

function renamePlaylist(id, name) {
    if (!name) return;
    const pl = playlists.find(p => p.id === id);
    if (pl) { pl.name = name; savePlaylists(); renderPlaylistManager(); showToast('Playlist renamed!'); }
}

function deletePlaylist(id) {
    if (!confirm('Delete this playlist?')) return;
    playlists = playlists.filter(p => p.id !== id);
    if (activePlaylistId === id) activePlaylistId = null;
    if (openPlaylistId === id) closePlaylistView();
    savePlaylists(); renderPlaylistManager(); showToast('Playlist deleted');
}
window.deletePlaylist = deletePlaylist;

function renderPlaylistManager() {
    const container = document.getElementById('playlistManagerList');
    const empty = document.getElementById('playlistsEmpty');
    if (!container) return;
    container.innerHTML = '';
    if (playlists.length === 0) { if (empty) empty.style.display = ''; return; }
    if (empty) empty.style.display = 'none';
    playlists.forEach(pl => {
        const div = document.createElement('div');
        div.className = 'playlist-item';
        div.innerHTML = `<span class="playlist-item-name">${pl.name}</span>
            <span class="playlist-item-count">${pl.trackUrls.length} tracks</span>
            <div class="playlist-item-btns">
                <button onclick="playPlaylist('${pl.id}')" title="Play" class="pl-btn pl-play"><i class="fa-solid fa-play"></i></button>
                <button onclick="openPlaylistView('${pl.id}')" title="Edit" class="pl-btn pl-edit"><i class="fa-solid fa-pen"></i></button>
                <button onclick="openPlaylistModal('${pl.id}')" title="Rename" class="pl-btn pl-rename"><i class="fa-solid fa-i-cursor"></i></button>
                <button onclick="deletePlaylist('${pl.id}')" title="Delete" class="pl-btn pl-delete"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        container.appendChild(div);
    });
}

function playPlaylist(id) {
    const pl = playlists.find(p => p.id === id);
    if (!pl || pl.trackUrls.length === 0) { showToast('Playlist is empty!'); return; }
    const allTracks = [...cd1Tracks, ...cd2Tracks, ...cd3Tracks, ...cd4Tracks];
    const plTracks = pl.trackUrls.map(url => allTracks.find(t => t.url === url)).filter(Boolean);
    if (!plTracks.length) { showToast('No tracks found!'); return; }
    activePlaylistId = id; tracks = plTracks; currentTrack = 0;
    history = []; historyPointer = -1;
    shufflePool = tracks.map((_, i) => i);
    if (!playInOrder) shuffleArray(shufflePool);
    playTrack(0);
    showToast('Playing: ' + pl.name);
}
window.playPlaylist = playPlaylist;

function openPlaylistView(id) {
    openPlaylistId = id;
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;
    document.getElementById('playlistManagerList').style.display = 'none';
    document.getElementById('playlistsEmpty').style.display = 'none';
    document.querySelector('.playlist-header').style.display = 'none';
    document.getElementById('playlistTrackView').style.display = '';
    document.getElementById('playlistViewName').textContent = pl.name;
    document.getElementById('playlistTrackSearch').value = '';
    document.getElementById('addTrackResults').innerHTML = '';
    renderPlaylistTracks(id);
}
window.openPlaylistView = openPlaylistView;

function closePlaylistView() {
    openPlaylistId = null;
    document.getElementById('playlistTrackView').style.display = 'none';
    document.getElementById('playlistManagerList').style.display = '';
    document.getElementById('playlistsEmpty').style.display = playlists.length === 0 ? '' : 'none';
    document.querySelector('.playlist-header').style.display = '';
    renderPlaylistManager();
}
window.closePlaylistView = closePlaylistView;

function renderPlaylistTracks(id) {
    const pl = playlists.find(p => p.id === id);
    const list = document.getElementById('playlistTrackList');
    if (!pl || !list) return;
    list.innerHTML = '';
    const allTracks = [...cd1Tracks, ...cd2Tracks, ...cd3Tracks, ...cd4Tracks];
    pl.trackUrls.forEach(url => {
        const track = allTracks.find(t => t.url === url);
        if (!track) return;
        const li = document.createElement('li');
        li.dataset.url = url;
        li.innerHTML = `<span class="track-text">${track.title || url}</span>
            <button class="pl-track-remove" onclick="removeFromPlaylist('${id}','${url.replace(/'/g,"\\'")}')"><i class="fa-solid fa-xmark"></i></button>`;
        list.appendChild(li);
    });
}

function removeFromPlaylist(id, url) {
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;
    pl.trackUrls = pl.trackUrls.filter(u => u !== url);
    savePlaylists(); renderPlaylistTracks(id); showToast('Removed from playlist');
}
window.removeFromPlaylist = removeFromPlaylist;

function addToPlaylist(id, url) {
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;
    if (pl.trackUrls.includes(url)) { showToast('Already in playlist!'); return; }
    pl.trackUrls.push(url); savePlaylists();
    if (openPlaylistId === id) renderPlaylistTracks(id);
    showToast('Added to "' + pl.name + '"');
}
window.addToPlaylist = addToPlaylist;

function filterAddTrack(query) {
    const results = document.getElementById('addTrackResults');
    if (!results) return;
    results.innerHTML = '';
    if (!query.trim() || !openPlaylistId) return;
    const allTracks = [...cd1Tracks, ...cd2Tracks, ...cd3Tracks, ...cd4Tracks];
    const q = query.toLowerCase();
    const matches = allTracks.filter(t => (t.title||'').toLowerCase().includes(q)||(t.game||'').toLowerCase().includes(q)).slice(0,8);
    matches.forEach(track => {
        const div = document.createElement('div');
        div.className = 'add-track-result-item';
        const pl = playlists.find(p => p.id === openPlaylistId);
        const inList = pl && pl.trackUrls.includes(track.url);
        div.innerHTML = `<span>${track.title}</span><button ${inList?'disabled':''} onclick="addToPlaylist('${openPlaylistId}','${track.url.replace(/'/g,"\\'")}');filterAddTrack(document.getElementById('playlistTrackSearch').value)" class="add-track-btn">${inList?'Added':'+ Add'}</button>`;
        results.appendChild(div);
    });
}
window.filterAddTrack = filterAddTrack;

function openAddToPlaylistPicker() {
    const picker = document.getElementById('addToPlaylistPicker');
    const list = document.getElementById('playlistPickerList');
    list.innerHTML = '';
    if (playlists.length === 0) {
        list.innerHTML = '<div style="color:#aaa;text-align:center;padding:8px">No playlists yet!</div>';
    } else {
        playlists.forEach(pl => {
            const btn = document.createElement('button');
            btn.className = 'picker-pl-btn';
            btn.textContent = pl.name;
            btn.onclick = () => { const url = tracks[currentTrack]&&tracks[currentTrack].url; if(url) addToPlaylist(pl.id,url); closeAddToPlaylistPicker(); };
            list.appendChild(btn);
        });
    }
    picker.style.display = '';
}
window.openAddToPlaylistPicker = openAddToPlaylistPicker;

function closeAddToPlaylistPicker() { document.getElementById('addToPlaylistPicker').style.display = 'none'; }
window.closeAddToPlaylistPicker = closeAddToPlaylistPicker;

// ---------- TABS ----------
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const ab = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (ab) ab.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    const sw = document.getElementById('searchWrapper');
    if (tab === 'all') {
        document.getElementById('tabContentAll').style.display = '';
        if (sw) sw.style.display = '';
    } else if (tab === 'favorites') {
        document.getElementById('tabContentFavorites').style.display = '';
        if (sw) sw.style.display = 'none';
        renderFavoritesList();
    } else if (tab === 'playlists') {
        document.getElementById('tabContentPlaylists').style.display = '';
        if (sw) sw.style.display = 'none';
        renderPlaylistManager();
    }
}
window.switchTab = switchTab;

// ---------- SEARCH ----------
let currentSearchQuery = '';
function filterTracks(query) { currentSearchQuery = query.toLowerCase(); renderTracklist(); }
window.filterTracks = filterTracks;

// ---------- HELPERS ----------
const shuffleArray = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
};
const formatTime = seconds => {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
};

// ---------- CREATE TRACK LI ----------
function createTrackLi(track, showNumber = true) {
    const li = document.createElement('li');
    li.dataset.url = track.url;
    const trackText = document.createElement('span');
    trackText.className = 'track-text';
    trackText.textContent = showNumber
        ? `${String(track.trackNumber).padStart(2,'0')} - ${track.title}${track.game ? ` [${track.game}]` : ''}`
        : `${track.title}${track.game ? ` [${track.game}]` : ''}`;
    const favBtn = document.createElement('button');
    favBtn.className = 'fav-btn' + (favorites.has(track.url) ? ' active' : '');
    favBtn.title = 'Favorite';
    favBtn.innerHTML = favorites.has(track.url) ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
    favBtn.addEventListener('click', e => { e.stopPropagation(); toggleFavorite(track.url); });
    const excludeBtn = document.createElement('span');
    excludeBtn.className = 'exclude-btn';
    excludeBtn.textContent = excludedTracks.has(track.url) ? '+' : '-';
    li.classList.toggle('excluded', excludedTracks.has(track.url));
    li.appendChild(trackText);
    li.appendChild(favBtn);
    li.appendChild(excludeBtn);
    return li;
}

// ---------- UPDATE ACTIVE TRACK ----------
const updateActiveTrack = () => {
    if (!tracklistContainer) return;
    tracklistContainer.querySelectorAll('li').forEach(li => li.classList.remove('active'));
    const track = tracks[currentTrack];
    if (!track) return;
    tracklistContainer.querySelectorAll('li[data-url]').forEach(li => {
        if (li.dataset.url === track.url) li.classList.add('active');
    });
};

// ---------- PLAY TRACK ----------
function playTrack(index, fromHistory = false) {
    if (!tracks.length || index == null || index < 0 || index >= tracks.length) return;
    currentTrack = index;
    const track = tracks[index];
    audioPlayer.src = encodeTrackUrl(track.url);
    audioPlayer.currentTime = 0;
    audioPlayer.load();
    audioPlayer.play().catch(err => console.warn('Play failed:', err.name, err.message));
    if (!fromHistory) {
        if (historyPointer < history.length - 1) history = history.slice(0, historyPointer + 1);
        history.push(index); historyPointer = history.length - 1;
        if (!playInOrder) shufflePool = shufflePool.filter(i => i !== index);
    }
    titleEl.textContent = track.title || '-';
    artworkEl.src = track.artwork || 'assets/player-img/cover.png';
    artworkEl.style.objectPosition = 'center center';
    gameEl.textContent = track.game || '';
    gameEl.style.visibility = track.game ? 'visible' : 'hidden';
    gameEl.classList.toggle('hidden', !track.game);
    progressBar.style.width = '0%';
    audioPlayer.addEventListener('loadedmetadata', () => {
        if (!isNaN(audioPlayer.duration)) timeDisplay.textContent = `0:00 / ${formatTime(audioPlayer.duration)}`;
    }, { once: true });
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title || 'Unknown Track', artist: track.game || 'Mario Kart World',
            album: 'Mario Kart World Radio',
            artwork: [{ src: track.artwork || 'assets/player-img/cover.png', sizes: '512x512', type: 'image/png' }]
        });
        // Reset position state on new track; action handlers are registered once at init
        audioPlayer.addEventListener('loadedmetadata', () => {
            try {
                if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
                    navigator.mediaSession.setPositionState({ duration: audioPlayer.duration || 0, playbackRate: 1, position: 0 });
                }
            } catch(e) {}
        }, { once: true });
    }
    updateActiveTrack();
    updateFavoriteBtn();
}

// ---------- SHUFFLE POOL ----------
function getNextShuffleTrack() {
    if (!shufflePool.length) {
        shufflePool = tracks.map((_, i) => i).filter(i => !excludedTracks.has(tracks[i].url));
        shuffleArray(shufflePool);
    }
    return shufflePool.shift();
}

// ---------- NEXT / PREV ----------
function playNextTrack() {
    if (!tracks.length) return;
    if (pendingUpdate) { updateTrackList(true); pendingUpdate = false; }
    if (loopMode === 'one') { audioPlayer.currentTime = 0; audioPlayer.play(); return; }
    if (historyPointer < history.length - 1) { historyPointer++; playTrack(history[historyPointer], true); return; }
    if (playInOrder) {
        let nextIndex = currentTrack + 1;
        while (nextIndex < tracks.length && excludedTracks.has(tracks[nextIndex] && tracks[nextIndex].url)) nextIndex++;
        if (nextIndex >= tracks.length) { if (loopMode === 'all') nextIndex = 0; else return; }
        playTrack(nextIndex);
    } else {
        const nextIndex = getNextShuffleTrack();
        if (nextIndex == null) return;
        playTrack(nextIndex);
    }
}

function playPreviousTrack() {
    if (!tracks.length) return;
    if (audioPlayer.currentTime > 3) { audioPlayer.currentTime = 0; audioPlayer.play(); return; }
    if (historyPointer > 0) { historyPointer--; playTrack(history[historyPointer], true); }
    else { audioPlayer.currentTime = 0; audioPlayer.play(); }
}

audioPlayer.addEventListener('ended', () => {
    if (loopMode === 'one') { audioPlayer.currentTime = 0; audioPlayer.play(); } else playNextTrack();
});

// ---------- BACKGROUND PLAYBACK ROBUSTNESS ----------

// 1. Stall / buffer wait recovery — Android throttles network when screen off
let stallTimer = null;
function clearStallTimer() { if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; } }

audioPlayer.addEventListener('waiting', () => {
    clearStallTimer();
    stallTimer = setTimeout(() => {
        // After 8s of buffering stall, try to seek slightly forward and resume
        if (!audioPlayer.paused && audioPlayer.readyState < 3) {
            console.warn('[MKWR] Audio stalled, attempting recovery...');
            const ct = audioPlayer.currentTime;
            audioPlayer.currentTime = ct + 0.1;
            audioPlayer.play().catch(e => console.warn('[MKWR] Stall recovery play failed:', e));
        }
    }, 8000);
});

audioPlayer.addEventListener('stalled', () => {
    clearStallTimer();
    stallTimer = setTimeout(() => {
        if (!audioPlayer.paused) {
            console.warn('[MKWR] Audio stalled (stalled event), attempting recovery...');
            const ct = audioPlayer.currentTime;
            audioPlayer.load();
            audioPlayer.currentTime = ct;
            audioPlayer.play().catch(e => console.warn('[MKWR] Stall load recovery failed:', e));
        }
    }, 10000);
});

audioPlayer.addEventListener('playing', clearStallTimer);
audioPlayer.addEventListener('ended', clearStallTimer);

// 2. Error handler — skip to next track on unrecoverable audio error
audioPlayer.addEventListener('error', (e) => {
    const err = audioPlayer.error;
    console.warn('[MKWR] Audio error:', err ? err.code + ' ' + err.message : e);
    clearStallTimer();
    // Don't skip if no track loaded yet
    if (!audioPlayer.src || !tracks.length) return;
    setTimeout(() => playNextTrack(), 1500);
});

// 3. Heartbeat — catches missed 'ended' events when screen is off (Android throttles JS)
let lastHeartbeatTime = -1;
let heartbeatSkipGuard = false;
setInterval(() => {
    if (audioPlayer.paused || !audioPlayer.duration || audioPlayer.duration === Infinity) return;
    const remaining = audioPlayer.duration - audioPlayer.currentTime;
    // Track has ended but ended event didn't fire
    if (audioPlayer.ended && !heartbeatSkipGuard) {
        heartbeatSkipGuard = true;
        console.warn('[MKWR] Heartbeat caught missed ended event');
        if (loopMode === 'one') { audioPlayer.currentTime = 0; audioPlayer.play(); }
        else playNextTrack();
        setTimeout(() => { heartbeatSkipGuard = false; }, 3000);
        return;
    }
    // currentTime frozen — audio silently stalled
    if (audioPlayer.currentTime === lastHeartbeatTime && audioPlayer.readyState < 3 && remaining > 2) {
        console.warn('[MKWR] Heartbeat: currentTime frozen, attempting recovery');
        audioPlayer.play().catch(e => {});
    }
    lastHeartbeatTime = audioPlayer.currentTime;
    heartbeatSkipGuard = false;
}, 3000);

// 4. Visibility change — recover when user unlocks screen
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    console.log('[MKWR] Page visible again, checking audio state...');

    // Short delay to let the browser fully resume from background
    setTimeout(() => {
        if (!tracks.length || currentTrack == null) return;

        // Case A: audio ended while screen was off
        if (audioPlayer.ended) {
            console.log('[MKWR] Audio ended while in background, playing next');
            if (loopMode === 'one') { audioPlayer.currentTime = 0; audioPlayer.play(); }
            else playNextTrack();
            return;
        }

        // Case B: audio should be playing but is paused (Android killed it)
        if (audioPlayer.paused && audioPlayer.currentTime > 0 && audioPlayer.currentTime < audioPlayer.duration) {
            console.log('[MKWR] Audio was playing but paused by system, resuming');
            audioPlayer.play().catch(e => console.warn('[MKWR] Resume failed:', e));
            return;
        }

        // Case C: audio stalled / low readyState while should be playing
        if (!audioPlayer.paused && audioPlayer.readyState < 2) {
            console.log('[MKWR] Audio stalled in background, reloading');
            const ct = audioPlayer.currentTime;
            audioPlayer.load();
            if (ct > 0) { try { audioPlayer.currentTime = ct; } catch(e) {} }
            audioPlayer.play().catch(e => console.warn('[MKWR] Stall resume failed:', e));
        }
    }, 500);
});

// 5. MediaSession — register action handlers ONCE at init (not per-track)
if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
        audioPlayer.play().catch(e => console.warn('[MKWR] MediaSession play failed:', e));
    });
    navigator.mediaSession.setActionHandler('pause', () => audioPlayer.pause());
    navigator.mediaSession.setActionHandler('previoustrack', playPreviousTrack);
    navigator.mediaSession.setActionHandler('nexttrack', playNextTrack);
    navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (d.seekTime >= 0 && audioPlayer.duration && d.seekTime <= audioPlayer.duration) {
            audioPlayer.currentTime = d.seekTime;
        }
    });
    navigator.mediaSession.setActionHandler('seekbackward', (d) => {
        audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - (d.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler('seekforward', (d) => {
        audioPlayer.currentTime = Math.min(audioPlayer.duration || 0, audioPlayer.currentTime + (d.seekOffset || 10));
    });
    // Update position state on play/resume so lock screen scrubber is accurate
    audioPlayer.addEventListener('play', () => {
        try {
            if (navigator.mediaSession.setPositionState && audioPlayer.duration) {
                navigator.mediaSession.setPositionState({ duration: audioPlayer.duration, playbackRate: 1, position: audioPlayer.currentTime });
            }
        } catch(e) {}
    });
}

// ---------- CONTROLS ----------
nextBtn.addEventListener('click', playNextTrack);
prevBtn.addEventListener('click', playPreviousTrack);
const playIcon = playBtn.querySelector('i');
const updatePlayButtonIcon = () => {
    playIcon.classList.toggle('fa-play', audioPlayer.paused);
    playIcon.classList.toggle('fa-pause', !audioPlayer.paused);
};
playBtn.addEventListener('click', () => { audioPlayer.paused ? audioPlayer.play().catch(e=>console.warn(e)) : audioPlayer.pause(); updatePlayButtonIcon(); });
audioPlayer.addEventListener('play', updatePlayButtonIcon);
audioPlayer.addEventListener('pause', updatePlayButtonIcon);
audioPlayer.addEventListener('loadedmetadata', updatePlayButtonIcon);
audioPlayer.addEventListener('timeupdate', () => {
    const current = isNaN(audioPlayer.currentTime) ? 0 : audioPlayer.currentTime;
    const total = isNaN(audioPlayer.duration) ? 0 : audioPlayer.duration;
    progressBar.style.width = ((current/total)*100||0) + '%';
    timeDisplay.textContent = `${formatTime(current)} / ${formatTime(total)}`;
    // Position state updated on loadedmetadata and play events instead of timeupdate
    // to avoid unnecessary calls when screen is off
});

// ---------- IOS ----------
const isIOSSafari = () => {
    const ua = navigator.userAgent, iOS = /iPad|iPhone|iPod/.test(ua), webkit = /WebKit/.test(ua);
    const chrome = /CriOS|Chrome/.test(ua), firefox = /FxiOS/.test(ua);
    const isPadOSDesktop = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return (iOS || isPadOSDesktop) && webkit && !chrome && !firefox;
};
if (volumeSlider) {
    if (isIOSSafari()) {
        const vc = document.querySelector('.volume-control-horizontal');
        if (vc) { vc.style.display = 'none'; document.body.classList.add('ios-safari'); }
    } else {
        audioPlayer.volume = volumeSlider.value / 100;
        volumeSlider.addEventListener('input', () => audioPlayer.volume = volumeSlider.value / 100);
    }
}

// ---------- SCROLL ----------
let scrollTimeout;
window.addEventListener('scroll', () => {
    if (window.innerWidth > 700) return;
    document.body.classList.toggle('scrolled', window.scrollY > 20);
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => { if (window.scrollY <= 20) document.body.classList.remove('scrolled'); }, 1000);
}, { passive: true });

// ---------- UPDATE TRACK LIST ----------
function updateTrackList(keepCurrent = false) {
    const excludeCD1 = document.getElementById('excludeCD1')?.checked;
    const excludeCD2 = document.getElementById('excludeCD2')?.checked;
    const excludeCD3 = document.getElementById('excludeCD3')?.checked;
    const excludeCD4 = document.getElementById('excludeCD4')?.checked;
    playInOrder = document.getElementById('playInOrder')?.checked || false;
    if (activePlaylistId) return;
    const currentTrackObj = tracks[currentTrack];
    const newTracks = [];
    if (!excludeCD1) newTracks.push(...cd1Tracks.filter(t => !excludedTracks.has(t.url)));
    if (!excludeCD2) newTracks.push(...cd2Tracks.filter(t => !excludedTracks.has(t.url)));
    if (!excludeCD3) newTracks.push(...cd3Tracks.filter(t => !excludedTracks.has(t.url)));
    if (!excludeCD4) newTracks.push(...cd4Tracks.filter(t => !excludedTracks.has(t.url)));
    tracks = newTracks;
    if (keepCurrent && currentTrackObj) {
        const newIndex = tracks.findIndex(t => t.url === currentTrackObj.url);
        currentTrack = newIndex !== -1 ? newIndex : 0;
        if (!audioPlayer.src && tracks.length) playTrack(currentTrack);
    } else {
        if (!audioPlayer.src && tracks.length) playTrack(playInOrder ? 0 : Math.floor(Math.random() * tracks.length));
        else if (currentTrack >= tracks.length) currentTrack = tracks.length ? tracks.length - 1 : 0;
    }
    shufflePool = !playInOrder
        ? tracks.map((_, i) => i).filter(i => i !== currentTrack && !excludedTracks.has(tracks[i].url))
        : [];
    shuffleArray(shufflePool);
    renderTracklist();
    updateActiveTrack();
}

// ---------- LOAD TRACKS ----------
Promise.all([
    fetch('./tracksCD1.json').then(r => r.json()),
    fetch('./tracksCD2.json').then(r => r.json()),
    fetch('./tracksCD3.json').then(r => r.json()),
    fetch('./tracksCD4.json').then(r => r.json())
]).then(([cd1Data, cd2Data, cd3Data, cd4Data]) => {
    const norm = (data, nested = false) => {
        if (!Array.isArray(data)) return [];
        if (nested) return data.flatMap(game => game.tracks.map(t => ({ ...t, trackNumber: Number(t.trackNumber)||0, game: game.game, artwork: game.artwork })));
        return data.map(t => ({ ...t, trackNumber: Number(t.trackNumber)||0 }));
    };
    cd1Tracks = norm(cd1Data); cd2Tracks = norm(cd2Data, true);
    cd3Tracks = norm(cd3Data.games, true); cd4Tracks = norm(cd4Data);
    const byNum = (a,b) => a.trackNumber - b.trackNumber;
    cd1Tracks.sort(byNum); cd2Tracks.sort(byNum); cd3Tracks.sort(byNum); cd4Tracks.sort(byNum);
    updateTrackList(false);
}).catch(err => console.error('Error loading tracks:', err));

// ---------- RENDER TRACKLIST ----------
function renderTracklist() {
    const container = document.getElementById('tabContentAll');
    if (!container) return;
    const openCDs = Array.from(container.querySelectorAll('.cd-tracks.open'))
        .map(ul => ul.closest('.cd-category')?.querySelector('.cd-btn')?.textContent);
    container.innerHTML = '';
    const q = currentSearchQuery;
    const cds = [
        { name: 'CD1 - Grand Prix / Battle Tracks', tracks: cd1Tracks },
        { name: 'CD2 - Mario Kart Series Free Roam', tracks: cd2Tracks },
        { name: 'CD3 - Super Mario Series Free Roam', tracks: cd3Tracks },
        { name: 'CD4 - Miscellaneous Songs', tracks: cd4Tracks }
    ];
    cds.forEach(cd => {
        const cdDiv = document.createElement('div'); cdDiv.className = 'cd-category';
        const cdBtn = document.createElement('button'); cdBtn.className = 'cd-btn'; cdBtn.textContent = cd.name;
        const cdTracksUl = document.createElement('ul'); cdTracksUl.className = 'cd-tracks';
        if (openCDs.includes(cd.name)) cdTracksUl.classList.add('open');
        const isFreeRoam = cd.name.includes('Free Roam');
        let visibleCount = 0;
        cd.tracks.slice().sort((a,b) => a.trackNumber-b.trackNumber).forEach(track => {
            const label = `${String(track.trackNumber).padStart(2,'0')} - ${track.title}${track.game?` [${track.game}]`:''}`.toLowerCase();
            if (q && !label.includes(q)) return;
            visibleCount++;
            const li = createTrackLi(track, true);
            const ts = li.querySelector('.track-text');
            if (ts) ts.textContent = `${String(track.trackNumber).padStart(2,'0')} - ${track.title}${isFreeRoam?` [${track.game||''}]`:''}`;
            cdTracksUl.appendChild(li);
        });
        if (q && visibleCount === 0) return;
        if (q) cdTracksUl.classList.add('open');
        cdBtn.addEventListener('click', () => {
            const isOpen = cdTracksUl.classList.contains('open');
            container.querySelectorAll('.cd-tracks').forEach(ul => { if (ul !== cdTracksUl) ul.classList.remove('open'); });
            cdTracksUl.classList.toggle('open');
            cdBtn.classList.add('flash'); setTimeout(() => cdBtn.classList.remove('flash'), 200);
            container.querySelectorAll('.cd-btn').forEach(b => b.classList.remove('highlight'));
            if (!isOpen) cdBtn.classList.add('highlight');
        });
        cdDiv.appendChild(cdBtn); cdDiv.appendChild(cdTracksUl);
        container.appendChild(cdDiv);
    });
    updateActiveTrack();
}

// ---------- TRACKLIST CLICK (single unified listener - no updateTrackList on click!) ----------
document.getElementById('tabContentAll').addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    const url = li.dataset.url;

    // Exclude button
    if (e.target.closest('.exclude-btn')) {
        excludedTracks.has(url) ? excludedTracks.delete(url) : excludedTracks.add(url);
        if (tracks[currentTrack] && tracks[currentTrack].url === url) playNextTrack();
        updateTrackList(true);
        return;
    }
    // Fav button handled by its own listener
    if (e.target.closest('.fav-btn')) return;

    // Normal track click - play directly without rebuilding list
    activePlaylistId = null;
    const index = tracks.findIndex(t => t.url === url);
    if (index !== -1) {
        playTrack(index);
    } else {
        // Track filtered out - rebuild then play
        updateTrackList(true);
        const newIndex = tracks.findIndex(t => t.url === url);
        if (newIndex !== -1) playTrack(newIndex);
    }
});

document.getElementById('favoriteslist').addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li || e.target.closest('.fav-btn') || e.target.closest('.exclude-btn')) return;
    const url = li.dataset.url;
    const allTracks = [...cd1Tracks, ...cd2Tracks, ...cd3Tracks, ...cd4Tracks];
    activePlaylistId = null;
    tracks = allTracks.filter(t => favorites.has(t.url));
    const index = tracks.findIndex(t => t.url === url);
    if (index !== -1) { currentTrack = index; playTrack(index); }
});

// ---------- CHECKBOXES ----------
['excludeCD1','excludeCD2','excludeCD3','excludeCD4'].forEach(id => document.getElementById(id)?.addEventListener('change', () => pendingUpdate = true));
document.getElementById('playInOrder')?.addEventListener('change', () => updateTrackList(true));

// ---------- DROPDOWN ----------
const dropdown = document.querySelector('.dropdown'), toggle = document.querySelector('.dropdown-toggle');
function toggleDropdown(event) {
    event?.stopPropagation();
    if (!dropdown) return;
    if (dropdown.style.display === 'flex') { dropdown.style.display = 'none'; toggle.classList.remove('open'); }
    else {
        dropdown.style.display = 'flex'; toggle.classList.add('open');
        const rect = document.querySelector('.musicplayer').getBoundingClientRect();
        let left = rect.right + 10;
        if (left + dropdown.offsetWidth > window.innerWidth) left = window.innerWidth - dropdown.offsetWidth - 10;
        dropdown.style.left = left + 'px'; dropdown.style.top = (rect.top + rect.height/2) + 'px'; dropdown.style.transform = 'translateY(-50%)';
    }
}
window.toggleDropdown = toggleDropdown;
document.addEventListener('click', e => {
    if (!dropdown || !toggle) return;
    if (!dropdown.contains(e.target) && !toggle.contains(e.target)) { dropdown.style.display = 'none'; toggle.classList.remove('open'); }
    const picker = document.getElementById('addToPlaylistPicker');
    if (picker && !picker.contains(e.target) && e.target.id !== 'addToPlaylistBtn') picker.style.display = 'none';
});

// ---------- PROGRESS BAR ----------
const progressContainer = document.querySelector('.progress-container');
if (progressContainer) {
    let isDragging = false, dragTime = 0;
    const seek = x => { const rect = progressContainer.getBoundingClientRect(); return (Math.max(0, Math.min(x - rect.left, rect.width)) / rect.width) * audioPlayer.duration; };
    const updateProgressBarUI = time => { progressBar.style.width = ((time / audioPlayer.duration) * 100 || 0) + '%'; };
    const dragStart = e => { if (!audioPlayer.duration) return; isDragging = true; dragTime = seek(e.clientX || e.touches[0].clientX); updateProgressBarUI(dragTime); e.preventDefault?.(); };
    const dragMove = e => { if (isDragging) { dragTime = seek(e.clientX || e.touches[0].clientX); updateProgressBarUI(dragTime); e.preventDefault?.(); } };
    const dragEnd = () => { if (isDragging) { audioPlayer.currentTime = dragTime; isDragging = false; } };
    progressContainer.addEventListener('mousedown', dragStart);
    progressContainer.addEventListener('touchstart', dragStart, { passive: false });
    window.addEventListener('mousemove', dragMove);
    window.addEventListener('touchmove', dragMove, { passive: false });
    window.addEventListener('mouseup', dragEnd);
    window.addEventListener('touchend', dragEnd);
    progressContainer.addEventListener('click', e => { if (!audioPlayer.duration) return; const x = e.clientX || e.touches?.[0]?.clientX; if (x != null) audioPlayer.currentTime = seek(x); });
    let lastSecond = -1;
    const updateUI = () => {
        const ct = isDragging ? dragTime : audioPlayer.currentTime;
        updateProgressBarUI(ct);
        const cs = Math.floor(ct);
        if (cs !== lastSecond) { lastSecond = cs; timeDisplay.textContent = `${formatTime(cs)} / ${formatTime(Math.floor(audioPlayer.duration||0))}`; }
        requestAnimationFrame(updateUI);
    };
    requestAnimationFrame(updateUI);
}

// ---------- TOUCH ANIMATIONS ----------
document.querySelectorAll('.controls button').forEach(button => {
    button.addEventListener('touchstart', () => { button.style.transform = 'scale(1.05)'; });
    button.addEventListener('touchend', () => { button.style.transform = 'scale(1)'; button.blur(); });
    button.addEventListener('touchcancel', () => { button.style.transform = 'scale(1)'; button.blur(); });
});

// ---------- KEYBOARD SHORTCUTS ----------
document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
    switch(e.code) {
        case 'Space': e.preventDefault(); audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause(); break;
        case 'ArrowRight': e.preventDefault(); playNextTrack(); break;
        case 'ArrowLeft': e.preventDefault(); playPreviousTrack(); break;
        case 'KeyL': cycleLoop(); break;
        case 'KeyM': toggleMute(); break;
        case 'KeyF': toggleFavoriteCurrentTrack(); break;
    }
});

// ---------- INIT ----------
updateLoopBtn();


// ============================================================
// DOWNLOAD SYSTEM - Format picker + m4a / mp3 / webm video
// ============================================================

let downloadInProgress = false;
let downloadCancelFlag = false;
let videoRecorder = null;
let videoAudioEl = null;

function openDownloadPicker() {
    if (!tracks.length || currentTrack == null) return;
    const picker = document.getElementById('downloadFormatPicker');
    document.getElementById('downloadPickerOptions').style.display = '';
    document.getElementById('downloadProgress').style.display = 'none';
    document.getElementById('downloadCancelBtn').textContent = 'Cancel';
    picker.style.display = '';
}
window.openDownloadPicker = openDownloadPicker;

function closeDownloadPicker() {
    // Cancel any in-progress operations
    downloadCancelFlag = true;
    if (videoRecorder && videoRecorder.state !== 'inactive') {
        try { videoRecorder.stop(); } catch(e) {}
    }
    if (videoAudioEl) {
        videoAudioEl.pause();
        videoAudioEl.src = '';
        videoAudioEl = null;
    }
    downloadInProgress = false;
    document.getElementById('downloadFormatPicker').style.display = 'none';
}
window.closeDownloadPicker = closeDownloadPicker;

function showDownloadProgress(label, pct) {
    document.getElementById('downloadPickerOptions').style.display = 'none';
    document.getElementById('downloadProgress').style.display = '';
    document.getElementById('downloadProgressLabel').textContent = label;
    document.getElementById('downloadProgressFill').style.width = Math.max(2, pct) + '%';
}

function hideDownloadProgress() {
    document.getElementById('downloadProgress').style.display = 'none';
    document.getElementById('downloadPickerOptions').style.display = '';
}

async function downloadAs(format) {
    if (downloadInProgress) return;
    if (!tracks.length || currentTrack == null) return;
    const track = tracks[currentTrack];
    if (!track) return;

    downloadCancelFlag = false;

    if (format === 'm4a') {
        // --- INSTANT DIRECT DOWNLOAD ---
        const a = document.createElement('a');
        a.href = encodeTrackUrl(track.url);
        a.download = (track.title || 'track') + '.m4a';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('Downloading: ' + (track.title || 'track') + '.m4a');
        closeDownloadPicker();

    } else if (format === 'mp3') {
        await downloadAsMp3(track);

    } else if (format === 'video') {
        await downloadAsVideo(track);
    }
}
window.downloadAs = downloadAs;

// ---- MP3 DOWNLOAD (via lamejs) ----
async function downloadAsMp3(track) {
    if (typeof lamejs === 'undefined') {
        showToast('MP3 encoder not loaded yet, try again in a moment');
        return;
    }
    downloadInProgress = true;
    showDownloadProgress('Fetching audio...', 5);

    try {
        // 1. Fetch the raw audio file
        const response = await fetch(encodeTrackUrl(track.url));
        if (!response.ok) throw new Error('Fetch failed: ' + response.status);
        if (downloadCancelFlag) return;

        showDownloadProgress('Decoding audio...', 15);
        const arrayBuffer = await response.arrayBuffer();
        if (downloadCancelFlag) return;

        // 2. Decode to PCM via Web Audio API
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioCtx.close();
        if (downloadCancelFlag) return;

        showDownloadProgress('Encoding MP3... 0%', 20);

        const channels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const numSamples = audioBuffer.length;

        // 3. Encode with lamejs
        const mp3encoder = new lamejs.Mp3Encoder(Math.min(channels, 2), sampleRate, 192);
        const mp3Chunks = [];
        const blockSize = 1152;

        const leftData  = audioBuffer.getChannelData(0);
        const rightData = channels > 1 ? audioBuffer.getChannelData(1) : audioBuffer.getChannelData(0);

        const toInt16 = f => Math.max(-32768, Math.min(32767, f < 0 ? f * 32768 : f * 32767));

        for (let i = 0; i < numSamples; i += blockSize) {
            if (downloadCancelFlag) return;

            const end = Math.min(i + blockSize, numSamples);
            const len = end - i;

            const leftChunk  = new Int16Array(len);
            const rightChunk = new Int16Array(len);
            for (let j = 0; j < len; j++) {
                leftChunk[j]  = toInt16(leftData[i + j]);
                rightChunk[j] = toInt16(rightData[i + j]);
            }

            const encoded = mp3encoder.encodeBuffer(leftChunk, rightChunk);
            if (encoded.length > 0) mp3Chunks.push(new Int8Array(encoded));

            // Update progress + yield to UI every ~100 blocks
            if (i % (blockSize * 80) === 0) {
                const pct = 20 + Math.round((i / numSamples) * 72);
                showDownloadProgress('Encoding MP3... ' + Math.round((i / numSamples) * 100) + '%', pct);
                await new Promise(r => setTimeout(r, 0));
            }
        }

        if (downloadCancelFlag) return;
        showDownloadProgress('Finalizing...', 95);

        const flushed = mp3encoder.flush();
        if (flushed.length > 0) mp3Chunks.push(new Int8Array(flushed));

        const blob = new Blob(mp3Chunks, { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (track.title || 'track') + '.mp3';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);

        showToast('Downloaded as MP3!');
        closeDownloadPicker();

    } catch(err) {
        console.error('MP3 download error:', err);
        showToast('MP3 conversion failed: ' + err.message);
        hideDownloadProgress();
    } finally {
        downloadInProgress = false;
    }
}

// ---- VIDEO DOWNLOAD (Canvas + MediaRecorder) ----
async function downloadAsVideo(track) {
    downloadInProgress = true;

    try {
        // 1. Build the canvas frame
        const W = 1280, H = 720;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Dark gradient background
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#0d0d22');
        grad.addColorStop(1, '#1a0a0a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Load & draw album art
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = (track.artwork || 'assets/player-img/cover.png') + '?t=' + Date.now();
        await new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 3000); });

        if (downloadCancelFlag) return;

        const artSize = 440;
        const artX = Math.round((W - artSize) / 2);
        const artY = Math.round((H - artSize) / 2) - 55;

        // Soft glow behind art
        ctx.shadowColor = 'rgba(255, 60, 60, 0.35)';
        ctx.shadowBlur = 40;
        ctx.fillStyle = 'transparent';
        ctx.fillRect(artX - 10, artY - 10, artSize + 20, artSize + 20);
        ctx.shadowBlur = 0;

        if (img.naturalWidth > 0) {
            // Rounded corners via clip
            ctx.save();
            const r = 18;
            ctx.beginPath();
            ctx.moveTo(artX + r, artY);
            ctx.lineTo(artX + artSize - r, artY);
            ctx.quadraticCurveTo(artX + artSize, artY, artX + artSize, artY + r);
            ctx.lineTo(artX + artSize, artY + artSize - r);
            ctx.quadraticCurveTo(artX + artSize, artY + artSize, artX + artSize - r, artY + artSize);
            ctx.lineTo(artX + r, artY + artSize);
            ctx.quadraticCurveTo(artX, artY + artSize, artX, artY + artSize - r);
            ctx.lineTo(artX, artY + r);
            ctx.quadraticCurveTo(artX, artY, artX + r, artY);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, artX, artY, artSize, artSize);
            ctx.restore();
        }

        // Song title
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 10;
        const titleText = track.title || 'Unknown Track';
        ctx.font = 'bold 44px Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        // Truncate if too long
        let displayTitle = titleText;
        while (ctx.measureText(displayTitle).width > W - 80 && displayTitle.length > 10) {
            displayTitle = displayTitle.slice(0, -4) + '...';
        }
        ctx.fillText(displayTitle, W / 2, artY + artSize + 58);

        // Game name
        if (track.game) {
            ctx.font = '28px Arial, sans-serif';
            ctx.fillStyle = '#ff9999';
            ctx.fillText(track.game, W / 2, artY + artSize + 96);
        }

        // Watermark
        ctx.shadowBlur = 0;
        ctx.font = '18px Arial, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillText('Mario Kart World Radio', W / 2, H - 18);

        if (downloadCancelFlag) return;

        // 2. Set up audio (separate element, silent to user)
        videoAudioEl = new Audio();
        videoAudioEl.crossOrigin = 'anonymous';
        videoAudioEl.src = encodeTrackUrl(track.url);
        videoAudioEl.volume = 0; // silent - we route via AudioContext

        showDownloadProgress('Loading audio...', 5);

        await new Promise((res, rej) => {
            videoAudioEl.addEventListener('canplaythrough', res, { once: true });
            videoAudioEl.addEventListener('error', rej, { once: true });
            videoAudioEl.load();
            setTimeout(rej, 15000);
        });

        if (downloadCancelFlag) return;

        const duration = videoAudioEl.duration || 0;
        const durationStr = Math.floor(duration / 60) + ':' + String(Math.floor(duration % 60)).padStart(2, '0');

        // 3. Wire audio into MediaStream
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaElementSource(videoAudioEl);
        const dest = audioCtx.createMediaStreamDestination();
        src.connect(dest);
        // NOT connecting to audioCtx.destination so it's silent to user

        // 4. Combine canvas + audio into MediaRecorder
        const canvasStream = canvas.captureStream(1); // 1fps is enough for static image
        const combined = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
        ]);

        const mimeType = 'video/webm;codecs=vp8,opus';
        videoRecorder = new MediaRecorder(combined, { mimeType });
        const chunks = [];

        videoRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };

        videoRecorder.onstop = () => {
            audioCtx.close();
            if (downloadCancelFlag) { downloadInProgress = false; return; }

            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (track.title || 'track') + '.webm';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 15000);
            showToast('Video downloaded!');
            closeDownloadPicker();
            downloadInProgress = false;
            videoAudioEl = null;
            videoRecorder = null;
        };

        // 5. Start recording + audio playback
        videoRecorder.start(500);
        videoAudioEl.play();

        // Progress ticker
        const progressInterval = setInterval(() => {
            if (downloadCancelFlag || !videoAudioEl) { clearInterval(progressInterval); return; }
            const elapsed = videoAudioEl.currentTime;
            const pct = duration > 0 ? Math.min(98, (elapsed / duration) * 100) : 0;
            const elStr = Math.floor(elapsed / 60) + ':' + String(Math.floor(elapsed % 60)).padStart(2, '0');
            showDownloadProgress('Recording video... ' + elStr + ' / ' + durationStr, pct);
        }, 500);

        videoAudioEl.addEventListener('ended', () => {
            clearInterval(progressInterval);
            if (videoRecorder && videoRecorder.state !== 'inactive') videoRecorder.stop();
        });
        videoAudioEl.addEventListener('error', () => {
            clearInterval(progressInterval);
            if (videoRecorder && videoRecorder.state !== 'inactive') videoRecorder.stop();
            showToast('Error recording video');
            downloadInProgress = false;
        });

        showDownloadProgress('Recording... 0:00 / ' + durationStr, 1);

    } catch(err) {
        console.error('Video download error:', err);
        showToast('Video export failed: ' + err.message);
        hideDownloadProgress();
        downloadInProgress = false;
    }
}
