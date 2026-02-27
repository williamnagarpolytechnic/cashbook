// ---> UPDATE THIS LINK WITH YOUR GOOGLE APPS SCRIPT /exec URL <---
const API_URL = "https://script.google.com/macros/s/AKfycbw5oRFdPcRSzC-ihxqWSlvUJXiWsj_fRw87Bvd93AJdEHFvpIzyiPJwU0JgNCE4szZQ_Q/exec"; 

let currentUser = "";
let currentRole = "";
let editingRow = null; 
let activeBanks = []; 

async function apiCall(action, payload) {
  try {
      // Use URLSearchParams to send data as 'application/x-www-form-urlencoded'
      // This bypasses the OPTIONS preflight check that causes 405 errors
      const response = await fetch(API_URL, { 
          method: 'POST', 
          mode: 'no-cors', // Tells browser to just send it and not wait for a security 'OK'
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: JSON.stringify({ action: action, ...payload }) 
      });

      // NOTE: With 'no-cors', we can't read the response. 
      // So for LOGIN specifically, we must use standard 'cors' but with text/plain.
      
      const standardResponse = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: action, ...payload })
      });
      
      const rawText = await standardResponse.text();
      return JSON.parse(rawText);
  } catch (e) { 
      return { success: false, message: "Connection Error: " + e.message }; 
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
  
  if(tab === 'admin') { loadUsers(); renderAdminBankList(); }
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
    
    const dataRes = await apiCall('getLedgerData', {});
    if(dataRes.success) updateTable(dataRes.data);
    
  } else {
    btn.innerHTML = "Secure Login"; btn.disabled = false;
    document.getElementById('error-message').innerHTML = res.message;
  }
}

// --- 4. DYNAMIC BANK LOGIC ---
function updateBankDropdowns() {
  const methodDropdown = document.getElementById('entry-method');
  if(!methodDropdown) return;
  methodDropdown.innerHTML = `<option value="Cash">Cash</option>`;
  activeBanks.forEach(bank => {
      methodDropdown.innerHTML += `<option value="${bank}">${bank}</option>`;
  });
}

function renderAdminBankList() {
    const tbody = document.getElementById('banks-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    activeBanks.forEach(bank => {
        tbody.innerHTML += `<tr><td><strong>${bank}</strong></td><td><button class="btn-danger" onclick="delBank('${bank}')">Delete</button></td></tr>`;
    });
}

async function addNewBank() {
    const newBank = document.getElementById('new-bank-name').value.trim();
    if(!newBank) return;
    const res = await apiCall('addBank', { bankName: newBank });
    if(res.success) {
        activeBanks = res.data;
        document.getElementById('new-bank-name').value = '';
        updateBankDropdowns();
        renderAdminBankList();
        const dataRes = await apiCall('getLedgerData', {});
        if(dataRes.success) updateTable(dataRes.data);
    }
}

async function delBank(bankName) {
    if(!confirm(`Remove ${bankName}?`)) return;
    const res = await apiCall('deleteBank', { bankName: bankName });
    if(res.success) {
        activeBanks = res.data;
        updateBankDropdowns();
        renderAdminBankList();
        const dataRes = await apiCall('getLedgerData', {});
        if(dataRes.success) updateTable(dataRes.data);
    }
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
      let rec = parseFloat(String(row[5]).replace(/,/g, '')) || 0;
      let pay = parseFloat(String(row[6]).replace(/,/g, '')) || 0;
      
      if(balances[method] !== undefined) balances[method] += (rec - pay);
      else if (method && method !== "Cash") balances[method] = (balances[method] || 0) + (rec - pay);

      let tr = `<tr><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td><td>${row[4]}</td><td>${row[5]}</td><td>${row[6]}</td><td class="bal-col">${parseFloat(row[7]).toFixed(2)}</td><td class="bal-col">${parseFloat(row[8]).toFixed(2)}</td><td>${row[9]}</td>`;
      if(currentRole === 'admin') {
         tr += `<td><button class="btn-warning" onclick="loadTransactionForEdit(${row[10]}, '${row[1]}', '${row[2]}', '${row[3]}', '${row[4]}', ${parseFloat(row[5]||0)}, ${parseFloat(row[6]||0)})">Edit</button> <button class="btn-danger" onclick="deleteTx(${row[10]})">Del</button></td>`;
      }
      tr += `</tr>`; tbody.innerHTML += tr;
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
    amount: document.getElementById('entry-amount').value
  };
  if(!entryData.date || !entryData.details || !entryData.amount) return alert("Fill all fields");
  
  let res = editingRow ? await apiCall('updateTransaction', { rowNum: editingRow, entryData, userName: currentUser }) : await apiCall('addEntry', { entryData, userName: currentUser });

  if (res.success) {
      updateTable(res.data);
      cancelEdit();
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
  if(!m) return;
  const res = await apiCall('generateReport', { selectedMonth: m });
  if(res.success) renderReport(res.data || res, m);
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
            tbody.innerHTML += `<tr><td>${u[0]}</td><td>${u[2]}</td><td>${u[3]}</td><td>${u[4].toUpperCase()}</td><td><button onclick="delUser('${u[0]}')">Delete</button></td></tr>`;
        });
    }
}
async function addNewUser() {
    const userData = { user: document.getElementById('new-user').value, pass: document.getElementById('new-pass').value, name: document.getElementById('new-name').value, role: document.getElementById('new-role').value };
    await apiCall('addUser', { userData });
    loadUsers();
}
async function delUser(u) { if(confirm("Delete user?")) { await apiCall('deleteUser', { username: u }); loadUsers(); } }
