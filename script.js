// ---> UPDATE THIS LINK WITH YOUR GOOGLE APPS SCRIPT /exec URL <---
const API_URL = "https://script.google.com/macros/s/AKfycbxa5w0x_01aCnOar_ihueNoMdF08sPksQRxStb7UKOs1JaOcerc-AT5_UnwotrbVmjclQ/exec"; 

let currentUser = "";
let currentRole = "";
let editingRow = null; 
let activeBanks = []; 

// --- 1. CORE API CALL ---
async function apiCall(action, payload) {
  // Turn ON the spinner overlay
  document.getElementById('loading-overlay').style.display = 'flex';
  
  try {
      const response = await fetch(API_URL, { 
          method: 'POST', 
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: action, ...payload }) 
      });
      
      const rawText = await response.text();
      try { return JSON.parse(rawText); } 
      catch (err) { return { success: false, message: "Server error parsing response." }; }
  } catch (e) { 
      return { success: false, message: "Network Error: " + e.message }; 
  } finally {
      // Turn OFF the spinner overlay, whether it succeeded or failed
      document.getElementById('loading-overlay').style.display = 'none';
  }
}

// --- 2. NAVIGATION ---
function switchTab(tab) {
  document.getElementById('dashboard-view').style.display = (tab === 'dashboard') ? 'block' : 'none';
  document.getElementById('report-view').style.display = (tab === 'report') ? 'block' : 'none';
  document.getElementById('admin-view').style.display = (tab === 'admin') ? 'block' : 'none';
  
  document.getElementById('nav-dash').className = (tab === 'dashboard') ? 'active' : '';
  document.getElementById('nav-rep').className = (tab === 'report') ? 'active' : '';
  document.getElementById('nav-admin').className = (tab === 'admin') ? 'active' : '';
  
  if(tab === 'admin') { loadUsers(); loadAdminLists(); }
}

async function loadFundsAndCategories() {
  const res = await apiCall('getFundsAndCategories', {});
  
  if (res.success) {
    const fundSelect = document.getElementById('entry-fund');
    const categorySelect = document.getElementById('entry-category');
    
    // Clear existing options (keep the default "Select..." ones)
    fundSelect.innerHTML = '<option value="" disabled selected>Select Fund...</option>';
    categorySelect.innerHTML = '<option value="">Select Category (If applicable)...</option>';
    
    // Populate Active Funds
    res.data.funds.forEach(fund => {
      fundSelect.innerHTML += `<option value="${fund}">${fund}</option>`;
    });
    
    // Populate Categories
    res.data.categories.forEach(category => {
      categorySelect.innerHTML += `<option value="${category}">${category}</option>`;
    });
  } else {
    console.error("Failed to load Funds and Categories:", res.message);
  }
}

// --- 3. LOGIN & INITIALIZATION ---
async function attemptLogin() {
  const u = document.getElementById('username').value, p = document.getElementById('password').value;
  const btn = document.getElementById('login-btn'); btn.innerHTML = "Verifying..."; btn.disabled = true;
  
  const res = await apiCall('verifyUser', { username: u, password: p });
  
  if (res.success) {
    currentUser = res.name; currentRole = res.role;
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-wrapper').style.display = 'block';
    document.getElementById('welcome-text').innerHTML = `User: ${currentUser}`;
    
    if(currentRole === 'admin') {
        document.getElementById('nav-admin').style.display = 'inline-block';
    }
    
    // Load Banks and then Ledger
    const bankRes = await apiCall('getBanks', {});
    activeBanks = (bankRes.success) ? bankRes.data : [];
    updateBankDropdowns();
    loadFundsAndCategories();
    
    const dataRes = await apiCall('getLedgerData', {});
    if(dataRes.success) updateTable(dataRes.data);
    
  } else {
    btn.innerHTML = "Secure Login"; btn.disabled = false;
    document.getElementById('error-message').innerHTML = res.message;
  }
}

// --- 4. DYNAMIC BANK LOGIC ---
function updateBankDropdowns() {
    console.log("Diagnostic - activeBanks is currently:", activeBanks);

    // THE SAFETY NET: Check if activeBanks is actually a list
    if (!Array.isArray(activeBanks)) {
        console.error("Warning: activeBanks is not a list. Attempting to auto-heal...");
        
        // Auto-Heal Scenario 1: It was double-wrapped in an object
        if (activeBanks && activeBanks.data && Array.isArray(activeBanks.data)) {
            activeBanks = activeBanks.data; 
        } 
        // Auto-Heal Scenario 2: It is undefined or completely broken
        else {
            activeBanks = []; 
        }
    }

    const dropdown = document.getElementById('entry-method');
    if (dropdown) {
        // Reset the dropdown to the default blank option
        dropdown.innerHTML = '<option value="" disabled selected>Select Cash/Bank...</option>';
        
        // Populate the active banks
        activeBanks.forEach(bank => {
            dropdown.innerHTML += `<option value="${bank}">${bank}</option>`;
        });
    }
}

