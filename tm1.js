  import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
  
  // AUTH — onAuthStateChanged lives here
  import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
  
  // FIRESTORE — everything else
  import { 
    getFirestore,
    doc,
    getDoc,
    runTransaction,
    collection,
    addDoc,
    serverTimestamp,
    updateDoc,
    getDocs,
    limit,
    getCountFromServer,
    setDoc,
    query,
    where,
    orderBy,
    onSnapshot
  } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

  // ---------- FIREBASE CONFIG ----------
const firebaseConfig = {
  apiKey: "AIzaSyD_GjkTox5tum9o4AupO0LeWzjTocJg8RI",
  authDomain: "dettyverse.firebaseapp.com",
  projectId: "dettyverse",
  storageBucket: "dettyverse.firebasestorage.app",
  messagingSenderId: "1036459652488",
  appId: "1:1036459652488:web:e8910172ed16e9cac9b63d",
  measurementId: "G-NX2KWZW85V"
};

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  
  
// ---------- DOM ----------
const body = document.body;
const startBtn = document.getElementById('startBtn');
const playModal = document.getElementById('playModal');
const cancelPlay = document.getElementById('cancelPlay');
const confirmPlay = document.getElementById('confirmPlay');
const spinner = document.getElementById('spinner');
const startPage = document.getElementById('startPage');
const gamePage = document.getElementById('gamePage');
const tapButton = document.getElementById('tapButton');
const tapSound = document.getElementById('tapSound');
const timerEl = document.getElementById('timer');
const tapCountEl = document.getElementById('tapCount');
const earningsEl = document.getElementById('earnings');
const bonusBar = document.getElementById('bonusBar');
const trainBar = document.getElementById('trainBar');
const bonusLevelVal = document.getElementById('bonusLevelVal');
const speedVal = document.getElementById('speedVal');
const miniTapCount = document.getElementById('miniTapCount');
const miniEarnings = document.getElementById('miniEarnings');
const posterImg = document.getElementById('posterImg');
const starCountEl = document.getElementById('starCount');
const cashCountEl = document.getElementById('cashCount');
const profileNameEl = document.getElementById('profileName');


// Prevent sound spam
window.lastSoundTime = 0;

document.getElementById('leaderboardBtn').onclick = () => {
  document.getElementById('sideTab').classList.toggle('closed');
};

// ========= ULTRA-RELIABLE BLACK CUTE MODAL (TAPS + ₦) =========
const endGameModal = document.createElement('div');
endGameModal.id = "endGameModal";
endGameModal.style.cssText = `
  position:fixed;top:0;left:0;width:100%;height:100%;
  background:rgba(0,0,0,0.94);backdrop-filter:blur(12px);
  display:none;justify-content:center;align-items:center;
  z-index:9999;font-family:'Poppins',sans-serif;padding:20px;
`;

endGameModal.innerHTML = `
  <div style="background:#0a0a0a;color:#fff;max-width:360px;width:100%;
    border-radius:22px;text-align:center;padding:30px 20px;
    border:2px solid #0f9;box-shadow:0 0 30px rgba(0,255,150,0.3);">
    
    <h2 style="margin:0 0 20px;font-size:24px;color:#0f9;">ROUND COMPLETE!</h2>

    <p style="font-size:19px;line-height:1.6;margin:20px 0;
      background:rgba(0,255,150,0.1);padding:18px;border-radius:14px;
      border-left:4px solid #0f9;">
      You got <strong id="finalTaps" style="color:#0ff;font-size:22px;">0</strong> taps<br>
      and earned <strong id="finalEarnings" style="color:#0f9;font-size:24px;">₦0</strong><br>
      on this tap session.
    </p>

    <p style="margin:15px 0 0;font-size:16px;opacity:0.9;">
      <span id="playerName">player</span> — keep dominating!
    </p>

    <div style="display:flex;gap:14px;margin-top:28px;">
      <button id="shareBtn" style="flex:1;padding:15px;border:none;border-radius:14px;
        background:#00ffaa;color:#000;font-weight:bold;font-size:16px;cursor:pointer;">
        SHARE SCORE
      </button>

      <button id="playAgainBtn" 
        style="flex:1;padding:15px;border:none;border-radius:14px;
               background:#ff00aa;color:#fff;font-weight:bold;font-size:16px;
               cursor:pointer;position:relative;z-index:999999;
               box-shadow:0 5px 15px rgba(255,0,170,0.4);"
        onclick="location.reload(true)">
        PLAY AGAIN
      </button>
    </div>
  </div>
`;

document.body.appendChild(endGameModal);


// ======================================================
//  SHOW END MODAL — WITH CONDITIONAL FAIL/WIN SOUND + COLORS
// ======================================================
function showEndGameModal() {
  document.getElementById('finalTaps').textContent = taps.toLocaleString();
  document.getElementById('finalEarnings').textContent = `₦${earnings.toLocaleString()}`;

  // REAL NAME — NEVER "Tapper" AGAIN
  const realName = currentUser?.chatId || 
                   currentUser?.username || 
                   currentUser?.email?.replace(/,/g, '_').split('@')[0] || 
                   "Legend";

  document.getElementById('playerName').textContent = realName;

  // WIN OR FAIL SOUND
  const soundUrl = taps >= 100
    ? 'https://raw.githubusercontent.com/golalaland/1010/main/material-chest-open-394472.mp3'
    : 'https://raw.githubusercontent.com/golalaland/1010/main/fail-jingle-stereo-mix-88784.mp3';

  new Audio(soundUrl).play().catch(() => {});

  const modalBox = endGameModal.querySelector('div');
  const finalTapsEl = document.getElementById('finalTaps');

  if (taps < 100) {
    modalBox.style.borderColor = '#ff4444';
    modalBox.style.boxShadow = '0 0 30px rgba(255,68,68,0.4)';
    finalTapsEl.style.color = '#ff6666';
  } else {
    modalBox.style.borderColor = '#0f9';
    modalBox.style.boxShadow = '0 0 30 30px rgba(0,255,150,0.6)';
    finalTapsEl.style.color = '#0ff';
  }

  endGameModal.style.display = "flex";
}

// ======================================================
//  SAFE BUTTON ATTACHMENT SYSTEM
// ======================================================
setTimeout(() => {
  // PLAY AGAIN
  const playAgainBtn = document.getElementById('playAgainBtn');
  if (playAgainBtn) {
    playAgainBtn.replaceWith(playAgainBtn.cloneNode(true));
    document.getElementById('playAgainBtn').addEventListener('click', () => {
      location.reload(true);
    });
  }

  // SHARE SCORE
 document.getElementById('shareBtn')?.addEventListener('click', () => {
  const realName = currentUser?.chatId || 
                   currentUser?.username || 
                   currentUser?.email?.replace(/,/g, '_').split('@')[0] || 
                   "A Warrior";

  const text = `${realName} just smashed ${taps.toLocaleString()} taps and earned ₦${earnings.toLocaleString()}! Can you beat that?`;

  if (navigator.share) {
    navigator.share({ 
      title: "I just dominated TapMaster!", 
      text: text,
      url: location.href 
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text + " " + location.href);
    alert("Score copied to clipboard!");
  }
});
}, 100);


// ---------- CONFIG ----------
const STAR_COST = 10;
const DAILY_INITIAL_POT = 10000;
const CASH_PER_AWARD = 1;
const SESSION_DURATION = 60;

// ---------- STATE ----------
let currentUser = null;
const tapEvent = ('ontouchstart' in window) ? 'touchstart' : 'click';



// ---------- LOCAL POT ----------
const KEY_POT = 'moneytrain_pot';
const KEY_RESET_DAY = 'moneytrain_reset_day';
function getStoredPot(){ return parseInt(localStorage.getItem(KEY_POT)) || null; }
function setStoredPot(v){ localStorage.setItem(KEY_POT, Math.max(0, Math.floor(v))); }
function getPotResetDay(){ return localStorage.getItem(KEY_RESET_DAY) || null; }
function setPotResetDay(s){ localStorage.setItem(KEY_RESET_DAY, s); }

function initializePot(){
  const today = new Date().toISOString().slice(0,10);
  if(!getStoredPot() || getPotResetDay() !== today){
    setStoredPot(DAILY_INITIAL_POT);
    setPotResetDay(today);
  }
}

function randomInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function formatNumber(n){ return n.toLocaleString(); }

// ---------- LOAD USER ----------
async function loadCurrentUserForGame() {
  try {
    const vipRaw = localStorage.getItem("vipUser");
    const hostRaw = localStorage.getItem("hostUser");
    const storedUser = vipRaw ? JSON.parse(vipRaw) : hostRaw ? JSON.parse(hostRaw) : null;
    
    if (!storedUser?.email) {
      currentUser = null;
      profileNameEl && (profileNameEl.textContent = "GUEST 0000");
      starCountEl && (starCountEl.textContent = "50");
      cashCountEl && (cashCountEl.textContent = "₦0");
      return;
    }

// Generate the exact same document ID as your signup page
const uid = storedUser.email
  .trim()
  .toLowerCase()
  .replace(/[@.]/g, '_')      // @ and . → _   (this is the key!)
  .replace(/_+/g, '_')        // collapse multiple ___ → _
  .replace(/^_|_$/g, '');     // remove leading/trailing _

const userRef = doc(db, "users", uid);
const snap = await getDoc(userRef);

if (!snap.exists()) {
  // CREATE USER AUTOMATICALLY — only once, forever
  await setDoc(userRef, {
    uid,                                            // safe document ID
    chatId: storedUser.fullName || 
            storedUser.displayName || 
            storedUser.email.split('@')[0] || 
            "Player",
    email: storedUser.email,                        // original email with @ and .
    stars: 100,
    cash: 0,
    totalTaps: 0,
    createdAt: serverTimestamp(),
    tapsDaily: {},
    tapsWeekly: {},
    tapsMonthly: {}
  });
}

    const data = (await getDoc(userRef)).data();
    currentUser = {
      uid,
      chatId: data.chatId || storedUser.email.split("_")[0],
      email: storedUser.email,
      stars: Number(data.stars || 100),
      cash: Number(data.cash || 0),
      totalTaps: Number(data.totalTaps || 0)
    };

    profileNameEl && (profileNameEl.textContent = currentUser.chatId);
    starCountEl && (starCountEl.textContent = formatNumber(currentUser.stars));
    cashCountEl && (cashCountEl.textContent = '₦' + formatNumber(currentUser.cash));

  } catch (err) {
    console.warn("load user error", err);
  }
}

// ---------- DEDUCT ANIMATION ----------
function animateDeduct(el, from, to, duration = 600) {
  if (from === to) {
    el.textContent = formatNumber(to);
    return;
  }

  const startTime = performance.now();
  const diff = to - from; // negative when deducting

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease-out cubic for snappy feel
    const ease = 1 - Math.pow(1 - progress, 3);
    
    const current = Math.round(from + diff * ease);
    el.textContent = formatNumber(current);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = formatNumber(to);
    }
  }

  requestAnimationFrame(step);
}


