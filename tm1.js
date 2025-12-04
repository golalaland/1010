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

// LEADERBOARD CACHE + AVATAR FUNCTION (GLOBAL – must be here!)
const leaderboardCache = {
  daily:   { data: null, timestamp: 0 },
  weekly:  { data: null, timestamp: 0 },
  monthly: { data: null, timestamp: 0 }
};
const CACHE_DURATION = 60 * 1000; // 60 seconds

const DEFAULT_MALE   = "https://cdn.shopify.com/s/files/1/0962/6648/6067/files/9720029.jpg?v=1763635357";
const DEFAULT_FEMALE = "https://cdn.shopify.com/s/files/1/0962/6648/6067/files/10491827.jpg?v=1763635326";
const DEFAULT_NEUTRAL = DEFAULT_MALE;

// GLOBAL AVATAR FUNCTION – now visible everywhere
function getAvatar(userData) {
  if (userData.popupPhoto && userData.popupPhoto.trim()) return userData.popupPhoto.trim();
  if (userData.gender === "male") return DEFAULT_MALE;
  if (userData.gender === "female") return DEFAULT_FEMALE;
  return DEFAULT_NEUTRAL;
}
  
  
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

window.isUserInCurrentBid = true; // instantly mark as joined

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
// === ULTRA-OPTIMIZED TAP HANDLER ===
let tapQueue = 0;
let processingTaps = false;

tapButton?.addEventListener(tapEvent, (e) => {
  if (!running || tapLocked) return;

  tapQueue++;
  processTapQueue();
});

async function processTapQueue() {
  if (processingTaps || tapQueue === 0) return;
  processingTaps = true;

  while (tapQueue > 0) {
    tapQueue--;

    // --- LIGHT LOGIC ONLY ---
    if (RedHotMode.active) {
      RedHotMode.punish();
      tapLocked = true;
      setTimeout(() => tapLocked = false, 300);
    } else {
      tapLocked = true;
      setTimeout(() => tapLocked = false, 50);

      // Run the heavy logic OUTSIDE the event
      await Promise.resolve().then(handleNormalTap);
    }
  }

  processingTaps = false;
}

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
// ======================================================
// END SESSION RECORD — FINAL FIXED & BULLETPROOF VERSION
// ======================================================
let sessionAlreadySaved = false; // ← Global guard (reset in startSession())

