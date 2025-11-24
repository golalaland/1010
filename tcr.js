/* ---------- Firebase Modular Imports (v10+) — FIXED & WORKING ---------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

// Firestore — all your needed functions
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  increment,
  getDocs,
  where,
  runTransaction,
  arrayUnion,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Auth — CRITICAL: signInWithEmailAndPassword & signOut live HERE
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ---------- Firebase Config ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyD_GjkTox5tum9o4AupO0LeWzjTocJg8RI",
  authDomain: "dettyverse.firebaseapp.com",
  projectId: "dettyverse",
  storageBucket: "dettyverse.firebasestorage.app",
  messagingSenderId: "1036459652488",
  appId: "1:1036452488:web:e8910172ed16e9cac9b63d",
  measurementId: "G-NX2KWZW85V"
};

/* ---------- Firebase Setup ---------- */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Make Firebase objects available globally (for debugging or reuse)
window.app = app;
window.db = db;
window.auth = auth;


// SYNC UNLOCKED VIDEOS — 100% Secure & Reliable
async function syncUserUnlocks() {
  if (!currentUser?.email) {
    console.log("No user email — skipping unlock sync");
    return JSON.parse(localStorage.getItem("userUnlockedVideos") || "[]");
  }

  const userId = getUserId(currentUser.email);  // ← CRITICAL: use sanitized ID
  const userRef = doc(db, "users", userId);
  const localKey = "userUnlockedVideos"; // consistent key

  try {
    const snap = await getDoc(userRef);
    
    // Get unlocks from Firestore (default empty array)
    const firestoreUnlocks = snap.exists() 
      ? (snap.data()?.unlockedVideos || []) 
      : [];

    // Get local unlocks
    const localUnlocks = JSON.parse(localStorage.getItem(localKey) || "[]");

    // Merge & deduplicate (local wins if conflict)
    const merged = [...new Set([...localUnlocks, ...firestoreUnlocks])];

    // Only update Firestore if local has new ones
    const hasNew = merged.some(id => !firestoreUnlocks.includes(id));
    if (hasNew && merged.length > firestoreUnlocks.length) {
      await updateDoc(userRef, {
        unlockedVideos: merged,
        lastUnlockSync: serverTimestamp()
      });
      console.log("Firestore unlocks updated:", merged);
    }

    // Always sync localStorage to latest truth
    localStorage.setItem(localKey, JSON.stringify(merged));
    currentUser.unlockedVideos = merged; // ← keep currentUser in sync too!

    console.log("Unlocks synced successfully:", merged.length, "videos");
    return merged;

  } catch (err) {
    console.error("Unlock sync failed:", err.message || err);

    // On error: trust localStorage as source of truth
    const fallback = JSON.parse(localStorage.getItem(localKey) || "[]");
    showStarPopup("Sync failed. Using local unlocks.");
    return fallback;
  }
}



/* ===============================
   🔔 Notification Helpers
================================= */
async function pushNotification(userId, message) {
  if (!userId) return console.warn("⚠️ No userId provided for pushNotification");
  
  const notifRef = doc(collection(db, "notifications"));
  await setDoc(notifRef, {
    userId,
    message,
    timestamp: serverTimestamp(),
    read: false,
  });
}

function pushNotificationTx(tx, userId, message) {
  const notifRef = doc(collection(db, "notifications"));
  tx.set(notifRef, {
    userId,
    message,
    timestamp: serverTimestamp(),
    read: false,
  });
}


/* ========== SHARED UTILS ========== */
let currentUser = null;
let notificationsUnsubscribe = null;  // Single global unsubscribe

/* ---------- Auth State Watcher (FIXED — NO MORE AUTO SIGN-OUT) ---------- */
let hasUserEverSignedIn = false;

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  // Hide modals during transition
  document.querySelectorAll(".featured-modal, #giftModal, #sessionModal")
    .forEach(m => m.style.display = "none");

  if (!user) {
    if (hasUserEverSignedIn) {
      console.log("User signed out (you clicked logout)");
    } else {
      console.log("Page loaded — waiting for sign-in...");
    }
    hasUserEverSignedIn = false;
    localStorage.removeItem("userId");
    document.querySelectorAll(".after-login-only").forEach(el => el.style.display = "none");
    document.querySelectorAll(".before-login-only").forEach(el => el.style.display = "");
    
    if (notificationsUnsubscribe) {
      notificationsUnsubscribe();
      notificationsUnsubscribe = null;
    }
    return;
  }

  // USER IS SIGNED IN — STOP ANYTHING FROM SIGNING THEM OUT
  const userEmail = user.email || user.uid;
  const userQueryId = getUserId(userEmail);

  console.log("User signed in (and staying in):", userEmail);
  hasUserEverSignedIn = true;

  // Show logged-in UI
  document.querySelectorAll(".after-login-only").forEach(el => el.style.display = "");
  document.querySelectorAll(".before-login-only").forEach(el => el.style.display = "none");

  localStorage.setItem("userId", userQueryId);
  console.log("Logged in as Sanitized ID:", userQueryId);

  // Sync unlocks
  try {
    await syncUserUnlocks();
    console.log("Unlocked videos synced successfully.");
  } catch (err) {
    console.error("Sync unlocks failed:", err);
  }
  // ——————— Setup Notifications Listener ———————
  const notifRef = collection(db, "notifications");
  const notifQuery = query(
    notifRef,
    where("userId", "==", userQueryId),
    orderBy("timestamp", "desc")
  );

  async function setupNotificationsListener() {
    const notificationsList = document.getElementById("notificationsList");
    if (!notificationsList) {
      console.log("#notificationsList not ready — retrying in 500ms");
      setTimeout(setupNotificationsListener, 500);
      return;
    }

    // Remove previous listener if exists
    if (notificationsUnsubscribe) notificationsUnsubscribe();

    console.log("Setting up live notification listener for:", userQueryId);

    notificationsUnsubscribe = onSnapshot(
      notifQuery,
      (snapshot) => {
        const count = snapshot.docs.length;
        console.log(`Received ${count} notification(s)`);

        if (snapshot.empty) {
          notificationsList.innerHTML = `<p style="opacity:0.7;">No new notifications yet.</p>`;
          return;
        }

        const html = snapshot.docs.map(docSnap => {
          const n = docSnap.data();
          const time = n.timestamp?.seconds
            ? new Date(n.timestamp.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "--:--";

          return `
            <div class="notification-item ${n.read ? "" : "unread"}" data-id="${docSnap.id}">
              <span>${n.message || "(no message)"}</span>
              <span class="notification-time">${time}</span>
            </div>`;
        }).join("");

        notificationsList.innerHTML = html;
      },
      (err) => console.error("Firestore Listener Error:", err)
    );
  }

  // Start listener (DOM ready safe)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupNotificationsListener);
  } else {
    setupNotificationsListener();
  }

  // Re-init when user opens notifications tab
  const notifTabBtn = document.querySelector('.tab-btn[data-tab="notificationsTab"]');
  if (notifTabBtn) {
    notifTabBtn.addEventListener("click", () => setTimeout(setupNotificationsListener, 150));
  }

  // Mark all as read button
  const markAllBtn = document.getElementById("markAllRead");
  if (markAllBtn) {
    markAllBtn.onclick = async () => {
      console.log("Marking all notifications as read...");
      const snapshot = await getDocs(query(notifRef, where("userId", "==", userQueryId)));
      const batch = writeBatch(db);
      snapshot.docs.forEach(docSnap => batch.update(docSnap.ref, { read: true }));
      await batch.commit();
      alert("All notifications marked as read.");
    };
  }
});


/* ===============================
   Manual Notification Starter (for whitelist / debug login)
================================= */
async function startNotificationsFor(userEmail) {
  const userQueryId = getUserId(userEmail);
  localStorage.setItem("userId", userQueryId);
  console.log("Manual notification listener started for:", userQueryId);

  const notifRef = collection(db, "notifications");
  const notifQuery = query(
    notifRef,
    where("userId", "==", userQueryId),
    orderBy("timestamp", "desc")
  );

  const notificationsList = document.getElementById("notificationsList");
  if (!notificationsList) {
    console.warn("#notificationsList not found — retrying...");
    setTimeout(() => startNotificationsFor(userEmail), 500);
    return;
  }

  onSnapshot(notifQuery, (snapshot) => {
    if (snapshot.empty) {
      notificationsList.innerHTML = `<p style="opacity:0.7;">No new notifications yet.</p>`;
      return;
    }

    notificationsList.innerHTML = snapshot.docs.map(docSnap => {
      const n = docSnap.data();
      const time = n.timestamp?.seconds
        ? new Date(n.timestamp.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "--:--";

      return `
        <div class="notification-item ${n.read ? "" : "unread"}" data-id="${docSnap.id}">
          <span>${n.message || "(no message)"}</span>
          <span class="notification-time">${time}</span>
        </div>`;
    }).join("");
  });
}


/* ---------- Helper: Get current user ID ---------- */
export function getCurrentUserId() {
  return currentUser ? currentUser.uid : localStorage.getItem("userId");
}
window.currentUser = currentUser;

/* ---------- Exports for other scripts ---------- */
export { app, db, auth };

/* ---------- Global State ---------- */
const ROOM_ID = "room5";
const CHAT_COLLECTION = "messages_room5";
const BUZZ_COST = 50;
const SEND_COST = 1;

let lastMessagesArray = [];
let starInterval = null;
let refs = {};

/* ---------- Helpers ---------- */
const generateGuestName = () => `GUEST ${Math.floor(1000 + Math.random() * 9000)}`;
const formatNumberWithCommas = n => new Intl.NumberFormat('en-NG').format(n || 0);

function randomColor() {
  const palette = ["#FFD700","#FF69B4","#87CEEB","#90EE90","#FFB6C1","#FFA07A","#8A2BE2","#00BFA6","#F4A460"];
  return palette[Math.floor(Math.random() * palette.length)];
}

function showStarPopup(text) {
  const popup = document.getElementById("starPopup");
  const starText = document.getElementById("starText");
  if (!popup || !starText) return;

  starText.innerHTML = text; // <- changed from innerText
  popup.style.display = "block";

  setTimeout(() => popup.style.display = "none", 1700);
}


/* ========== FIX: UNIVERSAL ID FUNCTION (ADD THIS EXACTLY) ========== */
const getUserId = (input) => {
  if (!input) return "";
  const str = String(input).trim().toLowerCase();
  if (str.includes("@")) {
    // it's an email → convert properly
    return str.replace(/@/g, "_").replace(/\./g, "_");
  }
  // already sanitized → return as-is (supports old docs)
  return str;
};


/* ========== FINAL: PERSISTENT LOGIN — 100% NO SYNTAX ERROR ========== */
// FINAL — WORKS WITH YOUR CURRENT DATABASE (EXAMPLE_GMAIL_COM DOC IDs)
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.log("No user — show login screen");
    currentUser = null;
    if (typeof showLoginUI === "function") showLoginUI();
    return;
  }

  console.log("Firebase Auth restored user:", user.email);

  // THIS IS YOUR CURRENT SYSTEM — KEEP IT
 const uid = user.email.replace(/\./g, '_').replace(/@/g, '_');