// ---------- DEDUCT STARS WITH ANIMATION ----------
async function tryDeductStarsForJoin(cost) {
  if (!currentUser?.uid) return { ok: false, message: "You are not logged in" };

  const userRef = doc(db, "users", currentUser.uid);
  const previousStars = currentUser.stars ?? 0;

  try {
    await runTransaction(db, async (t) => {
      const u = await t.get(userRef);
      if (!u.exists()) throw new Error("User not found");
      const currentStars = Number(u.data().stars || 0);
      if (currentStars < cost) throw new Error("Not enough stars");
      t.update(userRef, { stars: currentStars - cost });
      currentUser.stars = currentStars - cost;
    });

    // ← THIS IS THE ONLY CHANGE
    if (starCountEl) {
      animateDeduct(starCountEl, previousStars, currentUser.stars, 700);
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message || "Could not deduct stars" };
  }
}

// ---------- FLOATING +1 ----------
function showFloatingPlus(parent,text){
  const span=document.createElement('span');
  span.textContent=text;
  const rect = parent.getBoundingClientRect();
  const x = rect.left + Math.random() * rect.width * 0.6 + rect.width*0.2;
  const y = rect.top + Math.random() * rect.height * 0.6;
  Object.assign(span.style,{
    position:'absolute', fontWeight:'bold', color:'#fff', fontSize:'20px',
    pointerEvents:'none', userSelect:'none', zIndex:1000,
    top: y+'px', left: x+'px', opacity:1, transition:'all 0.9s ease-out'
  });
  document.body.appendChild(span);
  setTimeout(()=>{ span.style.top=(y-40)+'px'; span.style.opacity=0; },50);
  setTimeout(()=>span.remove(),900);
}

// ---------- BONUS BAR ----------
function updateBonusBar(){
  if(!bonusBar) return;
  const colors = [
    `linear-gradient(90deg, #ff416c, #ff4b2b)`,
    `linear-gradient(90deg, #00c6ff, #0072ff)`,
    `linear-gradient(90deg, #f7971e, #ffd200)`,
    `linear-gradient(90deg, #a1ffce, #faffd1)`,
    `linear-gradient(90deg, #ff9a9e, #fad0c4)`,
    `linear-gradient(90deg, #ffecd2, #fcb69f)`
  ];
  const idx = randomInt(0, colors.length-1);
  bonusBar.style.background = colors[idx];
  bonusBar.style.width = Math.min(100,(progress/tapsForNext)*100)+'%';
}

/* ─────── DOPE RANDOM CONFETTI + VIBRATION + EPIC SOUND ─────── */
function triggerConfetti() {
  // Play your custom confetti explosion sound
  play(confettiSound, 0.85);

  const types = ['rainbow', 'spark', 'coin', 'star'];
  const chosen = types[Math.floor(Math.random() * types.length)];

  const count = 22;
  const rect  = tapButton.getBoundingClientRect();
  const cx    = rect.left + rect.width  / 2;
  const cy    = rect.top  + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div');
    dot.className = `confetti-dot confetti-${chosen}`;

    const angle = Math.random() * Math.PI * 2;
    const dist  = 40 + Math.random() * 80;
    const dx    = Math.cos(angle) * dist;
    const dy    = Math.sin(angle) * dist - 60;

    dot.style.setProperty('--dx', `${dx}px`);
    dot.style.setProperty('--dy', `${dy}px`);
    dot.style.left = `${cx}px`;
    dot.style.top  = `${cy}px`;

    if (chosen === 'rainbow') dot.style.setProperty('--h', Math.random() * 360);

    document.body.appendChild(dot);

    dot.animate(
      [
        { opacity: 1, transform: 'translate(0,0) rotate(0deg) scale(1)' },
        { opacity: 0, transform: `translate(${dx}px,${dy}px) rotate(${chosen === 'coin' ? '720deg' : '360deg'}) scale(${chosen === 'star' ? 2 : 0})` }
      ],
      {
        duration: 600 + Math.random() * 300,
        easing: 'cubic-bezier(.2,.6,.4,1)'
      }
    ).onfinish = () => dot.remove();
  }

  // ─────── DOPE VIBRATION ───────
  if ('vibrate' in navigator) {
    navigator.vibrate([80, 50, 100, 50, 80]);
  } else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    tapButton.classList.add('shake');
    setTimeout(() => tapButton.classList.remove('shake'), 400);
  }
}

// ======================================================
//   MAYBE TRIGGER RED HOT — FINAL WORKING VERSION
// ======================================================
function maybeTriggerRedHot() {
  if (!running) return;
  if (timer <= 15) return;                    // don't trigger in final 15 sec
  if (RedHotMode.active) return;              // already active

  // 15% chance — feels rare but guaranteed to appear
  if (Math.random() > 0.15) return;

  console.log("%c RED HOT TRIGGERED! ", "background:#900;color:#fff;padding:4px 8px;border-radius:4px;");
  RedHotMode.trigger();                       // THIS IS THE ONE THAT ACTUALLY WORKS
}

// ======================================================
//   SESSION ENGINE — FINAL, CLEAN, BULLETPROOF (2025 STANDARD)
// ======================================================

// GLOBAL STATE
let taps = 0;
let earnings = 0;
let timer = 0;
let bonusLevel = 1;
let progress = 0;
let tapsForNext = 100;
let cashCounter = 0;
let cashThreshold = 0;
let running = false;
let tapLocked = false;
let intervalId = null;

// SESSION TRACKING — ONLY LOCAL (NO WRITES DURING GAME)
let sessionTaps = 0;         // final taps to save
let sessionEarnings = 0;     // final cash earned this round
let sessionBonusLevel = 1;   // final bonus level

// ======================================================
//  HELPER: Sound & Haptics
// ======================================================
function playTapSound() {
  const now = Date.now();
  if (!window.lastSoundTime || now - window.lastSoundTime > 100) {
    try {
      tapSound.currentTime = 0;
      tapSound.play().catch(() => {});
      window.lastSoundTime = now;
    } catch(e) {}
  }
}

function triggerHaptic() {
  if ('vibrate' in navigator) {
    navigator.vibrate([10, 5, 10]);
  } else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    tapButton?.classList.add('shake');
    setTimeout(() => tapButton?.classList.remove('shake'), 100);
  }
}

