/* ========== FIREBASE v10 IMPORTS (ES MODULES + GLOBAL FALLBACK) ========== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc,
  serverTimestamp, onSnapshot, query, orderBy, increment, getDocs,
  where, runTransaction, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDatabase, ref as rtdbRef, set as rtdbSet, onDisconnect, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ========== FIREBASE CONFIG ========== */
const firebaseConfig = {
  apiKey: "AIzaSyD_GjkTox5tum9o4AupO0LeWzjTocJg8RI",
  authDomain: "dettyverse.firebaseapp.com",
  projectId: "dettyverse",
  storageBucket: "dettyverse.firebasestorage.app",
  messagingSenderId: "1036459652488",
  appId: "1:1036459652488:web:e8910172ed16e9cac9b63d",
  measurementId: "G-NX2KWZW85V"
};

/* ========== INITIALIZE FIREBASE ========== */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const auth = getAuth(app);

// Global access (debug + legacy compatibility)
window.app = app;
window.db = db;
window.auth = auth;
window.rtdb = rtdb;

/* ========== CONFIG & CONSTANTS ========== */
const CONFIG = {
  ROOM_ID: "room5",
  CHAT_COLLECTION: `messages_room5`,
  HIGHLIGHTS_COLLECTION: "highlightVideos",
  NOTIFICATIONS_COLLECTION: "notifications",
  WHITELIST_COLLECTION: "whitelist",
  FEATURED_HOSTS_COLLECTION: "featuredHosts",
  BUZZ_COST: 50,
  SEND_COST: 1,
  MIN_GIFT_STARS: 100,
  HIGHLIGHT_BASE_PRICE: 100,
  STAR_EARNING_INTERVAL_MS: 60_000
};

/* ========== RUNTIME STATE ========== */
let currentUser = null;
let unlockedVideos = JSON.parse(localStorage.getItem("userUnlockedVideos") || "[]");
let notificationUnsubscribe = null;
let lastMessagesArray = [];

const refs = {
  messagesEl: null,
  messageInputEl: null,
  sendBtn: null,
  buzzBtn: null,
  starCountEl: null,
  onlineCountEl: null,
  redeemBtn: null,
  tipBtn: null,
  notificationsList: null,
  sendAreaEl: null,
  chatIDModal: null,
  chatIDInput: null,
  chatIDConfirmBtn: null,
  userColors: {}
};

window.DEBUG = false;

/* ========== UTILS ========== */
const log = (...args) => window.DEBUG && console.log("%c$STRZ", "color:#ff006e;font-weight:bold", ...args);
const warn = (...args) => console.warn("%c$STRZ WARN", "color:#ff8c00;font-weight:bold", ...args);
const error = (...args) => console.error("%c$STRZ ERROR", "color:#ff006e;background:#000;padding:4px;border-radius:4px", ...args);

