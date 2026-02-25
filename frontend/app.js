const readyBtn = document.getElementById('readyBtn');
const winnerAnnouncement = document.getElementById('winnerAnnouncement');
const balanceDisplay = document.getElementById('balance');
const playerNameDisplay = document.getElementById('playerNameDisplay');
const statusPanel = document.getElementById('game-status-panel');
const playersList = document.getElementById('playersList');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1600; 
canvas.height = 900; 

// ==========================================
// YENİ: AUTH (GİRİŞ VE KAYIT) DEĞİŞKENLERİ
// ==========================================
let myNickname = "";
let currentBalance = 0;
let lastRewardTime = 0;
let ws = null;

const authOverlay = document.getElementById('authOverlay');
const authUsernameInput = document.getElementById('authUsername');
const authPasswordInput = document.getElementById('authPassword');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const authMessage = document.getElementById('authMessage');
const dailyRewardBtn = document.getElementById('dailyRewardBtn');
let rewardTimerInterval;

const API_BASE = "https://ganyan-2026.onrender.com/api";
const WS_URL = "wss://ganyan-2026.onrender.com/ws/race";

// --- GİRİŞ YAP BUTONU ---
loginBtn.addEventListener('click', async () => {
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value.trim();
    if (!username || !password) { showAuthMessage("Lütfen boş alan bırakmayın!", false); return; }

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (response.ok) {
            startGame(username, data.balance, data.last_reward_time);
        } else {
            showAuthMessage(data.detail, false);
        }
    } catch (error) {
        showAuthMessage("Sunucuya bağlanılamadı!", false);
    }
});

// --- KAYIT OL BUTONU ---
registerBtn.addEventListener('click', async () => {
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value.trim();
    if (!username || !password) { showAuthMessage("Lütfen boş alan bırakmayın!", false); return; }

    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (response.ok) {
            showAuthMessage("Kayıt başarılı! Lobiye giriliyor...", true);
            setTimeout(() => startGame(username, data.balance, data.last_reward_time), 1000);
        } else {
            showAuthMessage(data.detail, false);
        }
    } catch (error) {
        showAuthMessage("Sunucuya bağlanılamadı!", false);
    }
});

function showAuthMessage(text, isSuccess) {
    authMessage.innerText = text;
    authMessage.className = "auth-message " + (isSuccess ? "success" : "error");
}

// ==========================================
// OYUNU BAŞLATMA (GİRİŞ YAPILDIKTAN SONRA)
// ==========================================
function startGame(username, balance, rewardTime) {
    myNickname = username;
    currentBalance = balance;
    lastRewardTime = rewardTime;
    
    // UI Güncelle
    playerNameDisplay.innerText = myNickname;
    balanceDisplay.innerText = currentBalance;
    authOverlay.classList.add('hidden'); // Giriş ekranını gizle
    
    checkDailyReward(); // Geri sayımı hesapla

    // Websocket Bağlantısını Kur
    ws = new WebSocket(WS_URL);
    
    ws.onopen = function() {
        ws.send(JSON.stringify({ name: myNickname }));
        statusPanel.innerText = `🟢 LOBİ: Bahis Yap ve Hazır Ol`;
        statusPanel.className = "status-panel lobby"; 
    };

    ws.onmessage = handleWebSocketMessage;
}

// GÜNLÜK ÖDÜL MOTORU (VERİTABANINA BAĞLI)
function checkDailyReward() {
    let now = Date.now();
    let twentyFourHours = 24 * 60 * 60 * 1000; 

    if (!lastRewardTime || (now - parseInt(lastRewardTime)) >= twentyFourHours) {
        dailyRewardBtn.disabled = false;
        dailyRewardBtn.innerHTML = "🎁 Günlük Ödül (500 🪙)";
        clearInterval(rewardTimerInterval);
    } else {
        dailyRewardBtn.disabled = true;
        let timeLeft = twentyFourHours - (now - parseInt(lastRewardTime));
        startRewardCountdown(timeLeft);
    }
}

