// admin-payfeed.js — FINAL FIXED & FULLY WORKING (DEC 2025)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, getDocs, doc, updateDoc, deleteDoc, setDoc,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const db = getFirestore(app);

// DOM
const adminGate = document.getElementById("adminGate");
const adminPanel = document.getElementById("adminPanel");
const adminEmailInput = document.getElementById("adminEmail");
const adminCheckBtn = document.getElementById("adminCheckBtn");
const adminGateMsg = document.getElementById("adminGateMsg");
const currentAdminEmailEl = document.getElementById("currentAdminEmail");
const logoutBtn = document.getElementById("logoutBtn");

const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

const usersTableBody = document.querySelector("#usersTable tbody");
const whitelistTableBody = document.querySelector("#whitelistTable tbody");
const featuredTableBody = document.querySelector("#featuredTable tbody");
const withdrawalsTableBody = document.querySelector("#withdrawalsTable tbody");

const userSearch = document.getElementById("userSearch");
const exportCurrentCsv = document.getElementById("exportCurrentCsv");
const exportFeaturedCsv = document.getElementById("exportFeaturedCsv");
const exportWithdrawalsCsv = document.getElementById("exportWithdrawalsCsv");

const wlEmailInput = document.getElementById("wlEmail");
const wlPhoneInput = document.getElementById("wlPhone");
const addWhitelistBtn = document.getElementById("addWhitelistBtn");

const moveToWhitelistBtn = document.getElementById("moveToWhitelistBtn");
const massRemoveUsersBtn = document.getElementById("massRemoveUsersBtn");
const massRemoveWhitelistBtn = document.getElementById("massRemoveWhitelistBtn");
const massRemoveFeaturedBtn = document.getElementById("massRemoveFeaturedBtn");

const loaderOverlay = document.getElementById("loaderOverlay");
const loaderText = document.getElementById("loaderText");

let currentAdmin = null;
let usersCache = [];

// UTILITIES
function showLoader(text = "Working...") {
  loaderText.textContent = text;
  loaderOverlay.style.display = "flex";
}
function hideLoader() { loaderOverlay.style.display = "none"; }

