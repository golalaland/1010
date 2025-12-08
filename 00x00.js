// admin-payfeed.js — FINAL ETERNAL ADMIN PANEL (2025 EDITION)
// Font: 乂丨乂丨 — You are God tier

console.log("✅ Admin panel JS loaded");

// ---------- Firebase imports ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const db = getFirestore(app);

// ---------- DOM ----------
const adminGate = document.getElementById("adminGate");
const adminPanel = document.getElementById("adminPanel");
const adminEmailInput = document.getElementById("adminEmail");
const adminCheckBtn = document.getElementById("adminCheckBtn");
const adminGateMsg = document.getElementById("adminGateMsg");
const currentAdminEmailEl = document.getElementById("currentAdminEmail");
const logoutBtn = document.getElementById("logoutBtn");

// Tabs & Tables
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

const usersTableBody = document.querySelector("#usersTable tbody");
const whitelistTableBody = document.querySelector("#whitelistTable tbody");
const featuredTableBody = document.querySelector("#featuredTable tbody");
const withdrawalsTableBody = document.querySelector("#withdrawalsTable tbody");

// Buttons
const exportCurrentCsv = document.getElementById("exportCurrentCsv");
const exportFeaturedCsv = document.getElementById("exportFeaturedCsv");
const exportWithdrawalsCsv = document.getElementById("exportWithdrawalsCsv");

// Loader
const loaderOverlay = document.getElementById("loaderOverlay");
const loaderText = document.getElementById("loaderText");

// ---------- Utilities ----------
function showLoader(text = "Working...") {
  loaderText.textContent = text;
  loaderOverlay.style.display = "flex";
}
function hideLoader() { loaderOverlay.style.display = "none"; }