function startRewardCountdown(timeLeft) {
    clearInterval(rewardTimerInterval);
    rewardTimerInterval = setInterval(() => {
        timeLeft -= 1000;
        if (timeLeft <= 0) {
            clearInterval(rewardTimerInterval);
            checkDailyReward();
        } else {
            let h = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
            let m = Math.floor((timeLeft / 1000 / 60) % 60);
            let s = Math.floor((timeLeft / 1000) % 60);
            dailyRewardBtn.innerHTML = `⏳ Bekle: ${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        }
    }, 1000);
}

dailyRewardBtn.addEventListener('click', async () => {
    // API'ye İstek Atarak Parayı Ekle ve Süreyi Güncelle
    try {
        const response = await fetch(`${API_BASE}/update_balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: myNickname, amount: 500, is_daily_reward: true })
        });
        const data = await response.json();
        
        if (response.ok) {
            updateLiveBalance(data.new_balance);
            lastRewardTime = data.last_reward_time;
            
            if (typeof confetti !== 'undefined') {
                confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 }, colors: ['#f1c40f', '#ffffff'] });
            }
            checkDailyReward();
        }
    } catch (error) {
        console.error("Ödül alınamadı!");
    }
});

function updateLiveBalance(newAmount) {
    currentBalance = newAmount;
    balanceDisplay.innerText = currentBalance;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "update_balance", balance: currentBalance }));
    }
}

// ==========================================
// OYUN İÇİ DEĞİŞKENLER (ESKİ KODLARIN AYNISI)
// ==========================================
let latestRaceData = null; 
let smoothPositions = {}; 
let cameraX = 0; let cameraY = 0; let currentZoom = 1.0; 
let currentWeather = "Güneşli";

const horseImg = new Image(); horseImg.src = 'horse.png'; const spriteFrames = 6; 
const trackImg = new Image(); trackImg.src = 'track.png'; 

const startSound = new Audio('zil.mp3');
const runSound = new Audio('nal.mp3'); runSound.loop = true; 
const finishSound = new Audio('alkis.mp3');
const heartbeatSound = new Audio('kalp.mp3');

let currentGameState = "LOBBY";
let isRaceStartedAnnounced = false; let isRaceFinishedAnnounced = false;
let lastSpokenTimer = 0; let lastLeader = "";
let midPointAnnounced = false; let finalStretchAnnounced = false;
let weatherAnnounced = false; let isSlowMoTriggered = false; 
let myBet = null;

let raindrops = [];
for(let i=0; i<150; i++) raindrops.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, len: Math.random() * 20 + 10, speed: Math.random() * 15 + 10 });

function drawRain() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for(let i=0; i<raindrops.length; i++) {
        let p = raindrops[i]; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.len/4, p.y + p.len);
        p.y += p.speed; p.x -= p.speed/4; 
        if(p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width + 200; }
    }
    ctx.stroke();
}

if ('speechSynthesis' in window) window.speechSynthesis.cancel();
const SpikerMotoru = {
    konusuyor: false, kuyruk: [], gecmis: {},
    soyle: function(metin, acil = false) {
        if (!('speechSynthesis' in window)) return;
        let simdi = Date.now();
        if (acil) { 
            this.kuyruk = []; window.speechSynthesis.cancel(); this.konusuyor = false;
            setTimeout(() => { this.gecmis[metin] = Date.now(); this.kuyruk.push(metin); this.oynat(); }, 50);
            return;
        } else { if (this.gecmis[metin] && (simdi - this.gecmis[metin] < 8000)) return; }
        this.gecmis[metin] = simdi; this.kuyruk.push(metin);
        if (!this.konusuyor) { this.oynat(); }
    },
    oynat: function() {
        if (this.kuyruk.length === 0) { this.konusuyor = false; return; }
        this.konusuyor = true; let metin = this.kuyruk.shift(); 
        let ses = new SpeechSynthesisUtterance(metin);
        ses.lang = 'tr-TR'; ses.rate = 1.35; ses.pitch = 1.1;
        ses.onend = () => { this.konusuyor = false; setTimeout(() => this.oynat(), 50); };
        ses.onerror = () => { this.konusuyor = false; this.oynat(); };
        window.speechSynthesis.speak(ses);
    },
    temizle: function() { this.kuyruk = []; window.speechSynthesis.cancel(); this.konusuyor = false; }
};