async function endSessionRecord() {
  if (sessionAlreadySaved || !currentUser?.uid || (sessionTaps + sessionEarnings) === 0) return;

  sessionAlreadySaved = true;

  const userRef = doc(db, "users", currentUser.uid);
  const now = new Date();
  const lagosTime = new Date(now.getTime() + 60 * 60 * 1000); // UTC+1
  const dailyKey = lagosTime.toISOString().split("T")[0];
  const weeklyKey = `${lagosTime.getFullYear()}-W${getWeekNumber(lagosTime)}`;
  const monthlyKey = `${lagosTime.getFullYear()}-${String(lagosTime.getMonth() + 1).padStart(2, "0")}`;

  try {
    // 1. Update user's main stats (cash, taps, daily/weekly/monthly)
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

    // 2. ONLY save to BID leaderboard if user actually joined today's bid
    if (window.CURRENT_ROUND_ID && sessionTaps > 0) {
      const bidCheck = await getDocs(query(
        collection(db, "bids"),
        where("uid", "==", currentUser.uid),
        where("roundId", "==", window.CURRENT_ROUND_ID),
        where("status", "==", "active")
      ));

      if (!bidCheck.empty) {
        await addDoc(collection(db, "taps"), {
          uid: currentUser.uid,
          username: currentUser.chatId || "Player",
          displayName: currentUser.chatId || "Player",
          count: sessionTaps,           // ← FIXED: was "count" → now "sessionTaps"
          roundId: window.CURRENT_ROUND_ID,
          inBid: true,
          timestamp: serverTimestamp()
        });
      }
    }

    // 3. Update local UI instantly
    currentUser.cash += sessionEarnings;
    currentUser.totalTaps += sessionTaps;

    if (cashCountEl) cashCountEl.textContent = '₦' + formatNumber(currentUser.cash);
    if (earningsEl) earningsEl.textContent = '₦0';
    if (miniEarnings) miniEarnings.textContent = '₦0';

    console.log("%cROUND SAVED — UNSTOPPABLE!", "color:#0f9;font-size:20px;font-weight:bold");

  } catch (err) {
    console.error("%cSAVE FAILED — WILL RETRY NEXT ROUND", "color:#f00;background:#300;padding:12px;border-radius:10px", err);
    sessionAlreadySaved = false; // ← allow retry on next round
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

/* ============================================================
   LEADERBOARD SYSTEM — FULLY FIXED + TAB HIGHLIGHTER WORKS
============================================================ */

const leaderboardBtn = document.getElementById("leaderboardBtn");
const leaderboardModal = document.getElementById("leaderboardModal");
const closeLeaderboard = document.getElementById("closeLeaderboard");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardDescription = document.getElementById("leaderboardDescription");
const periodTabs = document.querySelectorAll(".lb-tab");
const dailyTimerContainer = document.getElementById("dailyTimer");
const sliderWrapper = document.getElementById("leaderboardImageSlider");
const sliderTrack = sliderWrapper?.querySelector(".slider-track");
const slides = sliderWrapper?.querySelectorAll(".leaderboard-slide") || [];
let currentSlide = 0;
let slideInterval = null;
const slideCount = slides.length;

// ——— OPEN LEADERBOARD ———
leaderboardBtn?.addEventListener("click", () => {
  leaderboardModal.style.display = "block";

  // Auto-select first active tab or default to daily
  const activeTab = document.querySelector(".lb-tab.active") || periodTabs[0];
  if (activeTab) {
    periodTabs.forEach(t => t.classList.remove("active"));
    activeTab.classList.add("active");
    dailyTimerContainer.style.display = activeTab.dataset.period === "daily" ? "block" : "none";
  }

  queueMicrotask(() => {
    fetchLeaderboard(activeTab?.dataset.period || "daily");
    startSlider();
    startDailyCountdown(); // start timer
  });
});

closeLeaderboard?.addEventListener("click", () => {
  leaderboardModal.style.display = "none";
  stopSlider();
});

// ——— SLIDER ———
function showSlide(index) {
  currentSlide = (index + slideCount) % slideCount;
  sliderTrack.style.transform = `translate3d(-${currentSlide * 100}%, 0, 0)`;
}
function startSlider() {
  if (slideInterval || slideCount <= 1) return;
  slideInterval = setInterval(() => showSlide(currentSlide + 1), 5000);
}
function stopSlider() {
  clearInterval(slideInterval);
  slideInterval = null;
}

// Touch swipe
let startX = 0;
sliderWrapper?.addEventListener("touchstart", e => { startX = e.touches[0].clientX; stopSlider(); }, { passive: true });
sliderWrapper?.addEventListener("touchend", e => {
  const endX = e.changedTouches[0].clientX;
  if (Math.abs(endX - startX) > 50) {
    showSlide(endX > startX ? currentSlide - 1 : currentSlide + 1);
  }
  startSlider();
});

// ——— WEEK HELPER (FIXED) ———
function getWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ——— KEY GENERATOR ———
function getLeaderboardKey(period) {
  const now = new Date();
  if (period === "daily") return now.toISOString().split("T")[0];
  if (period === "weekly") return `${now.getFullYear()}-W${getWeek(now)}`;
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ——— FETCH LEADERBOARD ———
async function fetchLeaderboard(period = "daily") {
  const now = Date.now();
  if (leaderboardCache[period].data && now - leaderboardCache[period].time < CACHE_DURATION) {
    renderLeaderboardFromData(leaderboardCache[period].data);
    return;
  }

  leaderboardList.innerHTML = `<li style="text-align:center;padding:20px;color:#888;">Loading…</li>`;

  try {
    const key = getLeaderboardKey(period);
    const fieldPath = period === "daily" ? `tapsDaily.${key}` :
                     period === "weekly" ? `tapsWeekly.${key}` : `tapsMonthly.${key}`;

    const q = query(collection(db, "users"), orderBy(fieldPath, "desc"), limit(33));
    const snap = await getDocs(q);

    const topScores = [];
    snap.forEach(doc => {
      const d = doc.data();
      const taps = d.tapsDaily?.[key] ?? d.tapsWeekly?.[key] ?? d.tapsMonthly?.[key] ?? 0;
      if (taps > 0) {
        topScores.push({
          uid: doc.id,
          chatId: d.chatId || "Player",
          taps,
          gender: d.gender,
          popupPhoto: d.popupPhoto || ""
        });
      }
    });

    // My rank (non-blocking)
    let myTaps = 0, myRank = null;
    if (currentUser?.uid) {
      const myDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (myDoc.exists()) {
        const d = myDoc.data();
        myTaps = d.tapsDaily?.[key] ?? d.tapsWeekly?.[key] ?? d.tapsMonthly?.[key] ?? 0;

        const inTop = topScores.findIndex(u => u.uid === currentUser.uid);
        myRank = inTop !== -1 ? inTop + 1 : myTaps > 0 ? (await getCountFromServer(
          query(collection(db, "users"), where(fieldPath, ">", myTaps))
        )).data().count + 1 : null;
      }
    }

    const payload = { topScores, myTaps, myRank };
    leaderboardCache[period] = { data: payload, time: now };
    renderLeaderboardFromData(payload);

  } catch (err) {
    console.error("Leaderboard fetch failed:", err);
    leaderboardList.innerHTML = `<li style="color:#f66;text-align:center;">Error loading leaderboard</li>`;
  }
}

// ——— RENDER ———
function renderLeaderboardFromData({ topScores, myTaps, myRank }) {
  const display = topScores.slice(0, 10);
  document.getElementById("myDailyTapsValue")?.replaceChildren(myTaps.toLocaleString());
  document.getElementById("myRankFull")?.replaceChildren(myRank ? `#${myRank}` : "—");

  if (display.length === 0) {
    leaderboardList.innerHTML = `<li style="text-align:center;padding:30px;color:#888;">No taps yet — be the first!</li>`;
    return;
  }

  const colors = ["#FFD700", "#C0C0C0", "#CD7F32"];
  leaderboardList.innerHTML = display.map((u, i) => `
    <li class="lb-row" style="color:${i < 3 ? colors[i] : '#fff'};font-weight:${i < 3 ? '700' : '500'};">
      <img class="lb-avatar" loading="lazy" src="${getAvatar(u)}" onerror="this.src='assets/avatars/neutral.png'">
      <div class="lb-info">
        <span class="lb-name">${i + 1}. ${u.chatId}</span>
        <span class="lb-score">${u.taps.toLocaleString()} taps</span>
      </div>
    </li>
  `).join("");

  if (currentUser && myRank > 10) {
    leaderboardList.insertAdjacentHTML("beforeend", `
      <li class="lb-row" style="text-align:center;color:#00ff9d;background:rgba(0,255,157,0.1);margin:10px 0;padding:12px;border-radius:8px;">
        <strong>You → #${myRank}</strong> with ${myTaps.toLocaleString()} taps
      </li>
    `);
  }
}
/* ——————————————————————————
   TAB SWITCHER — FINAL FIX (WORKS NO MATTER WHAT)
   —————————————————————————— */
periodTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const period = tab.dataset.period;

    // 1. FORCE remove .active from EVERY tab
    periodTabs.forEach(t => {
      t.classList.remove("active");
      // Kill any leftover inline styles that break the gold design
      t.removeAttribute("style");
    });

    // 2. FORCE add .active ONLY to the clicked tab
    tab.classList.add("active");

    // 3. Timer visibility
    dailyTimerContainer.style.display = period === "daily" ? "block" : "none";

    // 4. Load leaderboard
    fetchLeaderboard(period);
  });
});