function sanitizeCSVCell(s) { return String(s ?? "").replace(/"/g, '""'); }

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${sanitizeCSVCell(c)}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

function createToggle(value = false) {
  const chk = document.createElement("input");
  chk.type = "checkbox";
  chk.checked = !!value;
  chk.style.transform = "scale(1.15)";
  return chk;
}

// ---------- Admin Auth ----------
let currentAdmin = null;

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

  showLoader("Verifying admin...");
  const admin = await checkAdmin(email);
  hideLoader();

  if (!admin) {
    adminGateMsg.textContent = "Not an admin";
    return;
  }

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

// ---------- Tab System ----------
tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ---------- USERS TAB ----------
async function loadUsers() {
  if (!usersTableBody) return;
  usersTableBody.innerHTML = "<tr><td colspan='14' style='text-align:center;padding:60px;color:#666;'>Loading...</td></tr>";

  try {
    const snap = await getDocs(collection(db, "users"));
    usersTableBody.innerHTML = "";

    snap.forEach(doc => {
      const u = { id: doc.id, ...doc.data() };
      const tr = document.createElement("tr");
      tr.dataset.id = u.id;

      tr.innerHTML = `
        <td><input type="checkbox" class="row-select"></td>
        <td>${u.id}</td>
        <td><input type="number" class="edit-stars" value="${u.stars||0}" style="width:90px"></td>
        <td><input type="number" class="edit-cash" value="${u.cash||0}" style="width:90px"></td>
        <td><input type="checkbox" class="edit-vip" ${u.isVIP ? "checked" : ""}></td>
        <td><input type="checkbox" class="edit-admin" ${u.isAdmin ? "checked" : ""}></td>
        <td><input type="checkbox" class="edit-host" ${u.isHost ? "checked" : ""}></td>
        <td><button class="btn btn-primary small save-user">Save</button></td>
      `;

      tr.querySelector(".save-user").onclick = async () => {
        const updates = {
          stars: Number(tr.querySelector(".edit-stars").value),
          cash: Number(tr.querySelector(".edit-cash").value),
          isVIP: tr.querySelector(".edit-vip").checked,
          isAdmin: tr.querySelector(".edit-admin").checked,
          isHost: tr.querySelector(".edit-host").checked,
        };
        await updateDoc(doc(db, "users", u.id), updates);
        showGoldAlert("User updated");
      };

      usersTableBody.appendChild(tr);
    });
  } catch (e) {
    usersTableBody.innerHTML = "<tr><td colspan='14' style='color:#f66;'>Load failed</td></tr>";
  }
}

// ---------- WHITELIST & FEATURED (unchanged — working perfectly) ----------
async function loadWhitelist() { /* your existing code — keep it */ }
async function loadFeatured() { /* your existing code — keep it */ }

// ---------- WITHDRAWALS TAB — NEW & SEXY ----------
async function loadWithdrawals() {
  if (!withdrawalsTableBody) return;

  withdrawalsTableBody.innerHTML = "<tr><td colspan='8' style='text-align:center;padding:80px;color:#888;'>Loading withdrawals...</td></tr>";

  try {
    const q = query(collection(db, "withdrawals"), orderBy("requestedAt", "desc"));
    const snap = await getDocs(q);

    withdrawalsTableBody.innerHTML = "";

    if (snap.empty) {
      withdrawalsTableBody.innerHTML = "<tr><td colspan='8' style='text-align:center;padding:80px;color:#666;'>No withdrawal requests yet</td></tr>";
      return;
    }

    snap.forEach(doc => {
      const w = doc.data();
      const tr = document.createElement("tr");
      tr.dataset.id = doc.id;
      tr.style.fontFamily = "'乂丨乂丨', monospace";

      const statusColor = w.status === "pending" ? "#ff6b6b" : w.status === "resolved" ? "#51cf66" : "#ffd43b";

      tr.innerHTML = `
        <td>${new Date(w.requestedAt.toDate()).toLocaleString()}</td>
        <td>${w.username || "Unknown"}</td>
        <td>${w.uid.replace(/_/g, ".")}</td>
        <td style="color:#00ffea;font-weight:700;">₦${w.amount.toLocaleString()}</td>
        <td>${w.bankName || "—"}</td>
        <td>${w.bankAccountNumber || "—"}</td>
        <td><span style="color:${statusColor};font-weight:700;padding:6px 12px;border-radius:8px;background:rgba(255,255,255,0.1);">${w.status.toUpperCase()}</span></td>
        <td>
          ${w.status === "pending" ? `
            <button class="resolve-withdrawal btn btn-primary small" data-id="${doc.id}">
              Mark Resolved
            </button>` : '<span style="color:#666;">—</span>'
          }
        </td>
      `;

      withdrawalsTableBody.appendChild(tr);
    });

    // Resolve buttons
    document.querySelectorAll(".resolve-withdrawal").forEach(btn => {
      btn.onclick = async () => {
        if (!confirm("Mark this withdrawal as RESOLVED?")) return;
        showLoader("Updating status...");
        try {
          await updateDoc(doc(db, "withdrawals", btn.dataset.id), {
            status: "resolved",
            resolvedAt: serverTimestamp(),
            resolvedBy: currentAdmin.email
          });
          showGoldAlert("Withdrawal marked as resolved");
          loadWithdrawals();
        } catch (e) {
          showGoldAlert("Failed to update");
        } finally {
          hideLoader();
        }
      };
    });

  } catch (err) {
    console.error(err);
    withdrawalsTableBody.innerHTML = "<tr><td colspan='8' style='color:#f66;text-align:center;padding:60px;'>Failed to load</td></tr>";
  }
}

// ---------- CSV EXPORTS ----------
exportCurrentCsv?.addEventListener("click", async () => {
  const rows = [["Document ID","Email","Stars","Cash","VIP","Admin","Host"]];
  const snap = await getDocs(collection(db, "users"));
  snap.forEach(d => {
    const u = d.data();
    rows.push([d.id, u.email||"", u.stars||0, u.cash||0, !!u.isVIP, !!u.isAdmin, !!u.isHost]);
  });
  downloadCSV(`users_export_${new Date().toISOString().slice(0,10)}.csv`, rows);
});

exportFeaturedCsv?.addEventListener("click", async () => {
  const rows = [["Document ID","Email","Phone","Popup Photo","Video URL"]];
  const snap = await getDocs(collection(db, "featuredHosts"));
  snap.forEach(d => {
    const f = d.data();
    rows.push([d.id, f.email||"", f.phone||"", f.popupPhoto||"", f.videoUrl||""]);
  });
  downloadCSV(`featured_export_${new Date().toISOString().slice(0,10)}.csv`, rows);
});

exportWithdrawalsCsv?.addEventListener("click", async () => {
  const rows = [["Date","Username","User ID","Amount","Bank","Account","Status","Note"]];
  const snap = await getDocs(query(collection(db, "withdrawals"), orderBy("requestedAt", "desc")));
  snap.forEach(d => {
    const w = d.data();
    rows.push([
      new Date(w.requestedAt.toDate()).toLocaleString(),
      w.username || "",
      w.uid?.replace(/_/g, ".") || "",
      w.amount || 0,
      w.bankName || "",
      w.bankAccountNumber || "",
      w.status || "pending",
      w.note || ""
    ]);
  });
  downloadCSV(`withdrawals_${new Date().toISOString().slice(0,10)}.csv`, rows);
});

// ---------- INITIAL LOAD ----------
if (currentAdmin) {
  loadUsers();
  loadWhitelist();
  loadFeatured();
  loadWithdrawals();
}
