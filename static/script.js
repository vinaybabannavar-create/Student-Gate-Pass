const API_BASE = window.location.origin;

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Student logic
async function submitApplication(e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const name = document.getElementById('name').value;
    const usn = document.getElementById('usn').value;
    const roll = document.getElementById('roll').value;
    const branch = document.getElementById('branch').value;
    const year_sem = document.getElementById('year_sem').value;
    const college = document.getElementById('college').value;
    const reason = document.getElementById('reason').value;

    btn.innerHTML = '<div class="spinner"></div> Submitting...';
    btn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('usn', usn);
        formData.append('roll', roll);
        formData.append('branch', branch);
        formData.append('year_sem', year_sem);
        formData.append('college', college);
        formData.append('reason', reason);

        const docInput = document.getElementById('document');
        if (docInput && docInput.files.length > 0) {
            formData.append('document', docInput.files[0]);
        }

        const res = await fetch(`${API_BASE}/apply`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (res.ok) {
            showToast('Application Submitted!');
            document.getElementById('applicationForm').classList.add('hidden');
            document.getElementById('statusSection').classList.remove('hidden');
            
            // Populate Details
            document.getElementById('stName').innerText = name;
            document.getElementById('stPriority').innerText = data.ai_priority;
            document.getElementById('stPriority').className = `priority-${data.ai_priority.toLowerCase()}`;
            document.getElementById('stLetter').innerText = data.letter;
            
            // Save to LocalStorage for persistence
            localStorage.setItem('activeGatePass', JSON.stringify({
                id: data.id,
                name: name,
                letter: data.letter,
                priority: data.ai_priority
            }));
            
            // Start polling
            pollStatus(data.id);
        } else {
            showToast(data.error, true);
        }
    } catch (err) {
        showToast('Network error', true);
    } finally {
         btn.innerHTML = 'Apply for Pass';
         btn.disabled = false;
    }
}