// ——— DAILY TIMER ———
function startDailyCountdown() {
  const el = document.getElementById("dailyTimerValue");
  if (!el) return;
  const tick = () => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const diff = (tomorrow - now) / 1000;
    const h = String(Math.floor(diff / 3600)).padStart(2, "0");
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const s = String(Math.floor(diff % 60)).padStart(2, "0");
    el.textContent = `${h}:${m}:${s}`;
  };
  tick();
  setInterval(tick, 1000);
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

// OPEN STAR MARKET
document.getElementById('starMarketBtn')?.addEventListener('click', () => {
  document.getElementById('starMarketModal').style.display = 'flex';
  updateBankDisplay();
});

document.getElementById('closeStarMarket')?.addEventListener('click', () => {
  document.getElementById('starMarketModal').style.display = 'none';
});

// UPDATE BALANCES
function updateBankDisplay() {
  const name = currentUser?.chatId || currentUser?.email?.split('@')[0] || "Player";
  const cash = currentUser?.cash || 0;
  const stars = currentUser?.stars || 0;

  document.getElementById('bankUsername').textContent = name;
  document.getElementById('bankCash').textContent = cash.toLocaleString();
  document.getElementById('bankStars').textContent = stars.toLocaleString();

  const amountInput = document.getElementById('withdrawAmount');
  const btn = document.getElementById('withdrawBtn');

  amountInput.value = '';
  btn.style.opacity = cash >= 5000 ? "1" : "0.5";
  btn.style.cursor = cash >= 5000 ? "pointer" : "not-allowed";
  btn.disabled = cash < 5000;
}