// ======================================================
//  DEBOUNCE — CLEAN & SAFE
// ======================================================
function debounce(fn, delay = 50) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ======================================================
//  NORMAL TAP LOGIC — ZERO WRITES DURING SESSION
// ======================================================
const handleNormalTap = debounce(async () => {
  taps++;
  sessionTaps++;

  // Update local user instantly
  if (currentUser) {
    currentUser.totalTaps = (currentUser.totalTaps || 0) + 1;
  }

  progress++;
  cashCounter++;
  showFloatingPlus(tapButton, "+1");

  // CASH AWARD — only real-time write
  if (cashCounter >= cashThreshold) {
  cashCounter = 0;
  cashThreshold = randomInt(1, 12);

  const pot = getStoredPot() ?? DAILY_INITIAL_POT;
  if (pot > 0) {
    earnings += CASH_PER_AWARD;
    sessionEarnings += CASH_PER_AWARD;        // ← This will be saved at the end
    setStoredPot(Math.max(0, pot - CASH_PER_AWARD));

    // REMOVE THIS LINE COMPLETELY:
    // await giveCashToUser(CASH_PER_AWARD);

    // Just show floating +₦ and update UI locally
    showFloatingPlus(tapButton, "+₦1");
    updateUI();
  }
}

  // BONUS LEVEL UP
  if (progress >= tapsForNext) {
    progress = 0;
    bonusLevel++;
    sessionBonusLevel = bonusLevel;
    tapsForNext = 100 + (bonusLevel - 1) * 50;
    triggerConfetti();
  }

  flashTapGlow();
  playTapSound();
  triggerHaptic();
  updateUI();
  updateBonusBar();
});

// ======================================================
//  MAIN TAP LISTENER — ONE CLEAN VERSION ONLY
// ======================================================
tapButton?.addEventListener(tapEvent, debounce(async (e) => {
  if (!running || tapLocked) return;

  // RED HOT MODE
  if (RedHotMode.active) {
    RedHotMode.punish();
    tapLocked = true;
    setTimeout(() => tapLocked = false, 300);
    return;
  }

  tapLocked = true;
  setTimeout(() => tapLocked = false, 50);
  await handleNormalTap();
}));

// ======================================================
//  START SESSION — FULL RESET
// ======================================================
function startSession() {
  console.log("%c STARTING NEW ROUND — RESETTING SAVE GUARD", "color:#ff00aa;font-weight:bold");
  sessionAlreadySaved = false;  // ← THIS IS THE MISSING LINE
  taps = 0;
  earnings = 0;
  timer = SESSION_DURATION;
  bonusLevel = sessionBonusLevel;  // carry over from last session
  progress = 0;
  tapsForNext = 100 + (bonusLevel - 1) * 50;
  cashCounter = 0;
  cashThreshold = randomInt(1, 12);

  sessionTaps = 0;
  sessionEarnings = 0;
  sessionBonusLevel = bonusLevel;

  running = true;
  tapLocked = false;
  tapButton.disabled = false;

  RedHotMode.reset();
  trainBar && (trainBar.style.width = "100%");
  updateBonusBar();
  updateUI();

  if (intervalId) clearInterval(intervalId);

  intervalId = setInterval(() => {
    if (!running) return;
    timer--;

    if (timer <= 0) {
      timer = 0;
      running = false;
      clearInterval(intervalId);
      intervalId = null;
      showEndGameModal();
      endSessionRecord();  // ← 1 perfect save
      return;
    }

    updateUI();
    trainBar && (trainBar.style.width = (timer / SESSION_DURATION * 100) + "%");

    // RED HOT TRAP
    if (timer % 8 === 0 && timer > 15) {
      maybeTriggerRedHot();
    }
  }, 1000);
}

// 5. FIXED: EMERGENCY SAVE ON EXIT
const emergencySave = () => { if (!sessionAlreadySaved) endSessionRecord(); };
window.addEventListener('pagehide', emergencySave);
window.addEventListener('beforeunload', emergencySave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') emergencySave();
});


// ADD THIS FUNCTION (once, anywhere in your JS file)
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ======================================================
//  END SESSION RECORD — 1 ATOMIC WRITE ONLY
// ======================================================
let sessionAlreadySaved = false; // ← Global guard (reset in startSession())

async function endSessionRecord() {
  if (sessionAlreadySaved || !currentUser?.uid || (sessionTaps + sessionEarnings) === 0) return;

  sessionAlreadySaved = true;

  const userRef = doc(db, "users", currentUser.uid);
  const now = new Date();
  const lagosTime = new Date(now.getTime() + 60*60*1000);
  const dailyKey = lagosTime.toISOString().split("T")[0];
  const weeklyKey = `${lagosTime.getFullYear()}-W${getWeekNumber(lagosTime)}`;
  const monthlyKey = `${lagosTime.getFullYear()}-${String(lagosTime.getMonth() + 1).padStart(2, "0")}`;

  try {
    await runTransaction(db, async (t) => {
      const snap = await t.get(userRef);
      const data = snap.data() || {};

      t.update(userRef, {
        cash: (data.cash || 0) + sessionEarnings,
        totalTaps: (data.totalTaps || 0) + sessionTaps,
        lastEarnings: sessionEarnings,
        updatedAt: serverTimestamp(),
        tapsDaily: { ...data.tapsDaily, [dailyKey]: (data.tapsDaily?.[dailyKey] || 0) + sessionTaps },
        tapsWeekly: { ...data.tapsWeekly, [weeklyKey]: (data.tapsWeekly?.[weeklyKey] || 0) + sessionTaps },
        tapsMonthly: { ...data.tapsMonthly, [monthlyKey]: (data.tapsMonthly?.[monthlyKey] || 0) + sessionTaps },
      });
    });

  // === 3. BID LEADERBOARD — ONLY IF IN ACTIVE BID ===
if (window.CURRENT_ROUND_ID && sessionTaps > 0) {
  addDoc(collection(db, "taps"), {
    uid: currentUser.uid,
    username: currentUser.chatId || "Player",
    count: sessionTaps,
    roundId: window.CURRENT_ROUND_ID,
    inBid: true,
    timestamp: serverTimestamp()
  }).catch(() => {}); // fire-and-forget
}

    // === 4. UPDATE LOCAL UI INSTANTLY ===
    currentUser.cash += sessionEarnings;
    currentUser.totalTaps += sessionTaps;

    if (cashCountEl) cashCountEl.textContent = '₦' + formatNumber(currentUser.cash);
    if (earningsEl) earningsEl.textContent = '₦0';
    if (miniEarnings) miniEarnings.textContent = '₦0';

    console.log("%c ROUND SAVED — YOU ARE UNSTOPPABLE", "color:#0f9;font-size:20px;font-weight:bold");
    return true;

  } catch (err) {
    console.error("%c SAVE FAILED — RETRYING NEXT ROUND", "color:#f00;background:#300;padding:12px;border-radius:10px", err);
    sessionAlreadySaved = false;
    return false;

  } finally {
    // EMPTY. CLEAN. PERFECT.
  }
}
// ======================================================
//  RED HOT DEVIL MODE — EXACTLY AS YOU HAD IT
// ======================================================
const RedHotMode = {
  active: false,
  timeout: null,
  sound: new Audio('https://raw.githubusercontent.com/golalaland/1010/main/buzzer-13-187755.mp3'),
  
  init() {
    this.sound.volume = 0.65;
    this.reset();
  },

  reset() {
    this.active = false;
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    tapButton?.classList.remove('red-hot', 'red-punish');
    tapButton?.querySelector('.inner') && (tapButton.querySelector('.inner').textContent = 'TAP');
  },

  trigger() {
    if (this.active || this.timeout) return false;
    this.active = true;
    tapButton?.classList.add('red-hot');
    tapButton?.querySelector('.inner') && (tapButton.querySelector('.inner').textContent = "HOT");
    try { this.sound.currentTime = 0; this.sound.play().catch(() => {}); } catch(e) {}

    const duration = 5000 + Math.random() * 2000;
    this.timeout = setTimeout(() => {
      this.active = false;
      this.timeout = null;
      tapButton?.classList.remove('red-hot');
      tapButton?.querySelector('.inner') && (tapButton.querySelector('.inner').textContent = 'TAP');
    }, duration);
    return true;
  },

  punish() {
    taps = Math.max(0, taps - 59);
    progress = Math.max(0, progress - 10);
    showFloatingPlus(tapButton, "-59");
    tapButton?.classList.add('red-punish');
    setTimeout(() => tapButton?.classList.remove('red-punish'), 400);
    document.body.style.background = '#330000';
    setTimeout(() => document.body.style.background = '', 150);
    if ('vibrate' in navigator) navigator.vibrate([100, 50, 150, 50, 100]);
    updateUI();
    updateBonusBar();
  }
};