const formatNumber = n => new Intl.NumberFormat("en-NG").format(n || 0);
const randomColor = () => ["#FFD700","#FF69B4","#87CEEB","#90EE90","#FFB6C1","#FFA07A","#8A2BE2","#00BFA6","#F4A460"][Math.floor(Math.random() * 9)];
const sanitizeKey = key => key.replace(/[.#$[\]]/g, "_");

/* ========== UNLOCKED VIDEOS SYNC ========== */
async function syncUserUnlocks() {
  if (!currentUser?.uid) return;
  try {
    const userRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userRef);
    const firestoreUnlocks = snap.exists() ? (snap.data().unlockedVideos || []) : [];
    const localUnlocks = JSON.parse(localStorage.getItem("userUnlockedVideos") || "[]");

    const merged = [...new Set([...firestoreUnlocks, ...localUnlocks])];
    const needsUpdate = merged.some(id => !firestoreUnlocks.includes(id));

    if (needsUpdate) {
      await updateDoc(userRef, { unlockedVideos: arrayUnion(...merged.filter(id => !firestoreUnlocks.includes(id))) });
    }

    localStorage.setItem("userUnlockedVideos", JSON.stringify(merged));
    unlockedVideos = merged;
    log("Unlocks synced:", merged.length);
  } catch (err) {
    error("Unlock sync failed:", err);
  }
}

/* ========== NOTIFICATIONS SYSTEM (PER-USER SUBCOLLECTION) ========== */
function setupNotificationsListener() {
  if (!currentUser?.uid) return;
  if (notificationUnsubscribe) notificationUnsubscribe();

  const notifRef = collection(db, "users", currentUser.uid, "notifications");
  const q = query(notifRef, orderBy("timestamp", "desc"));

  const listEl = document.getElementById("notificationsList");
  if (!listEl) {
    setTimeout(setupNotificationsListener, 500);
    return;
  }

  notificationUnsubscribe = onSnapshot(q, snapshot => {
    if (snapshot.empty) {
      listEl.innerHTML = `<p style="opacity:0.7;text-align:center;margin:20px 0;">No notifications yet.</p>`;
      return;
    }

    const items = snapshot.docs.map(doc => {
      const n = doc.data();
      const time = n.timestamp?.toDate?.()?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || "--:--";
      return `
        <div class="notification-item ${n.read ? "" : "unread"}" data-id="${doc.id}">
          <span>${n.message || "(no message)"}</span>
          <span class="notification-time">${time}</span>
        </div>
      `;
    });

    listEl.innerHTML = items.join("");
  }, err => {
    error("Notifications error:", err);
    listEl.innerHTML = `<p style="color:#ff6b6b;">Failed to load notifications</p>`;
  });
}

/* ========== MARK ALL NOTIFICATIONS READ ========== */
async function markAllNotificationsRead() {
  if (!currentUser?.uid) return;
  const notifRef = collection(db, "users", currentUser.uid, "notifications");
  const snapshot = await getDocs(query(notifRef, where("read", "==", false)));
  await Promise.all(snapshot.docs.map(d => updateDoc(d.ref, { read: true })));
  showStarPopup("All notifications marked as read");
}

/* ========== AUTH STATE OBSERVER (CENTRAL HUB) ========== */
onAuthStateChanged(auth, async user => {
  currentUser = user;
  window.currentUser = user;

  // Hide modals on logout
  document.querySelectorAll(".featured-modal, #giftModal, #highlightsModal, #unlockConfirmModal, #strzAirdropModal")
    .forEach(m => m && (m.style.display = "none"));

  if (!user) {
    log("User logged out");
    localStorage.removeItem("userId");
    document.querySelectorAll(".after-login-only").forEach(el => el.style.display = "none");
    notificationUnsubscribe?.();
    return;
  }

  log("User logged in:", user.uid);
  document.querySelectorAll(".after-login-only").forEach(el => el.style.display = "");

  await syncUserUnlocks();
  setupNotificationsListener();
  updateRedeemLink();
  updateTipLink();
  setupPresence(user);
});

/* ========== POPUP HELPERS ========== */
function showStarPopup(text, duration = 2000) {
  const popup = document.getElementById("starPopup");
  const textEl = document.getElementById("starText");
  if (!popup || !textEl) return;

  textEl.textContent = text;
  popup.style.display = "block";
  popup.style.opacity = "1";
  popup.style.transform = "translateY(0)";

  clearTimeout(popup._hideTimer);
  popup._hideTimer = setTimeout(() => {
    popup.style.opacity = "0";
    popup.style.transform = "translateY(-20px)";
    setTimeout(() => popup.style.display = "none", 400);
  }, duration);
}

function showGiftAlert(text) {
  const el = document.getElementById("giftAlert");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 5000);
}

/* ========== GIFT SYSTEM ========== */
async function showGiftModal(targetUid, targetData) {
  if (!targetUid || !targetData?.chatId || !currentUser?.uid) return;

  const modal = document.getElementById("giftModal");
  const title = document.getElementById("giftModalTitle");
  const input = document.getElementById("giftAmountInput");
  const confirm = document.getElementById("giftConfirmBtn");
  const close = document.getElementById("giftModalClose");

  if (!modal || !title || !input || !confirm || !close) return;

  title.textContent = `Gift to ${targetData.chatId}`;
  input.value = "";
  modal.style.display = "flex";

  const hide = () => modal.style.display = "none";
  close.onclick = hide;
  modal.onclick = e => e.target === modal && hide();

  const newBtn = confirm.cloneNode(true);
  confirm.replaceWith(newBtn);

  newBtn.onclick = async () => {
    const amount = parseInt(input.value) || 0;
    if (amount < CONFIG.MIN_GIFT_STARS) return showStarPopup(`Min ${CONFIG.MIN_GIFT_STARS} stars`);
    if ((currentUser.stars || 0) < amount) return showStarPopup("Not enough stars");

    try {
      const fromRef = doc(db, "users", currentUser.uid);
      const toRef = doc(db, "users", targetUid);

      const msgData = {
        content: `${currentUser.chatId} gifted ${amount} stars to ${targetData.chatId}!`,
        uid: currentUser.uid,
        timestamp: serverTimestamp(),
        highlight: true,
        systemBanner: true,
        buzzColor: randomColor()
      };

      const msgRef = await addDoc(collection(db, CONFIG.CHAT_COLLECTION), msgData);

      await Promise.all([
        updateDoc(fromRef, { stars: increment(-amount), starsGifted: increment(amount) }),
        updateDoc(toRef, { stars: increment(amount) })
      ]);

      showStarPopup(`Sent ${amount} stars to ${targetData.chatId}!`);
      hide();
      renderMessagesFromArray([{ id: msgRef.id, data: msgData }]);
    } catch (err) {
      error("Gift failed:", err);
      showStarPopup("Gift failed");
    }
  };
}