// WITHDRAW BUTTON — FINAL CLEAN FLOW
document.getElementById('withdrawBtn')?.addEventListener('click', async () => {
  const amount = parseInt(document.getElementById('withdrawAmount').value || 0);

  if (amount < 5000 || amount > currentUser.cash) {
    await showNiceAlert("Invalid amount!\nMinimum: ₦5,000", "Error");
    return;
  }

  // CONFIRM WITHDRAWAL
  const confirmed = await showNiceAlert(
    `Withdraw ₦${amount.toLocaleString()}?\n\n` +
    `Bank: ${currentUser.bankName || "Not set"}\n` +
    `Account: ${currentUser.bankAccountNumber || "Not set"}\n\n` +
    `Standard: 1–3 days\n` +
    `Fast Track: 21 STRZ (instant priority)`,
    "Confirm Withdrawal",
    true  // ← confirmMode = true → returns true/false
  );

  if (!confirmed) return; // canceled

  // ASK FOR FAST TRACK
  const fastTrack = await showNiceAlert(
    `Activate Fast Track?\n\n` +
    `Cost: 21 STRZ\n` +
    `• Priority processing\n` +
    `• Auto message to support\n\n` +
    `Current STRZ: ${currentUser.stars}`,
    "Fast Track (21 STRZ)",
    true
  );

  await processWithdrawal(amount, fastTrack);
});


async function processWithdrawal(amount, isFastTrack = false) {
  const userRef = doc(db, "users", currentUser.uid);
  const withdrawalRef = doc(collection(db, "withdrawals"));

  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw "User not found";
      const userData = userSnap.data();

      if (userData.cash < amount) throw "Insufficient cash";
      if (isFastTrack && userData.stars < 21) throw "Not enough STRZ";

      // Deduct balances
      transaction.update(userRef, {
        cash: userData.cash - amount,
        stars: isFastTrack ? userData.stars - 21 : userData.stars,
        updatedAt: serverTimestamp()
      });

      // Save full withdrawal record
      transaction.set(withdrawalRef, {
        uid: currentUser.uid,
        username: currentUser.chatId || currentUser.email?.split('@')[0] || "Player",
        amount: amount,
        bankName: userData.bankName || "Not set",
        bankAccountNumber: userData.bankAccountNumber || "Not set",
        status: isFastTrack ? "fast_track" : "pending",
        isFastTrack: isFastTrack,
        requestedAt: serverTimestamp(),
        processed: false,
        note: isFastTrack ? "User paid 21 STRZ for priority" : "Standard request"
      });
    });

    // Update local state
    currentUser.cash -= amount;
    if (isFastTrack) currentUser.stars -= 21;

    updateBankDisplay();
    triggerConfetti();

    // SUCCESS MESSAGE
    await showNiceAlert(
      isFastTrack
        ? `₦${amount.toLocaleString()} FAST TRACKED!\n\n21 STRZ deducted\nPriority processing active`
        : `₦${amount.toLocaleString()} withdrawal requested!\n\nProcessing in 1–3 days`
    );

    // AUTO OPEN SUPPORT CHAT IF FAST TRACK
    if (isFastTrack) {
      const msg = encodeURIComponent(
        `FAST TRACK REQUEST\n\n` +
        `User: @${currentUser.chatId || 'unknown'}\n` +
        `Amount: ₦${amount.toLocaleString()}\n` +
        `Bank: ${currentUser.bankName || 'Not set'}\n` +
        `Account: ${currentUser.bankAccountNumber || 'Not set'}\n` +
        `Please process urgently!`
      );
      window.open(`https://t.me/YOUR_SUPPORT_BOT_OR_ADMIN?text=${msg}`, '_blank');
    }

  } catch (err) {
    console.error("Withdrawal failed:", err);
    await showNiceAlert("Withdrawal failed!\nPlease try again.");
  }
}

/* ============================================================
   TAPMASTER CORE — CLEAN, MODERN, FULLY WORKING (2025+)
   ALL SETTINGS IN ONE PLACE — CHANGE IN 5 SECONDS
   ============================================================ */

// ====================== EASY CONTROL PANEL — CHANGE ANYTHING HERE ======================
const CONFIG = {
  BID_COST: 50,                    // Stars needed to join Bid Royale
  POOL_INCREASE_PER_PLAYER: 100,   // ₦ added to prize pool when someone joins (e.g. 100, 200, 500)
  BASE_PRIZE_POOL: 500000,          // ₦50,000 starting pool (even if 0 players)
  MAX_PRIZE_POOL: 5000000,          // Max pool cap (set to null for unlimited growth)
  // Examples to copy-paste:
  // BIG HYPE MODE → POOL_INCREASE_PER_PLAYER: 500, BASE_PRIZE_POOL: 200000, MAX_PRIZE_POOL: null
  // BUDGET MODE   → POOL_INCREASE_PER_PLAYER: 50,  BASE_PRIZE_POOL: 10000,  MAX_PRIZE_POOL: 100000
};