// → xoxoi@gmail.com → xoxoi_gmail_com  (EXACTLY like your Firestore docs)

  const userRef = doc(db, "users", uid);

  try {
    const snap = await getDoc (userRef);

    if (!snap.exists()) {
      console.error("Profile missing for:", uid);
      showStarPopup("Profile not found. Contact admin.");
      await signOut(auth);
      return;
    }

    const data = snap.data();

    currentUser = {
      uid: uid,                                      // ← sanitized ID (EXAMPLE_GMAIL_COM)
      email: user.email,                             // ← real email (example@gmail.com)
      chatId: data.chatId || user.email.split("@")[0],
      fullName: data.fullName || "$VIP",
      isVIP: !!data.isVIP,
      isAdmin: !!data.isAdmin,
      isHost: !!data.isHost,
      stars: data.stars || 0,
      cash: data.cash || 0,
      usernameColor: data.usernameColor || "#ff69b4",
      subscriptionActive: !!data.subscriptionActive,
      hostLink: data.hostLink || null,
      invitedBy: data.invitedBy || null,
      unlockedVideos: data.unlockedVideos || []
    };

    console.log("FULL PROFILE RESTORED:", currentUser);

    // ALL YOUR EXISTING FUNCTIONS — PASS THE RIGHT ID
    if (typeof showChatUI === "function") showChatUI(currentUser);
    if (typeof updateRedeemLink === "function") updateRedeemLink();
    if (typeof updateTipLink === "function") updateTipLink();
    if (typeof attachMessagesListener === "function") attachMessagesListener();
    if (typeof startStarEarning === "function") startStarEarning(currentUser.uid);        // ← sanitized ID
    if (typeof startNotificationsFor === "function") startNotificationsFor(currentUser.uid); // ← sanitized ID (most of your code expects this)

    const colors = ["#FF1493","#FFD700","#00FFFF","#FF4500","#DA70D6","#FF69B4","#32CD32","#FFA500"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    showStarPopup(`Welcome back, <span style="font-weight:bold;color:${color};">${currentUser.chatId.toUpperCase()}</span> !`);

    localStorage.setItem("lastVipEmail", user.email);

    // Sync unlocks (keep your existing call)
    if (typeof syncUserUnlocks === "function") {
      syncUserUnlocks().then(unlocks => {
        console.log("User has access to", unlocks.length, "premium videos");
      }).catch(err => console.warn("Unlock sync failed:", err));
    }

  } catch (err) {
    console.error("Auth state change error:", err);
    showStarPopup("Error loading profile.");
  }
});


/* ---------- User Colors ---------- */ 
function setupUsersListener() { onSnapshot(collection(db, "users"), snap => { refs.userColors = refs.userColors || {}; snap.forEach(docSnap => { refs.userColors[docSnap.id] = docSnap.data()?.usernameColor || "#ffffff"; }); if (lastMessagesArray.length) renderMessagesFromArray(lastMessagesArray); }); } setupUsersListener();
  

/* ----------------------------
   ⭐ GIFT MODAL / CHAT BANNER ALERT
----------------------------- */
async function showGiftModal(targetUid, targetData) {
  // Stop if required info is missing
  if (!targetUid || !targetData) return;

  const modal = document.getElementById("giftModal");
  const titleEl = document.getElementById("giftModalTitle");
  const amountInput = document.getElementById("giftAmountInput");
  const confirmBtn = document.getElementById("giftConfirmBtn");
  const closeBtn = document.getElementById("giftModalClose");

  // Make sure modal exists before doing anything
  if (!modal || !titleEl || !amountInput || !confirmBtn || !closeBtn) {
    console.warn("❌ Gift modal elements not found — skipping open");
    return;
  }

  // 🧩 Reset state before showing
  titleEl.textContent = "Gift ⭐️";
  amountInput.value = "";

  // 🚫 Don't auto-show unless called intentionally
  // So we only show the modal *after* all required info is ready
  requestAnimationFrame(() => {
    modal.style.display = "flex";
  });

  // Close modal behavior
  const close = () => {
    modal.style.display = "none";
  };

  closeBtn.onclick = close;
  modal.onclick = (e) => {
    if (e.target === modal) close();
  };

  // Remove any old listeners on confirm button
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.replaceWith(newConfirmBtn);

  // ✅ Confirm send action
  newConfirmBtn.addEventListener("click", async () => {
    const amt = parseInt(amountInput.value) || 0;
    if (amt < 100) return showStarPopup("🔥 Minimum gift is 100 ⭐️");
    if ((currentUser?.stars || 0) < amt) return showStarPopup("Not enough stars 💫");

    const fromRef = doc(db, "users", currentUser.uid);
    const toRef = doc(db, "users", targetUid);
    const glowColor = randomColor();

    const messageData = {
      content: `💫 ${currentUser.chatId} gifted ${amt} stars ⭐️ to ${targetData.chatId}!`,
      uid: currentUser.uid,
      timestamp: serverTimestamp(),
      highlight: true,
      buzzColor: glowColor,
      systemBanner: true,
      _confettiPlayed: false
    };

    const docRef = await addDoc(collection(db, CHAT_COLLECTION), messageData);

    await Promise.all([
      updateDoc(fromRef, { stars: increment(-amt), starsGifted: increment(amt) }),
      updateDoc(toRef, { stars: increment(amt) })
    ]);

    showStarPopup(`You sent ${amt} stars ⭐️ to ${targetData.chatId}!`);
    close();

    renderMessagesFromArray([{ id: docRef.id, data: messageData }]);
  });
}
/* ---------- Gift Alert (Optional Popup) ---------- */
function showGiftAlert(text) {
  const alertEl = document.getElementById("giftAlert");
  if (!alertEl) return;

  alertEl.textContent = text; // just text
  alertEl.classList.add("show", "glow"); // banner glow

  // ✅ Floating stars removed
  setTimeout(() => alertEl.classList.remove("show", "glow"), 4000);
}

/* ---------- Redeem Link ---------- */
function updateRedeemLink() {
  if (!refs.redeemBtn || !currentUser) return;
  refs.redeemBtn.href = `menu.html?uid=${encodeURIComponent(currentUser.uid)}`;
  refs.redeemBtn.style.display = "inline-block";
}

/* ---------- Tip Link ---------- */
function updateTipLink() {
  if (!refs.tipBtn || !currentUser) return;
  refs.tipBtn.href = `menu.html?uid=${encodeURIComponent(currentUser.uid)}`;
  refs.tipBtn.style.display = "inline-block";
}


// ---------------------- GLOBALS ----------------------
let scrollPending = false;      // used to throttle scroll updates
let tapModalEl = null;          // your tap modal reference
let currentReplyTarget = null;  // current reply target
let scrollArrow = null;         // scroll button reference


// ---------------------- INIT AUTO-SCROLL ----------------------
function handleChatAutoScroll() {
  if (!refs.messagesEl) return;

  // Create scroll-to-bottom button if it doesn't exist
  scrollArrow = document.getElementById("scrollToBottomBtn");
  if (!scrollArrow) {
    scrollArrow = document.createElement("div");
    scrollArrow.id = "scrollToBottomBtn";
    scrollArrow.textContent = "↓";
    scrollArrow.style.cssText = `
      position: fixed;
      bottom: 90px;
      right: 20px;
      padding: 6px 12px;
      background: rgba(255,20,147,0.9);
      color: #fff;
      border-radius: 14px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s ease;
      z-index: 9999;
    `;
    document.body.appendChild(scrollArrow);

    // Scroll on click
    scrollArrow.addEventListener("click", () => {
      refs.messagesEl.scrollTo({ top: refs.messagesEl.scrollHeight, behavior: "smooth" });
      scrollArrow.style.opacity = 0;
      scrollArrow.style.pointerEvents = "none";
    });
  }

  // Listen for scroll events
  refs.messagesEl.addEventListener("scroll", () => {
    const distanceFromBottom = refs.messagesEl.scrollHeight - refs.messagesEl.scrollTop - refs.messagesEl.clientHeight;
    if (distanceFromBottom > 150) {
      scrollArrow.style.opacity = 1;
      scrollArrow.style.pointerEvents = "auto";
    } else {
      scrollArrow.style.opacity = 0;
      scrollArrow.style.pointerEvents = "none";
    }
  });

  // Initial auto-scroll to bottom (safe with scrollPending)
  if (!scrollPending) {
    scrollPending = true;
    requestAnimationFrame(() => {
      refs.messagesEl.scrollTop = refs.messagesEl.scrollHeight;
      scrollPending = false;
    });
  }
}

// ---------------------- CALL ON PAGE LOAD / AFTER LOGIN ----------------------
handleChatAutoScroll();


// Cancel reply
function cancelReply() {
  currentReplyTarget = null;
  refs.messageInputEl.placeholder = "Type a message...";
  if (refs.cancelReplyBtn) {
    refs.cancelReplyBtn.remove();
    refs.cancelReplyBtn = null;
  }
}

// Show the little cancel reply button
function showReplyCancelButton() {
  if (!refs.cancelReplyBtn) {
    const btn = document.createElement("button");
    btn.textContent = "✖";
    btn.style.marginLeft = "6px";
    btn.style.fontSize = "12px";
    btn.onclick = cancelReply;
    refs.cancelReplyBtn = btn;
    refs.messageInputEl.parentElement.appendChild(btn);
  }
}

// Report a message
async function reportMessage(msgData) {
  try {
    const reportRef = doc(db, "reportedmsgs", msgData.id);
    const reportSnap = await getDoc(reportRef);
    const reporterChatId = currentUser?.chatId || "unknown";
    const reporterUid = currentUser?.uid || null;

    if (reportSnap.exists()) {
      const data = reportSnap.data();
      if ((data.reportedBy || []).includes(reporterChatId)) {
        return showStarPopup("You’ve already reported this message.", { type: "info" });
      }
      await updateDoc(reportRef, {
        reportCount: increment(1),
        reportedBy: arrayUnion(reporterChatId),
        reporterUids: arrayUnion(reporterUid),
        lastReportedAt: serverTimestamp()
      });
    } else {
      await setDoc(reportRef, {
        messageId: msgData.id,
        messageText: msgData.content,
        offenderChatId: msgData.chatId,
        offenderUid: msgData.uid || null,
        reportedBy: [reporterChatId],
        reporterUids: [reporterUid],
        reportCount: 1,
        createdAt: serverTimestamp(),
        status: "pending"
      });
    }

    // ✅ Success popup
    showStarPopup("✅ Report submitted!", { type: "success" });

  } catch (err) {
    console.error(err);
    // ❌ Error popup
    showStarPopup("❌ Error reporting message.", { type: "error" });
  }
}