let pollingInterval;
async function pollStatus(reqId) {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/student/status/${reqId}`);
            if(res.ok) {
                const data = await res.json();
                const badge = document.getElementById('stStatus');
                badge.innerText = data.status.replace('_', ' ');
                
                if(data.status.includes('pending')) {
                    badge.className = 'status-badge status-pending';
                } else if (data.status === 'approved') {
                    badge.className = 'status-badge status-approved';
                    document.getElementById('qrSection').classList.remove('hidden');
                    document.getElementById('qrCodeImg').src = `data:image/png;base64,${data.qr_image}`;
                    clearInterval(pollingInterval);
                    // Clear persistence on final status
                } else if (data.status === 'rejected') {
                    badge.className = 'status-badge status-rejected';
                    clearInterval(pollingInterval);
                    localStorage.removeItem('activeGatePass');
                } else if (data.status === 'used') {
                    badge.className = 'status-badge status-used';
                    clearInterval(pollingInterval);
                    localStorage.removeItem('activeGatePass');
                }
            } else if (res.status === 404) {
                // Request likely deleted by admin
                const badge = document.getElementById('stStatus');
                if(badge) {
                    badge.innerText = 'REMOVED / CANCELLED';
                    badge.className = 'status-badge bg-gray-500/50 text-white';
                }
                clearInterval(pollingInterval);
                localStorage.removeItem('activeGatePass');
                showToast('Your application was removed by an administrator', true);
            }
        } catch (e) {}
    }, 2000);
}

function checkExistingApplication() {
    const saved = localStorage.getItem('activeGatePass');
    if (saved) {
        const data = JSON.parse(saved);
        document.getElementById('applicationForm').classList.add('hidden');
        document.getElementById('statusSection').classList.remove('hidden');
        document.getElementById('stName').innerText = data.name;
        document.getElementById('stPriority').innerText = data.priority;
        document.getElementById('stPriority').className = `priority-${data.priority.toLowerCase()}`;
        document.getElementById('stLetter').innerText = data.letter;
        pollStatus(data.id);
    }
}

// Teacher & HOD logic
async function loadDashboardRequests(type, isSilent = false) {
    const tableBody = document.getElementById('requestsBody');
    const cardsCont = document.getElementById('requestsCards');
    
    if (!isSilent) {
        if(tableBody) tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="spinner border-blue-500"></div></td></tr>';
        if(cardsCont) cardsCont.innerHTML = '<div class="text-center py-10"><div class="spinner border-blue-500"></div></div>';
    }
    
    try {
        const res = await fetch(`${API_BASE}/${type}/requests`);
        const data = await res.json();
        
        if (tableBody) tableBody.innerHTML = '';
        if (cardsCont) cardsCont.innerHTML = '';

        if (data.length === 0) {
            const emptyTable = '<tr><td colspan="5" class="text-center py-10 text-gray-500 italic">No pending requests found.</td></tr>';
            const emptyCards = '<div class="text-center py-10 text-gray-500 italic">No pending requests.</div>';
            if(tableBody) tableBody.innerHTML = emptyTable;
            if(cardsCont) cardsCont.innerHTML = emptyCards;
            return;
        }

        data.forEach(req => {
            // DeskTop Table Row
            if (tableBody) {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-gray-700 hover:bg-gray-800 transition-colors';
                tr.innerHTML = `
                    <td class="p-3">
                        <p class="font-semibold">${req.name}</p>
                        <p class="text-[10px] text-gray-500 uppercase">${req.usn || ''}</p>
                    </td>
                    <td class="p-3 text-sm text-gray-300 max-w-xs truncate" title="${req.reason}">${req.reason}</td>
                    <td class="p-3"><span class="priority-${req.ai_priority.toLowerCase()} font-bold">${req.ai_priority}</span></td>
                    <td class="p-3">
                        <button class="text-blue-400 font-semibold hover:text-blue-300 underline text-xs block mb-1" onclick="viewLetter(\`${req.letter.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`)">View Letter</button>
                        ${req.document_path ? `<a href="${req.document_path}" target="_blank" class="text-green-400 font-semibold hover:text-green-300 underline text-[10px] block"><i class="fa-solid fa-paperclip"></i> View Document</a>` : ''}
                    </td>
                    <td class="p-3 flex items-center space-x-1">
                        <button onclick="handleAction('${type}', 'approve', ${req.id})" class="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-[10px] text-white transition font-bold uppercase">Approve</button>
                        <button onclick="handleAction('${type}', 'reject', ${req.id})" class="px-2 py-1 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/30 rounded text-[10px] transition font-bold uppercase">Reject</button>
                        <button onclick="handleDelete('${type}', ${req.id})" class="p-2 text-gray-500 hover:text-red-500 transition-colors" title="Delete Record">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </td>
                `;
                tableBody.appendChild(tr);
            }

            // Mobile Card
            if (cardsCont) {
                const card = document.createElement('div');
                card.className = 'mobile-card glass-card border-l-4 border-l-blue-500';
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h3 class="font-bold text-white text-lg">${req.name}</h3>
                            <p class="text-[10px] text-gray-500 uppercase font-mono">${req.usn || 'N/A'}</p>
                        </div>
                        <span class="text-[9px] px-2 py-1 bg-gray-800 rounded-full font-bold uppercase tracking-widest priority-${req.ai_priority.toLowerCase()}">${req.ai_priority}</span>
                    </div>
                    <p class="text-sm text-gray-300 mb-4 line-clamp-2 italic">"${req.reason}"</p>
                    <div class="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                        <div class="flex flex-col gap-1">
                            <button class="text-blue-400 text-xs font-bold uppercase tracking-wider text-left" onclick="viewLetter(\`${req.letter.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`)">Read Letter</button>
                            ${req.document_path ? `<a href="${req.document_path}" target="_blank" class="text-green-400 text-[10px] font-bold uppercase tracking-wider mt-1"><i class="fa-solid fa-file"></i> Open Doc</a>` : ''}
                        </div>
                        <div class="flex space-x-2">
                            <button onclick="handleAction('${type}', 'approve', ${req.id})" class="p-3 bg-green-600 text-white rounded-lg transition-transform active:scale-95 shadow-lg"><i class="fa-solid fa-check"></i></button>
                            <button onclick="handleAction('${type}', 'reject', ${req.id})" class="p-3 bg-red-600/20 text-red-500 border border-red-500/30 rounded-lg transition-transform active:scale-95"><i class="fa-solid fa-xmark"></i></button>
                            <button onclick="handleDelete('${type}', ${req.id})" class="p-3 text-gray-500"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                `;
                cardsCont.appendChild(card);
            }
        });
    } catch (err) {
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-red-500">Sync Error</td></tr>';
    }
}

function startDashboardPolling(type, intervalMs = 5000) {
    loadDashboardRequests(type);
    updateDashboardStats();
    if (type === 'hod') loadHODHistory();
    if (type === 'teacher') loadTeacherHistory();
    return setInterval(() => {
        loadDashboardRequests(type, true);
        updateDashboardStats();
        if (type === 'hod') loadHODHistory(true);
        if (type === 'teacher') loadTeacherHistory(isSilent = true);
    }, intervalMs);
}

function startSecurityPolling() {
    loadSecurityUpcoming();
    return setInterval(() => {
        loadSecurityUpcoming(true);
    }, 3000);
}

async function handleAction(role, action, id) {
    try {
        const res = await fetch(`${API_BASE}/${role}/${action}/${id}`, { method: 'POST' });
        const data = await res.json();
        if(res.ok) {
            showToast(`Request ${action}d successfully`);
            
            // If HOD approves, show the QR modal preview
            if (role === 'hod' && action === 'approve' && data.qr_image) {
                const modal = document.getElementById('qrModal');
                const modalImg = document.getElementById('modalQrImg');
                const secKeyE = document.getElementById('modalSecKey');
                if (modal && modalImg) {
                    modalImg.src = `data:image/png;base64,${data.qr_image}`;
                    if(secKeyE) secKeyE.innerText = data.security_key;
                    modal.classList.remove('hidden');
                }
            }
            
            loadDashboardRequests(role);
        }
    } catch(err) {
        showToast(`Failed to ${action}`, true);
    }
}

// Security Logic
async function verifyPass(e) {
    e.preventDefault();
    const qrId = document.getElementById('qrInput').value;
    const btn = document.getElementById('verifyBtn');
    
    btn.innerHTML = '<div class="spinner"></div>';
    
    try {
        const res = await fetch(`${API_BASE}/verify/${qrId}`);
        const data = await res.json();
        
        if(res.ok) {
             document.getElementById('secDetails').classList.remove('hidden');
             document.getElementById('secName').innerText = data.request.name;
             document.getElementById('secDetailsMore').innerText = `${data.request.usn || ''} • ${data.request.branch || ''} • ${data.request.year_sem || ''}`;
             document.getElementById('secReason').innerText = data.request.reason;
             document.getElementById('secKey').innerText = data.request.security_key || 'N/A';
             
             showToast('QR/Key Validated');
             // Show grant exit button
             document.getElementById('actionCont').classList.remove('hidden');
             document.getElementById('finalResult').classList.add('hidden');
        } else {
             showToast(data.error, true);
        }
    } catch(err) {
         showToast('Error validating QR', true);
    } finally {
        btn.innerHTML = 'Validate QR';
    }
}

async function grantExit() {
    const qrId = document.getElementById('qrInput').value;
    const btn = document.getElementById('grantBtn');
    const resBox = document.getElementById('finalResult');
    
    btn.innerHTML = '<div class="spinner"></div> Processing...';
    btn.disabled = true;
    
    try {
        const res = await fetch(`${API_BASE}/verify/complete/${qrId}`, { method: 'POST'});
        const data = await res.json();
        resBox.classList.remove('hidden');
        
        if(res.ok) {
             resBox.innerHTML = '<div class="p-4 bg-green-500/20 text-green-400 font-bold text-center rounded border border-green-500 animate-bounce">Access Granted ✓ Exit Allowed</div>';
             showToast(data.message);
             btn.classList.add('hidden'); // Hide button after success
             loadSecurityUpcoming(); // Refresh list
        } else {
             resBox.innerHTML = `<div class="p-4 bg-red-500/20 text-red-400 font-bold text-center rounded border border-red-500">${data.error}</div>`;
             showToast(data.error, true);
        }
    } catch (err) {
         showToast('Communication Error', true);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-person-walking-arrow-right mr-3 text-xl"></i> GRANT EXIT PERMISSION';
        btn.disabled = false;
    }
}

function viewLetter(content) {
    const modal = document.getElementById('letterModal');
    const display = document.getElementById('modalLetterContent');
    const glass = modal.querySelector('.glass-card');
    
    if (modal && display) {
        // Optimize modal for mobile if needed
        if (window.innerWidth < 768) {
            glass.classList.remove('p-10');
            glass.classList.add('p-6', 'max-h-[90vh]');
        }
        
        display.innerText = content;
        modal.classList.remove('hidden');
    }
}

async function handleDelete(role, id) {
    if(!confirm('Are you sure you want to permanently delete this gate pass record?')) return;
    try {
        const res = await fetch(`${API_BASE}/delete/${id}`, { method: 'DELETE' });
        if(res.ok) {
            showToast('Record deleted');
            if(role === 'security') loadSecurityUpcoming();
            else {
                loadDashboardRequests(role);
                updateDashboardStats();
                if(role === 'hod') loadHODHistory();
                if(role === 'teacher') loadTeacherHistory();
            }
        }
    } catch(err) {
        showToast('Delete failed', true);
    }
}

async function loadHODHistory(isSilent = false) {
    const body = document.getElementById('historyBody');
    const cardsCont = document.getElementById('historyCards');
    try {
        const res = await fetch(`${API_BASE}/hod/history`);
        const data = await res.json();
        if(body) body.innerHTML = '';
        if(cardsCont) cardsCont.innerHTML = '';

        if(data.length === 0) {
            if(body) body.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-600 font-light">No records yet.</td></tr>';
            if(cardsCont) cardsCont.innerHTML = '<div class="text-center py-6 text-gray-600">No records yet.</div>';
            return;
        }
        data.forEach(req => {
            if(body) {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-gray-800/40 text-[11px]';
                tr.innerHTML = `
                    <td class="p-3 text-gray-300 font-bold">${req.name}</td>
                    <td class="p-3 text-[10px] text-gray-500 font-mono">${new Date().toLocaleDateString()}</td>
                    <td class="p-3 font-mono text-purple-400 font-bold">${req.security_key}</td>
                    <td class="p-3"><span class="text-green-500 font-black text-[9px] tracking-widest uppercase">Used</span></td>
                    <td class="p-3">
                        <button onclick="handleDelete('hod', ${req.id})" class="text-red-500/40 hover:text-red-500 transition-colors"><i class="fa-solid fa-trash-can text-xs"></i></button>
                    </td>
                `;
                body.appendChild(tr);
            }
            if(cardsCont) {
                const card = document.createElement('div');
                card.className = 'bg-gray-800/20 p-4 rounded-xl border border-white/5 flex justify-between items-center';
                card.innerHTML = `
                   <div class="flex-grow">
                        <div class="flex items-center space-x-2">
                             <span class="text-xs font-bold text-gray-300 capitalize">${req.name.toLowerCase()}</span>
                             <span class="text-[8px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded-full font-black uppercase tracking-[0.2em]">Used</span>
                        </div>
                        <p class="text-[10px] font-mono text-purple-400 mt-0.5">${req.security_key}</p>
                   </div>
                   <button onclick="handleDelete('hod', ${req.id})" class="p-2 text-red-500/40 hover:text-red-500"><i class="fa-solid fa-trash-can text-sm"></i></button>
                `;
                cardsCont.appendChild(card);
            }
        });
    } catch(err) {}
}

async function loadSecurityUpcoming(isSilent = false) {
    const tableBody = document.getElementById('upcomingExitsBody');
    const cardsCont = document.getElementById('upcomingExitsCards');
    if(!tableBody && !cardsCont) return;
    
    try {
        const res = await fetch(`${API_BASE}/security/upcoming`);
        const data = await res.json();
        
        if (tableBody) tableBody.innerHTML = '';
        if (cardsCont) cardsCont.innerHTML = '';

        if(data.length === 0) {
            const emptyTable = '<tr><td colspan="4" class="py-10 text-center text-gray-600 italic text-xs uppercase tracking-widest">No pending exits.</td></tr>';
            const emptyCards = '<div class="text-center py-10 text-gray-600 italic text-xs uppercase tracking-widest">No pending exits.</div>';
            if(tableBody) tableBody.innerHTML = emptyTable;
            if(cardsCont) cardsCont.innerHTML = emptyCards;
            return;
        }

        data.forEach(req => {
            // Desktop Table
            if(tableBody) {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-gray-800/40 hover:bg-blue-900/5 transition-colors p-2';
                tr.innerHTML = `
                    <td class="py-4">
                        <p class="font-bold text-white">${req.name}</p>
                        <p class="text-[10px] text-gray-500 uppercase">${req.usn || ''}</p>
                    </td>
                    <td class="py-4 font-mono font-bold text-purple-400 capitalize">${req.security_key}</td>
                    <td class="py-4 text-xs text-gray-400 italic">${req.reason}</td>
                    <td class="py-4 text-right flex items-center justify-end space-x-2">
                        <button onclick="copyToScanner('${req.security_key}')" class="px-3 py-1 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white rounded text-[10px] font-bold border border-blue-500/30 transition-all uppercase">Verify</button>
                        <button onclick="handleDelete('security', ${req.id})" class="p-1.5 text-gray-700 hover:text-red-500 transition-colors"><i class="fa-solid fa-trash-can text-sm"></i></button>
                    </td>
                `;
                tableBody.appendChild(tr);
            }

            // Mobile Cards
            if(cardsCont) {
                const card = document.createElement('div');
                card.className = 'p-5 bg-white/5 rounded-2xl border border-white/10 shadow-xl';
                card.innerHTML = `
                    <div class="flex justify-between items-center mb-3">
                         <div>
                             <p class="text-white font-bold text-lg">${req.name}</p>
                             <p class="text-[10px] text-gray-500 font-mono">${req.usn || 'N/A'}</p>
                         </div>
                         <code class="bg-gray-800 px-3 py-1.5 rounded text-purple-400 font-black text-xs border border-purple-500/20">${req.security_key}</code>
                    </div>
                    <p class="text-xs text-gray-400 italic mb-4">"${req.reason}"</p>
                    <div class="flex space-x-2">
                         <button onclick="copyToScanner('${req.security_key}')" class="flex-grow bg-blue-600 text-white font-bold py-3 rounded-xl active:scale-95 transition-transform flex items-center justify-center">
                             <i class="fa-solid fa-barcode mr-2"></i> VERIFY NOW
                         </button>
                         <button onclick="handleDelete('security', ${req.id})" class="px-5 bg-gray-800 text-red-400 rounded-xl border border-red-500/20 flex items-center justify-center">
                             <i class="fa-solid fa-trash-can"></i>
                         </button>
                    </div>
                `;
                cardsCont.appendChild(card);
            }
        });
    } catch(err) {}
}

async function loadTeacherHistory(isSilent = false) {
    const body = document.getElementById('teacherHistoryBody');
    const cardsCont = document.getElementById('teacherHistoryCards');
    if(!body && !cardsCont) return;
    try {
        const res = await fetch(`${API_BASE}/teacher/history`);
        const data = await res.json();
        
        if(body) body.innerHTML = '';
        if(cardsCont) cardsCont.innerHTML = '';

        if(data.length === 0) {
            if(body) body.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-600 italic">No recent actions.</td></tr>';
            if(cardsCont) cardsCont.innerHTML = '<div class="text-center py-4 text-gray-600 italic">No recent actions.</div>';
            return;
        }
        data.forEach(req => {
            const statusColor = req.teacher_status === 'approved' ? 'text-green-500' : 'text-red-500';
            if(body) {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-gray-800/40 text-[11px]';
                tr.innerHTML = `
                    <td class="p-3 text-gray-300 font-bold">${req.name}</td>
                    <td class="p-3"><span class="${statusColor} font-black uppercase text-[9px] tracking-widest">${req.teacher_status}</span></td>
                    <td class="p-3 italic text-gray-500 truncate max-w-xs">${req.reason}</td>
                    <td class="p-3">
                        <button onclick="handleDelete('teacher', ${req.id})" class="text-red-500/40 hover:text-red-500 transition-colors"><i class="fa-solid fa-trash-can text-xs"></i></button>
                    </td>
                `;
                body.appendChild(tr);
            }
            if(cardsCont) {
                const card = document.createElement('div');
                card.className = 'bg-gray-800/20 p-4 rounded-xl border border-white/5 flex justify-between items-center';
                const pillColor = req.teacher_status === 'approved' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500';
                card.innerHTML = `
                   <div class="flex-grow">
                        <div class="flex items-center space-x-2">
                             <span class="text-xs font-bold text-gray-300 capitalize">${req.name.toLowerCase()}</span>
                             <span class="text-[8px] ${pillColor} px-1.5 py-0.5 rounded-full font-black uppercase tracking-[0.2em]">${req.teacher_status}</span>
                        </div>
                        <p class="text-[10px] text-gray-600 mt-1 truncate max-w-[200px]">"${req.reason}"</p>
                   </div>
                   <button onclick="handleDelete('teacher', ${req.id})" class="p-2 text-red-500/40 hover:text-red-500"><i class="fa-solid fa-trash-can text-sm"></i></button>
                `;
                cardsCont.appendChild(card);
            }
        });
    } catch(err) {}
}

async function updateDashboardStats() {
    try {
        const res = await fetch(`${API_BASE}/stats`);
        const data = await res.json();
        
        // HOD Stats
        const ph = document.getElementById('statPendingHOD');
        const at = document.getElementById('statApprovedToday');
        const rt = document.getElementById('statRejectedToday');
        
        if(ph) ph.innerText = data.pending_hod;
        if(at) at.innerText = data.approved_today;
        if(rt) rt.innerText = data.rejected;
        
        // Teacher Stats
        const pt = document.getElementById('statPendingTeacher');
        const att = document.getElementById('statApprovedTodayT');
        if(pt) pt.innerText = data.pending_teacher;
        if(att) att.innerText = data.approved_today;
        
    } catch(e) {}
}

function copyToScanner(key) {
    const input = document.getElementById('qrInput');
    if(input) {
        input.value = key;
        showToast(`Key ${key} copied to scanner`);
        // Scroll back up and trigger verify
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => document.getElementById('verifyBtn').click(), 500);
    }
}
