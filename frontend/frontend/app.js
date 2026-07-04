const API_BASE_URL = 'http://127.0.0.1:8000';

// ── State ────────────────────────────────────────────────────────────────────
let workspaces        = [];
let currentWorkspace  = null;
let currentSelectedReq = null;
// Local mirror of review data: { [reqText]: { approval_status, reviewer_comment } }
let reviewState       = {};

// ── DOM Refs ─────────────────────────────────────────────────────────────────
const wsListEl        = document.getElementById('workspaces-list');
const noWsState       = document.getElementById('no-workspace-state');
const contentGrid     = document.getElementById('content-grid');
const dashboardHeader = document.getElementById('dashboard-header');

// Modals
const modal           = document.getElementById('create-modal');
const btnNewWs        = document.getElementById('btn-new-workspace');
const closeModal      = document.querySelector('.close-modal');
const formCreateWs    = document.getElementById('create-ws-form');

const editModal       = document.getElementById('edit-modal');
const btnEditWs       = document.getElementById('btn-edit-workspace');
const closeModalEdit  = document.querySelector('.close-modal-edit');
const formEditWs      = document.getElementById('edit-ws-form');

const trashModal      = document.getElementById('trash-modal');
const btnOpenTrash    = document.getElementById('btn-open-trash');
const closeModalTrash = document.querySelector('.close-modal-trash');
const trashListEl     = document.getElementById('trash-list');

// Header
const elWsName         = document.getElementById('ws-name');

const elWinGauge       = document.getElementById('win-gauge');
const elWinValue       = document.getElementById('win-value');
const elStatusBadge    = document.getElementById('ws-status');
const elComplianceValue= document.getElementById('compliance-value');
const elHoursSaved     = document.getElementById('hours-saved');
const btnDeleteWs      = document.getElementById('btn-delete-workspace');
const approvalMetricCard   = document.getElementById('approval-metric-card');
const approvalProgressValue= document.getElementById('approval-progress-value');
const approvalMiniBarFill  = document.getElementById('approval-mini-fill');
const approvalProgressLabel= document.getElementById('approval-progress-label');

// Upload / Analyze
const dropZone    = document.getElementById('drop-zone');
const fileInput   = document.getElementById('file-input');
const uploadToast    = document.getElementById('upload-status');
const uploadToastIcon= uploadToast.querySelector('.upload-toast-icon');
const uploadToastMsg = uploadToast.querySelector('.upload-toast-msg');
const btnAnalyze  = document.getElementById('btn-analyze');

// File preview (shown after upload replaces drop-zone)
const filePreview  = document.getElementById('file-preview');
const fpName       = document.getElementById('fp-name');
const fpMeta       = document.getElementById('fp-meta');
const fpIcon       = document.getElementById('fp-icon');
const fpIconWrap   = document.querySelector('.fp-icon-wrap');
const fpRemoveBtn  = document.getElementById('fp-remove-btn');

// Requirements
const reqListEl   = document.getElementById('requirements-list');

// Edit tab
const draftEditor  = document.getElementById('draft-editor');
const editorContext= document.getElementById('editor-context');
const btnSaveDraft = document.getElementById('btn-save-draft');
const saveStatus   = document.getElementById('save-status');

// Review tab
const reviewSectionsList   = document.getElementById('review-sections-list');
const approvalBarApproved  = document.getElementById('approval-bar-approved');
const approvalBarRejected  = document.getElementById('approval-bar-rejected');
const rpbText              = document.getElementById('rpb-text');
const rpbCounts            = document.getElementById('rpb-counts');

// Preview tab
const fullProposalPreview  = document.getElementById('full-proposal-preview');
const btnDownloadProposal  = document.getElementById('btn-download-proposal');
const exportGateWarning    = document.getElementById('export-gate-warning');
const exportGateMsg        = document.getElementById('export-gate-msg');

// Tabs
const tabBtnEdit    = document.getElementById('tab-btn-edit');
const tabBtnReview  = document.getElementById('tab-btn-review');
const tabBtnPreview = document.getElementById('tab-btn-preview');
const tabBtnFinance = document.getElementById('tab-btn-finance');
const paneEdit      = document.getElementById('pane-edit');
const paneReview    = document.getElementById('pane-review');
const panePreview   = document.getElementById('pane-preview');
const paneFinance   = document.getElementById('pane-finance');
const financeReport = document.getElementById('finance-report');
const financeEmpty  = document.getElementById('finance-empty-state');
const btnRunFinance = document.getElementById('btn-run-finance');

// ── Upload toast helper ──────────────────────────────────────────────────────
/**
 * showUploadToast(type, message)
 *   type: 'error' | 'info' | 'success'
 *   Picks the right icon and color class automatically.
 */
function showUploadToast(type, message) {
    const iconMap = {
        error:   'ph-fill ph-warning-circle',
        info:    'ph ph-spinner-gap',
        success: 'ph-fill ph-check-circle',
    };
    uploadToast.style.display = 'flex';
    uploadToast.className     = `upload-toast toast-${type}`;
    uploadToastIcon.className = `upload-toast-icon ${iconMap[type] || iconMap.error}`;
    uploadToastMsg.textContent = message;
}

function hideUploadToast() {
    uploadToast.style.display = 'none';
    uploadToast.className     = 'upload-toast';
    uploadToastMsg.textContent = '';
}

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => { fetchWorkspaces(); });

// ── API calls ────────────────────────────────────────────────────────────────
async function fetchWorkspaces() {
    try {
        const res  = await fetch(`${API_BASE_URL}/api/workspaces`);
        workspaces = await res.json();
        renderSidebar();
        if (workspaces.length > 0 && !currentWorkspace) {
            selectWorkspace(workspaces[0].id);
        } else if (workspaces.length === 0) {
            showEmptyState();
        }
    } catch (e) { console.error('fetchWorkspaces', e); }
}

async function createWorkspace(data) {
    const fd = new URLSearchParams(data);
    try {
        const res   = await fetch(`${API_BASE_URL}/api/workspaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd
        });
        const newWs = await res.json();
        workspaces.push(newWs);
        renderSidebar();
        selectWorkspace(newWs.id);
        closeModalWindow();
    } catch (e) { console.error('createWorkspace', e); }
}

async function deleteWorkspace(id) {
    try {
        await fetch(`${API_BASE_URL}/api/workspaces/${id}`, { method: 'DELETE' });
        workspaces       = workspaces.filter(w => w.id !== id);
        currentWorkspace = null;
        renderSidebar();
        workspaces.length > 0 ? selectWorkspace(workspaces[0].id) : showEmptyState();
    } catch (e) { console.error('deleteWorkspace', e); }
}

async function updateWorkspaceInfo(id, data) {
    const fd = new URLSearchParams(data);
    try {
        const res       = await fetch(`${API_BASE_URL}/api/workspaces/${id}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd
        });
        const updatedWs = await res.json();
        const idx       = workspaces.findIndex(w => w.id === id);
        if (idx !== -1) workspaces[idx] = updatedWs;
        currentWorkspace = updatedWs;
        renderSidebar();
        renderWorkspace(updatedWs);
        closeEditModalWindow();
    } catch (e) { console.error('updateWorkspaceInfo', e); }
}

async function fetchTrash() {
    try {
        const res   = await fetch(`${API_BASE_URL}/api/workspaces/trash`);
        const trash = await res.json();
        renderTrash(trash);
    } catch (e) { console.error('fetchTrash', e); }
}