function spiker(metin, acil = false) { SpikerMotoru.soyle(metin, acil); }

function handleLiveCommentary(horses) {
    if (isSlowMoTriggered) return;
    let sorted = [...horses].sort((a, b) => b.position - a.position);
    let leader = sorted[0]; 
    if (leader.name !== lastLeader && leader.position > 5 && leader.position < 85) { lastLeader = leader.name; spiker(`Liderliği ${leader.name} aldı!`); }
    if (leader.position >= 50 && !midPointAnnounced) { midPointAnnounced = true; spiker("Yarışın yarısını geride bıraktık!"); }
    if (leader.position >= 85 && !finalStretchAnnounced) { finalStretchAnnounced = true; spiker(`Son düzlüğe girdik!`); }
}

function handleWebSocketMessage(event) {
    const data = JSON.parse(event.data);
    
    if (data.type === "leaderboard_update") {
        const lbList = document.getElementById('leaderboardList');
        if (lbList) {
            lbList.innerHTML = "";
            data.leaderboard.forEach((p, index) => {
                const li = document.createElement('li');
                let medal = index === 0 ? "🥇" : (index === 1 ? "🥈" : (index === 2 ? "🥉" : "👤"));
                li.innerHTML = `<span>${medal} ${p.name}</span> <span class="gold">${p.balance} 🪙</span>`;
                lbList.appendChild(li);
            });
        }
    }
    else if (data.type === "stats_update") {
        for (let horseId in data.stats) {
            let stat = data.stats[horseId];
            let card = document.querySelector(`.horse-card[data-id="${horseId}"]`);
            if (card) {
                card.querySelector('.odds').innerText = stat.odds.toFixed(2) + "x";
                card.querySelector('.form-info').innerText = "Son: " + stat.history.join("-");
            }
        }
    }
    else if (data.type === "players_update") {
        playersList.innerHTML = "";
        data.players.forEach(p => {
            const li = document.createElement('li');
            li.innerText = `${p.ready ? '✅' : '⏳'} ${p.name} ${p.ready ? '(Hazır)' : '(Bekleniyor)'}`;
            playersList.appendChild(li);
        });
    }
    else if (data.type === "state_update") {
        if (data.state === "COUNTDOWN") {
            currentWeather = data.weather; 
            let havaIkonu = currentWeather === "Yağmurlu" ? "🌧️" : (currentWeather === "Bulutlu" ? "☁️" : "☀️");
            statusPanel.innerHTML = `⚠️ BAŞLIYOR: ${data.timer} saniye | ${havaIkonu} Hava: ${currentWeather}`;
            statusPanel.className = "status-panel countdown"; 
            readyBtn.disabled = true;
            
            if (!weatherAnnounced) {
                weatherAnnounced = true;
                if (currentWeather === "Yağmurlu") spiker("Yağmur yağıyor, zemin çamurlu!");
                else if (currentWeather === "Güneşli") spiker("Hava güneşli, pist harika!");
                else spiker("Hava bulutlu, atlar hazır!");
                
                if (currentWeather === "Yağmurlu") canvas.style.filter = "brightness(0.65) contrast(1.1)";
                else if (currentWeather === "Bulutlu") canvas.style.filter = "brightness(0.80) contrast(1.05)"; 
                else canvas.style.filter = "none";
            }
            if (data.timer <= 3 && data.timer > 0 && lastSpokenTimer !== data.timer) { spiker(data.timer.toString()); lastSpokenTimer = data.timer; }
        }

        if (data.state !== currentGameState) {
            currentGameState = data.state; 
            if (data.state === "COUNTDOWN") {
                smoothPositions = {}; isRaceStartedAnnounced = false; isRaceFinishedAnnounced = false;
                lastLeader = ""; midPointAnnounced = false; finalStretchAnnounced = false;
                lastSpokenTimer = 0; weatherAnnounced = false; isSlowMoTriggered = false; 
                heartbeatSound.pause(); heartbeatSound.currentTime = 0;
            } 
            else if (data.state === "RACING") {
                statusPanel.innerText = `🔥 YARIŞ BAŞLADI! 🔥`;
                statusPanel.className = "status-panel racing"; 
                winnerAnnouncement.innerText = "";
                if (!isRaceStartedAnnounced) {
                    isRaceStartedAnnounced = true;
                    startSound.currentTime = 0; startSound.play().catch(e => console.log(e));
                    runSound.volume = 1.0; runSound.play().catch(e => console.log(e));
                    spiker("Ve koşu başladı!", true); 
                }
            }
            else if (data.state === "FINISHED") {
                statusPanel.innerText = `🟢 LOBİ: Yeni Tur İçin Hazır Ol`;
                statusPanel.className = "status-panel lobby"; 
                readyBtn.disabled = false; readyBtn.innerText = "Bahsi Onayla & Hazır Ol!";
                latestRaceData = null; smoothPositions = {}; canvas.style.filter = "none"; 
                runSound.volume = 1.0; isSlowMoTriggered = false;
            }
        }
    }
    else if (data.type === "race_update") {
        latestRaceData = data; 
        if (data.slow_mo && !isSlowMoTriggered && !data.is_finished) {
            isSlowMoTriggered = true; runSound.volume = 0.15; 
            heartbeatSound.currentTime = 0; heartbeatSound.play().catch(e => console.log(e)); 
            canvas.style.filter = "grayscale(0.5) contrast(1.3) sepia(0.3) drop-shadow(0 0 20px rgba(0,0,0,0.8))"; 
            SpikerMotoru.temizle(); 
        }

        if (data.is_finished) {
            if (!isRaceFinishedAnnounced) {
                isRaceFinishedAnnounced = true;
                runSound.pause(); runSound.currentTime = 0; runSound.volume = 1.0; 
                heartbeatSound.pause(); heartbeatSound.currentTime = 0;
                finishSound.currentTime = 0; finishSound.play().catch(e => console.log(e));

                if (myBet && myBet.horseId == data.winner_id) {
                    let kazancMultiplier = data.winner_odds || 2.0; 
                    let kazanilanAltin = Math.floor(myBet.amount * kazancMultiplier);
                    updateLiveBalance(currentBalance + kazanilanAltin);
                    winnerAnnouncement.innerText = `🏆 TEBRİKLER! ${data.winner_name} kazandı. ${kazanilanAltin} Altın eklendi! 🏆`;
                    winnerAnnouncement.style.color = "#2ecc71";
                    confetti({ particleCount: 250, spread: 120, origin: { y: 0.6 }, zIndex: 9999, colors: ['#f1c40f', '#2ecc71', '#e74c3c', '#ffffff'] });
                } else if (myBet) {
                    winnerAnnouncement.innerText = `😢 KAZANAN: ${data.winner_name}. Bahsiniz yattı. 😢`;
                    winnerAnnouncement.style.color = "#e74c3c";
                } else {
                    winnerAnnouncement.innerText = `🏁 YARIŞ BİTTİ! KAZANAN: ${data.winner_name} 🏁`;
                    winnerAnnouncement.style.color = "white";
                }

                let anons = `Ve kazanan... ${data.winner_name}!`;
                spiker(anons, true);
                myBet = null; 
            }
        } else if (!data.is_finished && currentGameState === "RACING") {
            if (data.horses) { handleLiveCommentary(data.horses); }
        }
    }
    else if (data.type === "chat_update") {
        const chatBox = document.getElementById('chat-box');
        const msgElement = document.createElement('div');
        if (data.sender === "SİSTEM") { msgElement.innerHTML = `<em style="color:#f39c12;">${data.message}</em>`; } 
        else { msgElement.innerHTML = `<strong>${data.sender}:</strong> ${data.message}`; }
        chatBox.appendChild(msgElement); chatBox.scrollTop = chatBox.scrollHeight;
    }
}