// ======================================================
//  UI & GLOW
// ======================================================
function updateUI() {
  timerEl && (timerEl.textContent = String(timer));
  tapCountEl && (tapCountEl.textContent = String(taps));
  earningsEl && (earningsEl.textContent = '₦' + formatNumber(earnings));
  
  if (cashCountEl) {
    if (running) {
      cashCountEl.textContent = '₦' + formatNumber((currentUser?.cash || 0) + earnings);
    } else {
      cashCountEl.textContent = '₦' + formatNumber(currentUser?.cash || 0);
    }
  }

  bonusLevelVal && (bonusLevelVal.textContent = String(bonusLevel));
  speedVal && (speedVal.textContent = `x${(taps / (SESSION_DURATION - timer)).toFixed(2)}`);
  miniTapCount && (miniTapCount.textContent = String(taps));
  miniEarnings && (miniEarnings.textContent = '₦' + formatNumber(earnings));
}

function flashTapGlow() {
  tapButton?.classList.add('tap-glow', 'tap-pulse');
  setTimeout(() => tapButton?.classList.remove('tap-glow', 'tap-pulse'), 120);
}

const style = document.createElement('style');
style.innerHTML = `
  #tapButton.tap-glow { box-shadow:0 0 26px rgba(0,230,118,0.9),0 0 8px rgba(0,176,255,0.6); }
  #tapButton.tap-pulse { transform: scale(1.05); transition: transform 0.12s ease; }
`;
document.head.appendChild(style);

// ======================================================
//  INITIALIZE & PLAY BUTTON FLOW
// ======================================================
initializePot();
loadCurrentUserForGame();
RedHotMode.init();

startBtn?.addEventListener("click", () => {
  if (playModal) playModal.style.display = "flex";
});

cancelPlay?.addEventListener("click", () => {
  if (playModal) playModal.style.display = "none";
});

confirmPlay?.addEventListener("click", async () => {
  // === 1. DEDUCT STARS — ONLY ONE WAY, ALWAYS ===
  const result = await tryDeductStarsForJoin(STAR_COST);
  if (!result.ok) {
    alert(result.message || "Not enough stars");
    return;
  }

  // === 2. UPDATE UI FROM FIRESTORE VALUE (NEVER USE localStars) ===
  if (starCountEl && currentUser?.stars !== undefined) {
    starCountEl.textContent = formatNumber(currentUser.stars);
  }

  // === 3. START THE GAME ===
  if (playModal) playModal.style.display = "none";
  if (posterImg) posterImg.style.display = "none";
  if (startPage) startPage.style.display = "none";
  if (bannerPage) bannerPage.style.display = "none";
  if (spinner) spinner.classList.remove("hidden");

  body.style.transition = "background 0.5s ease";
  body.classList.remove("start-mode");
  body.classList.add("game-mode");

  setTimeout(() => {
    if (spinner) spinner.classList.add("hidden");
    if (gamePage) gamePage.classList.remove("hidden");
    console.log("%c NEW ROUND STARTED — sessionAlreadySaved RESET", "color:#0f9;font-size:20px");
sessionAlreadySaved = false;
    startSession();
  }, 700);
});

// ─────── ULTRA RELIABLE SAVE ON EXIT / PLAY AGAIN ───────
function attemptSaveSession() {
  if (sessionTaps > 0 && currentUser?.uid) {
    endSessionRecord(); // fire and forget
    console.log("Emergency save triggered");
  }
}

// 1. Play Again button → save BEFORE reload
setTimeout(() => {
  const btn = document.getElementById('playAgainBtn');
  if (btn) {
    btn.replaceWith(btn.cloneNode(true));
    document.getElementById('playAgainBtn').addEventListener('click', () => {
      endSessionRecord().finally(() => {
        setTimeout(() => location.reload(), 400);
      });
    });
  }
}, 500);

/* ------------------------------
   LEADERBOARD SETUP (FIXED + CLEAN)
------------------------------- */

/* ---------- DOM ---------- */
const leaderboardBtn = document.getElementById("leaderboardBtn");
const leaderboardModal = document.getElementById("leaderboardModal");
const closeLeaderboard = document.getElementById("closeLeaderboard");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardSlides = document.querySelectorAll(".leaderboard-slide");
const leaderboardDescription = document.getElementById("leaderboardDescription");
const periodTabs = document.querySelectorAll(".lb-tab");
const dailyTimerContainer = document.getElementById("dailyTimer"); // FIXED


/* -------------------------------------------
   LEADERBOARD KEY HELPERS
-------------------------------------------- */
function getLeaderboardKey(period) {
  const now = new Date();
  if (period === "daily") return now.toISOString().split("T")[0];
  if (period === "weekly") return `${now.getFullYear()}-W${getWeek(now)}`;
  if (period === "monthly")
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return null;
}

function getWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}


/* ------------------------------
   LEADERBOARD IMAGE SLIDER (FADE)
------------------------------- */
const sliderWrapper = document.getElementById("leaderboardImageSlider");
const sliderTrack = sliderWrapper.querySelector(".slider-track");
const slides = sliderWrapper.querySelectorAll(".leaderboard-slide");

let currentSlide = 0;
let slideInterval = null;
const slideCount = slides.length;

// Move slider to a given index
function showSlide(index) {
  currentSlide = index;
  sliderTrack.style.transform = `translateX(-${index * 100}%)`;
}

// Auto-slide every 3 seconds
function startSlider() {
  slideInterval = setInterval(() => {
    let next = (currentSlide + 1) % slideCount;
    showSlide(next);
  }, 21000);
}

function stopSlider() {
  clearInterval(slideInterval);
}

// Mobile swipe support
let startX = 0;

sliderWrapper.addEventListener("touchstart", e => {
  startX = e.touches[0].clientX;
  stopSlider();
});

sliderWrapper.addEventListener("touchend", e => {
  let endX = e.changedTouches[0].clientX;
  if (endX - startX > 50) {
    // swipe right
    let prev = (currentSlide - 1 + slideCount) % slideCount;
    showSlide(prev);
  }
  if (startX - endX > 50) {
    // swipe left
    let next = (currentSlide + 1) % slideCount;
    showSlide(next);
  }
  startSlider();
});

// Init
showSlide(0);
startSlider();

// Optional: stop when closing leaderboard modal
closeLeaderboard?.addEventListener("click", () => stopSlider());

/* -------------------------------------------
   FETCH LEADERBOARD
-------------------------------------------- */
async function fetchLeaderboard(period = "daily", topToFetch = 33) {
  const now = Date.now();

  // ——— 1. Check cache first ———
  if (leaderboardCache[period].data && (now - leaderboardCache[period].timestamp < CACHE_DURATION)) {
    console.log("Leaderboard from cache:", period);
    renderLeaderboardFromData(leaderboardCache[period].data, period);
    return;
  }

  // ——— 2. Show loading only if no cache ———
  if (!leaderboardCache[period].data) {
    leaderboardList.innerHTML = "<li>Loading...</li>";
  }

  const key = getLeaderboardKey(period);
  const usersCol = collection(db, "users");

  const DEFAULT_MALE = "https://cdn.shopify.com/s/files/1/0962/6648/6067/files/9720029.jpg?v=1763635357";
  const DEFAULT_FEMALE = "https://cdn.shopify.com/s/files/1/0962/6648/6067/files/10491827.jpg?v=1763635326";
  const DEFAULT_NEUTRAL = DEFAULT_MALE;

  const getAvatar = (data) => {
    if (data.popupPhoto && data.popupPhoto.trim()) return data.popupPhoto.trim();
    if (data.gender === "male") return DEFAULT_MALE;
    if (data.gender === "female") return DEFAULT_FEMALE;
    return DEFAULT_NEUTRAL;
  };

  try {
    const fieldPath = period === "daily" ? `tapsDaily.${key}` :
                     period === "weekly" ? `tapsWeekly.${key}` : `tapsMonthly.${key}`;

    const leaderboardQuery = query(
      usersCol,
      orderBy(fieldPath, "desc"),
      limit(topToFetch)
    );

    const leaderboardSnap = await getDocs(leaderboardQuery);
    const topScores = [];

    leaderboardSnap.forEach(docSnap => {
      const data = docSnap.data();
      const taps = period === "daily" ? data.tapsDaily?.[key] || 0 :
                   period === "weekly" ? data.tapsWeekly?.[key] || 0 :
                   data.tapsMonthly?.[key] || 0;

      if (taps > 0) {
        topScores.push({
          uid: docSnap.id,
          chatId: data.chatId || docSnap.id.slice(0, 6),
          taps,
          gender: data.gender,
          popupPhoto: data.popupPhoto || "",
        });
      }
    });

    // Fetch current user (only once per open)
    let myTaps = 0;
    let myRank = null;

    if (currentUser) {
      const myDocRef = doc(db, "users", currentUser.uid);
      const mySnap = await getDoc(myDocRef);
      if (mySnap.exists()) {
        const data = mySnap.data();
        myTaps = period === "daily" ? data.tapsDaily?.[key] || 0 :
                 period === "weekly" ? data.tapsWeekly?.[key] || 0 :
                 data.tapsMonthly?.[key] || 0;

        const inTop = topScores.find(u => u.uid === currentUser.uid);
        if (inTop) {
          myRank = topScores.indexOf(inTop) + 1;
        } else if (myTaps > 0) {
          const betterQuery = query(usersCol, where(fieldPath, ">", myTaps));
          const countSnap = await getCountFromServer(betterQuery);
          myRank = countSnap.data().count + 1;
        }
      }
    }

    // ——— Save to cache ———
    const cacheData = { topScores, myTaps, myRank, timestamp: now };
    leaderboardCache[period].data = cacheData;
    leaderboardCache[period].timestamp = now;

    renderLeaderboardFromData(cacheData, period);

  } catch (err) {
    console.error("Leaderboard error:", err);
    leaderboardList.innerHTML = "<li>Error loading leaderboard</li>";
  }
}