// --- UNIFIED ADMIN LIST MANAGER ---
async function loadAdminLists() {
    const res = await apiCall('getAdminLists', {});
    if(res.success) renderAdminLists(res.data);
}

function renderAdminLists(data) {
    // 1. Update Global Variables & Dropdowns
    activeBanks = data.banks;
    updateBankDropdowns();
    loadFundsAndCategories(); // Refreshes the form dropdowns instantly

    // 2. Render Banks
    const bBody = document.getElementById('banks-body');
    if(bBody) {
        bBody.innerHTML = '';
        data.banks.forEach(b => bBody.innerHTML += `<tr><td><strong>${b}</strong></td><td><button class="btn-danger" onclick="delBank('${b}')">Delete</button></td></tr>`);
    }

    // 3. Render Funds (Color coded status!)
    const fBody = document.getElementById('funds-body');
    if(fBody) {
        fBody.innerHTML = '';
        data.funds.forEach(f => {
            const statusColor = f.status.toLowerCase() === 'active' ? 'green' : 'red';
            const btnText = f.status.toLowerCase() === 'active' ? 'Close Fund' : 'Re-Open';
            fBody.innerHTML += `<tr><td><strong>${f.name}</strong></td><td style="color:${statusColor}; font-weight:bold;">${f.status}</td><td><button class="btn-warning" onclick="toggleFund('${f.name}')">${btnText}</button></td></tr>`;
        });
    }

    // 4. Render Categories
    const cBody = document.getElementById('categories-body');
    if(cBody) {
        cBody.innerHTML = '';
        data.categories.forEach(c => cBody.innerHTML += `<tr><td><strong>${c}</strong></td><td><button class="btn-danger" onclick="delCategory('${c}')">Delete</button></td></tr>`);
    }
}

// --- BUTTON ACTIONS ---
async function addNewBank() {
    const v = document.getElementById('new-bank-name').value;
    if(!v) return;
    const res = await apiCall('addBank', { bankName: v });
    if(res.success) { document.getElementById('new-bank-name').value = ''; renderAdminLists(res.data); }
}
async function delBank(b) {
    if(!confirm(`Remove ${b}?`)) return;
    const res = await apiCall('deleteBank', { bankName: b });
    if(res.success) renderAdminLists(res.data);
}

async function addNewFund() {
    const v = document.getElementById('new-fund-name').value;
    if(!v) return;
    const res = await apiCall('addFund', { fundName: v });
    if(res.success) { document.getElementById('new-fund-name').value = ''; renderAdminLists(res.data); }
}
async function toggleFund(f) {
    const res = await apiCall('toggleFund', { fundName: f });
    if(res.success) renderAdminLists(res.data);
}

async function addNewCategory() {
    const v = document.getElementById('new-category-name').value;
    if(!v) return;
    const res = await apiCall('addCategory', { categoryName: v });
    if(res.success) { document.getElementById('new-category-name').value = ''; renderAdminLists(res.data); }
}
async function delCategory(c) {
    if(!confirm(`Remove ${c}?`)) return;
    const res = await apiCall('deleteCategory', { categoryName: c });
    if(res.success) renderAdminLists(res.data);
}

// --- 5. TRANSACTION LOGIC ---
function updateTable(data) {
  const tbody = document.getElementById('ledger-body');
  const boxesContainer = document.getElementById('dynamic-summary-boxes');
  if(!tbody || !boxesContainer) return;

  tbody.innerHTML = '';
  boxesContainer.innerHTML = '';
  
  let balances = { "Cash": 0 };
  activeBanks.forEach(b => balances[b] = 0);

data.forEach(row => {
      let method = row[4].toString().trim();
      
      // 1. Strip the commas out of ALL numbers before doing any math!
      let rec = parseFloat(String(row[5]).replace(/,/g, '')) || 0;
      let pay = parseFloat(String(row[6]).replace(/,/g, '')) || 0;
      let cashBal = parseFloat(String(row[7]).replace(/,/g, '')) || 0;
      let bankBal = parseFloat(String(row[8]).replace(/,/g, '')) || 0;
      
      if(balances[method] !== undefined) balances[method] += (rec - pay);
      else if (method && method !== "Cash") balances[method] = (balances[method] || 0) + (rec - pay);

      let tr = `<tr>
        <td>${row[1]}</td>  <td>${row[2]}</td>  <td>${row[10] || ''}</td> <td>${row[11] || ''}</td> <td>${row[3]}</td>  <td>${row[4]}</td>  <td>${row[5]}</td>  <td>${row[6]}</td>  <td class="bal-col">${cashBal.toFixed(2)}</td>
        <td class="bal-col">${bankBal.toFixed(2)}</td>
        
        <td>${row[9]}</td>  `;
        
      if(currentRole === 'admin') {
         // 3. Use the clean 'rec' and 'pay' variables so the Edit button doesn't drop zeros!
         tr += `<td>
            <button class="btn-warning" onclick="loadTransactionForEdit(${row[12]}, '${row[1]}', '${row[2]}', '${row[3]}', '${row[4]}', ${rec}, ${pay})">Edit</button> 
            <button class="btn-danger" onclick="deleteTx(${row[12]})">Del</button>
         </td>`;
      } else {
         tr += `<td></td>`; 
      }
      tr += `</tr>`; 
      tbody.innerHTML += tr;
  });

  // Render Summary Boxes
  Object.keys(balances).forEach(key => {
      const colorClass = (key === "Cash") ? "cash-bg" : "bank-bg";
      boxesContainer.innerHTML += `<div class="summary-box ${colorClass}"><div style="text-transform:uppercase; font-size:12px;">${key}</div><h2 style="margin:5px 0 0 0;">${balances[key].toFixed(2)}</h2></div>`;
  });
}