let selectedHorseId = 1; 
document.querySelectorAll('.horse-card').forEach(card => {
    card.addEventListener('click', function() {
        document.querySelectorAll('.horse-card').forEach(c => c.classList.remove('selected'));
        this.classList.add('selected'); selectedHorseId = parseInt(this.getAttribute('data-id'));
    });
});

readyBtn.addEventListener('click', () => {
    const betAmount = parseInt(document.getElementById('betAmount').value) || 0;
    const horseId = selectedHorseId; 

    if (betAmount < 0) { alert("Geçersiz bahis miktarı!"); return; }
    if (betAmount > currentBalance) { alert("Yetersiz bakiye!"); return; }

    if (betAmount === 0) {
        myBet = null; readyBtn.innerText = "✅ İzleyici Olarak Hazırsın!"; spiker("İzleyici olarak katıldınız.");
    } else {
        myBet = { horseId: horseId, amount: betAmount };
        updateLiveBalance(currentBalance - betAmount);
        readyBtn.innerText = "✅ Bahis Onaylandı, Hazırsın!"; spiker("Bahis onaylandı!");
    }
    if (ws) ws.send(JSON.stringify({ action: "ready" }));
    readyBtn.disabled = true; 
});

document.getElementById('sendChatBtn').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keypress', function (e) { if (e.key === 'Enter') sendChatMessage(); });