/* ========== LINKS ========== */
function updateRedeemLink() {
  if (refs.redeemBtn && currentUser?.uid) {
    refs.redeemBtn.href = `https://golalaland.github.io/crdb/shop.html?uid=${currentUser.uid}`;
    refs.redeemBtn.style.display = "inline-block";
  }
}
function updateTipLink() {
  if (refs.tipBtn && currentUser?.uid) {
    refs.tipBtn.href = `https://golalaland.github.io/crdb/tapmaster.html?uid=${currentUser.uid}`;
    refs.tipBtn.style.display = "inline-block";
  }
}

/* ========== PRESENCE SYSTEM ========== */
function setupPresence(user) {
  if (!rtdb || !user?.uid) return;
  const path = `presence/${CONFIG.ROOM_ID}/${sanitizeKey(user.uid)}`;
  const ref = rtdbRef(rtdb, path);

  rtdbSet(ref, {
    online: true,
    chatId: user.chatId || "Guest",
    lastSeen: Date.now()
  }).catch(() => {});

  onDisconnect(ref).remove().catch(() => {});
}

if (rtdb) {
  onValue(rtdbRef(rtdb, `presence/${CONFIG.ROOM_ID}`), snap => {
    const count = Object.keys(snap.val() || {}).length;
    if (refs.onlineCountEl) refs.onlineCountEl.textContent = `(${count} online)`;
  });
}

/* ========== USER COLORS ========== */
function setupUserColorsListener() {
  onSnapshot(collection(db, "users"), snap => {
    refs.userColors = {};
    snap.forEach(doc => {
      const data = doc.data();
      if (data.usernameColor) refs.userColors[doc.id] = data.usernameColor;
    });
    if (lastMessagesArray.length) renderMessagesFromArray(lastMessagesArray);
  });
}
setupUserColorsListener();

/* ========== REPLY & REPORT SYSTEM ========== */
let currentReplyTarget = null;
let tapModalEl = null;

function cancelReply() {
  currentReplyTarget = null;
  if (refs.messageInputEl) refs.messageInputEl.placeholder = "Type a message...";
  refs.cancelReplyBtn?.remove();
  refs.cancelReplyBtn = null;
}

function showReplyCancelButton() {
  if (refs.cancelReplyBtn) return;
  const btn = document.createElement("button");
  btn.textContent = "X";
  btn.style.cssText = "margin-left:6px;font-size:12px;background:none;border:none;color:#ff006e;cursor:pointer;";
  btn.onclick = cancelReply;
  refs.messageInputEl.parentElement.appendChild(btn);
  refs.cancelReplyBtn = btn;
}

async function reportMessage(msgData) {
  if (!currentUser) return showStarPopup("Login required");
  try {
    const reportRef = doc(db, "reportedmsgs", msgData.id);
    const snap = await getDoc(reportRef);
    const reporter = currentUser.chatId || "unknown";

    if (snap.exists() && snap.data().reportedBy?.includes(reporter)) {
      return showStarPopup("Already reported");
    }

    if (snap.exists()) {
      await updateDoc(reportRef, {
        reportCount: increment(1),
        reportedBy: arrayUnion(reporter),
        lastReportedAt: serverTimestamp()
      });
    } else {
      await setDoc(reportRef, {
        messageId: msgData.id,
        messageText: msgData.content,
        offenderChatId: msgData.chatId,
        offenderUid: msgData.uid,
        reportedBy: [reporter],
        reportCount: 1,
        createdAt: serverTimestamp(),
        status: "pending"
      });
    }
    showStarPopup("Report sent!");
  } catch (err) {
    error("Report failed", err);
    showStarPopup("Report failed");
  }
}

