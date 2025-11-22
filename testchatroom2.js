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

/* ========== UI STATE MANAGEMENT ========== */
function showChatUI(user) {
  document.getElementById("emailAuthWrapper")?.style.setProperty("display", "none", "important");
  document.getElementById("googleSignInBtn")?.style.setProperty("display", "none", "important");
  document.getElementById("vipAccessBtn")?.style.setProperty("display", "none", "important");

  const { sendAreaEl, profileBoxEl, profileNameEl, starCountEl, cashCountEl, adminControlsEl } = refs;

  refs.authBox && (refs.authBox.style.display = "none");
  sendAreaEl && (sendAreaEl.style.display = "flex");
  profileBoxEl && (profileBoxEl.style.display = "block");

  if (profileNameEl) {
    profileNameEl.textContent = user.chatId;
    profileNameEl.style.color = user.usernameColor || "#fff";
  }
  if (starCountEl) starCountEl.textContent = formatNumber(user.stars);
  if (cashCountEl) cashCountEl.textContent = formatNumber(user.cash);
  if (adminControlsEl) adminControlsEl.style.display = user.isAdmin ? "flex" : "none";

  document.querySelectorAll(".room-desc, #roomSubtitle, #helloText").forEach(el => el.style.display = "none");
}

function hideChatUI() {
  refs.authBox && (refs.authBox.style.display = "block");
  refs.sendAreaEl && (refs.sendAreaEl.style.display = "none");
  refs.profileBoxEl && (refs.profileBoxEl.style.display = "none");
  refs.adminControlsEl && (refs.adminControlsEl.style.display = "none");
  document.querySelectorAll(".room-desc, #roomSubtitle, #helloText").forEach(el => el.style.display = "block");
}

/* ========== DOM READY + AUTO-LOGIN ========== */
document.addEventListener("DOMContentLoaded", async () => {
  // Cache all refs
  Object.assign(refs, {
    authBox: document.getElementById("authBox"),
    messagesEl: document.getElementById("messages"),
    sendAreaEl: document.getElementById("sendArea"),
    messageInputEl: document.getElementById("messageInput"),
    sendBtn: document.getElementById("sendBtn"),
    buzzBtn: document.getElementById("buzzBtn"),
    profileBoxEl: document.getElementById("profileBox"),
    profileNameEl: document.getElementById("profileName"),
    starCountEl: document.getElementById("starCount"),
    cashCountEl: document.getElementById("cashCount"),
    redeemBtn: document.getElementById("redeemBtn"),
    tipBtn: document.getElementById("tipBtn"),
    onlineCountEl: document.getElementById("onlineCount"),
    adminControlsEl: document.getElementById("adminControls"),
    chatIDModal: document.getElementById("chatIDModal"),
    chatIDInput: document.getElementById("chatIDInput"),
    chatIDConfirmBtn: document.getElementById("chatIDConfirmBtn")
  });

  if (refs.chatIDInput) refs.chatIDInput.maxLength = 12;

  // Login button
  document.getElementById("whitelistLoginBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("emailInput")?.value.trim().toLowerCase();
    const password = document.getElementById("phoneInput")?.value.trim();
    if (!email || !password) return showStarPopup("Fill email & password");
    await loginWhitelist(email, password);
  });

  // Auto-login
  const saved = JSON.parse(localStorage.getItem("vipUser") || "null");
  if (saved?.email && !currentUser?.uid) {
    log("Auto-login attempt...");
    setTimeout(() => loginWhitelist(saved.email, saved.password), 500);
  }
});

/* ========== SEND MESSAGE (Instant Echo + Offline Safe) ========== */
let localPendingMsgs = JSON.parse(localStorage.getItem("localPendingMsgs") || "{}");

function clearReplyAfterSend() {
  currentReplyTarget = null;
  refs.messageInputEl.placeholder = "Type a message...";
  refs.cancelReplyBtn?.remove();
  refs.cancelReplyBtn = null;
}

function scrollToBottom() {
  if (!refs.messagesEl) return;
  refs.messagesEl.scrollTo({ top: refs.messagesEl.scrollHeight, behavior: "smooth" });
}

// Attach send handlers
document.addEventListener("DOMContentLoaded", () => {
  refs.sendBtn?.addEventListener("click", sendMessage);
  refs.messageInputEl?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
});

async function sendMessage() {
  if (!currentUser?.uid) return showStarPopup("Sign in to chat");
  const txt = refs.messageInputEl?.value.trim();
  if (!txt) return;

  if (currentUser.stars < CONFIG.SEND_COST) {
    return showStarPopup(`Need ${CONFIG.SEND_COST} stars to send`);
  }

  try {
    // Deduct stars
    currentUser.stars -= CONFIG.SEND_COST;
    refs.starCountEl && (refs.starCountEl.textContent = formatNumber(currentUser.stars));
    await updateDoc(doc(db, "users", currentUser.uid), { stars: increment(-CONFIG.SEND_COST) });

    const tempId = "temp_" + Date.now() + Math.random();
    const tempMsg = {
      content: txt,
      uid: currentUser.uid,
      chatId: currentUser.chatId,
      timestamp: { toMillis: () => Date.now() },
      highlight: false,
      replyTo: currentReplyTarget?.id || null,
      replyToChatId: currentReplyTarget?.chatId || null,
      tempId
    };

    // Save to local pending
    localPendingMsgs[tempId] = { ...tempMsg, createdAt: Date.now() };
    localStorage.setItem("localPendingMsgs", JSON.stringify(localPendingMsgs));

    // Render instantly
    renderMessagesFromArray([{ id: tempId, data: tempMsg }]);
    refs.messageInputEl.value = "";
    clearReplyAfterSend();
    requestAnimationFrame(scrollToBottom);

    // Send to server
    const realMsg = { ...tempMsg, tempId: null, timestamp: serverTimestamp() };
    delete realMsg.toMillis;
    const msgRef = await addDoc(collection(db, CONFIG.CHAT_COLLECTION), realMsg);

    // Clean up pending
    delete localPendingMsgs[tempId];
    localStorage.setItem("localPendingMsgs", JSON.stringify(localPendingMsgs));

  } catch (err) {
    error("Send failed:", err);
    showStarPopup("Message failed — retrying...");
  }
}

/* ========== BUZZ HANDLER ========== */
refs.buzzBtn?.addEventListener("click", async () => {
  if (!currentUser?.uid) return showStarPopup("Login to BUZZ");
  const txt = refs.messageInputEl?.value.trim();
  if (!txt) return showStarPopup("Type a message to BUZZ");

  if (currentUser.stars < CONFIG.BUZZ_COST) {
    return showStarPopup(`Need ${CONFIG.BUZZ_COST} stars to BUZZ`);
  }

  try {
    await updateDoc(doc(db, "users", currentUser.uid), { stars: increment(-CONFIG.BUZZ_COST) });
    const buzzColor = randomColor();
    const buzzMsg = {
      content: txt,
      uid: currentUser.uid,
      chatId: currentUser.chatId,
      timestamp: serverTimestamp(),
      highlight: true,
      buzzColor,
      systemBanner: true
    };

    const docRef = await addDoc(collection(db, CONFIG.CHAT_COLLECTION), buzzMsg);
    refs.messageInputEl.value = "";
    showStarPopup("BUZZ sent!");
    renderMessagesFromArray([{ id: docRef.id, data: buzzMsg }]);
    scrollToBottom();

    // Visual effect
    setTimeout(() => {
      const el = document.getElementById(docRef.id);
      const content = el?.querySelector(".content") || el;
      if (content) {
        content.style.setProperty("--buzz-color", buzzColor);
        content.classList.add("buzz-highlight");
      }
    }, 100);
  } catch (err) {
    error("Buzz failed:", err);
    showStarPopup("BUZZ failed");
  }
});

/* ========== ROTATING HELLO TEXT ========== */
(() => {
  const greetings = ["HELLO","HOLA","BONJOUR","CIAO","HALLO","こんにちは","你好","안녕하세요","SALUT","OLÁ","NAMASTE","MERHABA"];
  const el = document.getElementById("helloText");
  if (!el) return;
  let i = 0;
  setInterval(() => {
    el.style.opacity = "0";
    setTimeout(() => {
      el.textContent = greetings[i++ % greetings.length];
      el.style.color = randomColor();
      el.style.opacity = "1";
    }, 300);
  }, 1800);
})();