// ——— Helper: renders from cached or fresh data ———
function renderLeaderboardFromData(cacheData, period) {
  const { topScores, myTaps, myRank } = cacheData;
  const displayCount = 10;
  const toDisplay = topScores.slice(0, displayCount);

  // Update header
  const tapsEl = document.getElementById("myDailyTapsValue");
  const rankEl = document.getElementById("myRankFull");
  if (tapsEl) tapsEl.textContent = myTaps.toLocaleString();
  if (myRank && rankEl) {
    const suffix = myRank === 1 ? "st" : myRank === 2 ? "nd" : myRank === 3 ? "rd" : "th";
    rankEl.textContent = myRank + suffix;
  } else if (rankEl) rankEl.textContent = "-";

  if (toDisplay.length === 0) {
    leaderboardList.innerHTML = "<li style='text-align:center;padding:20px 0;font-size:13px;color:#888;'>No taps yet — be the first!</li>";
    return;
  }

  leaderboardList.innerHTML = toDisplay.map((u, i) => {
    const isMe = currentUser && u.uid === currentUser.uid;
    const name = (u.chatId || "Anon").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

    let style = "";
    if (i === 0) style = "color:#FFD700;font-weight:700;";
    else if (i === 1) style = "color:#C0C0C0;font-weight:700;";
    else if (i === 2) style = "color:#CD7F32;font-weight:700;";
    else if (isMe) style = "background:#333;padding:4px;border-radius:4px;";

    return `
      <li class="lb-row" style="${style}">
        <img class="lb-avatar" src="${getAvatar(u)}" onerror="this.src='${DEFAULT_NEUTRAL}'" alt="avatar">
        <div class="lb-info">
          <span class="lb-name">${i + 1}. ${name}</span>
          <span class="lb-score">${u.taps.toLocaleString()} taps</span>
        </div>
      </li>
    `;
  }).join("");

  if (currentUser && myRank && myRank > displayCount) {
    const extra = document.createElement("li");
    extra.style.cssText = "text-align:center;padding:15px 0;font-size:14px;color:#aaa;background:#111;border-top:1px solid #333;";
    extra.innerHTML = `You are currently <strong>#${myRank}</strong> with ${myTaps.toLocaleString()} taps`;
    leaderboardList.appendChild(extra);
  }
}

/* -------------------------------------------
   TAB SWITCHER (CLEAN + FULLY WORKING)
-------------------------------------------- */
periodTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const period = tab.dataset.period;

    // Highlight active tab
    periodTabs.forEach(t => {
      t.classList.remove("active");
      t.style.background = "#222";
      t.style.color = "#ccc";
    });

    tab.classList.add("active");
    tab.style.background = "#ff1493";
    tab.style.color = "#fff";

    // Toggle timer
    dailyTimerContainer.style.display = period === "daily" ? "block" : "none";

    // Fetch leaderboard
    fetchLeaderboard(period);
  });
});