// Tap modal for Reply / Report
function showTapModal(targetEl, msgData) {
  tapModalEl?.remove();
  tapModalEl = document.createElement("div");
  tapModalEl.className = "tap-modal";

  const replyBtn = document.createElement("button");
  replyBtn.textContent = "⏎ Reply";
  replyBtn.onclick = () => {
    currentReplyTarget = { id: msgData.id, chatId: msgData.chatId, content: msgData.content };
    refs.messageInputEl.placeholder = `Replying to ${msgData.chatId}: ${msgData.content.substring(0, 30)}...`;
    refs.messageInputEl.focus();
    showReplyCancelButton();
    tapModalEl.remove();
  };

  const reportBtn = document.createElement("button");
  reportBtn.textContent = "⚠ Report";
  reportBtn.onclick = async () => {
    await reportMessage(msgData);
    tapModalEl.remove();
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "✕";
  cancelBtn.onclick = () => tapModalEl.remove();

  tapModalEl.append(replyBtn, reportBtn, cancelBtn);
  document.body.appendChild(tapModalEl);

  const rect = targetEl.getBoundingClientRect();
  tapModalEl.style.position = "absolute";
  tapModalEl.style.top = rect.top - 40 + window.scrollY + "px";
  tapModalEl.style.left = rect.left + "px";
  tapModalEl.style.background = "rgba(0,0,0,0.85)";
  tapModalEl.style.color = "#fff";
  tapModalEl.style.padding = "6px 10px";
  tapModalEl.style.borderRadius = "8px";
  tapModalEl.style.fontSize = "12px";
  tapModalEl.style.display = "flex";
  tapModalEl.style.gap = "6px";
  tapModalEl.style.zIndex = 9999;

  setTimeout(() => tapModalEl?.remove(), 3000);
}

// Confetti / glow for banners
// Banner glow only (no confetti)
function triggerBannerEffect(bannerEl) {
  bannerEl.style.animation = "bannerGlow 1s ease-in-out infinite alternate";

  // ✅ Confetti removed
  // const confetti = document.createElement("div");
  // confetti.className = "confetti";
  // confetti.style.position = "absolute";
  // confetti.style.top = "-4px";
  // confetti.style.left = "50%";
  // confetti.style.width = "6px";
  // confetti.style.height = "6px";
  // confetti.style.background = "#fff";
  // confetti.style.borderRadius = "50%";
  // bannerEl.appendChild(confetti);
  // setTimeout(() => confetti.remove(), 1500);
}


// Render messages
function renderMessagesFromArray(messages) {
  if (!refs.messagesEl) return;
  messages.forEach(item => {
    if (!item.id) return;
    if (document.getElementById(item.id)) return;

    const m = item.data || item;
    const wrapper = document.createElement("div");
    wrapper.className = "msg";
    wrapper.id = item.id;

    // Banner
    if (m.systemBanner || m.isBanner || m.type === "banner") {
      wrapper.classList.add("chat-banner");
      wrapper.style.textAlign = "center";
      wrapper.style.padding = "4px 0";
      wrapper.style.margin = "4px 0";
      wrapper.style.borderRadius = "8px";
      wrapper.style.background = m.buzzColor || "linear-gradient(90deg,#ffcc00,#ff33cc)";
      wrapper.style.boxShadow = "0 0 16px rgba(255,255,255,0.3)";

      const innerPanel = document.createElement("div");
      innerPanel.style.display = "inline-block";
      innerPanel.style.padding = "6px 14px";
      innerPanel.style.borderRadius = "6px";
      innerPanel.style.background = "rgba(255,255,255,0.35)";
      innerPanel.style.backdropFilter = "blur(6px)";
      innerPanel.style.color = "#000";
      innerPanel.style.fontWeight = "700";
      innerPanel.textContent = m.content || "";
      wrapper.appendChild(innerPanel);

      triggerBannerEffect(wrapper);

      if (window.currentUser?.isAdmin) {
        const delBtn = document.createElement("button");
        delBtn.textContent = "🗑";
        delBtn.title = "Delete Banner";
        delBtn.style.position = "absolute";
        delBtn.style.right = "6px";
        delBtn.style.top = "3px";
        delBtn.style.cursor = "pointer";
        delBtn.onclick = async () => {
          await deleteDoc(doc(db, "messages", item.id));
          wrapper.remove();
        };
        wrapper.appendChild(delBtn);
      }
    } else {
      // Regular message
      const usernameEl = document.createElement("span");
      usernameEl.className = "meta";
      usernameEl.innerHTML = `<span class="chat-username" data-username="${m.uid}">${m.chatId || "Guest"}</span>:`;
      usernameEl.style.color = (m.uid && refs.userColors?.[m.uid]) ? refs.userColors[m.uid] : "#fff";
      usernameEl.style.marginRight = "4px";
      wrapper.appendChild(usernameEl);

      // Reply preview
      if (m.replyTo) {
        const replyPreview = document.createElement("div");
        replyPreview.className = "reply-preview";
        replyPreview.textContent = m.replyToContent || "Original message";
        replyPreview.style.cursor = "pointer";
        replyPreview.onclick = () => {
          const originalMsg = document.getElementById(m.replyTo);
          if (originalMsg) {
            originalMsg.scrollIntoView({ behavior: "smooth", block: "center" });
            originalMsg.style.outline = "2px solid #FFD700";
            setTimeout(() => originalMsg.style.outline = "", 1000);
          }
        };
        wrapper.appendChild(replyPreview);
      }

      const contentEl = document.createElement("span");
      contentEl.className = "content";
      contentEl.textContent = " " + (m.content || "");
      wrapper.appendChild(contentEl);

      wrapper.addEventListener("click", (e) => {
        e.stopPropagation();
        showTapModal(wrapper, {
          id: item.id,
          chatId: m.chatId,
          uid: m.uid,
          content: m.content,
          replyTo: m.replyTo,
          replyToContent: m.replyToContent
        });
      });
    }

    refs.messagesEl.appendChild(wrapper);
  });

  // Auto-scroll
  if (!scrollPending) {
    scrollPending = true;
    requestAnimationFrame(() => {
      refs.messagesEl.scrollTop = refs.messagesEl.scrollHeight;
      scrollPending = false;
    });
  }
}

/* ---------- 🔔 Messages Listener (Final Optimized Version) ---------- */
function attachMessagesListener() {
  const q = query(collection(db, CHAT_COLLECTION), orderBy("timestamp", "asc"));

  // 💾 Track shown gift alerts
  const shownGiftAlerts = new Set(JSON.parse(localStorage.getItem("shownGiftAlerts") || "[]"));
  function saveShownGift(id) {
    shownGiftAlerts.add(id);
    localStorage.setItem("shownGiftAlerts", JSON.stringify([...shownGiftAlerts]));
  }

  // 💾 Track local pending messages to prevent double rendering
  let localPendingMsgs = JSON.parse(localStorage.getItem("localPendingMsgs") || "{}");

  onSnapshot(q, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type !== "added") return;

      const msg = change.doc.data();
      const msgId = change.doc.id;

      // 🛑 Skip messages that look like local temp echoes
      if (msg.tempId && msg.tempId.startsWith("temp_")) return;

      // 🛑 Skip already rendered messages
      if (document.getElementById(msgId)) return;

      // ✅ Match Firestore-confirmed message to a locally sent one
      for (const [tempId, pending] of Object.entries(localPendingMsgs)) {
        const sameUser = pending.uid === msg.uid;
        const sameText = pending.content === msg.content;
        const createdAt = pending.createdAt || 0;
        const msgTime = msg.timestamp?.toMillis?.() || 0;
        const timeDiff = Math.abs(msgTime - createdAt);

        if (sameUser && sameText && timeDiff < 7000) {
          // 🔥 Remove local temp bubble
          const tempEl = document.getElementById(tempId);
          if (tempEl) tempEl.remove();

          // 🧹 Clean up memory + storage
          delete localPendingMsgs[tempId];
          localStorage.setItem("localPendingMsgs", JSON.stringify(localPendingMsgs));
          break;
        }
      }

      // ✅ Render message
      renderMessagesFromArray([{ id: msgId, data: msg }]);

      /* 💝 Gift Alert Logic */
      if (msg.highlight && msg.content?.includes("gifted")) {
        const myId = currentUser?.chatId?.toLowerCase();
        if (!myId) return;

        const parts = msg.content.split(" ");
        const sender = parts[0];
        const receiver = parts[2];
        const amount = parts[3];
        if (!sender || !receiver || !amount) return;

        if (receiver.toLowerCase() === myId && !shownGiftAlerts.has(msgId)) {
          showGiftAlert(`${sender} gifted you ${amount} stars ⭐️`);
          saveShownGift(msgId);
        }
      }

      // 🌀 Keep scroll locked for your messages
      if (refs.messagesEl && msg.uid === currentUser?.uid) {
        refs.messagesEl.scrollTop = refs.messagesEl.scrollHeight;
      }
    });
  });
}

/* ===== Notifications Tab Lazy + Live Setup (Robust) ===== */
let notificationsListenerAttached = false;

async function attachNotificationsListener() {
  // Wait for the notifications tab and list to exist
  const waitForElement = (selector) => new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const observer = new MutationObserver(() => {
      const elNow = document.querySelector(selector);
      if (elNow) {
        observer.disconnect();
        resolve(elNow);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  const notificationsList = await waitForElement("#notificationsList");
  const markAllBtn = await waitForElement("#markAllRead");

  if (!currentUser?.uid) return console.warn("⚠️ No logged-in user");
  const notifRef = collection(db, "users", currentUser.uid, "notifications");
  const q = query(notifRef, orderBy("timestamp", "desc"));

  // Live snapshot listener
  onSnapshot(q, (snapshot) => {
    console.log("📡 Notifications snapshot:", snapshot.docs.map(d => d.data()));

    if (snapshot.empty) {
      notificationsList.innerHTML = `<p style="opacity:0.7;">No new notifications yet.</p>`;
      return;
    }

    const items = snapshot.docs.map(docSnap => {
      const n = docSnap.data();
      const time = n.timestamp?.seconds
        ? new Date(n.timestamp.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "--:--";
      return `
        <div class="notification-item ${n.read ? "" : "unread"}" data-id="${docSnap.id}">
          <span>${n.message || "(no message)"}</span>
          <span class="notification-time">${time}</span>
        </div>
      `;
    });

    notificationsList.innerHTML = items.join("");
  });

  // Mark all as read
  if (markAllBtn) {
    markAllBtn.onclick = async () => {
      const snapshot = await getDocs(notifRef);
      for (const docSnap of snapshot.docs) {
        const ref = doc(db, "users", currentUser.uid, "notifications", docSnap.id);
        await updateDoc(ref, { read: true });
      }
      showStarPopup("✅ All notifications marked as read.");
    };
  }

  notificationsListenerAttached = true;
}

/* ===== Tab Switching (Lazy attach for notifications) ===== */
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.onclick = async () => {
    // Switch tabs visually
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(tab => tab.style.display = "none");

    btn.classList.add("active");
    const tabContent = document.getElementById(btn.dataset.tab);
    if (tabContent) tabContent.style.display = "block";

    // Attach notifications listener lazily
    if (btn.dataset.tab === "notificationsTab" && !notificationsListenerAttached) {
      await attachNotificationsListener();
    }
  };
});

/* ---------- 🆔 ChatID Modal ---------- */
async function promptForChatID(userRef, userData) {
  if (!refs.chatIDModal || !refs.chatIDInput || !refs.chatIDConfirmBtn)
    return userData?.chatId || null;

  // Skip if user already set chatId
  if (userData?.chatId && !userData.chatId.startsWith("GUEST"))
    return userData.chatId;

  refs.chatIDInput.value = "";
  refs.chatIDModal.style.display = "flex";
  if (refs.sendAreaEl) refs.sendAreaEl.style.display = "none";

  return new Promise(resolve => {
    refs.chatIDConfirmBtn.onclick = async () => {
      const chosen = refs.chatIDInput.value.trim();
      if (chosen.length < 3 || chosen.length > 12)
        return alert("Chat ID must be 3–12 characters");

      const lower = chosen.toLowerCase();
      const q = query(collection(db, "users"), where("chatIdLower", "==", lower));
      const snap = await getDocs(q);

      let taken = false;
      snap.forEach(docSnap => {
        if (docSnap.id !== userRef.id) taken = true;
      });
      if (taken) return alert("This Chat ID is taken 💬");

      try {
        await updateDoc(userRef, { chatId: chosen, chatIdLower: lower });
        currentUser.chatId = chosen;
        currentUser.chatIdLower = lower;
        refs.chatIDModal.style.display = "none";
        if (refs.sendAreaEl) refs.sendAreaEl.style.display = "flex";
        showStarPopup(`Welcome ${chosen}! 🎉`);
        resolve(chosen);
      } catch (err) {
        console.error(err);
        alert("Failed to save Chat ID");
      }
    };
  });
}


/* ===============================
   FINAL VIP LOGIN SYSTEM — 100% WORKING
   Google disabled | VIP button works | Safe auto-login
================================= */

/* BLOCK GOOGLE LOGIN — looks normal, clickable, shows message */
document.querySelectorAll(
  "#googleLoginBtn, .google-btn, #googleSignInBtn, #googlesigninbtn, [data-google-login]"
).forEach(btn => {
  if (!btn) return;

    // Make it look 100% normal
    btn.style.cssText = "";
    btn.disabled = false;

    // Remove ALL old listeners (the nuclear fix)
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    // Add our clean handler
    newBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      showStarPopup("Google Sign-Up is not available at the moment.<br>Use VIP Email Login instead.");
    });
});