/* ========== VIDEO PLAYER ENHANCEMENTS ========== */
(() => {
  const video = document.getElementById("videoPlayer");
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  const container = document.querySelector(".video-container");
  if (!video || !prev || !next) return;

  const videos = [
    "https://cdn.shopify.com/videos/c/o/v/aa400d8029e14264bc1ba0a47babce47.mp4",
    "https://cdn.shopify.com/videos/c/o/v/45c20ba8df2c42d89807c79609fe85ac.mp4"
  ];
  let idx = 0;

  const load = (i) => {
    idx = (i + videos.length) % videos.length;
    video.src = videos[idx];
    video.muted = true;
    video.play().catch(() => {});
  };

  prev.onclick = () => load(idx - 1);
  next.onclick = () => load(idx + 1);

  video.onclick = () => {
    video.muted = !video.muted;
    showStarPopup(video.muted ? "Muted" : "Sound on", 1000);
  };

  // Auto-hide buttons
  let hideTimer;
  const show = () => {
    [prev, next].forEach(b => {
      b.style.opacity = "1";
      b.style.pointerEvents = "auto";
    });
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      [prev, next].forEach(b => {
        b.style.opacity = "0";
        b.style.pointerEvents = "none";
      });
    }, 3000);
  };
  container.addEventListener("mousemove", show);
  container.addEventListener("click", show);
  show();
  load(0);
})();

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
        floatingStar.style.opacity = "0"; // invisible
        floatingStar.style.transform = "translate(-50%, -50%)";

        const rect = inlineStar.getBoundingClientRect();
        floatingStar.style.top = `${rect.top + rect.height / 2 + window.scrollY}px`;
        floatingStar.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;

        document.body.appendChild(floatingStar);

        // Remove immediately (optional, keeps DOM cleaner)
        setTimeout(() => floatingStar.remove(), 1);
      }
    });

    parent.removeChild(textNode);
  });
}

// Observe dynamic content including BallerAlert
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




/* ---------- DOM Elements ---------- */
const openBtn = document.getElementById("openHostsBtn");
const modal = document.getElementById("featuredHostsModal");
const closeModal = document.querySelector(".featured-close");
const videoFrame = document.getElementById("featuredHostVideo");
const usernameEl = document.getElementById("featuredHostUsername");
const detailsEl = document.getElementById("featuredHostDetails");
const hostListEl = document.getElementById("featuredHostList");
const giftBtn = document.getElementById("featuredGiftBtn");
const giftSlider = document.getElementById("giftSlider");
const giftAmountEl = document.getElementById("giftAmount");
const prevBtn = document.getElementById("prevHost");
const nextBtn = document.getElementById("nextHost");

let hosts = [];
let currentIndex = 0;


/* ---------- Fetch + Listen to featuredHosts + users merge ---------- */
async function fetchFeaturedHosts() {
  try {
    const q = collection(db, "featuredHosts");
    onSnapshot(q, async snapshot => {
      const tempHosts = [];

      for (const docSnap of snapshot.docs) {
        const hostData = { id: docSnap.id, ...docSnap.data() };
        let merged = { ...hostData };

        if (hostData.userId || hostData.chatId) {
          try {
            const userRef = doc(db, "users", hostData.userId || hostData.chatId);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              merged = { ...merged, ...userSnap.data() };
            }
          } catch (err) {
            console.warn("⚠️ Could not fetch user for host:", hostData.userId || hostData.chatId, err);
          }
        }

        tempHosts.push(merged);
      }

      hosts = tempHosts;

      if (!hosts.length) {
        console.warn("⚠️ No featured hosts found.");
        return;
      }

      console.log("✅ Loaded hosts:", hosts.length);
      renderHostAvatars();
      loadHost(currentIndex >= hosts.length ? 0 : currentIndex);
    });
  } catch (err) {
    console.error("❌ Error fetching hosts:", err);
  }
}

/* ---------- Render Avatars ---------- */
function renderHostAvatars() {
  hostListEl.innerHTML = "";
  hosts.forEach((host, idx) => {
    const img = document.createElement("img");
    img.src = host.popupPhoto || "";
    img.alt = host.chatId || "Host";
    img.classList.add("featured-avatar");
    if (idx === currentIndex) img.classList.add("active");

    img.addEventListener("click", () => {
      loadHost(idx);
    });

    hostListEl.appendChild(img);
  });
}

/* ---------- Load Host (Faster Video Loading) ---------- */
async function loadHost(idx) {
  const host = hosts[idx];
  if (!host) return;
  currentIndex = idx;

  const videoContainer = document.getElementById("featuredHostVideo");
  if (!videoContainer) return;
  videoContainer.innerHTML = "";
  videoContainer.style.position = "relative";
  videoContainer.style.touchAction = "manipulation";

  // Shimmer loader
  const shimmer = document.createElement("div");
  shimmer.className = "video-shimmer";
  videoContainer.appendChild(shimmer);

  // Video element
  const videoEl = document.createElement("video");
  Object.assign(videoEl, {
    src: host.videoUrl || "",
    autoplay: true,
    muted: true,
    loop: true,
    playsInline: true,
    preload: "auto", // preload more data
    style: "width:100%;height:100%;object-fit:cover;border-radius:8px;display:none;cursor:pointer;"
  });
  videoEl.setAttribute("webkit-playsinline", "true");
  videoContainer.appendChild(videoEl);

  // Force video to start loading immediately
  videoEl.load();

  // Hint overlay
  const hint = document.createElement("div");
  hint.className = "video-hint";
  hint.textContent = "Tap to unmute";
  videoContainer.appendChild(hint);

  function showHint(msg, timeout = 1400) {
    hint.textContent = msg;
    hint.classList.add("show");
    clearTimeout(hint._t);
    hint._t = setTimeout(() => hint.classList.remove("show"), timeout);
  }

  let lastTap = 0;
  function onTapEvent() {
    const now = Date.now();
    if (now - lastTap < 300) {
      document.fullscreenElement ? document.exitFullscreen?.() : videoEl.requestFullscreen?.();
    } else {
      videoEl.muted = !videoEl.muted;
      showHint(videoEl.muted ? "Tap to unmute" : "Sound on", 1200);
    }
    lastTap = now;
  }
  videoEl.addEventListener("click", onTapEvent);
  videoEl.addEventListener("touchend", (ev) => {
    if (ev.changedTouches.length < 2) {
      ev.preventDefault?.();
      onTapEvent();
    }
  }, { passive: false });

  // Show video as soon as it can play
  videoEl.addEventListener("canplay", () => {
    shimmer.style.display = "none";
    videoEl.style.display = "block";
    showHint("Tap to unmute", 1400);
    videoEl.play().catch(() => {});
  });

/* ---------- Host Info ---------- */
usernameEl.textContent = (host.chatId || "Unknown Host")
  .toLowerCase()
  .replace(/\b\w/g, char => char.toUpperCase());

const gender = (host.gender || "person").toLowerCase();
const pronoun = gender === "male" ? "his" : "her";
const ageGroup = !host.age ? "20s" : host.age >= 30 ? "30s" : "20s";
const flair = gender === "male" ? "😎" : "💋";
const fruit = host.fruitPick || "🍇";
const nature = host.naturePick || "cool";
const city = host.location || "Lagos";
const country = host.country || "Nigeria";

detailsEl.innerHTML = `A ${fruit} ${nature} ${gender} in ${pronoun} ${ageGroup}, currently in ${city}, ${country}. ${flair}`;

// Typewriter bio
if (host.bioPick) {
  const bioText = host.bioPick.length > 160 ? host.bioPick.slice(0, 160) + "…" : host.bioPick;

  // Create a container for bio
  const bioEl = document.createElement("div");
  bioEl.style.marginTop = "6px";
  bioEl.style.fontWeight = "600";  // little bold
  bioEl.style.fontSize = "0.95em";
  bioEl.style.whiteSpace = "pre-wrap"; // keep formatting

  // Pick a random bright color
  const brightColors = ["#FF3B3B", "#FF9500", "#FFEA00", "#00FFAB", "#00D1FF", "#FF00FF", "#FF69B4"];
  bioEl.style.color = brightColors[Math.floor(Math.random() * brightColors.length)];

  detailsEl.appendChild(bioEl);

  // Typewriter effect
  let index = 0;
  function typeWriter() {
    if (index < bioText.length) {
      bioEl.textContent += bioText[index];
      index++;
      setTimeout(typeWriter, 40); // typing speed (ms)
    }
  }
  typeWriter();
}
/* ---------- Meet Button ---------- */
let meetBtn = document.getElementById("meetBtn");
if (!meetBtn) {
  meetBtn = document.createElement("button");
  meetBtn.id = "meetBtn";
  meetBtn.textContent = "Meet";
  Object.assign(meetBtn.style, {
    marginTop: "6px",
    padding: "8px 16px",
    borderRadius: "6px",
    background: "linear-gradient(90deg,#ff0099,#ff6600)",
    color: "#fff",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer"
  });
  detailsEl.insertAdjacentElement("afterend", meetBtn);
}
meetBtn.onclick = () => showMeetModal(host);

/* ---------- Avatar Highlight ---------- */
hostListEl.querySelectorAll("img").forEach((img, i) => {
  img.classList.toggle("active", i === idx);
});

giftSlider.value = 1;
giftAmountEl.textContent = "1";
}