function showTapModal(targetEl, msgData) {
  tapModalEl?.remove();
  tapModalEl = document.createElement("div");
  tapModalEl.style.cssText = `
    position:absolute;background:rgba(0,0,0,0.92);color:white;padding:8px 12px;
    border-radius:8px;font-size:13px;display:flex;gap:12px;z-index:99999;
    backdrop-filter:blur(8px);border:1px solid #333;
  `;

  const replyBtn = document.createElement("button");
  replyBtn.textContent = "Reply";
  replyBtn.onclick = () => {
    currentReplyTarget = { id: msgData.id, chatId: msgData.chatId, content: msgData.content };
    refs.messageInputEl.placeholder = `Replying to ${msgData.chatId}...`;
    refs.messageInputEl.focus();
    showReplyCancelButton();
    tapModalEl.remove();
  };

  const reportBtn = document.createElement("button");
  reportBtn.textContent = "Report";
  reportBtn.onclick = () => { reportMessage(msgData); tapModalEl.remove(); };

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "X";
  closeBtn.onclick = () => tapModalEl.remove();

  tapModalEl.append(replyBtn, reportBtn, closeBtn);
  document.body.appendChild(tapModalEl);

  const rect = targetEl.getBoundingClientRect();
  tapModalEl.style.top = (rect.top + window.scrollY - 44) + "px";
  tapModalEl.style.left = (rect.left + window.scrollX) + "px";

  setTimeout(() => tapModalEl?.remove(), 4000);
}

/* ========== CHATID PROMPT ========== */
async function promptForChatID(userRef, userData) {
  return new Promise(resolve => {
    if (!refs.chatIDModal || (userData?.chatId && !userData.chatId.startsWith("GUEST"))) {
      return resolve(userData?.chatId || "Guest" + Math.floor(1000 + Math.random() * 9000));
    }

    refs.chatIDModal.style.display = "flex";
    refs.sendAreaEl && (refs.sendAreaEl.style.display = "none");
    refs.chatIDInput.value = "";
    refs.chatIDInput.focus();

    const submit = async () => {
      let name = refs.chatIDInput.value.trim();
      if (!name || name.length < 3 || name.length > 12) {
        return showStarPopup("Chat ID: 3–12 characters");
      }

      const lower = name.toLowerCase();
      const q = query(collection(db, "users"), where("chatIdLower", "==", lower));
      const snap = await getDocs(q);

      let taken = false;
      snap.forEach(d => { if (d.id !== userRef.id) taken = true; });
      if (taken) return showStarPopup("Name already taken");

      await updateDoc(userRef, { chatId: name, chatIdLower: lower });
      currentUser.chatId = name;
      refs.chatIDModal.style.display = "none";
      refs.sendAreaEl && (refs.sendAreaEl.style.display = "flex");
      showStarPopup(`Welcome ${name}!`);
      resolve(name);
    };

    refs.chatIDConfirmBtn.onclick = submit;
    refs.chatIDInput.onkeydown = e => e.key === "Enter" && submit();
  });
}

/* ========== GLOBAL EXPORTS ========== */
window.getCurrentUserId = () => currentUser?.uid || null;
window.showStarPopup = showStarPopup;
window.showGiftAlert = showGiftAlert;