// FINAL: WORKING LOGIN BUTTON — THIS MAKES SIGN IN ACTUALLY WORK
document.getElementById("whitelistLoginBtn")?.addEventListener("click", async () => {
  const email = document.getElementById("emailInput")?.value.trim().toLowerCase();
  const password = document.getElementById("passwordInput")?.value;

  if (!email || !password) {
    showStarPopup("Enter email and password");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will handle everything else — just wait
    showStarPopup("Logging in...");
  } catch (err) {
    console.error("Login failed:", err.code);
    if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
      showStarPopup("Wrong email or password");
    } else if (err.code === "auth/too-many-requests") {
      showStarPopup("Too many tries. Wait a minute.");
    } else {
      showStarPopup("Login failed. Check console.");
    }
  }
});

/* LOGOUT */
window.logoutVIP = async () => {
  await signOut(auth);
  localStorage.removeItem("lastVipEmail");
  location.reload();
};


/* FINAL WORKING LOGOUT — WORKS NO MATTER WHAT YOUR BUTTON IS */
document.addEventListener("click", async function(e) {
  // Detect ANY logout click — by text, class, id, or data attribute
  const target = e.target;
  const isLogout = 
    target.id === "logoutBtn" ||
    target.classList.contains("logout-btn") ||
    target.closest("[data-logout]") ||
    target.textContent.toLowerCase().includes("log out") ||
    target.textContent.toLowerCase().includes("sign out") ||
    target.getAttribute("onclick")?.includes("signOut");

  if (!isLogout) return;

  e.preventDefault();
  e.stopPropagation();

  console.log("LOGOUT DETECTED — cleaning everything");

  try {
    await signOut(auth);
    localStorage.removeItem("lastVipEmail");     // THIS STOPS AUTO-RELOGIN
    sessionStorage.setItem("justLoggedOut", "1");
    currentUser = null;

    showStarPopup("You have been logged out");

    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    console.error("Logout failed:", err);
  }
});

/* ALSO — block auto-login right after logout */
window.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem("justLoggedOut")) {
    console.log("User just logged out — blocking auto-login");
    sessionStorage.removeItem("justLoggedOut");
    // Do NOT run tryAutoLogin() here
    return;
  }

  // Only run auto-login if not just logged out
  setTimeout(tryAutoLogin, 1000);
});