async function recoverWorkspace(id) {
    try {
        const res         = await fetch(`${API_BASE_URL}/api/workspaces/${id}/recover`, { method: 'POST' });
        const recoveredWs = await res.json();
        workspaces.push(recoveredWs);
        renderSidebar();
        selectWorkspace(recoveredWs.id);
        fetchTrash();
    } catch (e) { console.error('recoverWorkspace', e); }
}

async function deletePermanent(id) {
    try {
        await fetch(`${API_BASE_URL}/api/workspaces/${id}/permanent`, { method: 'DELETE' });
        fetchTrash();
    } catch (e) { console.error('deletePermanent', e); }
}

window.recoverWorkspace = recoverWorkspace;
window.deletePermanent  = deletePermanent;

async function uploadFile(file) {
    if (!currentWorkspace) return;

    // Show uploading state on drop-zone itself
    showUploadToast('info', 'Uploading…');

    const fd = new FormData();
    fd.append('file', file);
    try {
        const res = await fetch(`${API_BASE_URL}/api/workspaces/${currentWorkspace.id}/upload`, {
            method: 'POST', body: fd
        });
        if (!res.ok) {
            const err = await res.json();
            showUploadToast('error', '⚠ ' + (err.detail || 'Upload failed.'));
            return;
        }
        currentWorkspace = await res.json();
        updateWorkspaceInState(currentWorkspace);
        renderWorkspace(currentWorkspace);

        // Show file preview card, hide drop zone
        showFilePreview(file);

        hideUploadToast();
        btnAnalyze.disabled = false;
    } catch (e) {
        console.error('uploadFile', e);
        showUploadToast('error', '⚠ Upload failed. Please try again.');
    }
}

/** Display the uploaded-file card and hide the drop-zone */
function showFilePreview(file) {
    const isPdf  = file.name.toLowerCase().endsWith('.pdf');
    const ext    = isPdf ? 'PDF' : 'DOCX';
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

    fpName.textContent = file.name;
    fpMeta.textContent = `${ext} · ${sizeMB} MB · Ready to analyse`;

    // Icon and tint: PDF = green, DOCX = purple
    fpIcon.className = isPdf ? 'ph-fill ph-file-pdf' : 'ph-fill ph-file-doc';
    if (isPdf) {
        fpIconWrap.classList.remove('docx-icon');
    } else {
        fpIconWrap.classList.add('docx-icon');
    }

    dropZone.style.display  = 'none';
    filePreview.style.display = 'flex';
}

/** Reset upload area back to the drop-zone (used by remove button & workspace switch) */
function resetUploadArea() {
    filePreview.style.display = 'none';
    dropZone.style.display    = 'block';
    hideUploadToast();
    fileInput.value           = '';
    btnAnalyze.disabled       = true;
}

async function runAnalysis() {
    if (!currentWorkspace) return;
    btnAnalyze.disabled = true;
    btnAnalyze.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> Analyzing…';
    try {
        const res = await fetch(`${API_BASE_URL}/api/workspaces/${currentWorkspace.id}/analyze`, {
            method: 'POST'
        });
        if (!res.ok) { const e = await res.json(); alert(e.detail || 'Analysis failed.'); return; }
        currentWorkspace = await res.json();
        reviewState      = {};   // fresh review state
        updateWorkspaceInState(currentWorkspace);
        renderWorkspace(currentWorkspace);
    } catch (e) { console.error('runAnalysis', e); }
    finally {
        btnAnalyze.disabled = false;
        btnAnalyze.innerHTML = '<i class="ph-fill ph-magic-wand"></i> Run AI Analysis';
    }
}