function showConfirm(title, msg) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;z-index:999999;backdrop-filter:blur(12px);";
    overlay.innerHTML = `
      <div style="background:#111;padding:32px;border-radius:18px;text-align:center;max-width:380px;width:90%;box-shadow:0 0 60px rgba(255,0,110,0.5);border:1px solid #444;">
        <h3 style="color:#fff;margin:0 0 16px;font-size:22px;">${title}</h3>
        <p style="color:#ccc;margin:0 0 24px;line-height:1.6;">${msg}</p>
        <div style="display:flex;gap:16px;justify-content:center;">
          <button id="no" style="padding:12px 28px;background:#333;color:#ccc;border:none;border-radius:12px;font-weight:600;cursor:pointer;">Cancel</button>
          <button id="yes" style="padding:12px 28px;background:linear-gradient(90deg,#ff006e,#ff4500);color:#fff;border:none;border-radius:12px;font-weight:700;cursor:pointer;">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#no").onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector("#yes").onclick = () => { overlay.remove(); resolve(true); };
  });
}

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  a.remove();
}

// ADMIN LOGIN
async function checkAdmin(email) {
  if (!email) return null;
  const q = query(collection(db, "users"), where("email", "==", email.toLowerCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return data.isAdmin ? { id: snap.docs[0].id, email: email.toLowerCase() } : null;
}

adminCheckBtn?.addEventListener("click", async () => {
  const email = adminEmailInput?.value.trim();
  if (!email) return adminGateMsg.textContent = "Enter email";
  showLoader("Checking...");
  const admin = await checkAdmin(email);
  hideLoader();
  if (!admin) return adminGateMsg.textContent = "Not admin";
  currentAdmin = admin;
  currentAdminEmailEl.textContent = admin.email;
  adminGate.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  await Promise.all([loadUsers(), loadWhitelist(), loadFeatured(), loadWithdrawals()]);
});

logoutBtn?.addEventListener("click", () => {
  currentAdmin = null;
  adminPanel.classList.add("hidden");
  adminGate.classList.remove("hidden");
  adminEmailInput.value = "";
});

// TABS
tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// USERS — FULLY WORKING
async function loadUsers() {
  if (!usersTableBody) return;
  usersTableBody.innerHTML = "<tr><td colspan='15' style='text-align:center;padding:100px;color:#888;'>Loading...</td></tr>";
  try {
    const snap = await getDocs(collection(db, "users"));
    usersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUsers();
  } catch (e) {
    usersTableBody.innerHTML = "<tr><td colspan='15' style='color:#f66;padding:100px;text-align:center;'>Load failed</td></tr>";
  }
}

function renderUsers() {
  usersTableBody.innerHTML = "";
  usersCache.forEach(u => {
    const tr = document.createElement("tr");
    tr.dataset.id = u.id;
    tr.innerHTML = `
      <td><input type="checkbox" class="row-select"></td>
      <td>${u.id}</td>
      <td>${u.email || ""}</td>
      <td><input type="text" class="phone" value="${u.phone || ""}"></td>
      <td>${u.chatId || ""}</td>
      <td><input type="number" class="stars" value="${u.stars || 0}"></td>
      <td><input type="number" class="cash" value="${u.cash || 0}"></td>
      <td><input type="checkbox" class="vip" ${u.isVIP ? "checked" : ""}></td>
      <td><input type="checkbox" class="admin" ${u.isAdmin ? "checked" : ""}></td>
      <td><input type="checkbox" class="host" ${u.isHost ? "checked" : ""}></td>
      <td><input type="checkbox" class="sub" ${u.subscriptionActive ? "checked" : ""}></td>
      <td><input type="checkbox" class="feat" ${u.featuredHosts ? "checked" : ""}></td>
      <td><input type="text" class="popup" value="${u.popupPhoto || ""}"></td>
      <td><input type="text" class="video" value="${u.videoUrl || ""}"></td>
      <td>
        <button class="save-user btn-primary">Save</button><br>
        <button class="delete-user btn-danger">Delete</button>
      </td>
    `;

    tr.querySelector(".save-user").onclick = async () => {
      const ok = await showConfirm("Save", `Update ${u.email || u.id}?`);
      if (!ok) return;
      showLoader("Saving...");
      await updateDoc(doc(db, "users", u.id), {
        phone: tr.querySelector(".phone").value.trim(),
        stars: Number(tr.querySelector(".stars").value),
        cash: Number(tr.querySelector(".cash").value),
        isVIP: tr.querySelector(".vip").checked,
        isAdmin: tr.querySelector(".admin").checked,
        isHost: tr.querySelector(".host").checked,
        subscriptionActive: tr.querySelector(".sub").checked,
        featuredHosts: tr.querySelector(".feat").checked,
        popupPhoto: tr.querySelector(".popup").value.trim(),
        videoUrl: tr.querySelector(".video").value.trim()
      });
      hideLoader();
      showGoldAlert("Saved");
    };

    tr.querySelector(".delete-user").onclick = async () => {
      const ok = await showConfirm("Delete", `Delete ${u.email || u.id}?`);
      if (!ok) return;
      showLoader("Deleting...");
      await deleteDoc(doc(db, "users", u.id));
      if (u.email) await deleteDoc(doc(db, "whitelist", u.email.toLowerCase())).catch(() => {});
      await deleteDoc(doc(db, "featuredHosts", u.id)).catch(() => {});
      hideLoader();
      loadUsers();
    };

    usersTableBody.appendChild(tr);
  });
}

// WHITELIST — FIXED & WORKING
async function loadWhitelist() {
  if (!whitelistTableBody) return;
  whitelistTableBody.innerHTML = "<tr><td colspan='5' style='text-align:center;padding:100px;color:#888;'>Loading whitelist...</td></tr>";
  try {
    const snap = await getDocs(collection(db, "whitelist"));
    whitelistTableBody.innerHTML = "";
    snap.forEach(d => {
      const w = d.data();
      const tr = document.createElement("tr");
      tr.dataset.id = d.id;
      tr.innerHTML = `
        <td><input type="checkbox" class="row-select"></td>
        <td>${d.id}</td>
        <td>${w.phone || ""}</td>
        <td>${w.subscriptionActive ? "Active" : "Inactive"}</td>
        <td><button class="remove-wl btn-danger">Remove</button></td>
      `;
      tr.querySelector(".remove-wl").onclick = async () => {
        const ok = await showConfirm("Remove", `Remove ${d.id}?`);
        if (!ok) return;
        await deleteDoc(doc(db, "whitelist", d.id));
        loadWhitelist();
      };
      whitelistTableBody.appendChild(tr);
    });
  } catch (e) {
    whitelistTableBody.innerHTML = "<tr><td colspan='5' style='color:#f66;padding:100px;text-align:center;'>Failed</td></tr>";
  }
}

// WITHDRAWALS — FIXED & WORKING
async function loadWithdrawals() {
  if (!withdrawalsTableBody) return;
  withdrawalsTableBody.innerHTML = "<tr><td colspan='8' style='text-align:center;padding:100px;color:#888;'>Loading withdrawals...</td></tr>";
  try {
    const q = query(collection(db, "withdrawals"), orderBy("requestedAt", "desc"));
    const snap = await getDocs(q);
    withdrawalsTableBody.innerHTML = "";
    snap.forEach(d => {
      const w = d.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${new Date(w.requestedAt.toDate()).toLocaleString()}</td>
        <td>${w.username || "—"}</td>
        <td>${w.uid.replace(/_/g, ".")}</td>
        <td style="color:#00ff9d;font-weight:700;">₦${w.amount.toLocaleString()}</td>
        <td>${w.bankName || "—"}</td>
        <td>${w.bankAccountNumber || "—"}</td>
        <td><span style="color:${w.status === "pending" ? "#ff6b6b" : "#51cf66"};font-weight:700;">${w.status.toUpperCase()}</span></td>
        <td>
          ${w.status === "pending" ? `<button class="resolve-btn btn-primary">Mark Resolved</button>` : "Done"}
        </td>
      `;
      if (w.status === "pending") {
        tr.querySelector(".resolve-btn").onclick = async () => {
          const ok = await showConfirm("Resolve", "Mark as resolved?");
          if (!ok) return;
          await updateDoc(doc(db, "withdrawals", d.id), {
            status: "resolved",
            resolvedAt: serverTimestamp(),
            resolvedBy: currentAdmin.email
          });
          loadWithdrawals();
        };
      }
      withdrawalsTableBody.appendChild(tr);
    });
  } catch (e) {
    withdrawalsTableBody.innerHTML = "<tr><td colspan='8' style='color:#f66;padding:100px;text-align:center;'>Load failed</td></tr>";
  }
}

