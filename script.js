      // ---> UPDATE THIS LINK WITH YOUR GOOGLE APPS SCRIPT /exec URL <---
      const API_URL = "https://script.google.com/macros/s/AKfycbwQzVYXsugoCWNIRRKY0Kvy_dkS7srhAYml1xYYIrzABk-2d780w-4a4nLpfX1rOIT-Wg/exec"; 
      
      let currentUser = "";
      let currentRole = "";
      let editingRow = null; 

      // --- 1. CORE API CALL ---
      async function apiCall(action, payload) {
        try {
            const response = await fetch(API_URL, { 
                method: 'POST', 
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: action, ...payload }) 
            });
            const rawText = await response.text();
            try { return JSON.parse(rawText); } 
            catch (err) {
                console.error("HTML Received:", rawText);
                return { success: false, message: "Google blocked the request. Check your Web App URL or permissions." };
            }
        } catch (e) { return { success: false, message: "Network Error: " + e.message }; }
      }

      // --- 2. NAVIGATION ---
      function switchTab(tab) {
        document.getElementById('dashboard-view').style.display = (tab === 'dashboard') ? 'block' : 'none';
        document.getElementById('report-view').style.display = (tab === 'report') ? 'block' : 'none';
        document.getElementById('admin-view').style.display = (tab === 'admin') ? 'block' : 'none';
        
        document.getElementById('nav-dash').className = (tab === 'dashboard') ? 'active' : '';
        document.getElementById('nav-rep').className = (tab === 'report') ? 'active' : '';
        document.getElementById('nav-admin').className = (tab === 'admin') ? 'active' : '';
        
        if(tab === 'admin') loadUsers();
      }

      // --- 3. LOGIN LOGIC ---
      async function attemptLogin() {
        const u = document.getElementById('username').value, p = document.getElementById('password').value;
        const btn = document.getElementById('login-btn'); btn.innerHTML = "Verifying..."; btn.disabled = true;
        document.getElementById('error-message').innerHTML = "";
        
        const res = await apiCall('verifyUser', { username: u, password: p });
        
        if (res.success) {
          currentUser = res.name; currentRole = res.role;
          document.getElementById('login-view').style.display = 'none';
          document.getElementById('app-wrapper').style.display = 'block';
          document.getElementById('welcome-text').innerHTML = `User: ${currentUser} (${currentRole.toUpperCase()})`;
          
          if(currentRole === 'admin') {
              document.getElementById('nav-admin').style.display = 'inline-block';
              document.getElementById('table-header').innerHTML += "<th>Admin Actions</th>";
          }
          
          const dataRes = await apiCall('getLedgerData', {});
          if(dataRes.success) updateTable(dataRes.data);
        } else {
          btn.innerHTML = "Secure Login"; btn.disabled = false;
          document.getElementById('error-message').innerHTML = res.message;
        }
      }

      // --- 4. TRANSACTION LOGIC ---
      async function submitNewEntry() {
        const btn = document.getElementById('submit-btn');
        const entryData = {
          date: document.getElementById('entry-date').value,
          details: document.getElementById('entry-details').value,
          voucher: document.getElementById('entry-voucher').value,
          method: document.getElementById('entry-method').value,
          type: document.getElementById('entry-type').value,
          amount: document.getElementById('entry-amount').value
        };

        if(!entryData.date || !entryData.details || !entryData.amount) return alert("Fill required fields");
        btn.innerHTML = "Processing..."; btn.disabled = true;

        let res;
        if(editingRow) {
            res = await apiCall('updateTransaction', { rowNum: editingRow, entryData: entryData, userName: currentUser });
            editingRow = null; btn.style.backgroundColor = "#2c3e50";
            document.getElementById('cancel-btn').style.display = "none";
        } else {
            res = await apiCall('addEntry', { entryData: entryData, userName: currentUser });
        }

        if (res.success) {
            updateTable(res.data); 
            document.getElementById('entry-details').value = ''; document.getElementById('entry-amount').value = '';
        } else alert("Error: " + res.message);
        btn.innerHTML = "Post Entry"; btn.disabled = false;
      }

      function loadTransactionForEdit(rowNum, dateStr, details, vch, method, rec, pay) {
        const dParts = dateStr.split('/');
        document.getElementById('entry-date').value = `${dParts[2]}-${dParts[1]}-${dParts[0]}`;
        document.getElementById('entry-details').value = details;
        document.getElementById('entry-voucher').value = vch;
        document.getElementById('entry-method').value = method;
        document.getElementById('entry-type').value = (rec > 0) ? "Receipt" : "Payment";
        document.getElementById('entry-amount').value = (rec > 0) ? rec : pay;
        
        editingRow = rowNum;
        const btn = document.getElementById('submit-btn');
        btn.innerHTML = "Update Corrected Entry"; btn.style.backgroundColor = "#f39c12"; 
        document.getElementById('cancel-btn').style.display = "inline-block";
        window.scrollTo(0, 0); 
      }

      function cancelEdit() {
        editingRow = null;
        document.getElementById('entry-details').value = ''; document.getElementById('entry-amount').value = '';
        const btn = document.getElementById('submit-btn');
        btn.innerHTML = "Post Entry"; btn.style.backgroundColor = "#2c3e50";
        document.getElementById('cancel-btn').style.display = "none";
      }

      async function deleteTx(rowNum) {
        if(!confirm("Are you sure? This will delete the entry and recalculate all balances automatically.")) return;
        const res = await apiCall('deleteTransaction', { rowNum: rowNum });
        if(res.success) updateTable(res.data);
      }

      function updateTable(data) {
        const tbody = document.getElementById('ledger-body'); tbody.innerHTML = ''; 
        if (!data || data.length === 0) return;

        document.getElementById('display-cash-bal').innerHTML = parseFloat(String(data[0][7]).replace(/,/g, '') || "0").toFixed(2);
        document.getElementById('display-bank-bal').innerHTML = parseFloat(String(data[0][8]).replace(/,/g, '') || "0").toFixed(2);

        data.forEach(row => {
          let tr = `<tr><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td><td>${row[4]}</td><td>${row[5]}</td><td>${row[6]}</td><td class="bal-col">${parseFloat(row[7]).toFixed(2)}</td><td class="bal-col">${parseFloat(row[8]).toFixed(2)}</td><td>${row[9]}</td>`;
          if(currentRole === 'admin') {
             tr += `<td>
                     <button class="btn-warning" onclick="loadTransactionForEdit(${row[10]}, '${row[1]}', '${row[2]}', '${row[3]}', '${row[4]}', ${parseFloat(row[5]||0)}, ${parseFloat(row[6]||0)})" style="padding:5px; font-size:11px;">Edit</button>
                     <button class="btn-danger" onclick="deleteTx(${row[10]})" style="padding:5px; font-size:11px;">Del</button>
                   </td>`;
          }
          tr += `</tr>`; tbody.innerHTML += tr;
        });
      }

      // --- 5. REPORT LOGIC ---
      async function generateReport() {
        const selectedMonth = document.getElementById('report-month-picker').value; 
        if(!selectedMonth) { alert("Please select a month and year first."); return; }

        const btn = document.getElementById('generate-btn'); btn.innerHTML = "Calculating..."; btn.disabled = true;
        const response = await apiCall('generateReport', { selectedMonth: selectedMonth });
        btn.innerHTML = "Calculate & Generate"; btn.disabled = false;
        
        if (response.success) renderReport(response.data || response, selectedMonth);
        else alert("Error generating report: " + (response.message || response.error || "Unknown Error"));
      }

      function renderReport(data, selectedMonth) {
        const rBody = document.getElementById('report-receipts-body');
        const pBody = document.getElementById('report-payments-body');
        rBody.innerHTML = ''; pBody.innerHTML = '';

        const dateInput = selectedMonth.split('-');
        const firstDayStr = "01/" + dateInput[1] + "/" + dateInput[0];

        rBody.innerHTML += `<tr class="closing-row"><td>${firstDayStr}</td><td>To Opening Balance b/d</td><td></td><td class="amount-col">${data.openingCash}</td><td class="amount-col">${data.openingBank}</td></tr>`;

        if (data.receipts) {
          data.receipts.forEach(tx => {
            const method = (tx.method || "").toString().trim().toLowerCase();
            const cAmt = (method === "cash") ? tx.receipt.toFixed(2) : "";
            const bAmt = (method === "bank") ? tx.receipt.toFixed(2) : "";
            rBody.innerHTML += `<tr><td>${tx.dateStr}</td><td>${tx.particulars}</td><td>${tx.voucher}</td><td class="amount-col">${cAmt}</td><td class="amount-col">${bAmt}</td></tr>`;
          });
        }

        if (data.payments) {
          data.payments.forEach(tx => {
            const method = (tx.method || "").toString().trim().toLowerCase();
            const cAmt = (method === "cash") ? tx.payment.toFixed(2) : "";
            const bAmt = (method === "bank") ? tx.payment.toFixed(2) : "";
            pBody.innerHTML += `<tr><td>${tx.dateStr}</td><td>${tx.particulars}</td><td>${tx.voucher}</td><td class="amount-col">${cAmt}</td><td class="amount-col">${bAmt}</td></tr>`;
          });
        }

        pBody.innerHTML += `<tr class="closing-row"><td>End of Mth</td><td>By Closing Balance c/d</td><td></td><td class="amount-col">${data.closingCash}</td><td class="amount-col">${data.closingBank}</td></tr>`;

        const totalHtml = `<td colspan="3" style="text-align:right;">TOTAL:</td><td class="amount-col">${data.grandTotalCash}</td><td class="amount-col">${data.grandTotalBank}</td>`;
        rBody.innerHTML += `<tr class="total-row">${totalHtml}</tr>`;
        pBody.innerHTML += `<tr class="total-row">${totalHtml}</tr>`;
        
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        document.getElementById('report-title').innerHTML = `Cash Book Folio - ${monthNames[parseInt(dateInput[1]) - 1]} ${dateInput[0]}`;
      }

      function downloadPDF() {
        const element = document.getElementById('report-print-area');
        const monthInput = document.getElementById('report-month-picker').value;
        if(!monthInput) { alert("Please generate a report first."); return; }

        const btn = document.getElementById('btn-pdf');
        const originalText = btn.innerHTML; btn.innerHTML = "Generating..."; btn.disabled = true;

        const opt = {
          margin: 0.5,
          filename: 'CashBook_Report_' + monthInput + '.pdf',
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
        };
        html2pdf().set(opt).from(element).save().then(() => { btn.innerHTML = originalText; btn.disabled = false; });
      }

      // --- 6. ADMIN USER LOGIC ---
      async function loadUsers() {
          const res = await apiCall('getUsers', {});
          const tbody = document.getElementById('users-body'); tbody.innerHTML = '';
          if(res.success) {
              res.data.forEach(u => {
                  tbody.innerHTML += `<tr><td>${u[0]}</td><td>${u[2]}</td><td>${u[3]}</td><td>${u[4].toUpperCase()}</td>
                  <td>
                    <button class="btn-warning" onclick="changePass('${u[0]}')" style="padding:5px; font-size:11px;">Change Pass</button>
                    <button class="btn-danger" onclick="delUser('${u[0]}')" style="padding:5px; font-size:11px;">Delete</button>
                  </td></tr>`;
              });
          }
      }

      async function addNewUser() {
          const u = document.getElementById('new-user').value, p = document.getElementById('new-pass').value, n = document.getElementById('new-name').value, r = document.getElementById('new-role').value;
          if(!u || !p || !n) return alert("Fill all fields");
          await apiCall('addUser', { userData: {user: u, pass: p, name: n, role: r} });
          document.getElementById('new-user').value=''; document.getElementById('new-pass').value=''; document.getElementById('new-name').value='';
          loadUsers();
      }

      async function changePass(username) {
          const newPass = prompt(`Enter new password for ${username}:`);
          if(newPass) { await apiCall('updateUserPass', { username: username, newPass: newPass }); loadUsers(); }
      }

      async function delUser(username) {
          if(confirm(`Delete user ${username}?`)) { await apiCall('deleteUser', { username: username }); loadUsers(); }
      }
