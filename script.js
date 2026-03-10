// ---> UPDATE THIS LINK WITH YOUR GOOGLE APPS SCRIPT /exec URL <---
const API_URL = "https://script.google.com/macros/s/AKfycbxa5w0x_01aCnOar_ihueNoMdF08sPksQRxStb7UKOs1JaOcerc-AT5_UnwotrbVmjclQ/exec"; 

let currentUser = "";
let currentRole = "";
let editingRow = null; 
let activeBanks = []; 
let globalActiveFunds = [];
let globalFundBalances = {};
let globalCategories = [];

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
  document.getElementById('statement-view').style.display = (tab === 'statement') ? 'block' : 'none'; // <-- NEW

  document.getElementById('nav-dash').className = (tab === 'dashboard') ? 'active' : '';
  document.getElementById('nav-rep').className = (tab === 'report') ? 'active' : '';
  document.getElementById('nav-admin').className = (tab === 'admin') ? 'active' : '';
  if(document.getElementById('nav-stmt')) document.getElementById('nav-stmt').className = (tab === 'statement') ? 'active' : ''; // <-- NEW
  
  if(tab === 'admin') { loadUsers(); loadAdminLists(); }
  if(tab === 'statement') { updateStmtDropdown(); } // <-- NEW
}

async function loadFundsAndCategories() {
  const res = await apiCall('getFundsAndCategories', {});
  if (res.success) {
    globalActiveFunds = res.data.funds; 
    globalCategories = res.data.categories; // <-- NEW: Save categories to memory
    
    const categorySelect = document.getElementById('entry-category');
    categorySelect.innerHTML = '<option value="">Select Category (If applicable)...</option>';
    res.data.categories.forEach(category => {
      categorySelect.innerHTML += `<option value="${category}">${category}</option>`;
    });
    
    updateFundUI(); 
    if(document.getElementById('stmt-type')) updateStmtDropdown(); // <-- NEW: Populates the statement dropdown
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

function updateFundUI() {
    // 1. Paint the Dropdown (Live Balances & Accept Negatives)
    const fundSelect = document.getElementById('entry-fund');
    if (fundSelect && globalActiveFunds.length > 0) {
        let currentValue = fundSelect.value; // Remember what they clicked
        fundSelect.innerHTML = '<option value="" disabled selected>Select Fund...</option>';
        
        globalActiveFunds.forEach(fund => {
            let bal = globalFundBalances[fund] || 0;
            // The text changes, but the 'value' stays clean so it saves correctly!
            let statusText = bal < 0 ? `(-ve: ₹${Math.abs(bal).toFixed(2)})` : (bal === 0 ? `(Exhausted)` : `(₹${bal.toFixed(2)})`);
            fundSelect.innerHTML += `<option value="${fund}">${fund} ${statusText}</option>`;
        });
        if (currentValue && globalActiveFunds.includes(currentValue)) fundSelect.value = currentValue;
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

    // 3. Render Funds (Color coded status & Balances!)
        const fBody = document.getElementById('funds-body');
        if(fBody) {
            fBody.innerHTML = '';
            data.funds.forEach(f => {
                const statusColor = f.status.toLowerCase() === 'active' ? 'green' : 'red';
                const btnText = f.status.toLowerCase() === 'active' ? 'Close Fund' : 'Re-Open';
                
                // Grab the live balance from the ledger math
                let bal = globalFundBalances[f.name] || 0;
                let balText = bal < 0 ? `<span style="color:#c0392b; font-weight:bold;">-ve ₹${Math.abs(bal).toFixed(2)}</span>` : 
                              (bal === 0 ? `<span style="color:#d35400; font-weight:bold;">Exhausted (₹0.00)</span>` : `₹${bal.toFixed(2)}`);
    
                // THESE 4 DATA COLUMNS NOW PERFECTLY MATCH YOUR 4 HTML HEADERS
                fBody.innerHTML += `<tr>
                    <td><strong>${f.name}</strong></td>
                    <td>${balText}</td>
                    <td style="color:${statusColor}; font-weight:bold;">${f.status}</td>
                    <td><button class="btn-warning" onclick="toggleFund('${f.name}')">${btnText}</button></td>
                </tr>`;
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
  globalFundBalances = {}; // Reset fund math before calculating

  // --- THE SHIELD: Safely neutralizes quotes and newlines so they don't break the HTML ---
  const safeStr = (str) => {
      if (!str) return '';
      return str.toString().replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/\n/g, " ");
  };

  try {
      data.forEach(row => {
          let method = row[4] ? row[4].toString().trim() : "";
          
          let rec = parseFloat(String(row[5]).replace(/,/g, '')) || 0;
          let pay = parseFloat(String(row[6]).replace(/,/g, '')) || 0;
          let cashBal = parseFloat(String(row[7]).replace(/,/g, '')) || 0;
          let bankBal = parseFloat(String(row[8]).replace(/,/g, '')) || 0;
          
          if(balances[method] !== undefined) balances[method] += (rec - pay);
          else if (method && method !== "Cash") balances[method] = (balances[method] || 0) + (rec - pay);

          let fundName = row[10] ? row[10].toString().trim() : "";
          if (fundName) {
              globalFundBalances[fundName] = (globalFundBalances[fundName] || 0) + (rec - pay);
          }

          let tr = `<tr>
            <td>${row[1]}</td>
            <td>${row[2]}</td>
            <td>${row[10] || ''}</td>
            <td>${row[11] || ''}</td>
            <td>${row[3]}</td>
            <td>${row[4]}</td>
            <td>${row[5]}</td>
            <td>${row[6]}</td>
            <td class="bal-col">${cashBal.toFixed(2)}</td>
            <td class="bal-col">${bankBal.toFixed(2)}</td>
            <td>${row[9]}</td>`;
            
          if(currentRole === 'admin') {
             // We wrap EVERY string in safeStr() to prevent crashes!
             tr += `<td>
                <button class="btn-warning" onclick="loadTransactionForEdit(${row[12]}, '${safeStr(row[1])}', '${safeStr(row[2])}', '${safeStr(row[3])}', '${safeStr(row[4])}', ${rec}, ${pay}, '${safeStr(row[10])}', '${safeStr(row[11])}')">Edit</button> 
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

      // Paint the Fund trackers!
      updateFundUI(); 

  } catch (error) {
      console.error("Table Render Crash:", error);
      tbody.innerHTML = `<tr><td colspan="12" style="color:red; text-align:center; padding:20px;"><b>System Alert:</b> A corrupted row prevented the table from loading. Press F12 to check the console.</td></tr>`;
  }
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

function loadTransactionForEdit(rowNum, date, details, vch, method, rec, pay, fund, category) {
  const d = date.split('/');
  document.getElementById('entry-date').value = `${d[2]}-${d[1]}-${d[0]}`;
  document.getElementById('entry-details').value = details;
  document.getElementById('entry-voucher').value = vch;
  document.getElementById('entry-method').value = method;
  document.getElementById('entry-type').value = (rec > 0) ? "Receipt" : "Payment";
  document.getElementById('entry-amount').value = (rec > 0) ? rec : pay;
  
  // NEW: Load the Fund and Category back into the dropdowns
  document.getElementById('entry-fund').value = fund || "";
  document.getElementById('entry-category').value = category || "";
  
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

// ==========================================
// ACCOUNT STATEMENTS LOGIC
// ==========================================
function updateStmtDropdown() {
  const type = document.getElementById('stmt-type').value;
  const dropdown = document.getElementById('stmt-item');
  if(!dropdown) return;

  dropdown.innerHTML = '<option value="">Select Item...</option>';
  const list = (type === 'fund') ? globalActiveFunds : globalCategories;
  
  list.forEach(item => {
      dropdown.innerHTML += `<option value="${item}">${item}</option>`;
  });

  document.getElementById('stmt-dynamic-col').innerText = (type === 'fund') ? 'Category' : 'Fund';
}

async function generateStatement() {
  const type = document.getElementById('stmt-type').value;
  const item = document.getElementById('stmt-item').value;
  const from = document.getElementById('stmt-from').value;
  const to = document.getElementById('stmt-to').value;

  if(!item) return alert("Please select a Fund or Category.");

  const res = await apiCall('generateStatement', { stmtType: type, stmtItem: item, fromDate: from, toDate: to });
  if(res.success) {
      renderStatement(res, type, item);
  } else {
      alert("Error generating statement: " + res.message);
  }
}

function renderStatement(data, type, item) {
  document.getElementById('stmt-title').innerText = `${item} - Account Statement`;
  
  const tbody = document.getElementById('stmt-body');
  tbody.innerHTML = '';

  // 1. Opening Balance
  tbody.innerHTML += `<tr style="background-color:#e8f8f5; font-weight:bold;">
      <td>-</td><td>Opening Balance</td><td>-</td><td>-</td><td>-</td>
      <td colspan="2"></td><td style="color:${data.openingBalance < 0 ? '#c0392b' : '#16a085'}">₹${data.openingBalance.toFixed(2)}</td>
  </tr>`;

  // 2. Transactions
  if(data.transactions.length === 0) {
      tbody.innerHTML += `<tr><td colspan="8" style="text-align:center;">No transactions in this date range.</td></tr>`;
  } else {
      data.transactions.forEach(tx => {
          tbody.innerHTML += `<tr>
              <td>${tx.dateStr}</td>
              <td>${tx.details}</td>
              <td>${tx.vch}</td>
              <td>${tx.method}</td>
              <td>${tx.dynamicCol}</td>
              <td style="color:#27ae60;">${tx.rec > 0 ? tx.rec.toFixed(2) : ''}</td>
              <td style="color:#c0392b;">${tx.pay > 0 ? tx.pay.toFixed(2) : ''}</td>
              <td style="font-weight:bold; color:${tx.runBal < 0 ? '#c0392b' : '#2c3e50'}">${tx.runBal.toFixed(2)}</td>
          </tr>`;
      });
  }

  // 3. Breakdown Summary Box (The Magic Box)
  const sumBox = document.getElementById('stmt-summary-box');
  const sumBody = document.getElementById('stmt-summary-body');
  
  if(data.breakdown && data.breakdown.length > 0) {
      sumBox.style.display = 'block';
      document.getElementById('stmt-summary-title').innerText = type === 'fund' ? 'Expenditure by Category' : 'Fund Source Breakdown';
      sumBody.innerHTML = '';
      let totalSpent = 0;
      data.breakdown.forEach(b => {
          sumBody.innerHTML += `<tr><td>${b.item}</td><td style="color:#c0392b;">₹${b.amount.toFixed(2)}</td></tr>`;
          totalSpent += b.amount;
      });
      sumBody.innerHTML += `<tr style="font-weight:bold;"><td>TOTAL EXPENDITURE</td><td style="color:#c0392b;">₹${totalSpent.toFixed(2)}</td></tr>`;
  } else {
      sumBox.style.display = 'none';
  }
}

function downloadStatementPDF() {
  const element = document.getElementById('stmt-print-area');
  html2pdf().from(element).set({ margin: 0.5, filename: 'Account_Statement.pdf', jsPDF: { orientation: 'portrait' } }).save();
}