/* ===============================
   💫 Auto Star Earning System
================================= */
function startStarEarning(uid) {
  if (!uid) return;
  if (starInterval) clearInterval(starInterval);

  const userRef = doc(db, "users", uid);
  let displayedStars = currentUser.stars || 0;
  let animationTimeout = null;

  // ✨ Smooth UI update
  const animateStarCount = target => {
    if (!refs.starCountEl) return;
    const diff = target - displayedStars;

    if (Math.abs(diff) < 1) {
      displayedStars = target;
      refs.starCountEl.textContent = formatNumberWithCommas(displayedStars);
      return;
    }

    displayedStars += diff * 0.25; // smoother easing
    refs.starCountEl.textContent = formatNumberWithCommas(Math.floor(displayedStars));
    animationTimeout = setTimeout(() => animateStarCount(target), 40);
  };

  // 🔄 Real-time listener
  onSnapshot(userRef, snap => {
    if (!snap.exists()) return;
    const data = snap.data();
    const targetStars = data.stars || 0;
    currentUser.stars = targetStars;

    if (animationTimeout) clearTimeout(animationTimeout);
    animateStarCount(targetStars);

    // 🎉 Milestone popup
    if (targetStars > 0 && targetStars % 1000 === 0) {
      showStarPopup(`🔥 Congrats! You’ve reached ${formatNumberWithCommas(targetStars)} stars!`);
    }
  });

  // ⏱️ Increment loop
  starInterval = setInterval(async () => {
    if (!navigator.onLine) return;

    const snap = await getDoc(userRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const today = todayDate();

    // Reset daily count
    if (data.lastStarDate !== today) {
      await updateDoc(userRef, { starsToday: 0, lastStarDate: today });
      return;
    }

    // Limit: 250/day
    if ((data.starsToday || 0) < 250) {
      await updateDoc(userRef, {
        stars: increment(10),
        starsToday: increment(10)
      });
    }
  }, 60000);

  // 🧹 Cleanup
  window.addEventListener("beforeunload", () => clearInterval(starInterval));
}

/* ===============================
   🧩 Helper Functions
================================= */
const todayDate = () => new Date().toISOString().split("T")[0];
const sleep = ms => new Promise(res => setTimeout(res, ms));


/* ===============================
   🧠 UI Updates After Auth (Improved)
================================= */
function updateUIAfterAuth(user) {
  const subtitle = document.getElementById("roomSubtitle");
  const helloText = document.getElementById("helloText");
  const roomDescText = document.querySelector(".room-desc .text");
  const hostsBtn = document.getElementById("openHostsBtn");
  const loginBar = document.getElementById("loginBar"); // adjust if different ID

  // Keep Star Hosts button always visible
  if (hostsBtn) hostsBtn.style.display = "block";

  if (user) {
    // Hide intro texts only for logged-in users
    if (subtitle) subtitle.style.display = "none";
    if (helloText) helloText.style.display = "none";
    if (roomDescText) roomDescText.style.display = "none";

    if (loginBar) loginBar.style.display = "flex";
  } else {
    // Show intro texts for guests
    if (subtitle) subtitle.style.display = "block";
    if (helloText) helloText.style.display = "block";
    if (roomDescText) roomDescText.style.display = "block";

    if (loginBar) loginBar.style.display = "flex";
  }
}

/* ===============================
   💬 Show Chat UI After Login
================================= */
function showChatUI(user) {
  const { authBox, sendAreaEl, profileBoxEl, profileNameEl, starCountEl, cashCountEl, adminControlsEl } = refs;

  // Hide login/auth elements
  document.getElementById("emailAuthWrapper")?.style?.setProperty("display", "none");
  document.getElementById("googleSignInBtn")?.style?.setProperty("display", "none");
  document.getElementById("vipAccessBtn")?.style?.setProperty("display", "none");

  // Show chat interface
  authBox && (authBox.style.display = "none");
  sendAreaEl && (sendAreaEl.style.display = "flex");
  profileBoxEl && (profileBoxEl.style.display = "block");

  if (profileNameEl) {
    profileNameEl.innerText = user.chatId;
    profileNameEl.style.color = user.usernameColor;
  }

  if (starCountEl) starCountEl.textContent = formatNumberWithCommas(user.stars);
  if (cashCountEl) cashCountEl.textContent = formatNumberWithCommas(user.cash);
  if (adminControlsEl) adminControlsEl.style.display = user.isAdmin ? "flex" : "none";

  // 🔹 Apply additional UI updates (hide intro, show hosts)
  updateUIAfterAuth(user);
}

/* ===============================
   🚪 Hide Chat UI On Logout
================================= */
function hideChatUI() {
  const { authBox, sendAreaEl, profileBoxEl, adminControlsEl } = refs;

  authBox && (authBox.style.display = "block");
  sendAreaEl && (sendAreaEl.style.display = "none");
  profileBoxEl && (profileBoxEl.style.display = "none");
  if (adminControlsEl) adminControlsEl.style.display = "none";

  // 🔹 Restore intro UI (subtitle, hello text, etc.)
  updateUIAfterAuth(null);
}

/* =======================================
   🚀 DOMContentLoaded Bootstrap
======================================= */
window.addEventListener("DOMContentLoaded", () => {

  /* ----------------------------
     ⚡ Smooth Loading Bar Helper
  ----------------------------- */
  function showLoadingBar(duration = 1000) {
    const postLoginLoader = document.getElementById("postLoginLoader");
    const loadingBar = document.getElementById("loadingBar");
    if (!postLoginLoader || !loadingBar) return;

    postLoginLoader.style.display = "flex";
    loadingBar.style.width = "0%";

    let progress = 0;
    const interval = 50;
    const step = 100 / (duration / interval);

    const loadingInterval = setInterval(() => {
      progress += step + Math.random() * 4; // adds organic feel
      loadingBar.style.width = `${Math.min(progress, 100)}%`;

      if (progress >= 100) {
        clearInterval(loadingInterval);
        setTimeout(() => postLoginLoader.style.display = "none", 250);
      }
    }, interval);
  }

  /* ----------------------------
     🧩 Cache DOM References
  ----------------------------- */
  refs = {
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
    adminClearMessagesBtn: document.getElementById("adminClearMessagesBtn"),
    chatIDModal: document.getElementById("chatIDModal"),
    chatIDInput: document.getElementById("chatIDInput"),
    chatIDConfirmBtn: document.getElementById("chatIDConfirmBtn")
  };

  if (refs.chatIDInput) refs.chatIDInput.maxLength = 12;

  /* ----------------------------
     🔐 VIP Login Setup
  ----------------------------- */
  const emailInput = document.getElementById("emailInput");
  const phoneInput = document.getElementById("phoneInput");
  const loginBtn = document.getElementById("whitelistLoginBtn");

  async function handleLogin() {
    const email = (emailInput?.value || "").trim().toLowerCase();
    const phone = (phoneInput?.value || "").trim();

    if (!email || !phone) {
      return showStarPopup("Enter your email and phone to get access.");
    }

    showLoadingBar(1000);
    await sleep(50);

    const success = await loginWhitelist(email, phone);
    if (!success) return;

    await sleep(400);
    updateRedeemLink();
    updateTipLink();
  }

  loginBtn?.addEventListener("click", handleLogin);

  /* ----------------------------
     🔁 Auto Login Session
  ----------------------------- */
 async function autoLogin() {
  const vipUser = JSON.parse(localStorage.getItem("vipUser"));
  if (vipUser?.email && vipUser?.phone) {
    showLoadingBar(1000);
    await sleep(60);
    const success = await loginWhitelist(vipUser.email, vipUser.phone);
    if (!success) return;
    await sleep(400);
    updateRedeemLink();
    updateTipLink();
  }
}

// Call on page load
autoLogin();


/* ----------------------------
   ⚡ Global setup for local message tracking
----------------------------- */
let localPendingMsgs = JSON.parse(localStorage.getItem("localPendingMsgs") || "{}"); 
// structure: { tempId: { content, uid, chatId, createdAt } }

/* ================================
   SEND MESSAGE + BUZZ (2025 FINAL)
   - Secure Firestore paths
   - Uses getUserId() correctly
   - No permission errors
   - Buzz works perfectly
   - Instant local echo + reply support
================================ */

// Helper: Clear reply state
function clearReplyAfterSend() {
  if (typeof cancelReply === "function") cancelReply();
  currentReplyTarget = null;
  refs.messageInputEl.placeholder = "Type a message...";
}

// SEND REGULAR MESSAGE
refs.sendBtn?.addEventListener("click", async () => {
  try {
    if (!currentUser) return showStarPopup("Sign in to chat.");

    const txt = refs.messageInputEl?.value.trim();
    if (!txt) return showStarPopup("Type a message first.");
    if ((currentUser.stars || 0) < SEND_COST)
      return showStarPopup("Not enough stars to send message.");

    // Deduct stars locally + in Firestore
    currentUser.stars -= SEND_COST;
    refs.starCountEl.textContent = formatNumberWithCommas(currentUser.stars);
    await updateDoc(doc(db, "users", currentUser.uid), {
      stars: increment(-SEND_COST)
    });

    // Create temp message (local echo)
    const tempId = "temp_" + Date.now();
    const newMsg = {
      content: txt,
      uid: currentUser.uid || "unknown",
      chatId: currentUser.chatId || "anon",
      usernameColor: currentUser.usernameColor || "#ff69b4",  // COLORS ARE BACK
      timestamp: { toMillis: () => Date.now() },
      highlight: false,
      buzzColor: null,
      replyTo: currentReplyTarget?.id || null,
      replyToContent: currentReplyTarget?.content || null,
      tempId
    };

    // Store temp message locally for dedupe
    let localPendingMsgs = JSON.parse(localStorage.getItem("localPendingMsgs") || "{}");
    localPendingMsgs[tempId] = { ...newMsg, createdAt: Date.now() };
    localStorage.setItem("localPendingMsgs", JSON.stringify(localPendingMsgs));

    // Reset input + scroll
    refs.messageInputEl.value = "";
    clearReplyAfterSend();
    scrollToBottom(refs.messagesEl);

    // RENDER LOCAL ECHO IMMEDIATELY
    renderMessagesFromArray([newMsg]);

    // SEND TO FIRESTORE — USING YOUR DYNAMIC CHAT_COLLECTION
    const msgRef = await addDoc(collection(db, CHAT_COLLECTION), {
      content: txt,
      uid: currentUser.uid,
      chatId: currentUser.chatId,
      usernameColor: currentUser.usernameColor || "#ff69b4",   // SAVED IN DB
      timestamp: serverTimestamp(),
      highlight: false,
      buzzColor: null,
      replyTo: currentReplyTarget?.id || null,
      replyToContent: currentReplyTarget?.content || null
      // tempId is NOT sent — clean Firestore doc
    });

    // Clean up pending on success
    delete localPendingMsgs[tempId];
    localStorage.setItem("localPendingMsgs", JSON.stringify(localPendingMsgs));

    console.log("Message sent & saved:", msgRef.id);

  } catch (err) {
    console.error("Message send error:", err);
    showStarPopup("Message failed: " + (err.message || "Network error"));

    // Refund stars on fail
    currentUser.stars += SEND_COST;
    refs.starCountEl.textContent = formatNumberWithCommas(currentUser.stars);
  }
});

// BUZZ MESSAGE (EPIC GLOW EFFECT)
refs.buzzBtn?.addEventListener("click", async () => {
  if (!currentUser?.email) return showStarPopup("Sign in to BUZZ.");

  const text = refs.messageInputEl?.value.trim();
  if (!text) return showStarPopup("Type a message to BUZZ");

  const userRef = doc(db, "users", getUserId(currentUser.email));
  const snap = await getDoc(userRef);
  const stars = snap.data()?.stars || 0;

  if (stars < BUZZ_COST) 
    return showStarPopup(`Need ${BUZZ_COST} stars for BUZZ.`);

  try {
    const buzzColor = randomColor();

    // Deduct + send in one go
    await runTransaction(db, async (transaction) => {
      transaction.update(userRef, { stars: increment(-BUZZ_COST) });
      transaction.set(addDoc(collection(db, "chats", "main", "messages")), {
        content: text,
        senderId: getUserId(currentUser.email),
        chatId: currentUser.chatId || currentUser.email.split("@")[0],
        timestamp: serverTimestamp(),
        highlight: true,
        buzzColor
      });
    });

    currentUser.stars -= BUZZ_COST;
    refs.starCountEl.textContent = formatNumberWithCommas(currentUser.stars);
    refs.messageInputEl.value = "";
    clearReplyAfterSend();
    scrollToBottom(refs.messagesEl);

    showStarPopup("BUZZ SENT! Everyone felt that!");
    console.log("BUZZ sent with color:", buzzColor);

  } catch (err) {
    console.error("BUZZ failed:", err);
    showStarPopup("BUZZ failed. Try again.");
  }
});
  /* ----------------------------
     👋 Rotating Hello Text
  ----------------------------- */
  const greetings = ["HELLO","HOLA","BONJOUR","CIAO","HALLO","こんにちは","你好","안녕하세요","SALUT","OLÁ","NAMASTE","MERHABA"];
  const helloEl = document.getElementById("helloText");
  let greetIndex = 0;

  setInterval(() => {
    if (!helloEl) return;
    helloEl.style.opacity = "0";

    setTimeout(() => {
      helloEl.innerText = greetings[greetIndex++ % greetings.length];
      helloEl.style.color = randomColor();
      helloEl.style.opacity = "1";
    }, 220);
  }, 1500);

  /* ----------------------------
     🧩 Tiny Helpers
  ----------------------------- */
  const scrollToBottom = el => {
    if (!el) return;
    requestAnimationFrame(() => el.scrollTop = el.scrollHeight);
  };
  const sleep = ms => new Promise(res => setTimeout(res, ms));
});

/* =====================================
   🎥 Video Navigation & UI Fade Logic
======================================= */
(() => {
  const videoPlayer = document.getElementById("videoPlayer");
  const prevBtn = document.getElementById("prev");
  const nextBtn = document.getElementById("next");
  const container = document.querySelector(".video-container");
  const navButtons = [prevBtn, nextBtn].filter(Boolean);

  if (!videoPlayer || navButtons.length === 0) return;

  // Wrap the video in a relative container if not already
  const videoWrapper = document.createElement("div");
  videoWrapper.style.position = "relative";
  videoWrapper.style.display = "inline-block";
  videoPlayer.parentNode.insertBefore(videoWrapper, videoPlayer);
  videoWrapper.appendChild(videoPlayer);

  // ---------- Create hint overlay inside video ----------
  const hint = document.createElement("div");
  hint.className = "video-hint";
  hint.style.position = "absolute";
  hint.style.bottom = "10%"; // slightly above bottom
  hint.style.left = "50%";
  hint.style.transform = "translateX(-50%)"; // horizontal center
  hint.style.padding = "2px 8px";
  hint.style.background = "rgba(0,0,0,0.5)";
  hint.style.color = "#fff";
  hint.style.borderRadius = "12px";
  hint.style.fontSize = "14px";
  hint.style.opacity = "0";
  hint.style.pointerEvents = "none";
  hint.style.transition = "opacity 0.4s";
  videoWrapper.appendChild(hint);

  const showHint = (msg, timeout = 1500) => {
    hint.textContent = msg;
    hint.style.opacity = "1";
    clearTimeout(hint._t);
    hint._t = setTimeout(() => (hint.style.opacity = "0"), timeout);
  };

  // 🎞️ Video list (Shopify video)
  const videos = [
    "https://cdn.shopify.com/videos/c/o/v/aa400d8029e14264bc1ba0a47babce47.mp4",
    "https://cdn.shopify.com/videos/c/o/v/45c20ba8df2c42d89807c79609fe85ac.mp4"
  ];

  let currentVideo = 0;
  let hideTimeout = null;

  /* ----------------------------
       ▶️ Load & Play Video
  ----------------------------- */
  const loadVideo = (index) => {
    if (index < 0) index = videos.length - 1;
    if (index >= videos.length) index = 0;

    currentVideo = index;
    videoPlayer.src = videos[currentVideo];
    videoPlayer.muted = true;

    // Wait for metadata before playing
    videoPlayer.addEventListener("loadedmetadata", function onMeta() {
      videoPlayer.play().catch(() => console.warn("Autoplay may be blocked by browser"));
      videoPlayer.removeEventListener("loadedmetadata", onMeta);
    });
  };

  /* ----------------------------
       🔊 Toggle Mute on Tap
  ----------------------------- */
  videoPlayer.addEventListener("click", () => {
    videoPlayer.muted = !videoPlayer.muted;
    showHint(videoPlayer.muted ? "Tap to unmute" : "Sound on");
  });

  /* ----------------------------
       ⏪⏩ Navigation Buttons
  ----------------------------- */
  prevBtn?.addEventListener("click", () => loadVideo(currentVideo - 1));
  nextBtn?.addEventListener("click", () => loadVideo(currentVideo + 1));

  /* ----------------------------
       👀 Auto Hide/Show Buttons
  ----------------------------- */
  const showButtons = () => {
    navButtons.forEach(btn => {
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    });
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      navButtons.forEach(btn => {
        btn.style.opacity = "0";
        btn.style.pointerEvents = "none";
      });
    }, 3000);
  };

  navButtons.forEach(btn => {
    btn.style.transition = "opacity 0.6s ease";
    btn.style.opacity = "0";
    btn.style.pointerEvents = "none";
  });

  ["mouseenter", "mousemove", "click"].forEach(evt => container?.addEventListener(evt, showButtons));
  container?.addEventListener("mouseleave", () => {
    navButtons.forEach(btn => {
      btn.style.opacity = "0";
      btn.style.pointerEvents = "none";
    });
  });

  // Start with first video
  loadVideo(0);

  // Show initial hint after video metadata loads
  videoPlayer.addEventListener("loadedmetadata", () => {
    showHint("Tap to unmute", 1500);
  });
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


/* ---------- SECURE + WORKING: Featured Hosts (2025 Final Version) ---------- */
async function fetchFeaturedHosts() {
  try {
    const docRef = doc(db, "featuredHosts", "current");
    const snap = await getDoc(docRef);

    if (!snap.exists() || !snap.data().hosts?.length) {
      console.warn("No featured hosts found.");
      hosts = [];
      renderHostAvatars();
      return;
    }

    const hostIds = snap.data().hosts;
    const hostPromises = hostIds.map(async (id) => {
      const userSnap = await getDoc(doc(db, "users", id));
      return userSnap.exists() ? { id, ...userSnap.data() } : null;
    });

    hosts = (await Promise.all(hostPromises)).filter(Boolean);
    console.log("Featured hosts loaded:", hosts.length);

    renderHostAvatars();
    loadHost(currentIndex >= hosts.length ? 0 : currentIndex);

  } catch (err) {
    console.warn("Featured hosts offline or not set up");
    hosts = [];
    renderHostAvatars();
  }
}

// Call it once
fetchFeaturedHosts();

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
    const emailId = (currentUser.email || "").replace(/\./g, "_");
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



/* ========== SOCIAL CARD + GIFT SYSTEM — FINAL 2025 SECURE VERSION ========== */
const socialCardCache = new Map(); // caches loaded profiles

// MAIN FUNCTION — CALL THIS WHEN USER TAPS A USERNAME
async function showSocialCard(userId) {
  if (!userId) return;

  // Return cached version instantly
  if (socialCardCache.has(userId)) {
    renderSocialCard(socialCardCache.get(userId));
    return;
  }

  try {
    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);

    let profile = {
      fullName: "Mystery VIP",
      chatId: userId.split('_')[0],
      bioPick: "✨ Nothing shared yet...",
      gender: "person",
      age: 25,
      location: "Lagos",
      country: "Nigeria",
      fruitPick: "strawberry",
      naturePick: "cool",
      isHost: false,
      isVIP: true,
      usernameColor: "#ff69b4",
      stars: 0
    };

    if (snap.exists()) {
      const data = snap.data();
      Object.assign(profile, data);
      profile.chatId = data.chatId || userId.split('_')[0];
    }

    socialCardCache.set(userId, profile);
    renderSocialCard(profile);

  } catch (err) {
    console.log("Social card: user offline/private");
    renderSocialCard(profile); // show mystery VIP
  }
}