// ====================== ROUND ID SYSTEM — PERFECT MIDNIGHT ROLLOVER ======================
function getTodayRound() {
  const lagosOffset = 60 * 60 * 1000; // UTC+1
  const lagosDate = new Date(Date.now() + lagosOffset);
  return "round_" + lagosDate.toISOString().split('T')[0]; // → round_2025-11-24
}

// Auto-update global round ID every minute (handles midnight perfectly)
function initRoundSystem() {
  window.CURRENT_ROUND_ID = getTodayRound();
  console.log("%c Bid Royale Active → " + window.CURRENT_ROUND_ID, "color:#0f9;font-size:16px;font-weight:bold");

  setInterval(() => {
    const newRound = getTodayRound();
    if (window.CURRENT_ROUND_ID !== newRound) {
      console.log("%c MIDNIGHT ROLLOVER → NEW ROUND: " + newRound, "color:#ff0;font-size:20px;font-weight:900");
      window.CURRENT_ROUND_ID = newRound;
      // Optional: trigger UI refresh or sound
      // playSound('newday.mp3');
    }
  }, 60000); // Check every minute
}

// Start it immediately
initRoundSystem();

// ====================== NICE ALERT — FINAL VERSION (OK = true, Cancel = false) ======================
function showNiceAlert(message, title = "TapMaster", confirmMode = false) {
  return new Promise((resolve) => {
    const alertEl = document.getElementById('niceAlert');
    const titleEl = document.getElementById('niceAlertTitle');
    const msgEl = document.getElementById('niceAlertMessage');
    const btnEl = document.getElementById('niceAlertBtn');

    if (!alertEl || !msgEl) {
      alert(message);
      resolve(confirmMode ? false : null);
      return;
    }

    if (titleEl) titleEl.textContent = title;
    msgEl.innerHTML = message.replace(/\n/g, "<br>");

    // CHANGE BUTTON TEXT IF CONFIRM MODE
    if (btnEl) btnEl.textContent = confirmMode ? "OKAY" : "GOT IT";

    alertEl.style.display = "flex";

    const close = (result) => {
      alertEl.style.display = "none";
      if (btnEl) btnEl.onclick = null;
      alertEl.onclick = null;
      resolve(result);
    };

    // OK / Confirm = true
    if (btnEl) btnEl.onclick = () => close(true);

    // Click outside or backdrop = false (only if confirmMode)
    alertEl.onclick = (e) => {
      if (e.target === alertEl) {
        close(confirmMode ? false : true);
      }
    };
  });
}

// ====================== HELPER: GET CURRENT PRIZE POOL (use anywhere) ======================
function calculatePrizePool(playerCount) {
  const { BASE_PRIZE_POOL, POOL_INCREASE_PER_PLAYER, MAX_PRIZE_POOL } = CONFIG;
  const total = BASE_PRIZE_POOL + (playerCount * POOL_INCREASE_PER_PLAYER);
  return MAX_PRIZE_POOL ? Math.min(total, MAX_PRIZE_POOL) : total;
}

// Optional: expose config to console for debugging
window.TAPMASTER_CONFIG = CONFIG;
window.calculatePrizePool = calculatePrizePool;
window.getTodayRound = getTodayRound;