/* ---------- Meet Modal with WhatsApp / Social / No-Meet Flow ---------- */
function showMeetModal(host) {
  let modal = document.getElementById("meetModal");
  if (modal) modal.remove();

  modal = document.createElement("div");
  modal.id = "meetModal";
  Object.assign(modal.style, {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "999999",
    backdropFilter: "blur(3px)",
    WebkitBackdropFilter: "blur(3px)"
  });

  modal.innerHTML = `
    <div id="meetModalContent" style="background:#111;padding:20px 22px;border-radius:12px;text-align:center;color:#fff;max-width:340px;box-shadow:0 0 20px rgba(0,0,0,0.5);">
      <h3 style="margin-bottom:10px;font-weight:600;">Meet ${host.chatId || "this host"}?</h3>
      <p style="margin-bottom:16px;">Request meet with <b>21 stars ⭐</b>?</p>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button id="cancelMeet" style="padding:8px 16px;background:#333;border:none;color:#fff;border-radius:8px;font-weight:500;">Cancel</button>
        <button id="confirmMeet" style="padding:8px 16px;background:linear-gradient(90deg,#ff0099,#ff6600);border:none;color:#fff;border-radius:8px;font-weight:600;">Yes</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const cancelBtn = modal.querySelector("#cancelMeet");
  const confirmBtn = modal.querySelector("#confirmMeet");
  const modalContent = modal.querySelector("#meetModalContent");

  cancelBtn.onclick = () => modal.remove();

  confirmBtn.onclick = async () => {
    const COST = 21;

      if (!currentUser?.uid) {
    showGiftAlert("⚠️ Please log in to request meets");
    modal.remove();
    return;
  }

  if ((currentUser.stars || 0) < COST) {
    showGiftAlert("⚠️ Uh oh, not enough stars ⭐");
    modal.remove();
    return;
  }


    confirmBtn.disabled = true;
    confirmBtn.style.opacity = 0.6;
    confirmBtn.style.cursor = "not-allowed";

    try {
      currentUser.stars -= COST;
      if (refs?.starCountEl) refs.starCountEl.textContent = formatNumberWithCommas(currentUser.stars);
      updateDoc(doc(db, "users", currentUser.uid), { stars: increment(-COST) }).catch(console.error);

      if (host.whatsapp) {
        // WhatsApp meet flow with staged messages
        const fixedStages = ["Handling your meet request…", "Collecting host’s identity…"];
        const playfulMessages = [
          "Oh, she’s hella cute…💋", "Careful, she may be naughty..😏",
          "Be generous with her, she’ll like you..", "Ohh, she’s a real star.. 🤩",
          "Be a real gentleman, when she texts u..", "She’s ready to dazzle you tonight.. ✨",
          "Watch out, she might steal your heart.. ❤️", "Look sharp, she’s got a sparkle.. ✨",
          "Don’t blink, or you’ll miss her charm.. 😉", "Get ready for some fun surprises.. 😏",
          "She knows how to keep it exciting.. 🎉", "Better behave, she’s watching.. 👀",
          "She might just blow your mind.. 💥", "Keep calm, she’s worth it.. 😘",
          "She’s got a twinkle in her eyes.. ✨", "Brace yourself for some charm.. 😎",
          "She’s not just cute, she’s 🔥", "Careful, her smile is contagious.. 😁",
          "She might make you blush.. 😳", "She’s a star in every way.. 🌟",
          "Don’t miss this chance.. ⏳"
        ];

        const randomPlayful = [];
        while (randomPlayful.length < 3) {
          const choice = playfulMessages[Math.floor(Math.random() * playfulMessages.length)];
          if (!randomPlayful.includes(choice)) randomPlayful.push(choice);
        }

        const stages = [...fixedStages, ...randomPlayful, "Generating secure token…"];
        modalContent.innerHTML = `<p id="stageMsg" style="margin-top:20px;font-weight:500;"></p>`;
        const stageMsgEl = modalContent.querySelector("#stageMsg");

        let totalTime = 0;
        stages.forEach((stage, index) => {
          let duration = (index < 2) ? 1500 + Math.random() * 1000
                        : (index < stages.length - 1) ? 1700 + Math.random() * 600
                        : 2000 + Math.random() * 500;
          totalTime += duration;

          setTimeout(() => {
            stageMsgEl.textContent = stage;
            if (index === stages.length - 1) {
              setTimeout(() => {
                modalContent.innerHTML = `
                  <h3 style="margin-bottom:10px;font-weight:600;">Meet Request Sent!</h3>
                  <p style="margin-bottom:16px;">Your request to meet <b>${host.chatId}</b> is approved.</p>
                  <button id="letsGoBtn" style="margin-top:6px;padding:10px 18px;border:none;border-radius:8px;font-weight:600;background:linear-gradient(90deg,#ff0099,#ff6600);color:#fff;cursor:pointer;">Send Message</button>
                `;
                const letsGoBtn = modalContent.querySelector("#letsGoBtn");
                letsGoBtn.onclick = () => {
                  const countryCodes = { Nigeria: "+234", Ghana: "+233", "United States": "+1", "United Kingdom": "+44", "South Africa": "+27" };
                  const hostCountry = host.country || "Nigeria";
                  let waNumber = host.whatsapp.trim();
                  if (waNumber.startsWith("0")) waNumber = waNumber.slice(1);
                  waNumber = countryCodes[hostCountry] + waNumber;
                  const firstName = currentUser.fullName.split(" ")[0];
                  const msg = `Hey! ${host.chatId}, my name’s ${firstName} (VIP on xixi live) & I’d like to meet you.`;
                  window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`, "_blank");
                  modal.remove();
                };
                setTimeout(() => modal.remove(), 7000 + Math.random() * 500);
              }, 500);
            }
          }, totalTime);
        });
      } else {
        // No WhatsApp → check social links or fallback
        showSocialRedirectModal(modalContent, host);
      }

    } catch (err) {
      console.error("Meet deduction failed:", err);
      alert("Something went wrong. Please try again later.");
      modal.remove();
    }
  };
}

/* ---------- Social / No-Meet Fallback Modal ---------- */
function showSocialRedirectModal(modalContent, host) {
  const socialUrl = host.tiktok || host.instagram || "";
  const socialName = host.tiktok ? "TikTok" : host.instagram ? "Instagram" : "";
  const hostName = host.chatId || "This host";

  if (socialUrl) {
    modalContent.innerHTML = `
      <h3 style="margin-bottom:10px;font-weight:600;">Meet ${hostName}?</h3>
      <p style="margin-bottom:16px;">${hostName} isn’t meeting new people via WhatsApp yet.</p>
      <p style="margin-bottom:16px;">Check her out on <b>${socialName}</b> instead?</p>
      <button id="goSocialBtn" style="padding:8px 16px;background:linear-gradient(90deg,#ff0099,#ff6600);border:none;color:#fff;border-radius:8px;font-weight:600;">Go</button>
      <button id="cancelMeet" style="margin-top:10px;padding:8px 16px;background:#333;border:none;color:#fff;border-radius:8px;font-weight:500;">Close</button>
    `;
    modalContent.querySelector("#goSocialBtn").onclick = () => { 
      window.open(socialUrl, "_blank"); 
      modalContent.parentElement.remove(); 
    };
    modalContent.querySelector("#cancelMeet").onclick = () => modalContent.parentElement.remove();
  } else {
    modalContent.innerHTML = `
      <h3 style="margin-bottom:10px;font-weight:600;">Meet ${hostName}?</h3>
      <p style="margin-bottom:16px;">${hostName} isn’t meeting new people yet. Please check back later!</p>
      <button id="cancelMeet" style="padding:8px 16px;background:#333;border:none;color:#fff;border-radius:8px;font-weight:500;">Close</button>
    `;
    modalContent.querySelector("#cancelMeet").onclick = () => modalContent.parentElement.remove();
  }
}