// RENDERS THE ACTUAL CARD (your beautiful design — unchanged!)
function renderSocialCard(user) {
  document.getElementById('socialCard')?.remove();
  const card = document.createElement('div');
  card.id = 'socialCard';
  Object.assign(card.style, {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    background: 'linear-gradient(135deg, rgba(20,20,22,0.9), rgba(25,25,27,0.9))',
    backdropFilter: 'blur(10px)', borderRadius: '14px', padding: '12px 16px',
    color: '#fff', width: '230px', maxWidth: '90%', zIndex: '999999',
    textAlign: 'center', boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
    fontFamily: 'Poppins, sans-serif', opacity: '0',
    transition: 'opacity .18s ease, transform .18s ease'
  });

  // Close button
  const closeBtn = document.createElement('div');
  closeBtn.innerHTML = '×';
  Object.assign(closeBtn.style, { position: 'absolute', top: '6px', right: '10px', fontSize: '16px', fontWeight: '700', color: '#fff', cursor: 'pointer', opacity: '0.6' });
  closeBtn.onmouseenter = () => closeBtn.style.opacity = '1';
  closeBtn.onmouseleave = () => closeBtn.style.opacity = '0.6';
  closeBtn.onclick = e => { e.stopPropagation(); card.remove(); };
  card.appendChild(closeBtn);

  // Header
  const header = document.createElement('h3');
  header.textContent = (user.chatId || "VIP").charAt(0).toUpperCase() + (user.chatId || "VIP").slice(1);
  const color = user.isHost ? '#ff6600' : user.isVIP ? '#ff0099' : '#cccccc';
  header.style.cssText = `margin:0 0 8px; font-size:18px; font-weight:700; background: linear-gradient(90deg, ${color}, #ff33cc); -webkit-background-clip: text; -webkit-text-fill-color: transparent;`;
  card.appendChild(header);

  // Details
  const details = document.createElement('p');
  details.style.cssText = 'margin:0 0 10px; font-size:14px; line-height:1.4;';
  const gender = (user.gender || "person").toLowerCase();
  const pronoun = gender === "male" ? "his" : "her";
  const ageGroup = !user.age ? "20s" : user.age >= 30 ? "30s" : "20s";
  const flair = gender === "male" ? "cool" : "kiss";
  const fruit = user.fruitPick || "grape";
  const nature = user.naturePick || "cool";
  const city = user.location || user.city || "Lagos";
  const country = user.country || "Nigeria";

  if (user.isHost) {
    details.innerHTML = `A ${fruit} ${nature} ${gender} in ${pronoun} ${ageGroup}, currently in ${city}, ${country}. ${flair}`;
  } else {
    details.innerHTML = `A ${gender} in ${pronoun} ${ageGroup}, currently in ${city}, ${country}. ${flair}`;
  }
  card.appendChild(details);

  // Bio
  const bioEl = document.createElement('div');
  bioEl.style.cssText = 'margin:6px 0 12px; font-style:italic; font-weight:600; font-size:13px;';
  bioEl.style.color = ['#ff99cc','#ffcc33','#66ff99','#66ccff','#ff6699','#ff9966','#ccccff','#f8b500'][Math.floor(Math.random()*8)];
  card.appendChild(bioEl);
  let i = 0;
  const text = user.bioPick || 'Nothing shared yet...';
  const iv = setInterval(() => {
    bioEl.textContent += text.charAt(i++) || '';
    if (i >= text.length) clearInterval(iv);
  }, 35);

  // Gift button + slider (same as yours — just cleaned up)
  const btnWrap = document.createElement('div');
  btnWrap.style.cssText = 'display:flex; flex-direction:column; gap:8px; align-items:center; margin-top:4px;';

  const sliderPanel = document.createElement('div');
  sliderPanel.style.cssText = 'width:100%; padding:6px 8px; border-radius:8px; background:rgba(255,255,255,0.06); backdrop-filter:blur(8px); display:flex; align-items:center; gap:8px; justify-content:space-between;';
  
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = 0; slider.max = 999; slider.value = 100;
  slider.style.flex = '1'; slider.style.height = '4px'; slider.style.borderRadius = '4px'; slider.style.outline = 'none'; slider.style.cursor = 'pointer'; slider.style.appearance = 'none';
  const grad = ['#ff0000','#ff8c00','#ff4500','#ffd700','#ff1493','#ff6347','#ff5500','#ffcc00','#ff3300','#ff0066'][Math.floor(Math.random()*10)];
  slider.style.background = `linear-gradient(90deg, ${grad}, #fff)`;

  const label = document.createElement('span');
  label.textContent = '100 ⭐️';
  label.style.fontSize = '13px';

  slider.oninput = () => label.textContent = `${slider.value} ⭐️`;

  const giftBtn = document.createElement('button');
  giftBtn.textContent = 'Gift ⭐️';
  giftBtn.style.cssText = 'padding:7px 14px; border-radius:6px; border:none; font-weight:600; background:linear-gradient(90deg,#ff0099,#ff0066); color:#fff; cursor:pointer;';
  giftBtn.onclick = async () => {
    const amt = parseInt(slider.value);
    if (amt < 100) return showStarPopup("Minimum 100 ⭐️");
    if ((currentUser?.stars || 0) < amt) return showStarPopup("Not enough stars");
    try {
      await sendStarsToUser(user, amt);
      card.remove();
    } catch (e) { console.error(e); }
  };

  sliderPanel.append(slider, label);
  btnWrap.append(sliderPanel, giftBtn);
  card.append(btnWrap);
  document.body.appendChild(card);

  requestAnimationFrame(() => {
    card.style.opacity = '1';
    card.style.transform = 'translate(-50%, -50%) scale(1.02)';
    setTimeout(() => card.style.transform = 'translate(-50%, -50%) scale(1)', 120);
  });

  const closeOutside = e => { if (!card.contains(e.target)) card.remove(); document.removeEventListener('click', closeOutside); };
  setTimeout(() => document.addEventListener('click', closeOutside), 10);
}

// TAP DETECTION — ADD THIS ONCE
document.addEventListener('pointerdown', e => {
  const usernameEl = e.target.closest('.username');
  if (!usernameEl) return;
  const userId = usernameEl.dataset.userId;
  if (!userId || userId === getUserId(currentUser?.email)) return;

  // Visual feedback
  const orig = usernameEl.style.backgroundColor;
  usernameEl.style.backgroundColor = '#ffcc00';
  setTimeout(() => usernameEl.style.backgroundColor = orig, 180);

  showSocialCard(userId);
});

// --- SEND STARS FUNCTION (Ephemeral Banner + Dual showGiftAlert + Receiver Sync + Notification) ---
async function sendStarsToUser(targetUser, amt) {
  try {
    const fromRef = doc(db, "users", currentUser.uid);
    const toRef = doc(db, "users", targetUser._docId);
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
const notifRef = collection(db, "notifications");
await addDoc(notifRef, {
  userId: targetUser._docId, // 🔥 link the notification to the receiver
  message: `💫 ${currentUser.chatId} gifted you ${amt} ⭐!`,
  read: false,
  timestamp: serverTimestamp(),
  type: "starGift",
  fromUserId: currentUser.uid,
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


// ---------- DEBUGGABLE HOST INIT (drop-in) ----------
(function () {
  // Toggle this dynamically in your app
  const isHost = true; // <-- make sure this equals true at runtime for hosts

  // Small helper: wait for a set of elements to exist (polling)
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

  // Safe getter w/ default
  const $ = (sel) => document.querySelector(sel);

  // run everything after DOM ready (and still robust if DOM already loaded)
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

    // 1) Wait for the most important elements that must exist for host flow.
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

      // Show wrapper/button
      hostSettingsWrapperEl.style.display = "block";

      // close button - optional but preferred
      const closeModalEl = hostModalEl.querySelector(".close");
      if (!closeModalEl) {
        console.warn("[host-init] close button (.close) not found inside #hostModal.");
      }

      // --- attach tab init (shared across modals)
      function initTabsForModal(modalEl) {
        modalEl.querySelectorAll(".tab-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            modalEl.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
            // Hide only tab-content referenced by dataset or global shared notifications
            document.querySelectorAll(".tab-content").forEach((tab) => (tab.style.display = "none"));
            btn.classList.add("active");
            const target = document.getElementById(btn.dataset.tab);
            if (target) target.style.display = "block";
            else console.warn("[host-init] tab target not found:", btn.dataset.tab);
          });
        });
      }
      initTabsForModal(hostModalEl);

      // --- host button click: show modal + populate
      hostSettingsBtnEl.addEventListener("click", async () => {
        try {
          hostModalEl.style.display = "block";

          if (!currentUser?.uid) {
            console.warn("[host-init] currentUser.uid missing");
            return showStarPopup("⚠️ Please log in first.");
          }

          const userRef = doc(db, "users", currentUser.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            console.warn("[host-init] user doc not found for uid:", currentUser.uid);
            return showStarPopup("⚠️ User data not found.");
          }
          const data = snap.data() || {};
          // populate safely (guard each element)
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
          // picks
          const natureEl = document.getElementById("naturePick");
          if (natureEl) natureEl.value = data.naturePick || "";
          const fruitEl = document.getElementById("fruitPick");
          if (fruitEl) fruitEl.value = data.fruitPick || "";

          // preview photo
          if (data.popupPhoto) {
            const photoPreview = document.getElementById("photoPreview");
            const photoPlaceholder = document.getElementById("photoPlaceholder");
            if (photoPreview) {
              photoPreview.src = data.popupPhoto;
              photoPreview.style.display = "block";
            }
            if (photoPlaceholder) photoPlaceholder.style.display = "none";
          } else {
            // ensure preview hidden if no photo
            const photoPreview = document.getElementById("photoPreview");
            const photoPlaceholder = document.getElementById("photoPlaceholder");
            if (photoPreview) photoPreview.style.display = "none";
            if (photoPlaceholder) photoPlaceholder.style.display = "inline-block";
          }

        } catch (err) {
          console.error("[host-init] error in hostSettingsBtn click:", err);
          showStarPopup("⚠️ Failed to open settings. Check console.");
        }
      });

      // --- close handlers
      if (closeModalEl) {
        closeModalEl.addEventListener("click", () => (hostModalEl.style.display = "none"));
      }
      window.addEventListener("click", (e) => {
        if (e.target === hostModalEl) hostModalEl.style.display = "none";
      });

      // --- photo preview handler (delegated)
      document.addEventListener("change", (e) => {
        if (e.target && e.target.id === "popupPhoto") {
          const file = e.target.files?.[0];
          if (!file) return;
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
          reader.readAsDataURL(file);
        }
      });

      // --- save info button (safe)
      const maybeSaveInfo = document.getElementById("saveInfo");
      if (maybeSaveInfo) {
        maybeSaveInfo.addEventListener("click", async () => {
          if (!currentUser?.uid) return showStarPopup("⚠️ Please log in first.");
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
            return showStarPopup("⚠️ Bank account number must be digits only (max 11).");
          if (dataToUpdate.whatsapp && dataToUpdate.whatsapp && !/^\d+$/.test(dataToUpdate.whatsapp))
            return showStarPopup("⚠️ WhatsApp number must be numbers only.");

          const originalHTML = maybeSaveInfo.innerHTML;
          maybeSaveInfo.innerHTML = `<div class="spinner" style="width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation: spin 0.6s linear infinite;margin:auto;"></div>`;
          maybeSaveInfo.disabled = true;

          try {
            const userRef = doc(db, "users", currentUser.uid);
            const filteredData = Object.fromEntries(Object.entries(dataToUpdate).filter(([_, v]) => v !== undefined));
            await updateDoc(userRef, { ...filteredData, lastUpdated: serverTimestamp() });
            // mirror to featuredHosts if exists
            const hostRef = doc(db, "featuredHosts", currentUser.uid);
            const hostSnap = await getDoc(hostRef);
            if (hostSnap.exists()) await updateDoc(hostRef, { ...filteredData, lastUpdated: serverTimestamp() });

            showStarPopup("✅ Profile updated successfully!");
            // blur inputs for UX
            document.querySelectorAll("#mediaTab input, #mediaTab textarea, #mediaTab select").forEach(i => i.blur());
          } catch (err) {
            console.error("[host-init] saveInfo error:", err);
            showStarPopup("⚠️ Failed to update info. Please try again.");
          } finally {
            maybeSaveInfo.innerHTML = originalHTML;
            maybeSaveInfo.disabled = false;
          }
        });
      } else {
        console.warn("[host-init] saveInfo button not found.");
      }

      // --- save media button (optional)
      const maybeSaveMedia = document.getElementById("saveMedia");
      if (maybeSaveMedia) {
        maybeSaveMedia.addEventListener("click", async () => {
          if (!currentUser?.uid) return showStarPopup("⚠️ Please log in first.");
          const popupPhotoFile = document.getElementById("popupPhoto")?.files?.[0];
          const uploadVideoFile = document.getElementById("uploadVideo")?.files?.[0];
          if (!popupPhotoFile && !uploadVideoFile) return showStarPopup("⚠️ Please select a photo or video to upload.");
          try {
            showStarPopup("⏳ Uploading media...");
            const formData = new FormData();
            if (popupPhotoFile) formData.append("photo", popupPhotoFile);
            if (uploadVideoFile) formData.append("video", uploadVideoFile);
            const res = await fetch("/api/uploadShopify", { method: "POST", body: formData });
            if (!res.ok) throw new Error("Upload failed.");
            const data = await res.json();
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, {
              ...(data.photoUrl && { popupPhoto: data.photoUrl }),
              ...(data.videoUrl && { videoUrl: data.videoUrl }),
              lastUpdated: serverTimestamp()
            });
            if (data.photoUrl) {
              const photoPreview = document.getElementById("photoPreview");
              const photoPlaceholder = document.getElementById("photoPlaceholder");
              if (photoPreview) {
                photoPreview.src = data.photoUrl;
                photoPreview.style.display = "block";
              }
              if (photoPlaceholder) photoPlaceholder.style.display = "none";
            }
            showStarPopup("✅ Media uploaded successfully!");
            hostModalEl.style.display = "none";
          } catch (err) {
            console.error("[host-init] media upload error:", err);
            showStarPopup(`⚠️ Failed to upload media: ${err.message}`);
          }
        });
      } else {
        console.info("[host-init] saveMedia button not present (ok if VIP-only UI).");
      }

      console.log("[host-init] Host logic initialized successfully.");
    } catch (err) {
      console.error("[host-init] Could not find required host elements:", err);
      // helpful message for debugging during development:
      showStarPopup("⚠️ Host UI failed to initialize. Check console for details.");
    }
  }); // ready
})();