async function saveDraft() {
    if (!currentWorkspace || !currentSelectedReq) return;
    const content = draftEditor.value;
    const fd      = new URLSearchParams({ requirement_text: currentSelectedReq, draft_content: content });
    btnSaveDraft.disabled = true;
    saveStatus.textContent = 'Saving…';
    try {
        await fetch(`${API_BASE_URL}/api/workspaces/${currentWorkspace.id}/edit-draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd
        });
        if (!currentWorkspace.drafts) currentWorkspace.drafts = {};
        currentWorkspace.drafts[currentSelectedReq] = content;

        // If this req was approved, mark it as edited
        if (reviewState[currentSelectedReq]?.approval_status === 'approved') {
            reviewState[currentSelectedReq].approval_status = 'edited';
        }

        saveStatus.textContent = 'Saved!';
        setTimeout(() => { saveStatus.textContent = ''; }, 3000);
    } catch (e) {
        console.error('saveDraft', e);
        saveStatus.textContent = 'Save failed.';
    } finally { btnSaveDraft.disabled = false; }
}

// ── Gap collaboration API ────────────────────────────────────────────────────
async function saveCollaboration(reqText, data, collabId = '') {
    const fd = new URLSearchParams({
        requirement_text:   reqText,
        company_name:       data.company_name,
        contact_email:      data.contact_email || '',
        capability_covered: data.capability_covered || '',
        notes:              data.notes || '',
        collab_id:          collabId
    });
    const res = await fetch(`${API_BASE_URL}/api/workspaces/${currentWorkspace.id}/gap-collaboration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: fd
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Save failed'); }
    return await res.json();
}

async function deleteCollaboration(reqText, collabId) {
    const fd = new URLSearchParams({ requirement_text: reqText, collab_id: collabId });
    const res = await fetch(`${API_BASE_URL}/api/workspaces/${currentWorkspace.id}/gap-collaboration`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: fd
    });
    if (!res.ok) throw new Error('Delete failed');
    return await res.json();
}

/**
 * Submit a review decision for one draft section.
 * Called from review card buttons.
 */
async function submitReview(reqText, approvalStatus, reviewerComment, newContent) {
    if (!currentWorkspace) return;
    const fd = new URLSearchParams({
        requirement_text: reqText,
        approval_status:  approvalStatus,
        reviewer_comment: reviewerComment || ''
    });
    if (newContent !== undefined && newContent !== null) {
        fd.append('draft_content', newContent);
    }
    try {
        const res  = await fetch(`${API_BASE_URL}/api/workspaces/${currentWorkspace.id}/review-draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd
        });
        const data = await res.json();

        // Update local review state
        reviewState[reqText] = { approval_status: approvalStatus, reviewer_comment: reviewerComment || '' };

        // Sync edited content locally
        if (newContent !== undefined && newContent !== null) {
            if (!currentWorkspace.drafts) currentWorkspace.drafts = {};
            currentWorkspace.drafts[reqText] = newContent;
        }

        updateApprovalUI(data.approved_count, data.rejected_count, data.total_sections);
    } catch (e) { console.error('submitReview', e); }
}

// ── Rendering ────────────────────────────────────────────────────────────────
function renderSidebar() {
    wsListEl.innerHTML = '';
    workspaces.forEach(ws => {
        const li = document.createElement('li');
        li.className = `ws-item ${currentWorkspace && currentWorkspace.id === ws.id ? 'active' : ''}`;
        li.innerHTML  = `<i class="ph-fill ph-folder"></i> ${ws.name}`;
        li.onclick    = () => selectWorkspace(ws.id);
        wsListEl.appendChild(li);
    });
}

function selectWorkspace(id) {
    const ws = workspaces.find(w => w.id === id);
    if (!ws) return;
    currentWorkspace   = ws;
    currentSelectedReq = null;
    reviewState        = {};

    // Restore review state from workspace data
    if (ws.draft_reviews) {
        reviewState = JSON.parse(JSON.stringify(ws.draft_reviews));
    }

    switchTab('edit');
    renderSidebar();
    showWorkspace(ws);
    resetUploadArea();
}

function updateWorkspaceInState(ws) {
    const idx = workspaces.findIndex(w => w.id === ws.id);
    if (idx !== -1) workspaces[idx] = ws;
}

function showEmptyState() {
    noWsState.style.display     = 'flex';
    dashboardHeader.style.display = 'none';
    contentGrid.style.display   = 'none';
}

function showWorkspace(ws) {
    noWsState.style.display     = 'none';
    dashboardHeader.style.display = 'flex';
    contentGrid.style.display   = 'grid';
    renderWorkspace(ws);
}

function renderWorkspace(ws) {
    elWsName.textContent    = ws.name;

    elComplianceValue.textContent = `${ws.compliance_pct ? ws.compliance_pct.toFixed(1) : 0}%`;
    elHoursSaved.textContent      = ws.manual_hours_saved || 0;
    elStatusBadge.textContent     = ws.status || 'NO-GO';
    elStatusBadge.className       = `status-badge ${ws.status === 'GO' ? 'status-go' : 'status-nogo'}`;

    const winProb = ws.win_probability || 0;
    elWinValue.textContent         = `${winProb.toFixed(1)}%`;
    elWinGauge.style.transform     = `rotate(${(winProb / 100) * 180}deg)`;

    renderRequirements(ws);
    resetEditor();

    // Decide if analyze button should be enabled
    const hasReqs     = ws.requirements && ws.requirements.length > 0;
    const notAnalyzed = !ws.drafts || Object.keys(ws.drafts).length === 0;
    btnAnalyze.disabled = !(hasReqs && notAnalyzed);

    // Enable finance button once requirements are analyzed
    if (btnRunFinance) btnRunFinance.disabled = !hasReqs;

    // Refresh approval header card
    refreshApprovalHeaderCard();
}

function renderRequirements(ws) {
    reqListEl.innerHTML = '';
    if (!ws.requirements || ws.requirements.length === 0) {
        reqListEl.innerHTML = '<div class="empty-state">No requirements loaded. Upload an RFP.</div>';
        return;
    }
    ws.requirements.forEach((req, idx) => {
        const item = document.createElement('div');
        item.className = 'req-item';
        let statusClass = 'req-pending', statusIcon = '<i class="ph ph-clock"></i> PENDING';
        if (req.status === 'Pass') { statusClass = 'req-pass'; statusIcon = '<i class="ph-fill ph-check-circle"></i> PASS'; }
        else if (req.status === 'Fail') { statusClass = 'req-fail'; statusIcon = '<i class="ph-fill ph-warning-circle"></i> GAP DETECTED'; }

        const header = document.createElement('div');
        header.className = 'req-header';
        header.innerHTML = `
            <div class="req-text">${req.text}</div>
            <div class="req-status-badge ${statusClass}">${statusIcon}</div>`;
        header.onclick = () => {
            const isOpen = item.classList.contains('open');
            document.querySelectorAll('.req-item').forEach(el => el.classList.remove('open'));
            if (!isOpen) item.classList.add('open');
            loadDraftToEditor(req.text);
        };
        item.appendChild(header);

        // Build body: evidence grid for Pass, collaboration panel for Fail
        const body = document.createElement('div');
        body.className = 'req-body';

        if (req.evidence) {
            body.innerHTML = `
                <div class="evidence-grid">
                    <div class="ev-label">Matched Cap:</div><div class="ev-val">${req.matched_cap || 'N/A'}</div>
                    <div class="ev-label">Domain:</div><div class="ev-val">${req.evidence.domain || 'N/A'}</div>
                    <div class="ev-label">Client:</div><div class="ev-val">${req.evidence.client_type || 'N/A'}</div>
                    <div class="ev-label">Value:</div><div class="ev-val">${req.evidence.contract_value || 'N/A'}</div>
                    <div class="ev-label">Cert:</div><div class="ev-val">${req.evidence.certification || 'None'}</div>
                    <div class="ev-label" style="grid-column:1/-1;margin-top:8px;">Summary:</div>
                    <div class="ev-val" style="grid-column:1/-1;font-style:italic;">"${req.evidence.summary}"</div>
                </div>`;
        } else if (req.status === 'Fail') {
            // Collaboration panel for gaps
            const collabs = (ws.gap_collaborations && ws.gap_collaborations[req.text]) || [];
            body.appendChild(buildCollabPanel(req.text, collabs, idx));
        }

        item.appendChild(body);
        reqListEl.appendChild(item);
    });
}

// ── Collaboration panel builder ───────────────────────────────────────────────
function buildCollabPanel(reqText, collabs, idx) {
    const wrap = document.createElement('div');
    wrap.className = 'collab-panel';
    wrap.id = `collab-panel-${idx}`;

    // Header row
    wrap.innerHTML = `
        <div class="collab-header">
            <i class="ph-fill ph-handshake collab-header-icon"></i>
            <div>
                <div class="collab-title">Capability gap — find a collaboration partner</div>
                <div class="collab-subtitle">Your organisation lacks evidence for this requirement. Add a partner company that can cover it so you can still bid.</div>
            </div>
        </div>`;

    // Existing partner cards
    const listWrap = document.createElement('div');
    listWrap.className = 'collab-list';
    listWrap.id = `collab-list-${idx}`;
    renderCollabPartners(listWrap, reqText, collabs, idx);
    wrap.appendChild(listWrap);

    // Add-partner form (collapsed by default)
    const formWrap = document.createElement('div');
    formWrap.className = 'collab-form-wrap';
    formWrap.id = `collab-form-${idx}`;
    formWrap.innerHTML = `
        <div class="collab-form-toggle" id="collab-toggle-${idx}" onclick="toggleCollabForm(${idx})">
            <i class="ph ph-plus-circle"></i> Add collaboration partner
        </div>
        <div class="collab-form" id="collab-form-inner-${idx}" style="display:none;">
            <div class="collab-field-row">
                <div class="collab-field">
                    <label>Company name <span style="color:var(--danger)">*</span></label>
                    <input type="text" id="cf-company-${idx}" class="glass-input collab-input" placeholder="e.g. CertifyPro Ltd.">
                </div>
                <div class="collab-field">
                    <label>Contact email</label>
                    <input type="email" id="cf-email-${idx}" class="glass-input collab-input" placeholder="partner@example.com">
                </div>
            </div>
            <div class="collab-field">
                <label>Capability / certification they cover</label>
                <input type="text" id="cf-cap-${idx}" class="glass-input collab-input" placeholder="e.g. ISO 27001 certified, CMMI L3 delivery">
            </div>
            <div class="collab-field">
                <label>Notes</label>
                <input type="text" id="cf-notes-${idx}" class="glass-input collab-input" placeholder="e.g. Already in contact, can provide subcontract letter">
            </div>
            <div class="collab-form-actions">
                <span class="collab-form-status" id="cf-status-${idx}"></span>
                <button class="btn-secondary collab-cancel-btn" onclick="toggleCollabForm(${idx})">Cancel</button>
                <button class="btn-collab-save" onclick="submitCollabForm('${escapeAttr(reqText)}', ${idx})">
                    <i class="ph ph-floppy-disk"></i> Save partner
                </button>
            </div>
        </div>`;
    wrap.appendChild(formWrap);
    return wrap;
}

function renderCollabPartners(container, reqText, collabs, idx) {
    container.innerHTML = '';
    if (!collabs || collabs.length === 0) {
        container.innerHTML = '<div class="collab-empty">No partners added yet. Add one below to resolve this gap.</div>';
        return;
    }
    collabs.forEach(p => {
        const card = document.createElement('div');
        card.className = 'collab-partner-card';
        card.innerHTML = `
            <div class="cp-icon"><i class="ph-fill ph-buildings"></i></div>
            <div class="cp-info">
                <div class="cp-name">${escapeHtml(p.company_name)}</div>
                ${p.capability_covered ? `<div class="cp-cap"><i class="ph ph-seal-check"></i> ${escapeHtml(p.capability_covered)}</div>` : ''}
                ${p.contact_email    ? `<div class="cp-email"><i class="ph ph-envelope"></i> ${escapeHtml(p.contact_email)}</div>` : ''}
                ${p.notes           ? `<div class="cp-notes">${escapeHtml(p.notes)}</div>` : ''}
            </div>
            <div class="cp-resolved-badge"><i class="ph-fill ph-check-circle"></i> Gap covered</div>
            <button class="cp-remove-btn" title="Remove partner"
                onclick="removeCollabPartner('${escapeAttr(reqText)}', '${p.id}', ${idx})">
                <i class="ph ph-x"></i>
            </button>`;
        container.appendChild(card);
    });
}

window.toggleCollabForm = function(idx) {
    const inner = document.getElementById(`collab-form-inner-${idx}`);
    const toggle = document.getElementById(`collab-toggle-${idx}`);
    if (!inner) return;
    const isOpen = inner.style.display !== 'none';
    inner.style.display = isOpen ? 'none' : 'block';
    toggle.style.display = isOpen ? 'flex' : 'none';
};

window.submitCollabForm = async function(reqText, idx) {
    const company  = document.getElementById(`cf-company-${idx}`)?.value.trim();
    const email    = document.getElementById(`cf-email-${idx}`)?.value.trim();
    const cap      = document.getElementById(`cf-cap-${idx}`)?.value.trim();
    const notes    = document.getElementById(`cf-notes-${idx}`)?.value.trim();
    const statusEl = document.getElementById(`cf-status-${idx}`);

    if (!company) { statusEl.textContent = 'Company name is required.'; statusEl.style.color='var(--danger)'; return; }

    statusEl.textContent = 'Saving…'; statusEl.style.color = 'var(--text-secondary)';
    try {
        const result = await saveCollaboration(reqText, {
            company_name: company, contact_email: email,
            capability_covered: cap, notes
        });

        // Update local state
        if (!currentWorkspace.gap_collaborations) currentWorkspace.gap_collaborations = {};
        currentWorkspace.gap_collaborations[reqText] = result.gap_collaborations;

        // Re-render the partner list
        const listEl = document.getElementById(`collab-list-${idx}`);
        if (listEl) renderCollabPartners(listEl, reqText, result.gap_collaborations, idx);

        // Reset + close form
        ['cf-company-','cf-email-','cf-cap-','cf-notes-'].forEach(id => {
            const el = document.getElementById(id + idx); if (el) el.value = '';
        });
        statusEl.textContent = '';
        toggleCollabForm(idx);
    } catch (e) {
        statusEl.textContent = 'Save failed. Try again.'; statusEl.style.color = 'var(--danger)';
    }
};

window.removeCollabPartner = async function(reqText, collabId, idx) {
    if (!confirm('Remove this collaboration partner?')) return;
    try {
        const result = await deleteCollaboration(reqText, collabId);

        if (!currentWorkspace.gap_collaborations) currentWorkspace.gap_collaborations = {};
        currentWorkspace.gap_collaborations[reqText] = (currentWorkspace.gap_collaborations[reqText] || [])
            .filter(p => p.id !== collabId);

        const listEl = document.getElementById(`collab-list-${idx}`);
        if (listEl) renderCollabPartners(listEl, reqText, currentWorkspace.gap_collaborations[reqText], idx);
    } catch (e) { console.error('removeCollabPartner', e); }
};

function loadDraftToEditor(reqText) {
    currentSelectedReq        = reqText;
    editorContext.textContent  = reqText;
    draftEditor.disabled       = false;
    btnSaveDraft.disabled      = false;
    draftEditor.value          = (currentWorkspace.drafts && currentWorkspace.drafts[reqText])
                                    ? currentWorkspace.drafts[reqText]
                                    : 'Draft not generated yet. Run AI Analysis.';
}

function resetEditor() {
    currentSelectedReq        = null;
    editorContext.textContent  = 'Select a requirement to edit its proposal draft.';
    draftEditor.value          = '';
    draftEditor.disabled       = true;
    btnSaveDraft.disabled      = true;
    saveStatus.textContent     = '';
}

// ── Review Panel ─────────────────────────────────────────────────────────────
function getValidDrafts() {
    if (!currentWorkspace || !currentWorkspace.requirements) return [];
    return currentWorkspace.requirements
        .map(req => ({ req, text: currentWorkspace.drafts ? currentWorkspace.drafts[req.text] : null }))
        .filter(d => d.text && !d.text.startsWith('WARNING') && !d.text.startsWith('Draft not generated'));
}

function renderReviewPane() {
    reviewSectionsList.innerHTML = '';
    const validDrafts = getValidDrafts();
    if (validDrafts.length === 0) {
        reviewSectionsList.innerHTML = '<div class="empty-state" style="padding:40px 0;">Run AI Analysis to generate drafts for review.</div>';
        refreshApprovalBar();
        return;
    }

    validDrafts.forEach((d, idx) => {
        const reqText  = d.req.text;
        const review   = reviewState[reqText] || { approval_status: 'pending', reviewer_comment: '' };
        const status   = review.approval_status;

        const card = document.createElement('div');
        card.className = `review-card rc-${status}`;
        card.id        = `rc-${idx}`;

        // Chip label map
        const chipMap = {
            pending:  { cls: 'rc-chip-pending',  icon: 'ph-clock',          label: 'PENDING' },
            approved: { cls: 'rc-chip-approved', icon: 'ph-fill ph-seal-check', label: 'APPROVED' },
            rejected: { cls: 'rc-chip-rejected', icon: 'ph-fill ph-x-circle',   label: 'REJECTED' },
            edited:   { cls: 'rc-chip-edited',   icon: 'ph-pencil',          label: 'EDITED — RE-REVIEW' },
        };
        const chip = chipMap[status] || chipMap.pending;

        card.innerHTML = `
        <div class="review-card-header" onclick="toggleReviewCard('rc-${idx}')">
            <div class="rc-req-label">
                <strong>Section ${idx + 1}</strong>
                ${reqText}
            </div>
            <div class="rc-status-chip ${chip.cls}">
                <i class="ph ${chip.icon}"></i> ${chip.label}
            </div>
        </div>
        <div class="review-card-body">
            <div class="rc-ai-badge"><i class="ph ph-robot"></i> AI Generated</div>

            <!-- Read-only draft view -->
            <div class="rc-draft-text" id="rc-text-${idx}">${escapeHtml(d.text)}</div>

            <!-- Editable textarea (hidden by default) -->
            <textarea class="rc-edit-area" id="rc-edit-${idx}" placeholder="Edit the draft here…">${escapeHtml(d.text)}</textarea>

            <!-- Comment display (shown when already reviewed) -->
            <div class="rc-comment-display" id="rc-comment-display-${idx}" style="${review.reviewer_comment ? 'display:block;' : 'display:none;'}">
                <i class="ph ph-chat-circle-text"></i> Reviewer note: ${escapeHtml(review.reviewer_comment || '')}
            </div>

            <!-- Comment input -->
            <div class="rc-comment-label"><i class="ph ph-chat-dots"></i> Reviewer Comment (optional)</div>
            <textarea class="rc-comment-input" id="rc-comment-${idx}" placeholder="Add a note for this section…">${escapeHtml(review.reviewer_comment || '')}</textarea>

            <!-- Action buttons -->
            <div class="rc-actions">
                <button class="btn-approve ${status === 'approved' ? 'active' : ''}"
                        onclick="handleApprove(${idx}, '${escapeAttr(reqText)}')">
                    <i class="ph-fill ph-check-circle"></i> Approve
                </button>
                <button class="btn-reject ${status === 'rejected' ? 'active' : ''}"
                        onclick="handleReject(${idx}, '${escapeAttr(reqText)}')">
                    <i class="ph-fill ph-x-circle"></i> Reject
                </button>
                <button class="btn-edit-inline" id="rc-edit-btn-${idx}"
                        onclick="toggleInlineEdit(${idx}, '${escapeAttr(reqText)}')">
                    <i class="ph ph-pencil"></i> Edit Draft
                </button>
                <button class="btn-save-inline" id="rc-save-btn-${idx}"
                        onclick="saveInlineEdit(${idx}, '${escapeAttr(reqText)}')">
                    <i class="ph ph-floppy-disk"></i> Save
                </button>
            </div>
        </div>`;

        reviewSectionsList.appendChild(card);
    });

    refreshApprovalBar();
}

window.toggleReviewCard = function(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.classList.toggle('rc-open');
};

window.handleApprove = async function(idx, reqText) {
    const comment = document.getElementById(`rc-comment-${idx}`)?.value || '';
    await submitReview(reqText, 'approved', comment);
    rerenderReviewCard(idx, reqText, 'approved', comment);
    refreshApprovalBar();
    refreshApprovalHeaderCard();
};

window.handleReject = async function(idx, reqText) {
    const comment = document.getElementById(`rc-comment-${idx}`)?.value || '';
    await submitReview(reqText, 'rejected', comment);
    rerenderReviewCard(idx, reqText, 'rejected', comment);
    refreshApprovalBar();
    refreshApprovalHeaderCard();
};

window.toggleInlineEdit = function(idx, reqText) {
    const textEl  = document.getElementById(`rc-text-${idx}`);
    const editEl  = document.getElementById(`rc-edit-${idx}`);
    const editBtn = document.getElementById(`rc-edit-btn-${idx}`);
    const saveBtn = document.getElementById(`rc-save-btn-${idx}`);
    const isEditing = editEl.style.display === 'block';
    if (isEditing) {
        // Cancel
        editEl.style.display  = 'none';
        textEl.style.display  = 'block';
        editBtn.style.display = 'flex';
        saveBtn.style.display = 'none';
        editBtn.innerHTML     = '<i class="ph ph-pencil"></i> Edit Draft';
    } else {
        editEl.value          = textEl.textContent;
        editEl.style.display  = 'block';
        textEl.style.display  = 'none';
        editBtn.style.display = 'none';
        saveBtn.style.display = 'flex';
    }
};

window.saveInlineEdit = async function(idx, reqText) {
    const editEl  = document.getElementById(`rc-edit-${idx}`);
    const textEl  = document.getElementById(`rc-text-${idx}`);
    const editBtn = document.getElementById(`rc-edit-btn-${idx}`);
    const saveBtn = document.getElementById(`rc-save-btn-${idx}`);
    const comment = document.getElementById(`rc-comment-${idx}`)?.value || '';
    const newText = editEl.value;

    // Save to backend (mark as edited, not approved)
    await submitReview(reqText, 'edited', comment, newText);

    // Update local display
    textEl.textContent    = newText;
    editEl.style.display  = 'none';
    textEl.style.display  = 'block';
    editBtn.style.display = 'flex';
    saveBtn.style.display = 'none';
    editBtn.innerHTML     = '<i class="ph ph-pencil"></i> Edit Draft';

    // Refresh card styling
    rerenderReviewCard(idx, reqText, 'edited', comment);
    refreshApprovalBar();
    refreshApprovalHeaderCard();
};

/** Update just the chip and card border without full re-render */
function rerenderReviewCard(idx, reqText, newStatus, comment) {
    const card = document.getElementById(`rc-${idx}`);
    if (!card) return;
    card.className = `review-card rc-${newStatus} rc-open`;

    const chipMap = {
        pending:  { cls: 'rc-chip-pending',  icon: 'ph-clock',              label: 'PENDING' },
        approved: { cls: 'rc-chip-approved', icon: 'ph-fill ph-seal-check', label: 'APPROVED' },
        rejected: { cls: 'rc-chip-rejected', icon: 'ph-fill ph-x-circle',   label: 'REJECTED' },
        edited:   { cls: 'rc-chip-edited',   icon: 'ph-pencil',             label: 'EDITED — RE-REVIEW' },
    };
    const chip    = chipMap[newStatus] || chipMap.pending;
    const chipEl  = card.querySelector('.rc-status-chip');
    if (chipEl) {
        chipEl.className  = `rc-status-chip ${chip.cls}`;
        chipEl.innerHTML  = `<i class="ph ${chip.icon}"></i> ${chip.label}`;
    }

    // Update approve/reject button active states
    const approveBtn = card.querySelector('.btn-approve');
    const rejectBtn  = card.querySelector('.btn-reject');
    if (approveBtn) approveBtn.classList.toggle('active', newStatus === 'approved');
    if (rejectBtn)  rejectBtn.classList.toggle('active',  newStatus === 'rejected');

    // Show comment display if has comment
    const commentDisplay = document.getElementById(`rc-comment-display-${idx}`);
    if (commentDisplay) {
        commentDisplay.style.display = comment ? 'block' : 'none';
        commentDisplay.innerHTML = comment
            ? `<i class="ph ph-chat-circle-text"></i> Reviewer note: ${escapeHtml(comment)}`
            : '';
    }
}

function refreshApprovalBar() {
    const validDrafts  = getValidDrafts();
    const total        = validDrafts.length;
    if (total === 0) { rpbCounts.textContent = 'No drafts generated yet.'; return; }

    let approved = 0, rejected = 0;
    validDrafts.forEach(d => {
        const s = reviewState[d.req.text]?.approval_status;
        if (s === 'approved') approved++;
        else if (s === 'rejected') rejected++;
    });
    const pending = total - approved - rejected;

    const approvedPct = (approved / total) * 100;
    const rejectedPct = (rejected / total) * 100;

    approvalBarApproved.style.width = `${approvedPct}%`;
    approvalBarRejected.style.width = `${rejectedPct}%`;
    rpbCounts.textContent = `${approved} approved · ${rejected} rejected · ${pending} pending`;

    if (approved === total) {
        rpbText.textContent = '✓ All sections approved — ready to export!';
        rpbText.style.color = 'var(--success)';
    } else {
        rpbText.textContent = `Review all sections before exporting the proposal`;
        rpbText.style.color = '';
    }
}

function refreshApprovalHeaderCard() {
    const validDrafts = getValidDrafts();
    const total       = validDrafts.length;
    if (total === 0) { approvalMetricCard.style.display = 'none'; return; }
    approvalMetricCard.style.display = 'flex';

    const approved = validDrafts.filter(d => reviewState[d.req.text]?.approval_status === 'approved').length;
    approvalProgressValue.textContent  = `${approved}/${total}`;
    approvalMiniBarFill.style.width    = `${(approved / total) * 100}%`;
    approvalProgressLabel.textContent  = approved === total ? 'All Approved ✓' : 'Sections Approved';
}

function updateApprovalUI(approved, rejected, total) {
    // Called from API response — just re-run local calculations
    refreshApprovalBar();
    refreshApprovalHeaderCard();
}

// ── Preview pane ─────────────────────────────────────────────────────────────
function updateFullPreview() {
    if (!currentWorkspace) return;
    const validDrafts  = getValidDrafts();
    const total        = validDrafts.length;
    const approved     = validDrafts.filter(d => reviewState[d.req.text]?.approval_status === 'approved').length;
    const pending      = validDrafts.filter(d => {
        const s = reviewState[d.req.text]?.approval_status;
        return !s || s === 'pending' || s === 'edited';
    }).length;

    // Export gate
    if (pending > 0 && total > 0) {
        exportGateWarning.style.display = 'flex';
        exportGateMsg.textContent       = `${pending} section${pending > 1 ? 's are' : ' is'} pending review. Please approve all sections before exporting.`;
        btnDownloadProposal.disabled    = true;
    } else {
        exportGateWarning.style.display = 'none';
        btnDownloadProposal.disabled    = (total === 0);
    }

    if (validDrafts.length === 0) {
        fullProposalPreview.innerHTML = '<div class="empty-state" style="padding:50px 0;">No drafts yet. Run AI Analysis first.</div>';
        return;
    }

    let html = `<h2 style="color:#fff;margin:0 0 6px;">${escapeHtml(currentWorkspace.name)}</h2>`;
    html += `<p style="font-size:13px;color:rgba(255,255,255,0.55);margin-bottom:14px;">`;
    html += `Sector: <strong>${currentWorkspace.sector}</strong> · Budget: <strong>PKR ${currentWorkspace.budget}M</strong> · Deadline: <strong>${currentWorkspace.deadline}</strong>`;
    html += `</p><hr style="border:0;border-top:1px solid rgba(255,255,255,0.1);margin-bottom:18px;">`;

    validDrafts.forEach((d, idx) => {
        const status  = reviewState[d.req.text]?.approval_status || 'pending';
        const comment = reviewState[d.req.text]?.reviewer_comment || '';
        const colMap  = { approved: 'var(--success)', rejected: 'var(--danger)', pending: 'var(--warning)', edited: 'var(--warning)' };
        const col     = colMap[status] || colMap.pending;

        html += `<div style="margin-bottom:22px;padding:14px;border-radius:8px;background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.06);">`;
        html += `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">`;
        html += `<h4 style="color:var(--accent);font-size:13px;font-weight:600;margin:0;">Section ${idx + 1}: ${escapeHtml(d.req.text)}</h4>`;
        html += `<span style="font-size:11px;font-weight:600;color:${col};background:rgba(0,0,0,0.2);padding:2px 8px;border-radius:10px;white-space:nowrap;margin-left:10px;">${status.toUpperCase()}</span>`;
        html += `</div>`;
        html += `<p style="font-size:13px;line-height:1.65;color:rgba(255,255,255,0.8);white-space:pre-wrap;margin:0 0 ${comment ? '8px' : '0'};">${escapeHtml(d.text)}</p>`;
        if (comment) {
            html += `<div style="font-size:11px;color:rgba(255,255,255,0.4);border-top:1px solid rgba(255,255,255,0.07);padding-top:6px;font-style:italic;">`;
            html += `<i class="ph ph-chat-circle-text"></i> ${escapeHtml(comment)}</div>`;
        }
        html += `</div>`;
    });

    fullProposalPreview.innerHTML = html;
}

function downloadProposalText() {
    if (!currentWorkspace) return;
    const validDrafts = getValidDrafts();
    if (validDrafts.length === 0) { alert('No drafts available.'); return; }

    let text = `========================================================================\n`;
    text += `TECHNICAL PROPOSAL RESPONSE\n`;
    text += `========================================================================\n\n`;
    text += `Project Name:      ${currentWorkspace.name}\n`;
    text += `Industry Sector:   ${currentWorkspace.sector}\n`;
    text += `Estimated Budget:  PKR ${currentWorkspace.budget}M\n`;
    text += `Submission Date:   ${currentWorkspace.deadline}\n`;
    text += `------------------------------------------------------------------------\n\n`;

    validDrafts.forEach((d, idx) => {
        const comment = reviewState[d.req.text]?.reviewer_comment;
        text += `SECTION ${idx + 1}: ${d.req.text}\n`;
        text += `------------------------------------------------------------------------\n`;
        text += `${d.text}\n`;
        if (comment) text += `\n[Reviewer Note]: ${comment}\n`;
        text += `\n\n`;
    });

    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${currentWorkspace.name.replace(/[^a-zA-Z0-9]/g, '_')}_Approved_Proposal.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── Tab switching ────────────────────────────────────────────────────────────
function switchTab(name) {
    const tabs  = { edit: tabBtnEdit, review: tabBtnReview, preview: tabBtnPreview, finance: tabBtnFinance };
    const panes = { edit: paneEdit,   review: paneReview,   preview: panePreview,   finance: paneFinance   };
    Object.keys(tabs).forEach(k => {
        tabs[k].classList.toggle('active', k === name);
        panes[k].style.display = k === name ? 'flex' : 'none';
    });
    if (name === 'review')  renderReviewPane();
    if (name === 'preview') updateFullPreview();
    if (name === 'finance') syncFinanceTab();
}

tabBtnEdit.onclick    = () => switchTab('edit');
tabBtnReview.onclick  = () => switchTab('review');
tabBtnPreview.onclick = () => switchTab('preview');
tabBtnFinance.onclick = () => switchTab('finance');

// ── Financial Analysis ───────────────────────────────────────────────────────
function syncFinanceTab() {
    if (!currentWorkspace) return;
    const cached = currentWorkspace.financial_analysis;
    if (cached) {
        financeEmpty.style.display = 'none';
        financeReport.style.display = 'flex';
        renderFinanceReport(cached);
    } else {
        financeEmpty.style.display  = 'flex';
        financeReport.style.display = 'none';
        financeReport.innerHTML     = '';
    }
}

async function runFinancialAnalysis() {
    if (!currentWorkspace) return;
    btnRunFinance.disabled = true;
    btnRunFinance.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> Analysing financials…';
    financeEmpty.style.display  = 'flex';
    financeReport.style.display = 'none';

    try {
        const res = await fetch(`${API_BASE_URL}/api/workspaces/${currentWorkspace.id}/financial-analysis`, {
            method: 'POST'
        });
        if (!res.ok) { const e = await res.json(); alert(e.detail || 'Financial analysis failed.'); return; }
        const data = await res.json();
        currentWorkspace.financial_analysis = data;
        updateWorkspaceInState(currentWorkspace);

        financeEmpty.style.display  = 'none';
        financeReport.style.display = 'flex';
        renderFinanceReport(data);
    } catch (e) {
        console.error('runFinancialAnalysis', e);
        alert('Financial analysis failed. Check backend connection.');
    } finally {
        btnRunFinance.disabled = false;
        btnRunFinance.innerHTML = '<i class="ph-fill ph-currency-dollar"></i> Regenerate Report';
    }
}

btnRunFinance.onclick = runFinancialAnalysis;

function fmt(n) {
    if (n === undefined || n === null) return 'N/A';
    return '$' + Number(n).toLocaleString();
}
function pct(n) { return (n === undefined || n === null) ? 'N/A' : n + '%'; }
function sev(s) {
    if (s === 'High')   return 'fin-sev-high';
    if (s === 'Medium') return 'fin-sev-med';
    return 'fin-sev-low';
}

function renderFinanceReport(d) {
    financeReport.innerHTML = '';

    const score      = d.profitability_score || 0;
    const label      = d.profitability_label || 'Financially Risky';
    const scoreColor = score >= 70 ? '#10b981' : score >= 50 ? '#6d28d9' : score >= 30 ? '#f59e0b' : '#ef4444';
    const winProb    = currentWorkspace ? (currentWorkspace.win_probability || 0) : 0;
    const wpColor    = winProb >= 60 ? '#10b981' : winProb >= 40 ? '#f59e0b' : '#ef4444';

    const C     = 2 * Math.PI * 70;
    const dash  = (score / 100) * C;
    const gap   = C - dash;
    const CW    = 2 * Math.PI * 52;
    const dashW = (winProb / 100) * CW;
    const gapW  = CW - dashW;

    // ── Derive combined verdict ──────────────────────────────────────────────
    // Four possible combinations of win prob vs profitability:
    //   High win + High profit  → BID NOW (green)
    //   High win + Low profit   → BID WITH CAUTION — renegotiate pricing (amber)
    //   Low win  + High profit  → CONDITIONAL BID — improve competitiveness (amber)
    //   Low win  + Low profit   → DO NOT BID (red)
    const highWin    = winProb >= 60;
    const highProfit = score   >= 50;

    let verdictIcon, verdictText, verdictSub, verdictColor, verdictBg;
    if (highWin && highProfit) {
        verdictIcon  = 'ph-fill ph-rocket-launch';
        verdictText  = 'Bid Now';
        verdictColor = '#10b981';
        verdictBg    = 'rgba(16,185,129,0.1)';
        verdictSub   = `Win probability is ${winProb.toFixed(0)}% and the contract is financially healthy (${score}% profitability). Submit this bid.`;
    } else if (highWin && !highProfit) {
        verdictIcon  = 'ph-fill ph-warning';
        verdictText  = 'Bid — but fix pricing first';
        verdictColor = '#f59e0b';
        verdictBg    = 'rgba(245,158,11,0.1)';
        verdictSub   = `You have a strong ${winProb.toFixed(0)}% chance of winning, but the current cost model shows only ${score}% profitability. Renegotiate rates or reduce scope before submitting — winning at a loss is worse than not bidding.`;
    } else if (!highWin && highProfit) {
        verdictIcon  = 'ph-fill ph-arrow-circle-up';
        verdictText  = 'Improve competitiveness first';
        verdictColor = '#f59e0b';
        verdictBg    = 'rgba(245,158,11,0.1)';
        verdictSub   = `The contract is profitable (${score}% score) but win probability is only ${winProb.toFixed(0)}%. Address capability gaps, improve compliance rate, and strengthen the technical proposal before submitting.`;
    } else {
        verdictIcon  = 'ph-fill ph-x-circle';
        verdictText  = 'Do Not Bid';
        verdictColor = '#ef4444';
        verdictBg    = 'rgba(239,68,68,0.1)';
        verdictSub   = `Both win probability (${winProb.toFixed(0)}%) and profitability (${score}%) are below threshold. Bidding risks wasting preparation effort and winning a loss-making contract. Resolve capability gaps and reassess.`;
    }

    financeReport.innerHTML += `
    <div class="fin-donut-wrap">
        <svg viewBox="0 0 180 180" width="180" height="180" style="flex-shrink:0">
            <circle cx="90" cy="90" r="70" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="14"/>
            <circle cx="90" cy="90" r="52" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="10"/>
            <circle cx="90" cy="90" r="70" fill="none"
                stroke="${scoreColor}" stroke-width="14"
                stroke-dasharray="${dash.toFixed(1)} ${gap.toFixed(1)}"
                stroke-dashoffset="${(C * 0.25).toFixed(1)}"
                stroke-linecap="round" transform="rotate(-90 90 90)"/>
            <circle cx="90" cy="90" r="52" fill="none"
                stroke="${wpColor}" stroke-width="10"
                stroke-dasharray="${dashW.toFixed(1)} ${gapW.toFixed(1)}"
                stroke-dashoffset="${(CW * 0.25).toFixed(1)}"
                stroke-linecap="round" transform="rotate(-90 90 90)"/>
            <text x="90" y="84" text-anchor="middle" font-size="26" font-weight="700"
                fill="${scoreColor}" font-family="Inter,sans-serif">${score}%</text>
            <text x="90" y="100" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.45)"
                font-family="Inter,sans-serif">PROFIT SCORE</text>
            <text x="90" y="115" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.3)"
                font-family="Inter,sans-serif">WIN ${winProb.toFixed(0)}%</text>
        </svg>

        <div class="fin-right-col">

            <!-- Two score pills -->
            <div class="fin-score-pills">
                <div class="fin-score-pill">
                    <div class="fin-pill-dot" style="background:${scoreColor}"></div>
                    <div class="fin-pill-body">
                        <span class="fin-pill-num" style="color:${scoreColor}">${score}%</span>
                        <span class="fin-pill-lbl">Profitability — ${label}</span>
                    </div>
                </div>
                <div class="fin-score-pill">
                    <div class="fin-pill-dot" style="background:${wpColor}"></div>
                    <div class="fin-pill-body">
                        <span class="fin-pill-num" style="color:${wpColor}">${winProb.toFixed(1)}%</span>
                        <span class="fin-pill-lbl">Win Probability — ${winProb >= 60 ? 'GO' : 'NO-GO'}</span>
                    </div>
                </div>
            </div>

            <button class="fin-regen-btn" onclick="runFinancialAnalysis()">
                <i class="ph ph-arrow-clockwise"></i> Regenerate
            </button>
        </div>
    </div>`;

    const gaps = (d.missing_features_impact || []);
    if (!gaps.length) {
        financeReport.innerHTML += `
        <div class="fin-no-gaps">
            <i class="ph-fill ph-check-circle" style="color:#10b981;font-size:1.4rem"></i>
            No capability gaps detected. All requirements are matched.
        </div>`;
        return;
    }

    const maxLoss = Math.max(...gaps.map(g => g.monetary_loss_usd || 0), 1);
    const totalLoss = gaps.reduce((s, g) => s + (g.monetary_loss_usd || 0), 0);

    const barCards = gaps.map((g, i) => {
        const isPending  = g.business_impact && g.business_impact.includes('Not yet analysed');
        const barColor   = isPending ? '#f59e0b' : '#ef4444';
        const tagCls     = isPending ? 'fin-chart-tag-pending' : 'fin-chart-tag-gap';
        const tagLabel   = isPending ? 'Pending' : 'Confirmed Gap';
        const pct_w      = Math.max(3, Math.round((g.monetary_loss_usd / maxLoss) * 100));
        const pct_total  = totalLoss > 0 ? Math.round((g.monetary_loss_usd / totalLoss) * 100) : 0;
        // rank: wider = bigger loss
        const rankLabel  = i === 0 ? 'Largest loss' : i === 1 ? '2nd largest' : '';
        return `
        <div class="fgc-card">
            <div class="fgc-top">
                <span class="fin-chart-tag ${tagCls}">${tagLabel}</span>
                <span class="fgc-req-text">${escapeHtml(g.feature)}</span>
            </div>
            <div class="fgc-bar-row">
                <div class="fgc-track">
                    <div class="fgc-fill" style="width:${pct_w}%;background:${barColor};"></div>
                    <span class="fgc-pct-label" style="color:#ffffff">${pct_total}% of total</span>
                </div>
                <div class="fgc-amount" style="color:${barColor}">
                    ${fmtK(g.monetary_loss_usd)}
                    <span class="fgc-sub">${isPending ? 'at-risk' : 'loss'}</span>
                </div>
            </div>
            ${rankLabel ? `<div class="fgc-rank">${rankLabel}</div>` : ''}
        </div>`;
    }).join('');

    financeReport.innerHTML += `
    <div class="fin-chart-section">
        <div class="fin-chart-title">
            <i class="ph-fill ph-warning-circle" style="color:#ef4444"></i>
            Per-gap financial impact
            <span class="fin-chart-total">Total at risk: ${fmtK(totalLoss)}</span>
        </div>
        <div class="fgc-grid">
            ${barCards}
        </div>
        <div class="fin-chart-legend">
            <span><span class="fin-donut-dot" style="background:#ef4444;border-radius:3px;width:10px;height:10px;display:inline-block"></span>&nbsp;Confirmed gap</span>
            <span><span class="fin-donut-dot" style="background:#f59e0b;border-radius:3px;width:10px;height:10px;display:inline-block"></span>&nbsp;Pending analysis</span>
        </div>
    </div>`;
}

function fmtK(n) {
    if (!n && n !== 0) return 'N/A';
    if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return '$' + Math.round(n);
}

// ── Trash rendering ──────────────────────────────────────────────────────────
function renderTrash(trash) {
    trashListEl.innerHTML = '';
    if (trash.length === 0) {
        trashListEl.innerHTML = '<div class="empty-state" style="padding:20px 0;">No items in the Recycle Bin.</div>';
        return;
    }
    trash.forEach(ws => {
        const li = document.createElement('li');
        li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);';
        li.innerHTML = `
            <span style="font-size:14px;font-weight:500;color:#fff;">${ws.name}</span>
            <div>
                <button class="btn-primary" style="padding:4px 8px;font-size:12px;margin-right:8px;" onclick="recoverWorkspace('${ws.id}')">
                    <i class="ph ph-recycle"></i> Restore
                </button>
                <button class="btn-primary" style="padding:4px 8px;font-size:12px;background:rgba(220,53,69,0.3);border-color:rgb(220,53,69);"
                    onclick="if(confirm('Delete forever?')) deletePermanent('${ws.id}')">
                    <i class="ph ph-trash"></i> Delete
                </button>
            </div>`;
        trashListEl.appendChild(li);
    });
}

// ── Modal listeners ──────────────────────────────────────────────────────────
btnNewWs.onclick       = () => modal.classList.add('show');
closeModal.onclick     = closeModalWindow;
closeModalEdit.onclick = closeEditModalWindow;
closeModalTrash.onclick= closeTrashModalWindow;
btnOpenTrash.onclick   = () => { fetchTrash(); trashModal.classList.add('show'); };

window.onclick = e => {
    if (e.target === modal)      closeModalWindow();
    if (e.target === editModal)  closeEditModalWindow();
    if (e.target === trashModal) closeTrashModalWindow();
};

function closeModalWindow()      { modal.classList.remove('show');      formCreateWs.reset(); }
function closeEditModalWindow()  { editModal.classList.remove('show');  formEditWs.reset(); }
function closeTrashModalWindow() { trashModal.classList.remove('show'); }

btnEditWs.onclick = () => {
    if (!currentWorkspace) return;
    document.getElementById('ws-edit-name').value   = currentWorkspace.name;
    document.getElementById('ws-edit-sector').value = currentWorkspace.sector;
    document.getElementById('ws-edit-budget').value = currentWorkspace.budget;
    let d = currentWorkspace.deadline;
    try { const p = new Date(d); if (!isNaN(p)) d = p.toISOString().substring(0, 10); } catch {}
    document.getElementById('ws-edit-deadline').value = d;
    editModal.classList.add('show');
};

// ── Form validation ──────────────────────────────────────────────────────────
function validateWorkspaceForm(data) {
    if (!data.name?.trim())   { alert('Project Name is required.');  return false; }
    if (!data.sector?.trim()) { alert('Sector is required.');         return false; }
    if (isNaN(parseFloat(data.budget)) || parseFloat(data.budget) <= 0) {
        alert('Budget must be a positive number.'); return false;
    }
    if (!data.deadline?.trim()) { alert('Deadline is required.');     return false; }
    const parts = data.deadline.trim().split('-');
    if (parts.length !== 3 || parts.some(isNaN)) { alert('Deadline must be a valid date.'); return false; }
    const [y, m, day] = parts.map(Number);
    if (m < 1 || m > 12)  { alert('Month must be 1-12.'); return false; }
    if (day < 1 || day > 31) { alert('Day must be 1-31.'); return false; }
    if (y < new Date().getFullYear()) { alert(`Year cannot be in the past.`); return false; }
    return true;
}

formCreateWs.onsubmit = e => {
    e.preventDefault();
    const name = document.getElementById('ws-input-name').value.trim();
    if (!name) { alert('Workspace name is required.'); return; }
    createWorkspace({ name });
};

formEditWs.onsubmit = e => {
    e.preventDefault();
    const data = { name: document.getElementById('ws-edit-name').value, sector: document.getElementById('ws-edit-sector').value, budget: document.getElementById('ws-edit-budget').value, deadline: document.getElementById('ws-edit-deadline').value };
    if (validateWorkspaceForm(data)) updateWorkspaceInfo(currentWorkspace.id, data);
};

// ── Action listeners ─────────────────────────────────────────────────────────
btnDeleteWs.onclick = () => {
    if (currentWorkspace && confirm(`Move "${currentWorkspace.name}" to Recycle Bin?`)) deleteWorkspace(currentWorkspace.id);
};
btnAnalyze.onclick          = runAnalysis;

// Remove-file button: clears the preview and re-shows the drop zone
fpRemoveBtn.onclick = () => {
    resetUploadArea();
};
btnSaveDraft.onclick        = saveDraft;
btnDownloadProposal.onclick = downloadProposalText;

// ── Drag & drop ──────────────────────────────────────────────────────────────
['dragenter','dragover','dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }));
['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.add('dragover')));
['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover')));
dropZone.addEventListener('drop', e => { const files = e.dataTransfer.files; if (files.length) handleFiles(files); });
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', function() { if (this.files.length) handleFiles(this.files); });

function handleFiles(files) {
    const file = files[0];
    if (file.type === 'application/pdf' || file.name.endsWith('.docx')) uploadFile(file);
    else showUploadToast('error', 'Invalid file type. Only PDF and DOCX are supported.');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/\n/g, ' ');
}