/* ---------- Gift Slider ---------- */
const fieryColors = [
  ["#ff0000", "#ff8c00"], // red to orange
  ["#ff4500", "#ffd700"], // orange to gold
  ["#ff1493", "#ff6347"], // pinkish red
  ["#ff0055", "#ff7a00"], // magenta to orange
  ["#ff5500", "#ffcc00"], // deep orange to yellow
  ["#ff3300", "#ff0066"], // neon red to hot pink
];

// Generate a random fiery gradient
function randomFieryGradient() {
  const [c1, c2] = fieryColors[Math.floor(Math.random() * fieryColors.length)];
  return `linear-gradient(90deg, ${c1}, ${c2})`;
}

/* ---------- Gift Slider ---------- */
giftSlider.addEventListener("input", () => {
  giftAmountEl.textContent = giftSlider.value;
  giftSlider.style.background = randomFieryGradient(); // change fiery color as it slides
});

/*
=========================================
🚫 COMMENTED OUT: Duplicate modal opener
=========================================
openBtn.addEventListener("click", () => {
  modal.style.display = "flex";
  modal.style.justifyContent = "center";
  modal.style.alignItems = "center";

  // Give it a fiery flash on open
  giftSlider.style.background = randomFieryGradient();
  console.log("📺 Modal opened");
});
*/


/* ===============================
   🎁 Send Gift + Dual Notification
================================= */

async function sendGift() {
  const receiver = hosts[currentIndex];
  if (!receiver?.id) return showGiftAlert("⚠️ No host selected.");
  if (!currentUser?.uid) return showGiftAlert("Please log in to send stars ⭐");

  const giftStars = parseInt(giftSlider.value, 10);
  if (isNaN(giftStars) || giftStars <= 0)
    return showGiftAlert("Invalid star amount ❌");

  const originalText = giftBtn.textContent;
  const buttonWidth = giftBtn.offsetWidth + "px";
  giftBtn.style.width = buttonWidth;
  giftBtn.disabled = true;
  giftBtn.innerHTML = `<span class="gift-spinner"></span>`;

  try {
    const senderRef = doc(db, "users", currentUser.uid);
    const receiverRef = doc(db, "users", receiver.id);
    const featuredReceiverRef = doc(db, "featuredHosts", receiver.id);

    await runTransaction(db, async (tx) => {
      const senderSnap = await tx.get(senderRef);
      const receiverSnap = await tx.get(receiverRef);

      if (!senderSnap.exists()) throw new Error("Your user record not found.");
      if (!receiverSnap.exists())
        tx.set(receiverRef, { stars: 0, starsGifted: 0, lastGiftSeen: {} }, { merge: true });

      const senderData = senderSnap.data();
      if ((senderData.stars || 0) < giftStars)
        throw new Error("Insufficient stars");

      tx.update(senderRef, { stars: increment(-giftStars), starsGifted: increment(giftStars) });
      tx.update(receiverRef, { stars: increment(giftStars) });
      tx.set(featuredReceiverRef, { stars: increment(giftStars) }, { merge: true });

      tx.update(receiverRef, {
        [`lastGiftSeen.${currentUser.username || "Someone"}`]: giftStars
      });
    });

    // ✅ Notify both sender and receiver
    const senderName = currentUser.username || "Someone";
    const receiverName = receiver.chatId || "User";

    await Promise.all([
      pushNotification(receiver.id, `🎁 ${senderName} sent you ${giftStars} stars ⭐`),
      pushNotification(currentUser.uid, `💫 You sent ${giftStars} stars ⭐ to ${receiverName}`)
    ]);

    showGiftAlert(`✅ You sent ${giftStars} stars ⭐ to ${receiverName}!`);

    if (currentUser.uid === receiver.id) {
      setTimeout(() => {
        showGiftAlert(`🎁 ${senderName} sent you ${giftStars} stars ⭐`);
      }, 1000);
    }

    console.log(`✅ Sent ${giftStars} stars ⭐ to ${receiverName}`);
  } catch (err) {
    console.error("❌ Gift sending failed:", err);
    showGiftAlert(`⚠️ Something went wrong: ${err.message}`);
  } finally {
    giftBtn.innerHTML = originalText;
    giftBtn.disabled = false;
    giftBtn.style.width = "auto";
  }
}

/* ---------- Assign gift button click ---------- */
giftBtn.onclick = sendGift;

/* ---------- Navigation ---------- */
prevBtn.addEventListener("click", e => {
  e.preventDefault();
  loadHost((currentIndex - 1 + hosts.length) % hosts.length);
});

nextBtn.addEventListener("click", e => {
  e.preventDefault();
  loadHost((currentIndex + 1) % hosts.length);
});

/* ---------- Safe Star Hosts Modal Open ---------- */
openBtn.addEventListener("click", () => {
  if (!hosts.length) {
    showGiftAlert("⚠️ No featured hosts available yet!");
    return;
  }

  // Load the current host safely
  loadHost(currentIndex);

  // Show modal centered
  modal.style.display = "flex";
  modal.style.justifyContent = "center";
  modal.style.alignItems = "center";

  // Optional: fiery gradient for gift slider
  if (giftSlider) {
    giftSlider.style.background = randomFieryGradient();
  }

  console.log("📺 Modal opened");
});

/* ---------- Close modal logic ---------- */
closeModal.addEventListener("click", () => {
  modal.style.display = "none";
  console.log("❎ Modal closed");
});

// Click outside modal closes it
window.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.style.display = "none";
    console.log("🪟 Modal dismissed");
  }
});

/* ---------- Init ---------- */
fetchFeaturedHosts();