async function submitNewEntry() {
  const entryData = {
    date: document.getElementById('entry-date').value,
    details: document.getElementById('entry-details').value,
    voucher: document.getElementById('entry-voucher').value,
    method: document.getElementById('entry-method').value,
    type: document.getElementById('entry-type').value,
    amount: document.getElementById('entry-amount').value,
    fund: document.getElementById('entry-fund').value,           // <-- NEW
    category: document.getElementById('entry-category').value    // <-- NEW
  };
  
  // Strict Validation: Checks if ANY required field is empty (Added fund)
  if(!entryData.date || !entryData.details || !entryData.amount || !entryData.method || !entryData.type || !entryData.fund) {
      return alert("Please fill all required fields and select dropdown options.");
  }
  
  let res = editingRow ? await apiCall('updateTransaction', { rowNum: editingRow, entryData, userName: currentUser }) : await apiCall('addEntry', { entryData, userName: currentUser });

  if (res.success) {
      updateTable(res.data);
      cancelEdit();
      
      // CLEAR FIELDS AFTER SUCCESS
      document.getElementById('entry-details').value = '';
      document.getElementById('entry-voucher').value = '';
      document.getElementById('entry-amount').value = '';
      document.getElementById('entry-method').value = ''; 
      document.getElementById('entry-type').value = '';   
      document.getElementById('entry-fund').value = '';      // <-- NEW
      document.getElementById('entry-category').value = '';  // <-- NEW
  } else {
      alert(res.message);
  }
}

function loadTransactionForEdit(rowNum, date, details, vch, method, rec, pay) {
  const d = date.split('/');
  document.getElementById('entry-date').value = `${d[2]}-${d[1]}-${d[0]}`;
  document.getElementById('entry-details').value = details;
  document.getElementById('entry-voucher').value = vch;
  document.getElementById('entry-method').value = method;
  document.getElementById('entry-type').value = (rec > 0) ? "Receipt" : "Payment";
  document.getElementById('entry-amount').value = (rec > 0) ? rec : pay;
  editingRow = rowNum;
  document.getElementById('submit-btn').innerHTML = "Update Entry";
  document.getElementById('cancel-btn').style.display = "inline-block";
}

function cancelEdit() {
  editingRow = null;
  document.getElementById('entry-details').value = '';
  document.getElementById('entry-amount').value = '';
  document.getElementById('submit-btn').innerHTML = "Post Entry";
  document.getElementById('cancel-btn').style.display = "none";
}

async function deleteTx(row) { if(confirm("Delete?")) { const res = await apiCall('deleteTransaction', { rowNum: row }); if(res.success) updateTable(res.data); } }