function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    const msg = chatInput.value.trim();
    if (msg !== "" && ws) { ws.send(JSON.stringify({ action: "chat_message", message: msg })); chatInput.value = ""; }
}

function getTrackCoordinates(pos, laneIndex) {
    let imgW = 3200; let imgH = 900; let cx = imgW / 2; let cy = (imgH / 2) + 30; 
    let trackWidth = imgW * 0.86; let trackHeight = imgH * 0.78; let L = trackWidth * 0.45; 
    let curveRx = (trackWidth - L) / 2; let curveRy = trackHeight / 2; let laneOffset = (laneIndex - 2) * 26; 
    let rx = curveRx - laneOffset; let ry = curveRy - laneOffset;
    let ellipsePerim = Math.PI * Math.sqrt(2 * (rx * rx + ry * ry)); let P = L * 2 + ellipsePerim; let d = (pos / 100) * P; 
    let x, y, rotationAngle;

    if (d <= L) { x = (cx - L/2) + d; y = cy + ry; rotationAngle = 0; } 
    else if (d <= L + ellipsePerim/2) {
        let curveD = d - L; let t = curveD / (ellipsePerim/2); let angle = Math.PI/2 - (t * Math.PI); 
        x = cx + L/2 + rx * Math.cos(angle); y = cy + ry * Math.sin(angle); rotationAngle = angle - Math.PI/2;
    } 
    else if (d <= L*2 + ellipsePerim/2) {
        let straightD = d - (L + ellipsePerim/2); x = (cx + L/2) - straightD; y = cy - ry; rotationAngle = Math.PI; 
    } 
    else {
        let curveD = d - (L*2 + ellipsePerim/2); let t = curveD / (ellipsePerim/2); let angle = -Math.PI/2 - (t * Math.PI); 
        x = cx - L/2 + rx * Math.cos(angle); y = cy + ry * Math.sin(angle); rotationAngle = angle - Math.PI/2;
    }
    return { x, y, rotationAngle, curveRy, L };
}