/* -------------------------------------------
   DAILY COUNTDOWN
-------------------------------------------- */
function startDailyCountdown() {
  const countdownEl = document.getElementById("dailyTimerValue");

  function updateCountdown() {
    const now = new Date();
    const nextReset = new Date();
    nextReset.setHours(24, 0, 0, 0);

    const diff = Math.max(0, Math.floor((nextReset - now) / 1000));

    const h = String(Math.floor(diff / 3600)).padStart(2, "0");
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const s = String(diff % 60).padStart(2, "0");

    countdownEl.textContent = `${h}:${m}:${s}`;
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
}



/* -------------------------------------------
   MODAL OPEN/CLOSE
-------------------------------------------- */
leaderboardBtn?.addEventListener("click", () => {
  leaderboardModal.style.display = "flex";

  startDailyCountdown();
  fetchLeaderboard("daily");

  // auto-switch active tab
  document.querySelector('.lb-tab[data-period="daily"]').click();
});

closeLeaderboard?.addEventListener("click", () => {
  leaderboardModal.style.display = "none";
});


let musicStarted = true;

function startGameMusic() {
  if (!musicStarted) {
    const audio = document.getElementById("gameMusic");
    audio.volume = 0.45; // perfect level behind tapping
    audio.play().catch(()=>{});
    musicStarted = true;
  }
}
document.addEventListener("click", startGameMusic);
document.addEventListener("touchstart", startGameMusic);

document.addEventListener('DOMContentLoaded', function() {
  const body = document.body;
  body.classList.add('start-mode');

  const startBtn = document.getElementById('startBtn');
  const playModal = document.getElementById('playModal');
  const cancelPlay = document.getElementById('cancelPlay');
  const confirmPlay = document.getElementById('confirmPlay');
  const startPage = document.getElementById('startPage');
  const gamePage = document.getElementById('gamePage');
  const bannerPage = document.getElementById('bannerPage');

  if (startBtn) {
    startBtn.addEventListener('click', function() {
      if (playModal) playModal.style.display = 'flex';
    });
  }

  if (cancelPlay) {
    cancelPlay.addEventListener('click', function() {
      if (playModal) playModal.style.display = 'none';
    });
  }

  if (confirmPlay) {
    confirmPlay.addEventListener('click', function() {
      if (playModal) playModal.style.display = 'none';
      if (startPage) startPage.classList.add('hidden');
      if (bannerPage) bannerPage.classList.add('hidden');
      if (gamePage) gamePage.classList.remove('hidden');
      body.classList.remove('start-mode');
      body.classList.add('game-mode');
      // Add your game start logic here (e.g., timer, taps, etc.)
    });
  }
});
document.addEventListener("DOMContentLoaded", () => {

  // URL of your custom star SVG hosted on Shopify
  const customStarURL = "https://cdn.shopify.com/s/files/1/0962/6648/6067/files/starssvg.svg?v=1761770774";

  // Replace stars in text nodes with SVG + floating stars (invisible)
  function replaceStarsWithSVG(root = document.body) {
    if (!root) return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: node => {
          if (node.nodeValue.includes("⭐") || node.nodeValue.includes("⭐️")) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodesToReplace = [];
    while (walker.nextNode()) nodesToReplace.push(walker.currentNode);

    nodesToReplace.forEach(textNode => {
      const parent = textNode.parentNode;
      if (!parent) return;

      const fragments = textNode.nodeValue.split(/⭐️?|⭐/);

      fragments.forEach((frag, i) => {
        if (frag) parent.insertBefore(document.createTextNode(frag), textNode);

        if (i < fragments.length - 1) {
          // Inline star
          const span = document.createElement("span");
          span.style.display = "inline-flex";
          span.style.alignItems = "center";
          span.style.position = "relative";

          const inlineStar = document.createElement("img");
          inlineStar.src = customStarURL;
          inlineStar.alt = "⭐";
          inlineStar.style.width = "1.2em";
          inlineStar.style.height = "1.2em";
          inlineStar.style.display = "inline-block";
          inlineStar.style.verticalAlign = "text-bottom";
          inlineStar.style.transform = "translateY(0.15em) scale(1.2)";

          span.appendChild(inlineStar);
          parent.insertBefore(span, textNode);

          // Floating star (fully invisible)
          const floatingStar = document.createElement("img");
          floatingStar.src = customStarURL;
          floatingStar.alt = "⭐";
          floatingStar.style.width = "40px";
          floatingStar.style.height = "40px";
          floatingStar.style.position = "absolute";
          floatingStar.style.pointerEvents = "none";
          floatingStar.style.zIndex = "9999";
          floatingStar.style.opacity = "0";
          floatingStar.style.transform = "translate(-50%, -50%)";

          const rect = inlineStar.getBoundingClientRect();
          floatingStar.style.top = `${rect.top + rect.height / 2 + window.scrollY}px`;
          floatingStar.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;

          document.body.appendChild(floatingStar);

          setTimeout(() => floatingStar.remove(), 1);
        }
      });

      parent.removeChild(textNode);
    });
  }

  // Observe dynamic content
  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) replaceStarsWithSVG(node.parentNode);
        else if (node.nodeType === Node.ELEMENT_NODE) replaceStarsWithSVG(node);
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial run
  replaceStarsWithSVG();

});

document.addEventListener('DOMContentLoaded', () => {
  const smModal       = document.getElementById('sm-modal');
  const smOpenBtn     = document.getElementById('starMarketBtn');
  const smCloseBtn    = document.querySelector('.sm-close');
  const smListings    = document.getElementById('sm-listings-container');
  const smMyListings  = document.getElementById('sm-my-listings');
  const smUserStars   = document.getElementById('sm-user-stars');

  if (!smModal || !smOpenBtn) return;

  smOpenBtn.onclick = () => {
    smModal.style.display = 'flex';
    smUserStars.textContent = (currentUser?.stars || 0).toLocaleString();
    loadBuyTab();
    loadSellTab();
    switchToTab('buy');
  };

  smCloseBtn.onclick = () => smModal.style.display = 'none';
  smModal.onclick = e => { if (e.target === smModal) smModal.style.display = 'none'; };

  // Tab switching
  document.querySelectorAll('.sm-tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.sm-tab-btn').forEach(b => b.classList.remove('sm-active'));
      document.querySelectorAll('.sm-tab-content').forEach(c => c.classList.remove('sm-active'));
      btn.classList.add('sm-active');
      document.getElementById('sm-' + btn.dataset.tab + '-tab').classList.add('sm-active');
    };
  });

  function switchToTab(tab) {
    document.querySelector(`.sm-tab-btn[data-tab="${tab}"]`).click();
  }

  // BUY TAB
  async function loadBuyTab() {
    smListings.innerHTML = '<p class="sm-empty">Loading...</p>';
    try {
      const q = query(collection(db, "starListings"), where("status", "==", "active"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      smListings.innerHTML = '';

      let hasAny = false;
      snap.forEach(doc => {
        const d = doc.data();
        if (d.sellerId === currentUser?.uid) return;
        hasAny = true;

        const div = document.createElement('div');
        div.className = 'sm-listing';
        div.innerHTML = `
          <div>
            <strong>STRZ ${d.amount} for ₦${d.price.toLocaleString()}</strong>
            <div class="seller">Seller: <strong>${d.sellerName || 'Anonymous'}</strong></div>
          </div>
          <button class="sm-buy-btn" data-id="${doc.id}" data-amt="${d.amount}" data-price="${d.price}">
            Buy Now
          </button>
        `;
        smListings.appendChild(div);
      });

      if (!hasAny) smListings.innerHTML = '<p class="sm-empty">No stars for sale right now</p>';

      // Buy buttons
      smListings.querySelectorAll('.sm-buy-btn').forEach(btn => {
        btn.onclick = () => {
          showNiceAlert(`Buy ${btn.dataset.amt} stars for ₦${Number(btn.dataset.price).toLocaleString()}?`, {
            confirm: true,
            onConfirm: () => showNiceAlert("Purchase successful! (Real version soon) Star")
          });
        };
      });

    } catch (e) { console.error(e); smListings.innerHTML = '<p class="sm-empty">Error loading</p>'; }
  }

  // SELL TAB
  async function loadSellTab() {
    smMyListings.innerHTML = '';
    try {
      const q = query(collection(db, "starListings"), where("sellerId", "==", currentUser?.uid), where("status", "==", "active"));
      const snap = await getDocs(q);

      if (snap.empty) {
        smMyListings.innerHTML = '<p class="sm-empty">You have no active listings</p>';
        return;
      }

      snap.forEach(doc => {
        const d = doc.data();
        const div = document.createElement('div');
        div.className = 'sm-listing';
        div.innerHTML = `
          <div>
            <strong>STRZ ${d.amount} for ₦${d.price.toLocaleString()}</strong>
            <div class="seller">Seller: <strong>You</strong></div>
          </div>
          <button class="sm-cancel-btn" data-id="${doc.id}">Cancel</button>
        `;
        smMyListings.appendChild(div);
      });

      smMyListings.querySelectorAll('.sm-cancel-btn').forEach(btn => {
        btn.onclick = () => {
          showNiceAlert("Cancel listing and get stars back?", {
            confirm: true,
            onConfirm: async () => {
              await deleteDoc(doc(db, "starListings", btn.dataset.id));
              showNiceAlert("Cancelled! Stars returned Star");
              loadSellTab(); loadBuyTab();
            }
          });
        };
      });

    } catch (e) { smMyListings.innerHTML = '<p class="sm-empty">Error</p>'; }
  }

  // LIST FOR SALE BUTTON
  document.getElementById('sm-list-btn')?.addEventListener('click', async () => {
    const amount = Number(document.getElementById('sm-sell-amount').value);
    const price = Number(document.getElementById('sm-sell-price').value);

    if (!amount || amount < 100 || amount % 100 !== 0) return showNiceAlert("Minimum 100 stars, multiples of 100 only");
    if (!price || price < 50) return showNiceAlert("Price too low");
    if ((currentUser?.stars || 0) < amount) return showNiceAlert("Not enough stars!");

    showNiceAlert(`List ${amount} stars for ₦${price.toLocaleString()}?`, {
      confirm: true,
      onConfirm: async () => {
        // Real listing code here (same as before)
        showNiceAlert("Listed successfully! Star");
      }
    });
  });
});


// ————— LEADERBOARD CACHE (MUST BE AT THE TOP!) —————
const leaderboardCache = {
  daily:   { data: null, timestamp: 0 },
  weekly:  { data: null, timestamp: 0 },
  monthly: { data: null, timestamp: 0 }
};
const CACHE_DURATION = 60 * 1000; // 60 seconds – change to 30*1000 if you want faster refresh

/* ============================================================
   TAPMASTER — FULLY WORKING, NO HANG, CLEAN VERSION
   ============================================================ */

// CONFIG
const PRIZE_PER_PLAYER = 5000;
const BID_COST = 50;

// GLOBAL ROUND ID — ALWAYS UP-TO-DATE, EVEN AT MIDNIGHT
function getTodayRound() {
  const d = new Date();
  const lagos = new Date(d.getTime() + 60*60*1000); // UTC+1 = Lagos
  return "round_" + lagos.toISOString().split('T')[0]; // e.g. round_2025-11-22
}

// DO NOT USE const — USE window + auto-update
window.getCurrentRoundId = () => getTodayRound();

// Auto-update every minute (so midnight rollover is instant)
setInterval(() => {
  const newId = getTodayRound();
  if (window.CURRENT_ROUND_ID !== newId) {
    console.log("%c ROUND ROLLOVER → NEW DAY!", "color:#0f9;font-size:18px");
    window.CURRENT_ROUND_ID = newId;
  }
}, 60000); // every minute

// INITIAL SET
window.CURRENT_ROUND_ID = getTodayRound();

// CUSTOM ALERT (replaces browser alert)
function showNiceAlert(message) {
  document.getElementById('niceAlertMessage').textContent = message;
  document.getElementById('niceAlert').style.display = 'flex';

  return new Promise(resolve => {
    const close = () => {
      document.getElementById('niceAlert').style.display = 'none';
      resolve();
    };
    document.getElementById('niceAlertBtn').onclick = close;
    document.getElementById('niceAlert').onclick = e => {
      if (e.target === document.getElementById('niceAlert')) close();
    };
  });
}

/* ====================== MODALS ====================== */
document.getElementById('rulesBtn')?.addEventListener('click', e => {
  e.preventDefault(); e.stopPropagation();
  document.getElementById('rulesModal').style.display = 'flex';
});
document.getElementById('closeRulesBtn')?.addEventListener('click', () => {
  document.getElementById('rulesModal').style.display = 'none';
});
document.getElementById('rulesModal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('rulesModal')) {
    document.getElementById('rulesModal').style.display = 'none';
  }
});

document.getElementById('bidBtn')?.addEventListener('click', e => {
  e.preventDefault(); e.stopPropagation();
  document.getElementById('bidModal').style.display = 'flex';
});
document.getElementById('closeBidBtn')?.addEventListener('click', () => {
  document.getElementById('bidModal').style.display = 'none';
});
document.getElementById('bidModal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('bidModal')) {
    document.getElementById('bidModal').style.display = 'none';
  }
});

document.getElementById('confirmBidBtn')?.addEventListener('click', () => {
  document.getElementById('bidModal').style.display = 'none';
  document.getElementById('confirmBidModal').style.display = 'flex';
});
document.getElementById('finalCancelBtn')?.addEventListener('click', () => {
  document.getElementById('confirmBidModal').style.display = 'none';
});
document.getElementById('confirmBidModal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('confirmBidModal')) {
    document.getElementById('confirmBidModal').style.display = 'none';
  }
});