// --- 6. REPORT LOGIC ---
async function generateReport() {
  const m = document.getElementById('report-month-picker').value;
  if(!m) return alert("Please select a month first!");

  // --- 1. VISUAL FEEDBACK START ---
  const btn = document.getElementById('generate-btn');
  const originalText = btn.innerHTML; // Saves "Calculate & Generate"
  btn.innerHTML = "Calculating... Please wait"; // Changes button text
  btn.disabled = true; // Grays out button to prevent double-clicks
  btn.style.opacity = "0.7";
  // --------------------------------

  try {
    const res = await apiCall('generateReport', { selectedMonth: m });
    if(res.success) {
      renderReport(res.data || res, m);
    } else {
      alert("Error: " + res.message);
    }
  } catch (e) {
    console.error("Report Generation Error:", e);
    alert("An error occurred. Check the console for details.");
  } finally {
    // --- 2. VISUAL FEEDBACK RESET ---
    // This runs whether the report succeeded or failed
    btn.innerHTML = originalText; 
    btn.disabled = false;
    btn.style.opacity = "1";
    // --------------------------------
  }
}
function renderReport(data, month) {
  const rBody = document.getElementById('report-receipts-body');
  const pBody = document.getElementById('report-payments-body');
  rBody.innerHTML = ''; pBody.innerHTML = '';
  
  const dParts = month.split('-');
  rBody.innerHTML += `<tr class="closing-row"><td>01/${dParts[1]}/${dParts[0]}</td><td>Opening Bal b/d</td><td></td><td class="amount-col">${data.openingCash}</td><td class="amount-col">${data.openingBank}</td></tr>`;

  data.receipts.forEach(tx => {
    const isCash = tx.method.toLowerCase() === "cash";
    rBody.innerHTML += `<tr><td>${tx.dateStr}</td><td>${tx.particulars} ${isCash ? '' : '('+tx.method+')'}</td><td>${tx.voucher}</td><td class="amount-col">${isCash ? tx.receipt.toFixed(2) : ''}</td><td class="amount-col">${isCash ? '' : tx.receipt.toFixed(2)}</td></tr>`;
  });

  data.payments.forEach(tx => {
    const isCash = tx.method.toLowerCase() === "cash";
    pBody.innerHTML += `<tr><td>${tx.dateStr}</td><td>${tx.particulars} ${isCash ? '' : '('+tx.method+')'}</td><td>${tx.voucher}</td><td class="amount-col">${isCash ? tx.payment.toFixed(2) : ''}</td><td class="amount-col">${isCash ? '' : tx.payment.toFixed(2)}</td></tr>`;
  });

  pBody.innerHTML += `<tr class="closing-row"><td>End</td><td>Closing Bal c/d</td><td></td><td class="amount-col">${data.closingCash}</td><td class="amount-col">${data.closingBank}</td></tr>`;
  
  const totalRow = `<td colspan="3" style="text-align:right">TOTAL:</td><td class="amount-col">${data.grandTotalCash}</td><td class="amount-col">${data.grandTotalBank}</td>`;
  rBody.innerHTML += `<tr class="total-row">${totalRow}</tr>`;
  pBody.innerHTML += `<tr class="total-row">${totalRow}</tr>`;
}

function downloadPDF() {
  const element = document.getElementById('report-print-area');
  html2pdf().from(element).set({ margin: 0.5, filename: 'Report.pdf', jsPDF: { orientation: 'landscape' } }).save();
}

// --- 7. ADMIN USER LOGIC ---
async function loadUsers() {
    const res = await apiCall('getUsers', {});
    const tbody = document.getElementById('users-body');
    if(res.success && tbody) {
        tbody.innerHTML = '';
        res.data.forEach(u => {
            tbody.innerHTML += `<tr>
                <td>${u[0]}</td>
                <td>${u[2]}</td>
                <td>${u[3]}</td>
                <td>${u[4].toUpperCase()}</td>
                <td>
                    <button class="btn-warning" onclick="changePass('${u[0]}')" style="padding:5px; font-size:11px; margin-right:5px;">Change Pass</button>
                    <button class="btn-danger" onclick="delUser('${u[0]}')" style="padding:5px; font-size:11px;">Delete</button>
                </td>
            </tr>`;
        });
    }
}

// ALSO ADD THIS FUNCTION IF IT IS MISSING AT THE BOTTOM OF SCRIPT.JS
async function changePass(username) {
    const newPass = prompt(`Enter new password for ${username}:`);
    if (!newPass || newPass.trim() === "") return; 
    
    const res = await apiCall('updateUserPass', { username: username, newPass: newPass });
    if (res.success) {
        alert(`Password for ${username} updated successfully!`);
        loadUsers(); 
    } else {
        alert("Error: " + res.message);
    }
}
async function addNewUser() {
    const userData = { 
        user: document.getElementById('new-user').value, 
        pass: document.getElementById('new-pass').value, 
        name: document.getElementById('new-name').value, 
        role: document.getElementById('new-role').value 
    };
    
    if(!userData.user || !userData.pass || !userData.name) return alert("Fill all fields!");

    const res = await apiCall('addUser', { userData });
    if(res.success) {
        loadUsers();
        // CLEAR FIELDS AFTER SUCCESS
        document.getElementById('new-user').value = '';
        document.getElementById('new-pass').value = '';
        document.getElementById('new-name').value = '';
        document.getElementById('new-role').value = 'cashier';
    } else {
        alert("Error adding user: " + res.message);
    }
}

async function delUser(u) { if(confirm("Delete user?")) { await apiCall('deleteUser', { username: u }); loadUsers(); } }