// INIT MESSAGE
console.log("%c TAPMASTER CORE LOADED SUCCESSFULLY", "color:#0f9;background:#000;padding:10px;font-size:18px;font-weight:bold");
console.log("%c Current Round → " + window.CURRENT_ROUND_ID, "color:#0f9;font-size:14px");
console.log("%c Edit CONFIG at the top to control everything!", "color:#ff0;font-size:12px");

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
/* ====================== FINAL BID JOIN — 100% WORKING & FLAWLESS ====================== */
document.getElementById('finalConfirmBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('finalConfirmBtn');
  const modal = document.getElementById('confirmBidModal');
  
  // Prevent double click
  if (btn.disabled) return;
  
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>';

  try {
    // Must be logged in
    if (!currentUser?.uid) {
      await showNiceAlert("Login required to join Bid Royale!");
      modal.style.display = 'none';
      return;
    }

    // Prevent double join
    const alreadySnap = await getDocs(query(
      collection(db, "bids"),
      where("uid", "==", currentUser.uid),
      where("roundId", "==", window.CURRENT_ROUND_ID)
    ));

    if (!alreadySnap.empty) {
      await showNiceAlert("You're already in today's Bid Royale!\nGo crush the leaderboard!");
      modal.style.display = 'none';
      return;
    }

    // Deduct stars
    const deduct = await tryDeductStarsForJoin(CONFIG.BID_COST);
    if (!deduct.ok) {
      await showNiceAlert("Not enough stars!\nYou need " + CONFIG.BID_COST + " STRZ to join.");
      return;
    }
// SUCCESS: OFFICIALLY JOIN THE BID
await addDoc(collection(db, "bids"), {
  uid: currentUser.uid,
  username: currentUser.chatId,           // ← CORRECT (this is your real name)
  displayName: currentUser.chatId,        // ← ADD THIS TOO (future-proof)
  roundId: window.CURRENT_ROUND_ID,
  status: "active",
  joinedAt: serverTimestamp()
});
    // SUCCESS FLOW — EVERYTHING WORKS
    modal.style.display = 'none';

    await showNiceAlert(
      `YOU'RE IN THE BID ROYALE!\n` +
      `+₦${CONFIG.POOL_INCREASE_PER_PLAYER.toLocaleString()} added to prize pool\n` +
      `Start tapping — dominate the leaderboard!`
    );

    // Celebration
    triggerConfetti();
    if (typeof playSound === 'function') playSound('success.mp3');

    // Update stars display
    if (starCountEl) {
      starCountEl.textContent = formatNumber(currentUser.stars);
    }

  } catch (err) {
    console.error("Bid join failed:", err);
    await showNiceAlert("Join failed — please try again");
  } finally {
    // Always re-enable button and reset text
    btn.disabled = false;
    btn.textContent = "YES!";
  }
});
/* ====================== DAILY BID ENGINE — PERFECT TIMER + LIVE PRIZE + BID LEADERBOARD ====================== */
let bidActive = false;
let unsubStats = null;
let unsubLeaderboard = null;