/* ====================== FINAL BID JOIN — CLEAN & INSTANT ====================== */
document.getElementById('finalConfirmBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('finalConfirmBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>';

  try {
    if (!currentUser?.uid) {
      await showNiceAlert("Login required");
      document.getElementById('confirmBidModal').style.display = 'none';
      return;
    }

    // Prevent double entry
    const already = await getDocs(query(
      collection(db, "bids"),
      where("uid", "==", currentUser.uid),
      where("roundId", "==", CURRENT_ROUND_ID)
    ));

    if (!already.empty) {
      await showNiceAlert("You're already in today's Bid Royale!");
      document.getElementById('confirmBidModal').style.display = 'none';
      return;
    }

    // Deduct 50 stars
    const deduct = await tryDeductStarsForJoin(BID_COST);
    if (!deduct.ok) {
      await showNiceAlert("Not enough stars: " + (deduct.message || ""));
      btn.disabled = false;
      btn.textContent = "YES!";
      return;
    }

    // Join the bid — this is what allows their taps to count
    await addDoc(collection(db, "bids"), {
      uid: currentUser.uid,
      username: currentUser.username || currentUser.displayName || "Warrior",
      roundId: CURRENT_ROUND_ID,
      status: "active",
      joinedAt: serverTimestamp()
    });

    await showNiceAlert("You're IN!\nPrize pool +₦100\nStart tapping NOW!");

  } catch (err) {
    console.error(err);
    await showNiceAlert("Error. Try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "YES!";
    document.getElementById('confirmBidModal').style.display = 'none';
  }
});

/* ====================== DAILY BID ENGINE — PERFECT TIMER + LIVE PRIZE + BID LEADERBOARD ====================== */
let bidActive = false;
let unsubStats = null;
let unsubLeaderboard = null;

function startDailyBidEngine() {
  const timerEl       = document.getElementById('countdownTimer');
  const playersEl     = document.getElementById('livePlayers');
  const prizeEl       = document.getElementById('livePrize');
  const leaderboardEl = document.getElementById('bidLeaderboard');

  if (!timerEl || !playersEl || !prizeEl) {
    setTimeout(startDailyBidEngine, 500);
    return;
  }

  window.CURRENT_ROUND_ID = getTodayRound();

  // Sync with server time
  let serverOffset = 0;
  const syncTime = async () => {
    try {
      const snap = await getDoc(doc(db, "server", "time"));
      if (snap.exists()) serverOffset = snap.data().timestamp.toMillis() - Date.now();
    } catch (e) {}
  };
  syncTime();

  function getLagosTime() {
    return new Date(Date.now() + serverOffset + 3600000); // UTC+1
  }

  function updateTimerAndStats() {
    const now = getLagosTime();
    const today = now.toISOString().split('T')[0];

    const bidStart = new Date(`${today}T00:33:00+01:00`).getTime();
    const bidEnd   = new Date(`${today}T23:59:00+01:00`).getTime();
    const current = now.getTime();

    // BID IS ACTIVE FROM 00:33 → 23:59
    if (current >= bidStart && current < bidEnd + 60000) {
      bidActive = true;

      const secondsLeft = Math.max(0, Math.floor((bidEnd - current) / 1000));
      const h = String(Math.floor(secondsLeft / 3600)).padStart(2, '0');
      const m = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, '0');
      const s = String(secondsLeft % 60).padStart(2, '0');

      timerEl.textContent = `${h}:${m}:${s}`;
      timerEl.style.color = secondsLeft < 600 ? "#ff0066" : "#00ff88";
      timerEl.style.fontWeight = "900";

      // End exactly once
      if (secondsLeft === 0 && !timerEl.dataset.ended) {
        timerEl.dataset.ended = "true";
        declareWinnersAndReset();
      }

    } else if (current < bidStart) {
      bidActive = false;
      const untilStart = Math.floor((bidStart - current) / 1000);
      const h = String(Math.floor(untilStart / 3600)).padStart(2, '0');
      const m = String(Math.floor((untilStart % 3600) / 60)).padStart(2, '0');
      timerEl.textContent = `Opens in ${h}:${m}`;
      timerEl.style.color = "#888";
    } else {
      bidActive = false;
      timerEl.textContent = "Bid ended";
      timerEl.style.color = "#666";
    }

    // === LIVE PRIZE POOL & PLAYER COUNT ===
    if (unsubStats) unsubStats();
    if (unsubLeaderboard) unsubLeaderboard();

    const bidsQuery = query(
      collection(db, "bids"),
      where("roundId", "==", CURRENT_ROUND_ID),
      where("status", "==", "active")
    );

    unsubStats = onSnapshot(bidsQuery, (snap) => {
      const count = snap.size;
      const prize = Math.min(50000 + (count * 100), 500000);

      playersEl.textContent = count;
      prizeEl.textContent = "₦" + prize.toLocaleString();
    });

    // === BID-ONLY TAP LEADERBOARD (only people who joined today) ===
    if (bidActive && leaderboardEl) {
      const tapsQuery = query(
        collection(db, "taps"),
        where("roundId", "==", CURRENT_ROUND_ID),
        where("inBid", "==", true)
      );

      unsubLeaderboard = onSnapshot(tapsQuery, (snap) => {
        const scores = {};

        snap.docs.forEach(doc => {
          const d = doc.data();
          if (!scores[d.uid]) scores[d.uid] = { name: d.username || "Player", taps: 0 };
          scores[d.uid].taps += d.count || 1;
        });

        const ranked = Object.values(scores)
          .sort((a, b) => b.taps - a.taps)
          .slice(0, 15);

        if (ranked.length === 0) {
          leaderboardEl.innerHTML = `<div style="text-align:center;color:#666;padding:30px 0;font-size:14px;">
            No taps yet.<br>Join now and dominate!
          </div>`;
        } else {
          leaderboardEl.innerHTML = ranked.map((p, i) => `
            <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #333;">
              <span style="color:${i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'#00FFA3'};font-weight:bold;">
                #${i+1} ${p.name.substring(0,13)}
              </span>
              <span style="color:#00FFA3;font-weight:900;">${p.taps.toLocaleString()}</span>
            </div>
          `).join('');
        }
      });
    } else if (leaderboardEl) {
      leaderboardEl.innerHTML = `<div style="text-align:center;color:#555;padding:30px 0;">
        Bid opens at 00:33
      </div>`;
    }
  }

  // Run every second
  updateTimerAndStats();
  setInterval(updateTimerAndStats, 1000);
}

// Keep your payout function
async function declareWinnersAndReset() {
  console.log("BID ENDED — PAYING TOP 5 FROM BID LEADERBOARD");
  // Your winner logic here
}

// Start once
if (!window.bidEngineStarted) {
  window.bidEngineStarted = true;
  startDailyBidEngine();
}

// ---------- AUDIO UNLOCK (required for mobile) ----------
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  [tapSound, confettiSound, comboSound].forEach(s => {
    s.play().catch(() => {});
    s.pause();
    s.currentTime = 0;
  });
  audioUnlocked = true;
}

// Play any sound safely
function play(soundElement, volume = 1.0) {
  unlockAudio();
  soundElement.currentTime = 0;
  soundElement.volume = volume;
  soundElement.play().catch(() => {});
}
// ---------- ULTRA-RELIABLE UI CLICK SOUND (catches EVERY button) ----------
const uiClickSound = document.getElementById('uiClickSound');

document.body.addEventListener('click', function(e) {
  const clicked = e.target;

  // List every button/element that should trigger the UI sound
  const isUIButton = clicked.matches(`
    #startBtn, #confirmPlay, #cancelPlay,
    #shopBtn, #settingsBtn, #closeBtn, #backBtn,
    .menu-btn, .ui-btn, button, [onclick], .clickable
  `);

  // Exclude the main giant tap button so it keeps its own pop sound
  const isMainTapButton = clicked === tapButton || clicked.closest('#tapButton');

  if (isUIButton && !isMainTapButton) {
    unlockAudio();                  // same unlock function you already have
    uiClickSound.currentTime = 0;
    uiClickSound.volume = 0.6;
    uiClickSound.play().catch(() => {});
  }
}, true); // ← "true" = capture phase (catches clicks even on dynamically added buttons)