/* =======================================
   Dynamic Host Panel Greeting + Scroll Arrow
========================================== */
function capitalizeFirstLetter(str) {
  if (!str) return "Guest";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function setGreeting() {
  if (!currentUser?.chatId) {
    document.getElementById("hostPanelTitle").textContent = "Host Panel";
    return;
  }

  const name = capitalizeFirstLetter(currentUser.chatId.replace(/_/g, " "));
  const hour = new Date().getHours();
  let greeting;

  if (hour < 12) {
    greeting = `Good Morning, ${name}!`;
  } else if (hour < 18) {
    greeting = `Good Afternoon, ${name}!`;
  } else {
    greeting = `Good Evening, ${name}!`;
  }

  const titleEl = document.getElementById("hostPanelTitle");
  if (titleEl) titleEl.textContent = greeting;
}

/* Run greeting when host panel opens */
document.getElementById("hostSettingsBtn")?.addEventListener("click", () => {
  setGreeting();
});

/* =======================================
   Scroll to Bottom Arrow (Smart & Smooth)
========================================== */
const chatContainer = document.getElementById("chatContainer") || document.getElementById("messages");

if (scrollArrow && chatContainer) {
  let fadeTimeout = null;

  function showArrow() {
    scrollArrow.classList.add("show");
    if (fadeTimeout) clearTimeout(fadeTimeout);
    fadeTimeout = setTimeout(() => {
      scrollArrow.classList.remove("show");
    }, 3000);
  }

  function checkScroll() {
    const distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;

    if (distanceFromBottom > 300) {
      showArrow();
    } else {
      scrollArrow.classList.remove("show");
    }
  }

  // Listen to scroll
  chatContainer.addEventListener("scroll", checkScroll);

  // Click to scroll down
  scrollArrow.addEventListener("click", () => {
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: "smooth"
    });
  });

  // Initial check
  setTimeout(checkScroll, 1000);

  // Re-check when new messages come in
  const observer = new MutationObserver(checkScroll);
  observer.observe(chatContainer, { childList: true, subtree: true });
}


const scrollArrow = document.getElementById('scrollArrow');
  let fadeTimeout;

  function showArrow() {
    scrollArrow.classList.add('show');
    if (fadeTimeout) clearTimeout(fadeTimeout);
    fadeTimeout = setTimeout(() => {
      scrollArrow.classList.remove('show');
    }, 2000); // disappears after 2 seconds
  }

  function checkScroll() {
    const distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
    if (distanceFromBottom > 200) { // threshold for showing arrow
      showArrow();
    }
  }

  chatContainer.addEventListener('scroll', checkScroll);

  scrollArrow.addEventListener('click', () => {
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: 'smooth'
    });
  });
  
checkScroll(); // initial check
}); // ✅ closes DOMContentLoaded event listener


/* ---------- Highlights Button ---------- */
highlightsBtn.onclick = async () => {
  try {
    if (!currentUser?.uid) {
      showGoldAlert("Please log in to view highlights 🔒");
      return;
    }

    const highlightsRef = collection(db, "highlightVideos");
    const q = query(highlightsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      showGoldAlert("No highlights uploaded yet ⚡");
      return;
    }

    const videos = snapshot.docs.map(docSnap => {
      const d = docSnap.data();
      const uploaderName = d.uploaderName || d.chatId || d.displayName || d.username || "Anonymous";
      return {
        id: docSnap.id,
        highlightVideo: d.highlightVideo,
        highlightVideoPrice: d.highlightVideoPrice || 0,
        title: d.title || "Untitled",
        uploaderName,
        uploaderId: d.uploaderId || "",
        uploaderEmail: d.uploaderEmail || "unknown",
        description: d.description || "",
        thumbnail: d.thumbnail || "",
        createdAt: d.createdAt || null,
        unlockedBy: d.unlockedBy || [],
        previewClip: d.previewClip || ""
      };
    });

    showHighlightsModal(videos);
  } catch (err) {
    console.error("🔥 Error fetching highlights:", err);
    showGoldAlert("Error fetching highlights — please try again.");
  }
};
/* ---------- Highlights Modal (DOPE + ORIGINAL SIZES + EDGE X) ---------- */
function showHighlightsModal(videos) {
  document.getElementById("highlightsModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "highlightsModal";
  Object.assign(modal.style, {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0,0,0,0.9)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    zIndex: "999999",
    overflowY: "auto",
    padding: "20px",
    boxSizing: "border-box",
    fontFamily: "system-ui, sans-serif"
  });

  // === STICKY INTRO (Your Size, My Glow) ===
  const intro = document.createElement("div");
  intro.innerHTML = `
    <div style="text-align:center;color:#ccc;max-width:640px;margin:0 auto;line-height:1.6;font-size:14px;
      background:linear-gradient(135deg,rgba(255,0,110,0.12),rgba(255,100,0,0.08));
            padding:14px 48px 14px 20px;  /* right padding for X */
      border:1px solid rgba(255,0,110,0.3);box-shadow:0 0 16px rgba(255,0,110,0.15);">
      <p style="margin:0;">
        <span style="background:linear-gradient(90deg,#ff006e,#ff8c00);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;">
          Highlights
        </span> 🎬 are exclusive creator moments.<br>
        Unlock premium clips with ⭐ Stars to support your favorite creators.
      </p>
    </div>`;
  Object.assign(intro.style, {
    position: "sticky",
    top: "10px",
    zIndex: "1001",
    marginBottom: "12px",
    transition: "opacity 0.3s ease"
  });
  modal.appendChild(intro);

  modal.addEventListener("scroll", () => {
    intro.style.opacity = modal.scrollTop > 50 ? "0.7" : "1";
  });

  // === SEARCH + TOGGLE (Your Exact Layout & Sizes) ===
  const searchWrap = document.createElement("div");
  Object.assign(searchWrap.style, {
    position: "sticky",
    top: "84px",
    zIndex: "1001",
    marginBottom: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px"
  });

  // Search Input (280px)
  const searchInputWrap = document.createElement("div");
  searchInputWrap.style.cssText = `
    display:flex;align-items:center;
    background:linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04));
    border:1px solid rgba(255,0,110,0.3);
    border-radius:30px;padding:8px 14px;width:280px;
    backdrop-filter:blur(8px);box-shadow:0 0 12px rgba(255,0,110,0.15);
  `;
  searchInputWrap.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 15L21 21M10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10C17 13.866 13.866 17 10 17Z" 
            stroke="url(#gradSearch)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <defs><linearGradient id="gradSearch" x1="3" y1="3" x2="21" y2="21"><stop stop-color="#ff006e"/><stop offset="1" stop-color="#ff8c00"/></linearGradient></defs>
    </svg>
    <input id="highlightSearchInput" type="text" placeholder="Search by creator..." 
           style="flex:1;background:transparent;border:none;outline:none;color:#fff;font-size:13px;letter-spacing:0.3px;"/>
  `;
  searchWrap.appendChild(searchInputWrap);

  // Toggle Button
  const toggleBtn = document.createElement("button");
  toggleBtn.id = "toggleLocked";
  toggleBtn.textContent = "Show Unlocked";
  Object.assign(toggleBtn.style, {
    padding: "4px 10px",
    borderRadius: "6px",
    background: "linear-gradient(135deg, #333, #222)",
    color: "#fff",
    border: "1px solid rgba(255,0,110,0.3)",
    fontSize: "12px",
    cursor: "pointer",
    fontWeight: "600",
    transition: "all 0.2s",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
  });
  toggleBtn.onmouseenter = () => {
    toggleBtn.style.background = "linear-gradient(135deg, #ff006e, #ff8c00)";
    toggleBtn.style.transform = "translateY(-1px)";
  };
  toggleBtn.onmouseleave = () => {
    toggleBtn.style.background = "linear-gradient(135deg, #333, #222)";
    toggleBtn.style.transform = "translateY(0)";
  };
  searchWrap.appendChild(toggleBtn);
  modal.appendChild(searchWrap);

  // === DOPE X BUTTON — NO PAD, OG EFFECT, INSIDE PANEL ===
  const closeBtn = document.createElement("div");
  closeBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 6L6 18M6 6L18 18" stroke="#ff006e" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`;
  Object.assign(closeBtn.style, {
    position: "absolute",
    top: "14px",
    right: "16px",
    width: "24px",
    height: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    zIndex: "1002",
    transition: "transform 0.2s ease",
    filter: "drop-shadow(0 0 6px rgba(255,0,110,0.3))"
  });

  // OG DOPE EFFECT: Rotate + Scale
  closeBtn.onmouseenter = () => {
    closeBtn.style.transform = "rotate(90deg) scale(1.15)";
  };
  closeBtn.onmouseleave = () => {
    closeBtn.style.transform = "rotate(0deg) scale(1)";
  };
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    closeBtn.style.transform = "rotate(180deg) scale(1.3)";
    setTimeout(() => modal.remove(), 180);
  };

  // Attach to intro panel
  intro.querySelector("div").appendChild(closeBtn);
  
  // === HORIZONTAL CONTENT ===
  const content = document.createElement("div");
  Object.assign(content.style, {
    display: "flex",
    gap: "16px",
    flexWrap: "nowrap",
    overflowX: "auto",
    paddingBottom: "40px",
    scrollBehavior: "smooth",
    width: "100%",
    justifyContent: "flex-start"
  });
  modal.appendChild(content);

  let unlockedVideos = JSON.parse(localStorage.getItem("userUnlockedVideos") || "[]");
  let showUnlockedOnly = false;

  function renderCards(videosToRender) {
    content.innerHTML = "";
    const filtered = videosToRender.filter(v => !showUnlockedOnly || unlockedVideos.includes(v.id));

    filtered.forEach(video => {
      const isUnlocked = unlockedVideos.includes(video.id);

      const card = document.createElement("div");
      Object.assign(card.style, {
        minWidth: "230px", maxWidth: "230px", background: "#1b1b1b", borderRadius: "12px",
        overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "space-between",
        cursor: "pointer", flexShrink: 0, boxShadow: "0 4px 16px rgba(255,0,110,0.15)",
        transition: "transform 0.3s ease, box-shadow 0.3s ease", border: "1px solid rgba(255,0,110,0.2)"
      });
      card.onmouseenter = () => {
        card.style.transform = "scale(1.03)";
        card.style.boxShadow = "0 8px 24px rgba(255,0,110,0.3)";
      };
      card.onmouseleave = () => {
        card.style.transform = "scale(1)";
        card.style.boxShadow = "0 4px 16px rgba(255,0,110,0.15)";
      };
      card.classList.add("videoCard");
      card.setAttribute("data-uploader", video.uploaderName || "Anonymous");
      card.setAttribute("data-title", video.title || "");

      const videoContainer = document.createElement("div");
      Object.assign(videoContainer.style, { height: "320px", overflow: "hidden", position: "relative" });

      const videoEl = document.createElement("video");
      videoEl.src = video.previewClip || video.highlightVideo;
      videoEl.muted = true; videoEl.controls = false; videoEl.loop = true; videoEl.preload = "metadata";
      videoEl.poster = video.thumbnail || `https://image-thumbnails-service/?video=${encodeURIComponent(video.highlightVideo)}&blur=10`;
      videoEl.style.cssText = `
        width:100%;height:100%;object-fit:cover;
        filter: ${isUnlocked ? 'none' : "blur(6px)"};
        transition: filter 0.4s ease;
      `;

      if (!isUnlocked) {
        const lock = document.createElement("div");
        lock.innerHTML = `
          <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(0,0,0,0.65),rgba(255,0,110,0.25));
                      display:flex;align-items:center;justify-content:center;z-index:2;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C9.2 2 7 4.2 7 7V11H6C4.9 11 4 11.9 4 13V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V13C20 11.9 19.1 11 18 11H17V7C17 4.2 14.8 2 12 2ZM12 4C13.7 4 15 5.3 15 7V11H9V7C9 5.3 10.3 4 12 4Z" fill="#ff006e"/>
            </svg>
          </div>`;
        videoContainer.appendChild(lock);
      }

      videoContainer.appendChild(videoEl);

      if (!isUnlocked) {
        videoContainer.onmouseenter = () => videoEl.play().catch(() => {});
        videoContainer.onmouseleave = () => { videoEl.pause(); videoEl.currentTime = 0; };
      }

      videoContainer.onclick = (e) => {
        e.stopPropagation();
        if (isUnlocked) playFullVideo(video);
        else showUnlockConfirm(video, () => renderCards(videos));
      };

      const infoPanel = document.createElement("div");
      Object.assign(infoPanel.style, {
        background: "#111", padding: "10px", display: "flex", flexDirection: "column", textAlign: "left", gap: "4px"
      });

      const vidTitle = document.createElement("div");
      vidTitle.textContent = video.title || "Untitled";
      Object.assign(vidTitle.style, { fontWeight: "700", color: "#fff", fontSize: "14px" });

      const uploader = document.createElement("div");
      uploader.textContent = `By: ${video.uploaderName || "Anonymous"}`;
      Object.assign(uploader.style, { fontSize: "12px", color: "#ff006e" });

      const unlockBtn = document.createElement("button");
      unlockBtn.textContent = isUnlocked ? "Unlocked" : `Unlock ${video.highlightVideoPrice || 100} ⭐`;
      Object.assign(unlockBtn.style, {
        background: isUnlocked ? "#333" : "linear-gradient(135deg, #ff006e, #ff4500)",
        border: "none",
        borderRadius: "6px",
        padding: "8px 0",
        fontWeight: "600",
        color: "#fff",
        cursor: isUnlocked ? "default" : "pointer",
        transition: "all 0.2s",
        fontSize: "13px",
        boxShadow: isUnlocked ? "inset 0 2px 6px rgba(0,0,0,0.3)" : "0 3px 10px rgba(255,0,110,0.3)"
      });

      if (!isUnlocked) {
        unlockBtn.onmouseenter = () => {
          unlockBtn.style.background = "linear-gradient(135deg, #ff3385, #ff6600)";
          unlockBtn.style.transform = "translateY(-1px)";
        };
        unlockBtn.onmouseleave = () => {
          unlockBtn.style.background = "linear-gradient(135deg, #ff006e, #ff4500)";
          unlockBtn.style.transform = "translateY(0)";
        };
        unlockBtn.onclick = (e) => {
          e.stopPropagation();
          showUnlockConfirm(video, () => {
            unlockedVideos = JSON.parse(localStorage.getItem("userUnlockedVideos") || "[]");
            renderCards(videos);
          });
        };
      } else {
        unlockBtn.disabled = true;
      }

      infoPanel.append(vidTitle, uploader, unlockBtn);
      card.append(videoContainer, infoPanel);
      content.appendChild(card);
    });
  }

  renderCards(videos);

  // Search & Toggle
  searchInputWrap.querySelector("#highlightSearchInput").addEventListener("input", e => {
    const term = e.target.value.trim().toLowerCase();
    content.querySelectorAll(".videoCard").forEach(card => {
      const uploader = card.getAttribute("data-uploader")?.toLowerCase() || "";
      const title = card.getAttribute("data-title")?.toLowerCase() || "";
      card.style.display = (uploader.includes(term) || title.includes(term)) ? "flex" : "none";
    });
  });

  toggleBtn.addEventListener("click", () => {
    showUnlockedOnly = !showUnlockedOnly;
    toggleBtn.textContent = showUnlockedOnly ? "Show All" : "Show Unlocked";
    renderCards(videos);
  });

  document.body.appendChild(modal);

  setTimeout(() => searchInputWrap.querySelector("input").focus(), 300);
}