// --- ✅ Prevent redeclaration across reloads ---
if (!window.verifyHandlersInitialized) {
  window.verifyHandlersInitialized = true;

  // ---------- ✨ SIMPLE GOLD MODAL ALERT ----------
  window.showGoldAlert = function (message, duration = 3000) {
    const existing = document.getElementById("goldAlert");
    if (existing) existing.remove();

    const alertEl = document.createElement("div");
    alertEl.id = "goldAlert";
    Object.assign(alertEl.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      background: "linear-gradient(90deg, #ffcc00, #ff9900)",
      color: "#111",
      padding: "12px 30px", // increased padding for one-liner
      borderRadius: "10px",
      fontWeight: "600",
      fontSize: "14px",
      zIndex: "999999",
      boxShadow: "0 0 12px rgba(255, 215, 0, 0.5)",
      whiteSpace: "nowrap",
      animation: "slideFade 0.4s ease-out",
    });
    alertEl.innerHTML = message;

    const style = document.createElement("style");
    style.textContent = `
      @keyframes slideFade {
        from {opacity: 0; transform: translate(-50%, -60%);}
        to {opacity: 1; transform: translate(-50%, -50%);}
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(alertEl);
    setTimeout(() => alertEl.remove(), duration);
  };

  // ---------- PHONE NORMALIZER (for backend matching) ----------
  function normalizePhone(number) {
    return number.replace(/\D/g, "").slice(-10); // last 10 digits
  }

  // ---------- CLICK HANDLER ----------
  document.addEventListener("click", (e) => {
    if (e.target.id === "verifyNumberBtn") {
      const input = document.getElementById("verifyNumberInput");
      const numberRaw = input?.value.trim();
      const COST = 21;

      if (!currentUser?.uid) return showGoldAlert("⚠️ Please log in first.");
      if (!numberRaw) return showGoldAlert("⚠️ Please enter a phone number.");

      showConfirmModal(numberRaw, COST);
    }
  });

  // ---------- CONFIRM MODAL ----------
  window.showConfirmModal = function (number, cost = 21) {
    let modal = document.getElementById("verifyConfirmModal");
    if (modal) modal.remove();

    modal = document.createElement("div");
    modal.id = "verifyConfirmModal";
    Object.assign(modal.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      background: "rgba(0,0,0,0.7)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "999999",
      backdropFilter: "blur(2px)",
    });

    modal.innerHTML = `
      <div style="background:#111;padding:16px 18px;border-radius:10px;text-align:center;color:#fff;max-width:280px;box-shadow:0 0 12px rgba(0,0,0,0.5);">
        <h3 style="margin-bottom:10px;font-weight:600;">Verification</h3>
        <p>Scan phone number <b>${number}</b> for <b>${cost} stars ⭐</b>?</p>
        <div style="display:flex;justify-content:center;gap:10px;margin-top:12px;">
          <button id="cancelVerify" style="padding:6px 12px;border:none;border-radius:6px;background:#333;color:#fff;font-weight:600;cursor:pointer;">Cancel</button>
          <button id="confirmVerify" style="padding:6px 12px;border:none;border-radius:6px;background:linear-gradient(90deg,#ff0099,#ff6600);color:#fff;font-weight:600;cursor:pointer;">Yes</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const cancelBtn = modal.querySelector("#cancelVerify");
    const confirmBtn = modal.querySelector("#confirmVerify");

    cancelBtn.onclick = () => modal.remove();

confirmBtn.onclick = async () => {
  if (!currentUser?.uid) {
    showGoldAlert("⚠️ Please log in first");
    modal.remove();
    return;
  }

  if ((currentUser.stars || 0) < cost) {
    showGoldAlert("⚠️ Not enough stars ⭐");
    modal.remove();
    return;
  }

      confirmBtn.disabled = true;
      confirmBtn.style.opacity = 0.6;
      confirmBtn.style.cursor = "not-allowed";

      try {
        // Deduct stars
        await updateDoc(doc(db, "users", currentUser.uid), { stars: increment(-cost) });
        currentUser.stars -= cost;
        if (refs?.starCountEl) refs.starCountEl.textContent = formatNumberWithCommas(currentUser.stars);

        // Run verification
        await runNumberVerification(number);
        modal.remove();
      } catch (err) {
        console.error(err);
        showGoldAlert("❌ Verification failed, please retry!");
        modal.remove();
      }
    };
  };

  // ---------- RUN VERIFICATION ----------
  async function runNumberVerification(number) {
    try {
      const lastDigits = normalizePhone(number);

      const usersRef = collection(db, "users");
      const qSnap = await getDocs(usersRef);

      let verifiedUser = null;
      qSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.phone) {
          const storedDigits = normalizePhone(data.phone);
          if (storedDigits === lastDigits) verifiedUser = data;
        }
      });

      showVerificationModal(verifiedUser, number);
    } catch (err) {
      console.error(err);
      showGoldAlert("❌ Verification failed, please retry!");
    }
  }

  // ---------- VERIFICATION MODAL ----------
  function showVerificationModal(user, inputNumber) {
    let modal = document.getElementById("verifyModal");
    if (modal) modal.remove();

    modal = document.createElement("div");
    modal.id = "verifyModal";
    Object.assign(modal.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      background: "rgba(0,0,0,0.75)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "999999",
      backdropFilter: "blur(2px)",
    });

    modal.innerHTML = `
      <div id="verifyModalContent" style="background:#111;padding:14px 16px;border-radius:10px;text-align:center;color:#fff;max-width:320px;box-shadow:0 0 12px rgba(0,0,0,0.5);">
        <p id="stageMsg" style="margin-top:12px;font-weight:500;"></p>
      </div>
    `;
    document.body.appendChild(modal);

    const modalContent = modal.querySelector("#verifyModalContent");
    const stageMsgEl = modalContent.querySelector("#stageMsg");

    // fixed + random stages
    const fixedStages = ["Gathering information…", "Checking phone number validity…"];
    const playfulMessages = [
      "Always meet in public spaces for the first time..",
      "Known hotels are safer for meetups 😉",
      "Condoms should be in the conversation always..",
      "Trust your instincts, always..",
      "Keep things fun and safe 😎",
      "Be polite and confident when messaging..",
      "Avoid sharing sensitive info too soon..",
      "Remember, first impressions last ✨",
      "Don’t rush, enjoy the conversation..",
      "Check for verified accounts before proceeding..",
      "Safety first, fun second 😏",
      "Listen carefully to their plans..",
      "Pick neutral locations for first meets..",
      "Be respectful and courteous..",
      "Share your location with a friend..",
      "Always verify identity before meeting..",
      "Plan ahead, stay alert 👀",
      "Keep communication clear and honest..",
      "Bring a friend if unsure..",
      "Set boundaries clearly..",
      "Have fun, but stay safe!"
    ];
    const randomPlayful = [];
    while (randomPlayful.length < 5) {
      const choice = playfulMessages[Math.floor(Math.random() * playfulMessages.length)];
      if (!randomPlayful.includes(choice)) randomPlayful.push(choice);
    }
    const stages = [...fixedStages, ...randomPlayful, "Finalizing check…"];

    let totalTime = 0;
    stages.forEach((stage, index) => {
      let duration = 1400 + Math.random() * 600;
      totalTime += duration;

      setTimeout(() => {
        stageMsgEl.textContent = stage;

        if (index === stages.length - 1) {
          setTimeout(() => {
            modalContent.innerHTML = user
              ? `<h3>Number Verified! ✅</h3>
                 <p>This number belongs to <b>${user.fullName}</b></p>
                 <p style="margin-top:8px; font-size:13px; color:#ccc;">You’re free to chat — they’re legit 😌</p>
                 <button id="closeVerifyModal" style="margin-top:12px;padding:6px 14px;border:none;border-radius:8px;background:linear-gradient(90deg,#ff0099,#ff6600);color:#fff;font-weight:600;cursor:pointer;">Close</button>`
              : `<h3>Number Not Verified! ❌</h3>
                 <p>The number <b>${inputNumber}</b> does not exist on verified records — be careful!</p>
                 <button id="closeVerifyModal" style="margin-top:12px;padding:6px 14px;border:none;border-radius:8px;background:linear-gradient(90deg,#ff0099,#ff6600);color:#fff;font-weight:600;cursor:pointer;">Close</button>`;

            modal.querySelector("#closeVerifyModal").onclick = () => modal.remove();

            if (user) setTimeout(() => modal.remove(), 8000 + Math.random() * 1000);
          }, 500);
        }
      }, totalTime);
    });
  }
}

// ================================
// 💰 $ell Content (Highlight Upload)
// ================================
document.getElementById("uploadHighlightBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("highlightUploadStatus");
  statusEl.textContent = "";
  // 🧍 Wait until user is confirmed
  if (!currentUser) {
    statusEl.textContent = "⚠️ Please sign in first!";
    console.warn("❌ Upload blocked — no currentUser found");
    return;
  }
  // 🧾 Get field values
  const videoUrl = document.getElementById("highlightVideoInput").value.trim();
  const title = document.getElementById("highlightTitleInput").value.trim();
  const desc = document.getElementById("highlightDescInput").value.trim();
  const price = parseInt(document.getElementById("highlightPriceInput").value.trim() || "0");
  if (!videoUrl || !title || !price) {
    statusEl.textContent = "⚠️ Fill in all required fields (URL, title, price)";
    return;
  }
  try {
    const userId = currentUser.uid;
    const emailId = (currentUser.email || "").replace(/./g, ",");
    const chatId = currentUser.chatId || currentUser.displayName || "Anonymous";
    statusEl.textContent = "⏳ Uploading highlight...";
    // ✅ Direct upload without thumbnail generation
    const docRef = await addDoc(collection(db, "highlightVideos"), {
      uploaderId: userId,
      uploaderEmail: emailId,
      uploaderName: chatId,
      highlightVideo: videoUrl,
      highlightVideoPrice: price,
      title,
      description: desc || "",
      createdAt: serverTimestamp(),
    });
    console.log("✅ Uploaded highlight:", docRef.id);
    statusEl.textContent = "✅ Highlight uploaded successfully!";
    setTimeout(() => (statusEl.textContent = ""), 4000);
    // 🧹 Reset form
    document.getElementById("highlightVideoInput").value = "";
    document.getElementById("highlightTitleInput").value = "";
    document.getElementById("highlightDescInput").value = "";
    document.getElementById("highlightPriceInput").value = "";
  } catch (err) {
    console.error("❌ Error uploading highlight:", err);
    statusEl.textContent = "⚠️ Failed to upload. Try again.";
  }
});




  // --- Initial random values for first load ---