/* ========== VIP LOGIN + SMOOTH AUTO-LOGIN (FINAL UID-SAFE VERSION) ========== */
async function loginWhitelist(email, password) {
  const loader = document.getElementById("postLoginLoader");
  const loadingBar = document.getElementById("loadingBar");
  let progress = 0;
  let loadingInterval = null;

  try {
    if (loader) loader.style.display = "flex";
    if (loadingBar) {
      loadingBar.style.width = "0%";
      loadingBar.style.background = "linear-gradient(90deg, #ff69b4, #ff1493)";
    }

    loadingInterval = setInterval(() => {
      if (progress < 92) {
        progress += Math.random() * 3 + 0.8;
        loadingBar.style.width = `${Math.min(progress, 92)}%`;
      }
    }, 80);

    const cred = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = cred.user;
    log("Authenticated Firebase UID:", firebaseUser.uid);

    // Whitelist check
    const whitelistSnap = await getDocs(query(collection(db, "whitelist"), where("email", "==", email)));
    if (whitelistSnap.empty) {
      await signOut(auth);
      throw new Error("Not on whitelist");
    }

    const userRef = doc(db, "users", firebaseUser.uid);
    let userSnap = await getDoc(userRef);

    // Migrate legacy email-based profile if needed
    if (!userSnap.exists()) {
      const legacyId = email.replace(/\./g, ",");
      const legacyRef = doc(db, "users", legacyId);
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists()) {
        await setDoc(userRef, { ...legacySnap.data(), uid: firebaseUser.uid, email }, { merge: true });
        log("Migrated legacy profile to UID-based");
        userSnap = await getDoc(userRef);
      } else {
        await signOut(auth);
        throw new Error("Profile not found");
      }
    }

    const data = userSnap.data();

    // Build full currentUser object
    currentUser = {
      uid: firebaseUser.uid,
      email: data.email || firebaseUser.email,
      chatId: data.chatId || "VIP",
      fullName: data.fullName || "",
      isAdmin: !!data.isAdmin,
      isVIP: !!data.isVIP,
      isHost: !!data.isHost,
      gender: data.gender || "",
      stars: Number(data.stars || 0),
      cash: Number(data.cash || 0),
      usernameColor: data.usernameColor || randomColor(),
      subscriptionActive: !!data.subscriptionActive,
      hostLink: data.hostLink || null,
      invitedBy: data.invitedBy || null
    };

    window.currentUser = currentUser;
    localStorage.setItem("vipUser", JSON.stringify({ email, password }));

    // Initialize all systems
    updateRedeemLink();
    updateTipLink();
    setupPresence(currentUser);
    attachMessagesListener();
    startStarEarning(currentUser.uid);
    showChatUI(currentUser);

    // Final loading animation
    clearInterval(loadingInterval);
    if (loadingBar) {
      const finalize = setInterval(() => {
        progress += 5;
        loadingBar.style.width = `${progress}%`;
        if (progress >= 100) {
          clearInterval(finalize);
          setTimeout(() => loader && (loader.style.display = "none"), 300);
        }
      }, 30);
    }

    showStarPopup(`Welcome back, ${currentUser.chatId}!`);
    return true;

  } catch (err) {
    error("Login failed:", err.message);
    showStarPopup(err.message.includes("wrong-password") || err.message.includes("user-not-found")
      ? "Wrong email or password"
      : err.message === "Not on whitelist" ? "Access denied — not on VIP list"
      : err.message === "Profile not found" ? "Profile missing — contact admin"
      : "Login failed");
    await signOut(auth).catch(() => {});
    return false;
  } finally {
    clearInterval(loadingInterval);
    setTimeout(() => loader && (loader.style.display = "none"), 1000);
  }
}

/* ========== AUTO STAR EARNING SYSTEM (SMOOTH + DAILY LIMIT) ========== */
function startStarEarning(uid) {
  if (!uid || starInterval) return;

  const userRef = doc(db, "users", uid);
  let displayedStars = currentUser.stars || 0;
  let animationFrame = null;

  const animateStars = (target) => {
    if (!refs.starCountEl) return;
    const diff = target - displayedStars;
    if (Math.abs(diff) < 1) {
      displayedStars = target;
      refs.starCountEl.textContent = formatNumber(displayedStars);
      return;
    }
    displayedStars += diff * 0.18;
    refs.starCountEl.textContent = formatNumber(Math.round(displayedStars));
    animationFrame = requestAnimationFrame(() => animateStars(target));
  };

  // Real-time stars sync
  onSnapshot(userRef, snap => {
    if (!snap.exists()) return;
    const stars = snap.data().stars || 0;
    currentUser.stars = stars;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animateStars(stars);
    if (stars > 0 && stars % 1000 === 0) showStarPopup(`Congrats! ${formatNumber(stars)} stars!`);
  });

  // Daily earning: 10 stars/min → max 250/day
  starInterval = setInterval(async () => {
    if (!navigator.onLine) return;
    try {
      const snap = await getDoc(userRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const today = new Date().toISOString().split("T")[0];

      if (data.lastStarDate !== today) {
        await updateDoc(userRef, { starsToday: 0, lastStarDate: today });
      }
      if ((data.starsToday || 0) < 250) {
        await updateDoc(userRef, {
          stars: increment(10),
          starsToday: increment(10)
        });
      }
    } catch (err) {
      error("Star earning tick failed:", err);
    }
  }, CONFIG.STAR_EARNING_INTERVAL_MS);

  window.addEventListener("beforeunload", () => {
    if (starInterval) clearInterval(starInterval);
    if (animationFrame) cancelAnimationFrame(animationFrame);
  });
}