/* ---------- Sorting helper ---------- */
function sortVideos(videos, mode="all"){
  const unlockedIds = JSON.parse(localStorage.getItem("userUnlockedVideos")||"[]");
  if(mode==="unlocked") return videos.filter(v=>unlockedIds.includes(v.id));
  if(mode==="locked") return videos.filter(v=>!unlockedIds.includes(v.id));
  return videos;
}

/* ---------- Unlock Confirm Modal ---------- */
function showUnlockConfirm(video, onUnlockCallback) {
  document.querySelectorAll("video").forEach(v => v.pause());
  document.getElementById("unlockConfirmModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "unlockConfirmModal";
  Object.assign(modal.style, {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0,0,0,0.93)",
    backdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "1000001",
    opacity: "1",
  });

  modal.innerHTML = `
    <div style="background:#111;padding:20px;border-radius:12px;text-align:center;color:#fff;max-width:320px;box-shadow:0 0 20px rgba(0,0,0,0.5);">
      <h3 style="margin-bottom:10px;font-weight:600;">Unlock "${video.title}"?</h3>
      <p style="margin-bottom:16px;">This will cost <b>${video.highlightVideoPrice} ⭐</b></p>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button id="cancelUnlock" style="padding:8px 16px;background:#333;border:none;color:#fff;border-radius:8px;font-weight:500;">Cancel</button>
        <button id="confirmUnlock" style="padding:8px 16px;background:linear-gradient(90deg,#ff0099,#ff6600);border:none;color:#fff;border-radius:8px;font-weight:600;">Yes</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#cancelUnlock").onclick = () => modal.remove();
  modal.querySelector("#confirmUnlock").onclick = async () => {
    modal.remove();
    await handleUnlockVideo(video);
    if (onUnlockCallback) onUnlockCallback();
  };
}

/* ---------- Unlock Logic ---------- */
async function handleUnlockVideo(video) {
  try {
    const senderId = currentUser.uid;
    const receiverId = video.uploaderId;
    const starsToDeduct = parseInt(video.highlightVideoPrice, 10) || 0;

    if (!starsToDeduct || starsToDeduct <= 0)
      return showGoldAlert("Invalid unlock price ❌");
    if (senderId === receiverId)
      return showGoldAlert("You can’t unlock your own video 😅");

    const senderRef = doc(db, "users", senderId);
    const receiverRef = doc(db, "users", receiverId);
    const videoRef = doc(db, "highlightVideos", video.id);

    await runTransaction(db, async (tx) => {
      const senderSnap = await tx.get(senderRef);
      const receiverSnap = await tx.get(receiverRef);
      const videoSnap = await tx.get(videoRef);

      if (!senderSnap.exists()) throw new Error("User record not found.");
      if (!receiverSnap.exists()) tx.set(receiverRef, { stars: 0 }, { merge: true });

      const senderData = senderSnap.data();
      if ((senderData.stars || 0) < starsToDeduct)
        throw new Error("Insufficient stars ⭐");

      // Deduct and add stars
      tx.update(senderRef, { stars: increment(-starsToDeduct) });
      tx.update(receiverRef, { stars: increment(starsToDeduct) });

      // Add sender info to video unlockedBy using client timestamp
      tx.update(videoRef, {
        unlockedBy: arrayUnion({
          userId: senderId,
          chatId: currentUser.chatId || "unknown",
          unlockedAt: new Date() // <-- replace serverTimestamp()
        })
      });

      // Add video to user unlockedVideos
      tx.update(senderRef, { unlockedVideos: arrayUnion(video.id) });
    });

    // Update localStorage for UI
    const unlockedIds = JSON.parse(localStorage.getItem("userUnlockedVideos") || "[]");
    if (!unlockedIds.includes(video.id)) unlockedIds.push(video.id);
    localStorage.setItem("userUnlockedVideos", JSON.stringify(unlockedIds));
    localStorage.setItem(`unlocked_${video.id}`, "true");

    showGoldAlert(`✅ You unlocked ${video.uploaderName}'s video for ${starsToDeduct} ⭐`);
    document.getElementById("highlightsModal")?.remove();
    showHighlightsModal([video]);

  } catch (err) {
    console.error("❌ Unlock failed:", err);
    showGoldAlert(`⚠️ ${err.message}`);
  }
}
// ---------- Play Full Video Modal ----------
function playFullVideo(video) {
  const modal = document.createElement("div");
  Object.assign(modal.style, {
    position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
    background: "rgba(0,0,0,0.95)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: "1000002"
  });

  const vid = document.createElement("video");
  vid.src = video.highlightVideo;
  vid.controls = true;
  vid.autoplay = true;
  vid.style.maxWidth = "90%";
  vid.style.maxHeight = "90%";
  vid.style.borderRadius = "12px";

  modal.appendChild(vid);
  modal.onclick = () => modal.remove();
  document.body.appendChild(modal);
}
// Minimal Logout Handler
document.addEventListener("click", async e => {
  if (!e.target.closest("[data-logout]")) return; // detects any element with data-logout

  e.preventDefault();
  e.stopPropagation();

  // Optional: disable button to prevent double-click
  e.target.disabled = true;

  try {
    await signOut(auth);                     // Firebase logout
    localStorage.removeItem("lastVipEmail"); // stop auto-login
    sessionStorage.setItem("justLoggedOut", "1");
    currentUser = null;

    showStarPopup("You have been logged out");

    setTimeout(() => location.reload(), 1200); // or redirect to login page
  } catch (err) {
    console.error("Logout failed:", err);
    e.target.disabled = false; // re-enable if it fails
    showStarPopup("Logout failed. Check console.");
  }
});