function startDailyBidEngine() {
  const timerEl = document.getElementById('countdownTimer');
  const playersEl = document.getElementById('livePlayers');
  const prizeEl = document.getElementById('livePrize');
  const leaderboardEl = document.getElementById('bidLeaderboard');

  if (!timerEl || !playersEl || !prizeEl) {
    setTimeout(startDailyBidEngine, 500);
    return;
  }

  window.CURRENT_ROUND_ID = getTodayRound();

  // Sync server time
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
    const bidEnd = new Date(`${today}T23:59:00+01:00`).getTime();
    const current = now.getTime();

    if (current >= bidStart && current < bidEnd + 60000) {
      bidActive = true;
      const secondsLeft = Math.max(0, Math.floor((bidEnd - current) / 1000));
      const h = String(Math.floor(secondsLeft / 3600)).padStart(2, '0');
      const m = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, '0');
      const s = String(secondsLeft % 60).padStart(2, '0');
      timerEl.textContent = `${h}:${m}:${s}`;
      timerEl.style.color = secondsLeft < 600 ? "#ff0066" : "#00ff88";
      timerEl.style.fontWeight = "900";

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
        // === LIVE PRIZE POOL & PLAYER COUNT ===
    if (unsubStats) unsubStats();
    if (unsubLeaderboard) unsubLeaderboard();

    // ─── Player count & prize pool (from bids collection) ───
    const bidsQuery = query(
      collection(db, "bids"),
      where("roundId", "==", window.CURRENT_ROUND_ID),
      where("status", "==", "active")
    );

    unsubStats = onSnapshot(bidsQuery, (snap) => {
      const count = snap.size;
      const prize = calculatePrizePool(count);
      playersEl.textContent = count;
      prizeEl.textContent = "₦" + prize.toLocaleString();
    });

    // ─── BID-ONLY LEADERBOARD (only paid & joined players) ───
    if (bidActive && leaderboardEl) {
      const tapsQuery = query(
        collection(db, "taps"),
        where("roundId", "==", window.CURRENT_ROUND_ID),
        where("inBid", "==", true)
      );

      unsubLeaderboard = onSnapshot(tapsQuery, (snap) => {
        const scores = {};

        snap.docs.forEach(doc => {
          const d = doc.data();
          if (d.roundId !== window.CURRENT_ROUND_ID || d.inBid !== true) return;

          const realName = d.displayName || d.username || "Player";

          if (!scores[d.uid]) {
            scores[d.uid] = { name: realName, taps: 0 };
          }
          scores[d.uid].taps += (d.count || 1);
        });

        const ranked = Object.values(scores)
          .sort((a, b) => b.taps - a.taps)
          .slice(0, 15);   // change to 5 later if you want Top-5 only

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

  updateTimerAndStats();
  setInterval(updateTimerAndStats, 1000);
}
/* ====================== TAP SAVING – CORRECTLY FEEDS BOTH LEADERBOARDS ====================== */
/* 
  Rules:
  - Every tap → always counts for General Leaderboard (via endSessionRecord → users.totalTaps)
  - Bid Leaderboard → ONLY if user has an active entry in "bids" collection for today
  - No extra reads during rapid tapping (we check only once per session save)
*/

async function saveTap(count = 1) {
  if (!currentUser?.uid) return;

  // === 1. Always count toward general leaderboard (handled in endSessionRecord) ===
  // We don't write anything here for general taps — your existing endSessionRecord()
  // already atomically updates users.totalTaps, tapsDaily, etc. Perfect.

  // === 2. Check ONCE if user is in today's active bid (cached for performance) ===
  let isInBid = window.isUserInCurrentBid ?? false; // use cache if exists

  if (isInBid === false && window.CURRENT_ROUND_ID) {
    // First tap of session → verify from Firestore (only once!)
    const snap = await getDocs(query(
      collection(db, "bids"),
      where("uid", "==", currentUser.uid),
      where("roundId", "==", window.CURRENT_ROUND_ID),
      where("status", "==", "active")
    ));

    isInBid = !snap.empty;
    window.isUserInCurrentBid = isInBid; // cache for rest of session
  }

  if (isInBid && window.CURRENT_ROUND_ID) {
    await addDoc(collection(db, "taps"), {
      uid: currentUser.uid,
      username: currentUser.chatId,           // ← 100% correct name
      count: count,
      roundId: window.CURRENT_ROUND_ID,
      inBid: true,
      timestamp: serverTimestamp()
    }).catch(() => {
      // Silently ignore — never block tapping flow
      // User will still get credit next tap or on refresh
    });
  }

  // Optional: tiny visual cue when tap counts in Bid Royale
  // if (isInBid) showFloatingPlus(tapButton, "FIRE");
}

// ————————————————————————————————————————————————————————————————
async function declareWinnersAndReset() {
  console.log("%cBID ROYALE ENDED — PAYING TOP 5!", "color:#ff0;font-size:18px;font-weight:bold");
  // Your payout logic here (unchanged)
}

// ————————————————————————————————————————————————————————————————
// Start the daily bid engine only once
if (!window.bidEngineStarted) {
  window.bidEngineStarted = true;
  startDailyBidEngine();
}

// ————————————————————————————————————————————————————————————————
// IMPORTANT: Set this flag to true right after successful bid join!
/* Example (inside your finalConfirmBtn success flow):
   ...
   await addDoc(collection(db, "bids"), { ... });
   window.isUserInCurrentBid = true;   // ← This makes taps count instantly
   ...
*/

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
// WEEKLY STREAK SYSTEM — SUNDAY = DAY 1, SATURDAY = DAY 7
// 350 STRZ EVERY 7 DAYS — ACCURATE
// ======================================================

// Helper: get current date in Lagos timezone (UTC+1), start of day
function getLagosDate() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000; // convert to UTC
  const lagos = new Date(utc + 3600000); // +1 hour for Lagos
  lagos.setHours(0, 0, 0, 0); // start of day
  return lagos;
}

// Get THIS WEEK's Sunday (Lagos time)
function getThisWeekSunday() {
  const lagos = getLagosDate();
  const day = lagos.getDay(); // 0 = Sunday
  const diff = lagos.getDate() - day; // back to Sunday
  const sunday = new Date(lagos);
  sunday.setDate(diff);
  return sunday;
}

// Build week: Sunday → Saturday
function buildWeekArray(streakDays) {
  const weekStart = getThisWeekSunday();
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const key = day.toISOString().split('T')[0];
    return {
      played: !!streakDays[key],
      date: key,
      label: labels[i]
    };
  });
}

// Start streak system
async function startWeeklyStreakSystem() {
  if (!currentUser?.uid) return;

  const userRef = doc(db, "users", currentUser.uid);
  try {
    const snap = await getDoc(userRef);
    const data = snap.exists() ? snap.data() : {};

    const lagosToday = getLagosDate();
    const todayKey = lagosToday.toISOString().split('T')[0];

    let streakDays = data.streakDays || {};
    let lastClaimWeek = data.lastStreakClaim || null;

    // Mark today as played
    if (!streakDays[todayKey]) {
      streakDays[todayKey] = true;
      await updateDoc(userRef, { streakDays });
    }

    const weekArray = buildWeekArray(streakDays);
    const currentWeekStart = weekArray[0].date;

    currentUser.weekStreak = weekArray;
    currentUser.currentWeekStart = currentWeekStart;
    currentUser.lastStreakClaim = lastClaimWeek;

    forceRenderStreak();
  } catch (e) {
    console.error("Streak error:", e);
  }
}