function drawGame() {
    ctx.fillStyle = '#4c9a2a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let imgW = 3200; let imgH = 900; let leaderCameraTarget = imgW / 2; let maxPos = 0;
    let trackDetails = getTrackCoordinates(0, 2); let leaderCoordsY = imgH / 2; 

    if (latestRaceData && latestRaceData.horses) {
        let easeFactor = (latestRaceData.slow_mo) ? 0.01 : 0.08;
        latestRaceData.horses.forEach(horse => {
            if (smoothPositions[horse.id] === undefined) smoothPositions[horse.id] = horse.position;
            smoothPositions[horse.id] += (horse.position - smoothPositions[horse.id]) * easeFactor;
            if (smoothPositions[horse.id] > maxPos) {
                maxPos = smoothPositions[horse.id];
                let coords = getTrackCoordinates(maxPos, 2);
                leaderCameraTarget = coords.x; leaderCoordsY = coords.y; 
            }
        });
    }

    let targetZoom = (latestRaceData && latestRaceData.slow_mo && !latestRaceData.is_finished) ? 1.7 : 1.0;
    currentZoom += (targetZoom - currentZoom) * 0.03; 
    let visibleWidth = canvas.width / currentZoom; let visibleHeight = canvas.height / currentZoom;
    let targetCamX = leaderCameraTarget - (visibleWidth / 2); let targetCamY = leaderCoordsY - (visibleHeight / 2) + 50; 
    if (targetZoom < 1.05) targetCamY = 0;

    cameraX += (targetCamX - cameraX) * 0.08; cameraY += (targetCamY - cameraY) * 0.08; 
    if (cameraX < 0) cameraX = 0; if (cameraX > imgW - visibleWidth) cameraX = Math.max(0, imgW - visibleWidth);
    if (cameraY < 0) cameraY = 0; if (cameraY > imgH - visibleHeight) cameraY = Math.max(0, imgH - visibleHeight);

    ctx.save(); ctx.scale(currentZoom, currentZoom); ctx.translate(-cameraX, -cameraY);

    if (trackImg.complete && trackImg.naturalHeight !== 0) { ctx.drawImage(trackImg, 0, 0, imgW, imgH); }

    let finishX = (imgW / 2) - (trackDetails.L / 2); let finishY = ((imgH / 2) + 30) + trackDetails.curveRy; 
    ctx.beginPath(); ctx.moveTo(finishX, finishY - 75); ctx.lineTo(finishX, finishY + 75); 
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctx.lineWidth = 6; ctx.stroke();

    let dummyHorses = ["Şahbatur", "Gülbatur", "Poyraz", "Kafkaslı", "Yavuzhan"];
    let horsesToDraw = (latestRaceData && latestRaceData.horses) ? latestRaceData.horses : dummyHorses.map((name, i) => ({ id: i + 1, name: name, position: 0 }));

    horsesToDraw.forEach((horse, index) => {
        let currentPos = (latestRaceData) ? smoothPositions[horse.id] : 0;
        let coords = getTrackCoordinates(currentPos, index);
        let startOffsetX = (currentPos === 0) ? -35 : 0;

        ctx.save(); ctx.translate(coords.x + startOffsetX, coords.y); 
        let rot = coords.rotationAngle % (Math.PI * 2); if (rot < 0) rot += Math.PI * 2;
        let isMovingLeft = rot > Math.PI/2 && rot < 1.5 * Math.PI; let horseSize = 80;

        if (horseImg.complete && horseImg.naturalHeight !== 0) {
            let frameWidth = horseImg.width / spriteFrames; let frameHeight = horseImg.height;
            let speedMultiplier = (latestRaceData && latestRaceData.slow_mo) ? 0.6 : 2;
            let currentFrame = Math.floor(currentPos * speedMultiplier) % spriteFrames;
            ctx.rotate(rot); if (isMovingLeft) ctx.scale(1, -1); 
            ctx.drawImage(horseImg, currentFrame * frameWidth, 0, frameWidth, frameHeight, -horseSize/2, -horseSize/2, horseSize, horseSize);
        } else {
            ctx.rotate(rot); if (isMovingLeft) ctx.scale(1, -1);
            ctx.font = '24px Arial'; ctx.fillText('🐎', -12, 8); 
        }

        ctx.restore(); 
        ctx.fillStyle = 'white'; ctx.font = '14px Poppins'; ctx.fontWeight = '600';
        ctx.shadowColor = 'black'; ctx.shadowBlur = 4;
        let nameWidth = ctx.measureText(horse.name).width;
        ctx.fillText(horse.name, coords.x + startOffsetX - (nameWidth/2), coords.y + 45); 
        ctx.shadowBlur = 0; 
    });

    ctx.restore(); 
    if (currentWeather === "Yağmurlu") drawRain();
    requestAnimationFrame(drawGame);
}

drawGame();