(function() {
  const onlineCountEl = document.getElementById('onlineCount');
  const storageKey = 'lastOnlineCount';
  
  // Helper: format number as K if > 999
  function formatCount(n) {
    if(n >= 1000) return (n/1000).toFixed(n%1000===0?0:1) + 'K';
    return n;
  }
  
  // Function to get a random starting value
  function getRandomStart() {
    const options = [100, 105, 405, 455, 364, 224];
    return options[Math.floor(Math.random() * options.length)];
  }
  
  
  // Initialize count from storage or random
  let count = parseInt(localStorage.getItem(storageKey)) || getRandomStart();
  onlineCountEl.textContent = formatCount(count);
  
  // Increment pattern
  const increments = [5,3,4,1];
  let idx = 0;

  // Random threshold to start decreasing (2K–5K)
  let decreaseThreshold = 2000 + Math.floor(Math.random()*3000); 
  
  setInterval(() => {
    if(count < 5000) {
      // Occasionally spike
      if(Math.random() < 0.05) {
        count += Math.floor(Math.random()*500); 
      } else {
        count += increments[idx % increments.length];
      }
      if(count > 5000) count = 5000;
      idx++;
    }
    onlineCountEl.textContent = formatCount(count);
    localStorage.setItem(storageKey, count);
    
    // Reset threshold occasionally
    if(count >= decreaseThreshold) {
      decreaseThreshold = 2000 + Math.floor(Math.random()*3000);
    }
    
  }, 4000);

  // Slow decrease every 30s if above threshold
  setInterval(() => {
    if(count > decreaseThreshold) {
      count -= 10;
      if(count < 500) count = 500;
      onlineCountEl.textContent = formatCount(count);
      localStorage.setItem(storageKey, count);
    }
  }, 30000);
})();