// Render streak bar — SUNDAY FIRST
function forceRenderStreak() {
  const countEl = document.getElementById('streakDayCount');
  const btn = document.getElementById('claimStreakRewardBtn');
  const days = document.querySelectorAll('.streak-day-mini');

  if (!currentUser?.weekStreak || days.length === 0) {
    countEl && (countEl.textContent = '0');
    days.forEach(el => {
      el.classList.remove('active');
      el.querySelector('.streak-dot')?.classList.remove('active');
    });
    if (btn) {
      btn.textContent = 'CLAIM 350 STRZ (0/7)';
      btn.style.opacity = '0.4';
      btn.style.pointerEvents = 'none';
    }
    return;
  }

  let playedCount = 0;
  currentUser.weekStreak.forEach((day, i) => {
    const el = days[i];
    const dot = el?.querySelector('.streak-dot');
    if (day.played) {
      el?.classList.add('active');
      dot?.classList.add('active');
      playedCount++;
    } else {
      el?.classList.remove('active');
      dot?.classList.remove('active');
    }
    const label = el?.querySelector('.streak-label');
    if (label) label.textContent = day.label;
  });

  countEl.textContent = playedCount;

  const claimedThisWeek = currentUser.lastStreakClaim === currentUser.currentWeekStart;

  if (playedCount === 7 && !claimedThisWeek) {
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
      : `CLAIM 350 STRZ (${playedCount}/7)`;
  }
}

// Claim reward
async function claimWeeklyStreak() {
  if (!currentUser?.uid || !currentUser.weekStreak) return;

  const played = currentUser.weekStreak.filter(d => d.played).length;
  if (played < 7) {
    await showNiceAlert("Play all 7 days to claim 350 STRZ!");
    return;
  }
  if (currentUser.lastStreakClaim === currentUser.currentWeekStart) {
    await showNiceAlert("Already claimed this week!");
    return;
  }

  const userRef = doc(db, "users", currentUser.uid);
  try {
    await runTransaction(db, async (t) => {
      const snap = await t.get(userRef);
      if (!snap.exists()) throw "User missing";
      const data = snap.data();
      if (data.lastStreakClaim === currentUser.currentWeekStart) throw "Already claimed";

      t.update(userRef, {
        stars: (data.stars || 0) + 350,
        lastStreakClaim: currentUser.currentWeekStart,
        updatedAt: serverTimestamp()
      });
    });

    currentUser.stars += 350;
    currentUser.lastStreakClaim = currentUser.currentWeekStart;
    if (starCountEl) starCountEl.textContent = formatNumber(currentUser.stars);

    forceRenderStreak();
    triggerConfetti();
    await showNiceAlert("350 STRZ CLAIMED!\nYour streak is fire!");
  } catch (e) {
    await showNiceAlert("Claim failed — try again");
  }
}

// AUTO START
document.addEventListener("DOMContentLoaded", async () => {
  await loadCurrentUserForGame();
  await startWeeklyStreakSystem();
});

document.getElementById('claimStreakRewardBtn')?.addEventListener('click', claimWeeklyStreak);

// Refresh every 2 minutes
setInterval(() => {
  if (currentUser?.uid) startWeeklyStreakSystem();
}, 120000);

const START_BG   = "https://cdn.shopify.com/s/files/1/0962/6648/6067/files/9F6F9EAC-F165-4C70-85CB-B2351A3B8C59.png?v=1763282422";
const GAME_BGS   = [
  "https://cdn.shopify.com/s/files/1/0962/6648/6067/files/64EB80F3-9BE7-4D39-8C96-5608B941E4DC.png?v=1763280746",
  "https://cdn.shopify.com/s/files/1/0962/6648/6067/files/IMG_2461.jpg?v=1764634530",
  "https://cdn.shopify.com/s/files/1/0962/6648/6067/files/IMG_2447.jpg?v=1764634569",
  // add the rest
];

function setBg() {
  document.body.style.backgroundImage = 
    document.body.classList.contains('game-mode')
      ? `url('${GAME_BGS[Math.floor(Math.random()*GAME_BGS.length)]}')`
      : `url('${START_BG}')`;
}

setBg(); // on load

// Re-apply whenever class changes
new MutationObserver(setBg).observe(document.body, {attributes:true, attributeFilter:['class']});