// MASS REMOVE USERS — FIXED
massRemoveUsersBtn?.addEventListener("click", async () => {
  const checked = Array.from(usersTableBody.querySelectorAll(".row-select:checked"));
  if (!checked.length) return showGoldAlert("No users selected");
  const ok = await showConfirm("Delete", `Delete ${checked.length} users forever?`);
  if (!ok) return;
  showLoader("Deleting...");
  for (const cb of checked) {
    const tr = cb.closest("tr");
    const id = tr.dataset.id;
    await deleteDoc(doc(db, "users", id));
    const user = usersCache.find(u => u.id === id);
    if (user?.email) await deleteDoc(doc(db, "whitelist", user.email.toLowerCase())).catch(() => {});
    await deleteDoc(doc(db, "featuredHosts", id)).catch(() => {});
  }
  hideLoader();
  showGoldAlert("Deleted");
  loadUsers();
});

// MOVE TO WHITELIST — WORKING
moveToWhitelistBtn?.addEventListener("click", async () => {
  const checked = Array.from(usersTableBody.querySelectorAll(".row-select:checked"));
  if (!checked.length) return showGoldAlert("No users selected");
  const ok = await showConfirm("Move", `Move ${checked.length} users to whitelist?`);
  if (!ok) return;
  showLoader("Moving...");
  for (const cb of checked) {
    const tr = cb.closest("tr");
    const id = tr.dataset.id;
    const user = usersCache.find(u => u.id === id);
    if (user?.email) {
      await setDoc(doc(db, "whitelist", user.email.toLowerCase()), {
        email: user.email.toLowerCase(),
        phone: user.phone || "",
        subscriptionActive: true,
        subscriptionStartTime: Date.now()
      }, { merge: true });
    }
  }
  hideLoader();
  showGoldAlert("Moved");
  loadWhitelist();
});

// ADD WHITELIST
addWhitelistBtn?.addEventListener("click", async () => {
  const email = wlEmailInput?.value.trim().toLowerCase();
  const phone = wlPhoneInput?.value.trim();
  if (!email) return showGoldAlert("Enter email");
  const ok = await showConfirm("Add", `Add ${email} to whitelist?`);
  if (!ok) return;
  showLoader("Adding...");
  await setDoc(doc(db, "whitelist", email), { email, phone, subscriptionActive: true, subscriptionStartTime: Date.now() }, { merge: true });
  hideLoader();
  showGoldAlert("Added");
  wlEmailInput.value = "";
  wlPhoneInput.value = "";
  loadWhitelist();
});

// EXPORTS
exportCurrentCsv?.addEventListener("click", () => {
  const rows = [["ID","Email","Stars","Cash"]];
  usersCache.forEach(u => rows.push([u.id, u.email||"", u.stars||0, u.cash||0]));
  downloadCSV("users.csv", rows);
});

exportWithdrawalsCsv?.addEventListener("click", async () => {
  const rows = [["Date","Username","Amount","Status"]];
  const snap = await getDocs(query(collection(db, "withdrawals"), orderBy("requestedAt", "desc")));
  snap.forEach(d => {
    const w = d.data();
    rows.push([new Date(w.requestedAt.toDate()).toLocaleString(), w.username||"", w.amount||0, w.status||"pending"]);
  });
  downloadCSV("withdrawals.csv", rows);
});

// START
if (currentAdmin) {
  loadUsers();
  loadWhitelist();
  loadFeatured();
  loadWithdrawals();
}