document.addEventListener("DOMContentLoaded", () => {


/* ======================================================
  Social Card + Gift Stars System — Firestore + Chat Banner
  Paste AFTER Firebase/Firestore initialized
====================================================== */(async function initSocialCardSystem() {
  const allUsers = [];
  const usersByChatId = {};

  try {
    const usersRef = collection(db, "users");
    const snaps = await getDocs(usersRef);
    snaps.forEach(docSnap => {
      const data = docSnap.data();
      const chatIdLower = (data.chatIdLower || (data.chatId || "")).toLowerCase();
      data._docId = docSnap.id;
      data.chatIdLower = chatIdLower;
      allUsers.push(data);
      usersByChatId[chatIdLower] = data;
    });
    console.log('Social card: loaded', allUsers.length, 'users');
  } catch (err) {
    console.error("Failed to fetch users for social card:", err);
  }

  function showSocialCard(user) {
    if (!user) return;

    // Remove existing
    document.getElementById('socialCard')?.remove();

    const card = document.createElement('div');
    card.id = 'socialCard';
    Object.assign(card.style, {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  background: 'linear-gradient(135deg, rgba(20,20,22,0.9), rgba(25,25,27,0.9))',
  backdropFilter: 'blur(10px)',
  borderRadius: '14px',
  padding: '12px 16px',
  color: '#fff',
  width: '230px',
  maxWidth: '90%',
  zIndex: '999999',
  textAlign: 'center',
  boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
  fontFamily: 'Poppins, sans-serif',
  opacity: '0',
  transition: 'opacity .18s ease, transform .18s ease'
});

// --- Small Close (×) Button ---
const closeBtn = document.createElement('div');
closeBtn.innerHTML = '&times;'; // × symbol
Object.assign(closeBtn.style, {
  position: 'absolute',
  top: '6px',
  right: '10px',
  fontSize: '16px',
  fontWeight: '700',
  color: '#fff',
  cursor: 'pointer',
  opacity: '0.6',
  transition: 'opacity 0.2s ease'
});
closeBtn.onmouseenter = () => closeBtn.style.opacity = '1';
closeBtn.onmouseleave = () => closeBtn.style.opacity = '0.6';
closeBtn.onclick = (e) => {
  e.stopPropagation(); // prevent triggering outside-close
  card.remove();
};
card.appendChild(closeBtn);

    // --- Header ---
    const chatIdDisplay = user.chatId ? user.chatId.charAt(0).toUpperCase() + user.chatId.slice(1) : 'Unknown';
    const color = user.isHost ? '#ff6600' : user.isVIP ? '#ff0099' : '#cccccc';
    const header = document.createElement('h3');
    header.textContent = chatIdDisplay;
    Object.assign(header.style, {
      margin: '0 0 8px',
      fontSize: '18px',
      fontWeight: '700',
      background: `linear-gradient(90deg, ${color}, #ff33cc)`,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent'
    });
    card.appendChild(header);

// --- Details ---
const detailsEl = document.createElement('p');
Object.assign(detailsEl.style, {
  margin: '0 0 10px',
  fontSize: '14px',
  lineHeight: '1.4'
});

const gender = (user.gender || "person").toLowerCase();
const pronoun = gender === "male" ? "his" : "her";
const ageGroup = !user.age ? "20s" : user.age >= 30 ? "30s" : "20s";
const flair = gender === "male" ? "😎" : "💋";
const fruit = user.fruitPick || "🍇";
const nature = user.naturePick || "cool";
const city = user.location || user.city || "Lagos";
const country = user.country || "Nigeria";

if (user.isHost) {
  detailsEl.innerHTML = `A ${fruit} ${nature} ${gender} in ${pronoun} ${ageGroup}, currently in ${city}, ${country}. ${flair}`;
} else if (user.isVIP) {
  detailsEl.innerHTML = `A ${gender} in ${pronoun} ${ageGroup}, currently in ${city}, ${country}. ${flair}`;
} else {
  detailsEl.innerHTML = `A ${gender} from ${city}, ${country}. ${flair}`;
}
card.appendChild(detailsEl);

// --- Bio ---
const bioEl = document.createElement('div');
Object.assign(bioEl.style, {
  margin: '6px 0 12px',
  fontStyle: 'italic',
  fontWeight: '600', // 🔥 makes it bolder
  fontSize: '13px',
  transition: 'color 0.5s ease'
});

// 🎨 Random color generator
function randomBioColor() {
  const colors = [
    '#ff99cc', '#ffcc33', '#66ff99',
    '#66ccff', '#ff6699', '#ff9966',
    '#ccccff', '#f8b500'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Apply random color each time
bioEl.style.color = randomBioColor();

card.appendChild(bioEl);
typeWriterEffect(bioEl, user.bioPick || '✨ Nothing shared yet...');

// --- Buttons wrapper ---
const btnWrap = document.createElement('div');
Object.assign(btnWrap.style, {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  alignItems: 'center',
  marginTop: '4px'
});

// Meet button (hosts only)
if (user.isHost) {
  const meetBtn = document.createElement('button');
  meetBtn.textContent = 'Meet';
  Object.assign(meetBtn.style, {
    padding: '7px 14px',
    borderRadius: '6px',
    border: 'none',
    fontWeight: '600',
    background: 'linear-gradient(90deg,#ff6600,#ff0099)',
    color: '#fff',
    cursor: 'pointer'
  });
  meetBtn.onclick = () => { if (typeof showMeetModal === 'function') showMeetModal(user); };
  btnWrap.appendChild(meetBtn);
}

// --- Glass Slider Panel (Fiery Compact, Centered Thumb) ---
const sliderPanel = document.createElement('div');
Object.assign(sliderPanel.style, {
  width: '100%',
  padding: '6px 8px',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  justifyContent: 'space-between'
});

// --- Fiery color palette ---
const fieryColors = [
  ["#ff0000", "#ff8c00"], // red to orange
  ["#ff4500", "#ffd700"], // orange to gold
  ["#ff1493", "#ff6347"], // pinkish red
  ["#ff0055", "#ff7a00"], // magenta to orange
  ["#ff5500", "#ffcc00"], // deep orange to yellow
  ["#ff3300", "#ff0066"], // neon red to hot pink
];

// --- Random fiery gradient ---
function randomFieryGradient() {
  const [c1, c2] = fieryColors[Math.floor(Math.random() * fieryColors.length)];
  return `linear-gradient(90deg, ${c1}, ${c2})`;
}

// --- Slider ---
const slider = document.createElement('input');
slider.type = 'range';
slider.min = 0;
slider.max = 999;
slider.value = 0;
slider.style.flex = '1';
slider.style.height = '4px';
slider.style.borderRadius = '4px';
slider.style.outline = 'none';
slider.style.cursor = 'pointer';
slider.style.appearance = 'none'; // important
slider.style.background = randomFieryGradient();
slider.style.transition = 'background 0.25s ease';

// --- Create CSS for pseudo elements dynamically ---
const style = document.createElement('style');
style.textContent = `
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 8px rgba(255, 120, 0, 0.8);
    cursor: pointer;
    margin-top: -5px; /* ✅ centers the thumb vertically */
  }
  input[type="range"]::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 4px;
    background: ${randomFieryGradient()};
  }
`;
document.head.appendChild(style);

const sliderLabel = document.createElement('span');
sliderLabel.textContent = `${slider.value} ⭐️`;
sliderLabel.style.fontSize = '13px';
sliderPanel.appendChild(slider);
sliderPanel.appendChild(sliderLabel);

// --- Dynamic fiery gradient as slider moves ---
slider.addEventListener('input', () => {
  sliderLabel.textContent = `${slider.value} ⭐️`;
  const gradient = randomFieryGradient();
  slider.style.background = gradient;
  style.textContent = `
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 0 8px rgba(255, 120, 0, 0.8);
      cursor: pointer;
      margin-top: -5px; /* ✅ thumb stays centered */
    }
    input[type="range"]::-webkit-slider-runnable-track {
      height: 4px;
      border-radius: 4px;
      background: ${gradient};
    }
  `;
});

btnWrap.appendChild(sliderPanel);

// --- Gift button ---
const giftBtnLocal = document.createElement('button');
giftBtnLocal.textContent = 'Gift ⭐️';
Object.assign(giftBtnLocal.style, {
  padding: '7px 14px',
  borderRadius: '6px',
  border: 'none',
  fontWeight: '600',
  background: 'linear-gradient(90deg,#ff0099,#ff0066)',
  color: '#fff',
  cursor: 'pointer',
  position: 'relative'
});

    giftBtnLocal.onclick = async () => {
      const amt = parseInt(slider.value);
      if (!amt || amt < 100) return showStarPopup("🔥 Minimum gift is 100 ⭐️");
      if ((currentUser?.stars || 0) < amt) return showStarPopup("Not enough stars 💫");

      // Spinner animation
      const originalText = giftBtnLocal.textContent;
      giftBtnLocal.textContent = '';
      const spinner = document.createElement('div');
      Object.assign(spinner.style, {
        width: '18px',
        height: '18px',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTop: '2px solid white',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      });
      giftBtnLocal.appendChild(spinner);

      try {
        await sendStarsToUser(user, amt);
        slider.value = 0;
        sliderLabel.textContent = `0 ⭐️`;

        // Scroll chat to bottom
        const chatBox = document.querySelector('#chatMessages') || document.body;
        chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });

        // Auto-close modal
        setTimeout(() => card.remove(), 500);
      } catch (err) {
        console.error("Gift failed:", err);
      } finally {
        giftBtnLocal.textContent = originalText;
      }
    };

    // Spinner animation keyframes
    const styleTag = document.createElement('style');
    styleTag.textContent = `
      @keyframes spin { from {transform:rotate(0)} to {transform:rotate(360deg)} }
    `;
    document.head.appendChild(styleTag);

    btnWrap.appendChild(giftBtnLocal);
    card.appendChild(btnWrap);

    // Append & animate
    document.body.appendChild(card);
    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'translate(-50%, -50%) scale(1.02)';
      setTimeout(() => card.style.transform = 'translate(-50%, -50%) scale(1)', 120);
    });

    // Click outside to close
    const closeHandler = (ev) => {
      if (!card.contains(ev.target)) {
        card.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  function typeWriterEffect(el, text, speed = 35) {
    el.textContent = '';
    let i = 0;
    const iv = setInterval(() => {
      el.textContent += text.charAt(i) || '';
      i++;
      if (i >= text.length) clearInterval(iv);
    }, speed);
  }
  
 // --- USERNAME TAP DETECTOR (2025 GOD-TIER EDITION) ---
document.addEventListener('pointerdown', (e) => {
  const target = e.target.closest('span, div, p, h1, h2, h3, .username, .chatId'); // broader hit area
  if (!target?.textContent) return;

  const text = target.textContent.trim();
  
  // Ignore full chat lines (they contain ":") and empty strings
  if (!text || text.includes(':') || text.length < 2) return;

  // Extract first word/phrase as potential chatId (handles emojis, spaces, special chars)
  const potentialChatId = text.split(/\s+/)[0].replace(/[^a-zA-Z0-9_@]/g, ''); // strip emojis/symbols
  if (!potentialChatId) return;

  // Normalize lookup key (case-insensitive, no spaces/emojis)
  const lookupKey = potentialChatId.toLowerCase();

  // Find user — PRIORITIZE exact chatId match, fallback to search
  let user = usersByChatId[lookupKey];

  if (!user) {
    user = allUsers.find(u => {
      const id = (u.chatId || "").toString().toLowerCase();
      return id === lookupKey || id.includes(lookupKey) || lookupKey.includes(id);
    });
  }

  // Final guards
  if (!user) return;
  if (getUserId(user) === currentUser?.uid) return; // don't show card for self

  // Visual feedback — sexy blink
  const originalBg = target.style.backgroundColor || '';
  const originalColor = target.style.color || '';
  
  target.style.backgroundColor = '#ffcc00';
  target.style.color = '#000';
  target.style.transition = 'all 0.15s ease';

  setTimeout(() => {
    target.style.backgroundColor = originalBg;
    target.style.color = originalColor;
  }, 200);

  // Show the card
  showSocialCard(user);

  // Optional: haptic feedback on mobile
  if (navigator.vibrate) navigator.vibrate(30);
});

// Helper (add once at the top of your file)
function getUserId(user) {
  return user.uid || user._docId || user.id;
}
  
// --- SEND STARS FUNCTION (Ephemeral Banner + Dual showGiftAlert + Receiver Sync + Notification) ---
async function sendStarsToUser(targetUser, amt) {
  try {
    const fromRef = doc(db, "users", currentUser.uid);
   const targetUserId = targetUser.uid || targetUser._docId || user._docId;
    const glowColor = randomColor();

    // --- 1️⃣ Update Firestore balances ---
    await Promise.all([
      updateDoc(fromRef, { stars: increment(-amt), starsGifted: increment(amt) }),
      updateDoc(toRef, { stars: increment(amt) })
    ]);

    // --- 2️⃣ Create ephemeral banner inside main messages collection ---
    const bannerMsg = {
      content: `💫 ${currentUser.chatId} gifted ${amt} stars ⭐️ to ${targetUser.chatId}!`,
      timestamp: serverTimestamp(),
      systemBanner: true,
      highlight: true,
      buzzColor: glowColor,
      isBanner: true,           // ✅ tag for admin cleanup
      bannerShown: false,       // ✅ ephemeral display
      senderId: currentUser.uid,
      type: "banner"
    };

    const docRef = await addDoc(collection(db, "messages_room5"), bannerMsg);

    // --- 3️⃣ Render instantly for sender ---
    renderMessagesFromArray([{ id: docRef.id, data: bannerMsg }], true);

    // --- 4️⃣ Glow pulse for banner ---
    setTimeout(() => {
      const msgEl = document.getElementById(docRef.id);
      if (!msgEl) return;
      const contentEl = msgEl.querySelector(".content") || msgEl;
      contentEl.style.setProperty("--pulse-color", glowColor);
      contentEl.classList.add("baller-highlight");
      setTimeout(() => {
        contentEl.classList.remove("baller-highlight");
        contentEl.style.boxShadow = "none";
      }, 21000);
    }, 80);

// --- 5️⃣ Sender popup (using Gold Alert for consistency) ---
showGoldAlert(`✅ You sent ${amt} ⭐ to ${targetUser.chatId}!`, 4000);

// --- 6️⃣ Receiver quick sync marker ---
await updateDoc(toRef, {
  lastGift: {
    from: currentUser.chatId,
    amt,
    at: Date.now(),
  },
});

// --- 6.5️⃣ Create notification for receiver ---
await addDoc(notifRef, {
  userId: targetUserId,
  message: `💫 ${currentUser.chatId} gifted you ${amt} ⭐!`,
  read: false,
  timestamp: serverTimestamp(),
  type: "starGift",
  fromUserId: currentUser.uid,
  fromChatId: currentUser.chatId,
  amount: amt,
  // Optional: auto-action when tapped
  action: "viewProfile"
});

    // --- 7️⃣ Mark banner as shown ---
    await updateDoc(doc(db, "messages_room5", docRef.id), {
      bannerShown: true
    });

  } catch (err) {
    console.error("❌ sendStarsToUser failed:", err);
    showGiftAlert(`⚠️ Error: ${err.message}`, 4000);
  }
}

})(); // ✅ closes IIFE



/* ---------- DEBUGGABLE HOST INIT (drop-in) ---------- */
(function () {
  const isHost = true; // toggle dynamically in your app

  function waitForElements(selectors = [], { timeout = 5000, interval = 80 } = {}) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      (function poll() {
        const found = selectors.map(s => document.querySelector(s));
        if (found.every(el => el)) return resolve(found);
        if (Date.now() - start > timeout) return reject(new Error("waitForElements timeout: " + selectors.join(", ")));
        setTimeout(poll, interval);
      })();
    });
  }

  function ready(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      setTimeout(fn, 0);
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  ready(async () => {
    console.log("[host-init] DOM ready. isHost =", isHost);
    if (!isHost) {
      console.log("[host-init] not a host. exiting host init.");
      return;
    }

    try {
      const [
        hostSettingsWrapperEl,
        hostModalEl,
        hostSettingsBtnEl,
      ] = await waitForElements(
        ["#hostSettingsWrapper", "#hostModal", "#hostSettingsBtn"],
        { timeout: 7000 }
      );

      console.log("[host-init] Found host elements:", {
        hostSettingsWrapper: !!hostSettingsWrapperEl,
        hostModal: !!hostModalEl,
        hostSettingsBtn: !!hostSettingsBtnEl,
      });

      hostSettingsWrapperEl.style.display = "block";

      const closeModalEl = hostModalEl.querySelector(".close");
      if (!closeModalEl) console.warn("[host-init] close button (.close) not found inside #hostModal.");

      // Tab system
      function initTabsForModal(modalEl) {
        modalEl.querySelectorAll(".tab-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            modalEl.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(tab => tab.style.display = "none");
            btn.classList.add("active");
            const target = document.getElementById(btn.dataset.tab);
            if (target) target.style.display = "block";
          });
        });
      }
      initTabsForModal(hostModalEl);

      // Open modal + populate
      hostSettingsBtnEl.addEventListener("click", async () => {
        try {
          hostModalEl.style.display = "block";
          if (!currentUser?.uid) return showStarPopup("Please log in first.");

          const userRef = doc(db, "users", currentUser.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) return showStarPopup("User data not found.");

          const data = snap.data() || {};
          const safeSet = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value ?? "";
          };

          safeSet("fullName", data.fullName || "");
          safeSet("city", data.city || "");
          safeSet("location", data.location || "");
          safeSet("bio", data.bioPick || "");
          safeSet("bankAccountNumber", data.bankAccountNumber || "");
          safeSet("bankName", data.bankName || "");
          safeSet("telegram", data.telegram || "");
          safeSet("tiktok", data.tiktok || "");
          safeSet("whatsapp", data.whatsapp || "");
          safeSet("instagram", data.instagram || "");
          if (document.getElementById("naturePick")) document.getElementById("naturePick").value = data.naturePick || "";
          if (document.getElementById("fruitPick")) document.getElementById("fruitPick").value = data.fruitPick || "";

          // Photo preview
          const photoPreview = document.getElementById("photoPreview");
          const photoPlaceholder = document.getElementById("photoPlaceholder");
          if (data.popupPhoto && photoPreview) {
            photoPreview.src = data.popupPhoto;
            photoPreview.style.display = "block";
            if (photoPlaceholder) photoPlaceholder.style.display = "none";
          } else if (photoPreview && photoPlaceholder) {
            photoPreview.style.display = "none";
            photoPlaceholder.style.display = "inline-block";
          }
        } catch (err) {
          console.error("[host-init] error opening modal:", err);
          showStarPopup("Failed to open settings.");
        }
      });

      // Close handlers
      if (closeModalEl) closeModalEl.addEventListener("click", () => hostModalEl.style.display = "none");
      window.addEventListener("click", e => { if (e.target === hostModalEl) hostModalEl.style.display = "none"; });

      // Photo preview
      document.addEventListener("change", e => {
        if (e.target.id === "popupPhoto" && e.target.files[0]) {
          const reader = new FileReader();
          reader.onload = () => {
            const photoPreview = document.getElementById("photoPreview");
            const photoPlaceholder = document.getElementById("photoPlaceholder");
            if (photoPreview) {
              photoPreview.src = reader.result;
              photoPreview.style.display = "block";
            }
            if (photoPlaceholder) photoPlaceholder.style.display = "none";
          };
          reader.readAsDataURL(e.target.files[0]);
        }
      });

      // Save Info
      const saveInfoBtn = document.getElementById("saveInfo");
      if (saveInfoBtn) {
        saveInfoBtn.addEventListener("click", async () => {
          if (!currentUser?.uid) return showStarPopup("Login required.");

          const getVal = id => document.getElementById(id)?.value ?? "";
          const dataToUpdate = {
            fullName: (getVal("fullName") || "").replace(/\b\w/g, l => l.toUpperCase()),
            city: getVal("city"),
            location: getVal("location"),
            bioPick: getVal("bio"),
            bankAccountNumber: getVal("bankAccountNumber"),
            bankName: getVal("bankName"),
            telegram: getVal("telegram"),
            tiktok: getVal("tiktok"),
            whatsapp: getVal("whatsapp"),
            instagram: getVal("instagram"),
            naturePick: getVal("naturePick"),
            fruitPick: getVal("fruitPick"),
          };

          if (dataToUpdate.bankAccountNumber && !/^\d{1,11}$/.test(dataToUpdate.bankAccountNumber))
            return showStarPopup("Bank account: digits only (max 11).");
          if (dataToUpdate.whatsapp && !/^\d+$/.test(dataToUpdate.valueOf.whatsapp))
            return showStarPopup("WhatsApp: numbers only.");

          const original = saveInfoBtn.innerHTML;
          saveInfoBtn.innerHTML = `<div class="spinner" style="width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;margin:auto;"></div>`;
          saveInfoBtn.disabled = true;

          try {
            const userRef = doc(db, "users", currentUser.uid);
            const filtered = Object.fromEntries(Object.entries(dataToUpdate).filter(([_, v]) => v !== undefined && v !== ""));
            await updateDoc(userRef, { ...filtered, lastUpdated: serverTimestamp() });

            const hostRef = doc(db, "featuredHosts", currentUser.uid);
            const hostSnap = await getDoc(hostRef);
            if (hostSnap.exists()) await updateDoc(hostRef, { ...filtered, lastUpdated: serverTimestamp() });

            showStarPopup("Profile updated successfully!");
          } catch (err) {
            console.error(err);
            showStarPopup("Update failed.");
          } finally {
            saveInfoBtn.innerHTML = original;
            saveInfoBtn.disabled = false;
          }
        });
      }

      // Save Media
      const saveMediaBtn = document.getElementById("saveMedia");
      if (saveMediaBtn) {
        saveMediaBtn.addEventListener("click", async () => {
          const photoFile = document.getElementById("popupPhoto")?.files[0];
          const videoFile = document.getElementById("uploadVideo")?.files[0];
          if (!photoFile && !videoFile) return showStarPopup("Select a file.");

          try {
            showStarPopup("Uploading...");
            const form = new FormData();
            if (photoFile) form.append("photo", photoFile);
            if (videoFile) form.append("video", videoFile);

            const res = await fetch("/api/uploadShopify", { method: "POST", body: form });
            if (!res.ok) throw new Error("Upload failed");
            const data = await res.json();

            await updateDoc(doc(db, "users", currentUser.uid), {
              ...(data.photoUrl && { popupPhoto: data.photoUrl }),
              ...(data.videoUrl && { videoUrl: data.videoUrl }),
              lastUpdated: serverTimestamp()
            });

            if (data.photoUrl) {
              const prev = document.getElementById("photoPreview");
              const ph = document.getElementById("photoPlaceholder");
              if (prev) prev.src = data.photoUrl, prev.style.display = "block";
              if (ph) ph.style.display = "none";
            }

            showStarPopup("Media uploaded!");
            hostModalEl.style.display = "none";
          } catch (err) {
            showStarPopup("Upload failed: " + err.message);
          }
        });
      }

      console.log("[host-init] Host logic initialized successfully.");
    } catch (err) {
      console.error("[host-init] Failed:", err);
      showStarPopup("Host UI failed to load.");
    }
  });
})(); 
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