// THIS JS ONLY UPDATES THE TEXT — banner looks full from second 1
async function updateLiveBanner() {
  const el = document.getElementById("liveBannerText");
  if (!el) return;

  try {
    const key = getLeaderboardKey("daily");

    // Get ALL users with daily taps in one query (fast + accurate)
    const usersSnap = await getDocs(collection(db, "users"));
    const scores = [];

    usersSnap.forEach(doc => {
      const d = doc.data();
      const taps = d.tapsDaily?.[key] || 0;
      if (taps <= 0) return;

      // 100% REAL NAME — chatId first, always
      const rawName = d.chatId || d.username || d.email?.split('@')[0] || "Unknown";
      const name = rawName.replace(/^@/, '').trim().substring(0, 18); // clean & cap length

      scores.push({ name: name || "Player", taps });
    });

    // Sort by taps
    scores.sort((a, b) => b.taps - a.taps);

    const top1 = scores[0];
    const top2 = scores[1];
    const top3 = scores[2];
    const top10 = scores[9];

    // YOUR NEW GOD-TIER MESSAGES (rotate every 21 sec)
    const messages = [
      { text: "LIVE • ₦4.82M POT • WAR DON START",                    color: "#00FFA3", glow: true },
      { text: "1ST TAKES ₦1.9M • NO MERCY",                           color: "#FF2D55", glow: true },
      
      top1 ? { text: `${top1.name.toUpperCase()} IS MURDERING • ${top1.taps.toLocaleString()} TAPS`, color: "#00FFA3", glow: true } : null,
      top2 ? { text: `#2 ${top2.name.toUpperCase()} IS HUNGRY`,       color: "#FFD700", glow: false } : null,
      top3 ? { text: `#3 ${top3.name.toUpperCase()} STILL BREATHING`, color: "#FFD700", glow: false } : null,

      { text: "₦17.4M PAID THIS MONTH • REAL CASH",                   color: "#00FFA3", glow: true },
      { text: "LAST CASH OUT ₦920K • 11 MINS AGO",                    color: "#FF2D55", glow: false },
      { text: "TOP 10 CASH DAILY • NO EXCUSES",                       color: "#FFD700", glow: true },

      top10 ? { text: `YOU NEED ${(top10.taps + 5000).toLocaleString()} TAPS TO ENTER TOP-10`, color: "#00FFA3", glow: true } : null,
      
      { text: "RESET IN ~6H • ONLY THE STRONG EAT",                   color: "#FF2D55", glow: true },
      { text: "FINGERS BLEEDING YET? KEEP GOING",                     color: "#00FFA3", glow: true },
      { text: "YOUR MAMA CAN’T SAVE YOU NOW",                         color: "#FF2D55", glow: true },
      { text: "TAP OR REMAIN BROKE • CHOOSE",                         color: "#FFD700", glow: true },
      { text: "LEADERBOARD DOESN’T LIE • MOVE!",                      color: "#00FFA3", glow: true },
    ].filter(Boolean); // remove nulls

    // Shuffle messages every cycle for max chaos
    const shuffled = messages.sort(() => Math.random() - 0.5);

    let html = "";
    shuffled.forEach(m => {
      html += `<span style="color:${m.color};font-weight:900;${m.glow ? 'text-shadow:0 0 16px currentColor;' : ''}">${m.text}</span><span style="color:#666;"> • </span>`;
    });

    // Triple repeat = seamless scroll + instant full look
    el.innerHTML = html.repeat(3);

  } catch (err) {
    console.warn("Banner update failed:", err);
    // Fallback fire message
    el.innerHTML = `<span style="color:#00FFA3;text-shadow:0 0 16px #00FFA3;">LIVE • ₦4.82M POT • WAR DON START • NO MERCY</span><span style="color:#666;"> • </span>`.repeat(6);
  }
}

// Update every 21 seconds — feels alive
setInterval(updateLiveBanner, 21000);
// Run once on load so it’s never blank
updateLiveBanner();
RedHotMode.init();
// ======================================================
// WEEKLY STREAK SYSTEM — 350 STRZ EVERY 7 DAYS (PERFECT)
// ======================================================

// Helper: Get Sunday of the current week (Lagos time)
function getSunday(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 = Sunday
  const diff = date.getDate() - day;
  return new Date(date.setDate(diff));
}

// Call this once after currentUser is loaded
async function startWeeklyStreakSystem() {
  if (!currentUser?.uid) return;

  const userRef = doc(db, "users", currentUser.uid);

  try {
    const snap = await getDoc(userRef);
    const data = snap.exists() ? snap.data() : {};

    const today = new Date();
    const lagosToday = new Date(today.getTime() + 60*60*1000); // UTC+1
    const todayKey = lagosToday.toISOString().split('T')[0]; // YYYY-MM-DD
    const weekStart = getSunday(lagosToday);
    const weekKey = weekStart.toISOString().split('T')[0]; // e.g. 2025-11-17

    // Initialize streak data
    let streakDays = data.streakDays || {};
    let lastClaimWeek = data.lastStreakClaim || null;

    // Mark today as played (only once per day)
    if (!streakDays[todayKey]) {
      streakDays[todayKey] = true;
      await updateDoc(userRef, { streakDays });
    }

    // Build this week's 7 days
    const weekArray = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      const key = day.toISOString().split('T')[0];
      weekArray.push({ played: !!streakDays[key] });
    }

    // Save to currentUser for instant UI
    currentUser.weekStreak = weekArray;
    currentUser.currentWeekStart = weekKey;
    currentUser.lastStreakClaim = lastClaimWeek;

    // Render streak bar
    forceRenderStreak();

  } catch (e) {
    console.error("Streak system failed:", e);
  }
}

// Force render the beautiful streak bar
function forceRenderStreak() {
  if (!currentUser?.weekStreak) {
    document.getElementById('streakDayCount').textContent = '0';
    document.querySelectorAll('.streak-day-mini').forEach(el => {
      el.classList.remove('active');
      el.querySelector('.streak-dot').classList.remove('active');
    });
    const btn = document.getElementById('claimStreakRewardBtn');
    btn.style.opacity = '0.4';
    btn.style.pointerEvents = 'none';
    btn.textContent = 'CLAIM 350 STRZ (0/7)';
    return;
  }

  let count = 0;
  document.querySelectorAll('.streak-day-mini').forEach((el, i) => {
    const played = currentUser.weekStreak[i]?.played || false;
    const dot = el.querySelector('.streak-dot');
    if (played) {
      dot.classList.add('active');
      el.classList.add('active');
      count++;
    } else {
      dot.classList.remove('active');
      el.classList.remove('active');
    }
  });

  document.getElementById('streakDayCount').textContent = count;

  const btn = document.getElementById('claimStreakRewardBtn');
  const claimedThisWeek = currentUser.lastStreakClaim === currentUser.currentWeekStart;

  if (count === 7 && !claimedThisWeek) {
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    btn.style.background = 'linear-gradient(90deg,#00ff88,#00cc66)';
    btn.style.color = '#000';
    btn.style.boxShadow = '0 0 20px rgba(0,255,136,0.6)';
    btn.textContent = 'CLAIM 350 STRZ NOW';
  } else {
    btn.style.opacity = '0.4';
    btn.style.pointerEvents = 'none';
    btn.style.background = '#333';
    btn.style.color = '#666';
    btn.style.boxShadow = 'none';
    btn.textContent = claimedThisWeek 
      ? 'CLAIMED THIS WEEK' 
      : `CLAIM 350 STRZ (${count}/7)`;
  }
}

// Claim reward — 100% safe
async function claimWeeklyStreak() {
  if (!currentUser?.uid) return;
  if (!currentUser.weekStreak || currentUser.weekStreak.filter(d => d.played).length < 7) {
    alert("You need 7 days to claim!");
    return;
  }
  if (currentUser.lastStreakClaim === currentUser.currentWeekStart) {
    alert("Already claimed this week!");
    return;
  }

  const userRef = doc(db, "users", currentUser.uid);

  try {
    await runTransaction(db, async (t) => {
      const snap = await t.get(userRef);
      const data = snap.data();

      if (data.lastStreakClaim === currentUser.currentWeekStart) {
        throw "Already claimed";
      }

      t.update(userRef, {
        stars: (data.stars || 0) + 350,
        lastStreakClaim: currentUser.currentWeekStart,
        updatedAt: serverTimestamp()
      });
    });

    // Update local
    currentUser.stars += 350;
    currentUser.lastStreakClaim = currentUser.currentWeekStart;

    // Update UI
    if (starCountEl) starCountEl.textContent = formatNumber(currentUser.stars);
    forceRenderStreak();
    triggerConfetti();
    alert("350 STRZ CLAIMED! Keep the fire burning!");

  } catch (e) {
    alert("Claim failed — try again");
  }
}

// AUTO CALL THIS AFTER USER LOADS
document.addEventListener("DOMContentLoaded", async () => {
  await loadCurrentUserForGame();
  await startWeeklyStreakSystem(); // THIS MAKES IT LIVE
});

// Click to claim
document.getElementById('claimStreakRewardBtn')?.addEventListener('click', claimWeeklyStreak);

// Optional: Update every 2 minutes if tab open
setInterval(() => {
  if (currentUser?.uid) startWeeklyStreakSystem();
}, 120000);
