import os
import re
import json
import uuid
import shutil
import warnings
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pypdf

# Suppress future warnings from library migrations to keep console output clean
warnings.filterwarnings("ignore", category=FutureWarning)
import google.generativeai as genai

from backend.scoring import BidScoringModel
from backend.rag_engine import CapabilityRAG

app = FastAPI(title="AI-Powered Bid & Proposal Response Engine", version="1.0.0")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(BASE_DIR, "..", "Problem#1_Sample_Datasets (TEKROWE).xlsx")
WORKSPACES_FILE = os.path.join(BASE_DIR, "workspaces.json")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Initialize models
scoring_model = None
rag_engine = None

@app.on_event("startup")
def startup_event():
    global scoring_model, rag_engine
    try:
        scoring_model = BidScoringModel(DATASET_PATH)
        rag_engine = CapabilityRAG(DATASET_PATH)
        initialize_workspaces()
    except Exception as e:
        print(f"Error during startup model loading: {e}")

# Configure Gemini API
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    print("Gemini API configured successfully.")
else:
    print("Gemini API key not found. Backend will run in offline simulation mode.")

# Workspaces Helper Functions
def load_workspaces():
    if not os.path.exists(WORKSPACES_FILE):
        return {}
    try:
        with open(WORKSPACES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}

def save_workspaces(data):
    try:
        with open(WORKSPACES_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving workspaces: {e}")

def initialize_workspaces():
    # Pre-populate workspaces if file does not exist or is empty
    workspaces = load_workspaces()
    if not workspaces:
        default_id = "sample-workspace-1"
        workspaces[default_id] = {
            "id": default_id,
            "name": "Sample Telecom Network Expansion",
            "sector": "Telecom",
            "budget": 15.0,
            "deadline": "2026-08-15",
            "compliance_pct": 80.0,
            "win_probability": 74.5,
            "status": "GO",
            "manual_hours_saved": 16.0,
            "requirements": [
                {"text": "Must deploy local network nodes in northern areas.", "status": "Pass", "matched_cap": "CAP-045", "score": 0.72},
                {"text": "Requires ISO 9001 quality management certification.", "status": "Pass", "matched_cap": "CAP-008", "score": 0.90},
                {"text": "Network design must utilize fiber optic routing.", "status": "Pass", "matched_cap": "CAP-032", "score": 0.65},
                {"text": "Must support 5G wireless broadband expansion.", "status": "Pass", "matched_cap": "CAP-021", "score": 0.58},
                {"text": "Requires ISO 27001 information security certification.", "status": "Fail", "matched_cap": None, "score": 0.0}
            ],
            "drafts": {
                "Must deploy local network nodes in northern areas.": "In response to the requirement, our company possesses extensive experience in the Telecom domain, highlighted by our project CAP-045 (Deploying 100+ network nodes). We have successfully completed similar installations in challenging terrains, ensuring high availability.",
                "Requires ISO 9001 quality management certification.": "We are proud to state that our quality processes are certified under the ISO 9001 standard. All project management deliverables conform to these strict international benchmarks.",
                "Network design must utilize fiber optic routing.": "Our engineering division maintains seasoned fiber routing professionals, who successfully deployed fiber-optic ring architectures for provincial telecom clients.",
                "Must support 5G wireless broadband expansion.": "We propose our 5G Core deployment package, previously tested and approved in federal telecom trials.",
                "Requires ISO 27001 information security certification.": "WARNING: Our organization currently lacks the ISO 27001 certificate. We plan to address this gap through a subcontractor collaboration."
            }
        }
        save_workspaces(workspaces)

import zipfile
import xml.etree.ElementTree as ET

# Parsing Helpers
def extract_pdf_text(file_path: str) -> str:
    text = ""
    try:
        reader = pypdf.PdfReader(file_path)
        total_pages = len(reader.pages)
        
        # If it's a small document (10 pages or less), extract all pages directly
        if total_pages <= 10:
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    text += t + "\n"
            return text

        # Otherwise, perform smart page filtering for large documents (like 500+ pages)
        pages_retained = 0
        for idx, page in enumerate(reader.pages):
            t = page.extract_text()
            if not t:
                continue
            
            t_lower = t.lower()
            # Always include the first few pages (table of contents, introduction) to preserve context
            is_intro = idx < 3 and any(kw in t_lower for kw in ["contents", "index", "agenda", "introduction", "table"])
            # Check for requirement indicators
            has_requirements = any(kw in t_lower for kw in ["must ", "shall ", "requires", "required to", "certification", "mandatory"])
            
            if is_intro or has_requirements:
                text += f"\n--- PAGE {idx + 1} ---\n" + t + "\n"
                pages_retained += 1

        print(f"Smart PDF Filter: Retained {pages_retained} out of {total_pages} pages.")
    except Exception as e:
        print(f"Error extracting PDF text: {e}")
    return text

def extract_docx_text(file_path: str) -> str:
    text = ""
    try:
        with zipfile.ZipFile(file_path) as z:
            xml_content = z.read('word/document.xml')
            root = ET.fromstring(xml_content)
            namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            for p in root.findall('.//w:p', namespaces):
                p_text = ""
                for t in p.findall('.//w:t', namespaces):
                    if t.text:
                        p_text += t.text
                if p_text:
                    text += p_text + "\n"
    except Exception as e:
        print(f"Error extracting DOCX text: {e}")
    return text

def parse_rfp_offline(text: str):
    # Rule-based regex extraction as fallback
    # Normalize spacing to reconstruct sentences across line breaks
    cleaned_text = re.sub(r'\s+', ' ', text)
    sentences = re.split(r'(?<=[.!?])\s+', cleaned_text)
    
    requirements = []
    deadline = "2026-12-31"
    budget = 10.0
    sector = "IT Services"

    # Identify sector based on keywords
    text_upper = text.upper()
    sectors_map = {
        "CONSTRUCTION": ["CONSTRUCT", "BUILD", "ROAD", "BRIDGE", "INFRASTRUCTURE"],
        "ENERGY": ["ENERGY", "SOLAR", "POWER", "ELECTRIC", "GRID"],
        "TELECOM": ["TELECOM", "5G", "WIRELESS", "FIBER", "NETWORK"],
        "HEALTHCARE": ["HEALTH", "MEDICAL", "CLINIC", "HOSPITAL"],
        "EDUCATION": ["EDUCATION", "LEARN", "SCHOOL", "UNIVERSITY", "LMS"],
        "FINANCE": ["FINANCE", "BANK", "PAYMENT", "TRANSACTION"],
        "LOGISTICS": ["LOGISTICS", "FLEET", "SHIPPING", "TRANSPORT", "DELIVERY"],
        "IT SERVICES": ["SOFTWARE", "CLOUD", "CYBER", "DATABASE", "SYSTEM", "IT"]
    }

    found_sector = False
    for sec, keywords in sectors_map.items():
        for kw in keywords:
            if kw in text_upper:
                sector = sec
                found_sector = True
                break
        if found_sector:
            break

    seen_reqs = set()
    for sentence in sentences:
        sentence_strip = sentence.strip()
        # Keep sentence length reasonable (minimum 25 characters)
        if len(sentence_strip) < 25:
            continue
        
        # Check standard requirement indicators (case-insensitive check)
        lower_sentence = sentence_strip.lower()
        if any(kw in lower_sentence for kw in ["must ", "shall ", "required to", "certification", "requires"]):
            # Clean bullet numbers or list items from start of sentence
            clean_req = re.sub(r'^\s*[\d\.\-\•\*]+\s*', '', sentence_strip)
            # Ensure it ends with proper punctuation
            if not clean_req.endswith(('.', '!', '?')):
                clean_req += '.'
            if clean_req not in seen_reqs:
                requirements.append(clean_req)
                seen_reqs.add(clean_req)
                if len(requirements) >= 10:  # Allow up to 10 requirements
                    break

    # If no requirements found, return empty (validation handled by endpoint)
    if not requirements:
        requirements = []

    # Extract deadline
    deadline_match = re.search(r"(?:deadline|due date|submission)\s*(?:is|on|by)?\s*([A-Za-z]+ \d+, \d{4}|\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})", text, re.IGNORECASE)
    if deadline_match:
        deadline = deadline_match.group(1)

    # Extract budget
    budget_match = re.search(r"(?:budget|value|value of|limit)\s*(?:is|around|of)?\s*(?:PKR)?\s*(\d+(?:\.\d+)?)\s*(M|Million)", text, re.IGNORECASE)
    if budget_match:
        budget = float(budget_match.group(1))

    return {
        "deadline": str(deadline),
        "budget": float(budget),
        "sector": sector.title(),
        "requirements": requirements
    }

def parse_rfp_gemini(text: str):
    if not GEMINI_API_KEY:
        return None
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = f"""
You are an AI bid manager. Analyze the following RFP/Tender document text and extract:
1. Submission deadline (format: YYYY-MM-DD or readable text).
2. Estimated budget/contract limit (express as a simple float number representing PKR Millions, e.g. 15.5 for PKR 15.5M. If budget is not found, estimate a reasonable default).
3. Primary Industry Sector (Must be exactly one of: Construction, IT Services, Energy, Healthcare, Education, Telecom, Finance, Logistics).
4. A list of 5 to 10 specific, critical technical, operational, or compliance requirements. 
   - You must scan the entire document content. Important requirements may be buried deep inside the text.
   - Each requirement in the list must be returned as a complete, fully formed sentence (do not cut sentences in half).
   - If the document is not an RFP, Tender, or business bidding document (e.g. if it is a poem, story, or random text), return an empty list.

Format your output strictly as a JSON object (do not include backticks or code blocks in your response, just the raw JSON text):
{{
  "deadline": "string",
  "budget": float,
  "sector": "string",
  "requirements": ["string", "string", ...]
}}

RFP Text content:
{text[:400000]}
"""
        response = model.generate_content(prompt)
        text_resp = response.text.strip()
        # Clean markdown code blocks if the model returned them
        text_resp = re.sub(r"^```(?:json)?", "", text_resp)
        text_resp = re.sub(r"```$", "", text_resp).strip()
        
        return json.loads(text_resp)
    except Exception as e:
        print(f"Gemini parsing error: {e}")
        return None

# Local drafting template (Simplified & Professional)
def generate_local_draft(req_text: str, match_result) -> str:
    if match_result["status"] == "Fail":
        reason = match_result.get("reason", "no matching capability meets requirements")
        return f"WARNING [CAPABILITY GAP]: We currently lack documented project evidence for the requirement '{req_text}'. {reason.capitalize()}. We are actively looking to partner with certified subcontractors to cover this requirements gap."
    
    evidence = match_result["evidence"]
    cap_id = evidence.get("cap_id", "")
    domain = evidence.get("domain", "")
    summary = evidence.get("summary", "")
    cert = evidence.get("certification", "")
    year = evidence.get("year_completed", "")
    val = evidence.get("contract_value", "")
    client = evidence.get("client_type", "")
    
    cert_text = f" (which is backed by our {cert} certification)" if cert and cert != "N/A" else ""

    draft = (
        f"Regarding the requirement for '{req_text}', we will apply our successful experience from project "
        f"{cap_id} in the '{domain}' domain. For that project, we delivered: '{summary}'. "
        f"This was completed in {year} for an {client} client with a contract value of {val}{cert_text}. "
        f"We will bring this same reliable approach and expertise to ensure your project succeeds."
    )
    return draft

def generate_gemini_draft(req_text: str, match_result) -> Optional[str]:
    if not GEMINI_API_KEY:
        return None
    try:
        if match_result["status"] == "Fail":
            return f"WARNING: We currently do not have matching project experience or certifications in our capability database to support the requirement: '{req_text}'."

        evidence = match_result["evidence"]
        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = f"""
You are an expert bid proposal writer. Write a clear, professional, and easy-to-understand proposal response for this requirement:
Requirement: "{req_text}"

Use our past project experience as evidence:
- Project ID: {evidence.get('cap_id')}
- Domain: {evidence.get('domain')}
- Summary: {evidence.get('summary')}
- Certification: {evidence.get('certification')}
- Year Completed: {evidence.get('year_completed')}
- Contract Value: {evidence.get('contract_value')}
- Client Type: {evidence.get('client_type')}

Write in the first-person plural ("We", "Our company") and limit it to 1-2 paragraphs. Keep the language professional but simple and easy to read. Avoid overly complex jargon and map our project summary directly to show we have done this successfully before. Do not make up any other project details.
"""
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Gemini drafting error: {e}")
        return None


def update_win_probability_and_decision(workspace):
    if not workspace.get("requirements"):
        return
    
    requirements = workspace["requirements"]
    passed_count = len([r for r in requirements if r.get("status") == "Pass"])
    failed_count = len([r for r in requirements if r.get("status") == "Fail"])
    total_count  = len(requirements)
    
    compliance_pct = round((passed_count / total_count) * 100.0, 2) if total_count > 0 else 0.0
    # Only confirmed Fail = real gaps. Pending items are not yet matched — treating
    # them as gaps would double-penalise an un-analysed workspace.
    gaps_count = failed_count
    
    response_time = round(workspace.get("manual_hours_saved", 5.0) * 1.5, 1)
    doc_pages = int(workspace.get("manual_hours_saved", 4.0) * 2)
    
    win_prob = scoring_model.predict_win_probability(
        sector=workspace["sector"],
        budget_m=workspace["budget"],
        compliance_pct=compliance_pct,
        gaps_found=gaps_count,
        doc_pages=doc_pages,
        response_time_hrs=response_time
    )
    
    workspace["compliance_pct"] = compliance_pct
    workspace["win_probability"] = win_prob
    workspace["status"] = "GO" if win_prob >= 60.0 else "NO-GO"


def validate_workspace_data(name: str, sector: str, budget: float, deadline: str):
    import datetime
    
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Project Name is required.")
    if not sector or not sector.strip():
        raise HTTPException(status_code=400, detail="Sector is required.")
    if budget <= 0:
        raise HTTPException(status_code=400, detail="Budget must be a positive number.")
    if not deadline or not deadline.strip():
        raise HTTPException(status_code=400, detail="Deadline is required.")
        
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", deadline.strip())
    if not match:
        raise HTTPException(status_code=400, detail="Deadline must be in YYYY-MM-DD format.")
        
    year_val = int(match.group(1))
    month_val = int(match.group(2))
    day_val = int(match.group(3))
    
    current_year = datetime.date.today().year
    
    if month_val < 1 or month_val > 12:
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12.")
    if day_val < 1 or day_val > 31:
        raise HTTPException(status_code=400, detail="Day must be between 1 and 31.")
    if year_val < current_year:
        raise HTTPException(status_code=400, detail=f"Year cannot be in the past. Must be {current_year} or later.")


# FastAPI Endpoints

@app.get("/api/workspaces")
def get_workspaces_list():
    workspaces = load_workspaces()
    return [ws for ws in workspaces.values() if not ws.get("is_deleted", False)]

@app.get("/api/workspaces/trash")
def get_trash_list():
    workspaces = load_workspaces()
    return [ws for ws in workspaces.values() if ws.get("is_deleted", True) is True]

@app.post("/api/workspaces")
def create_workspace(
    name: str = Form(...),
    sector: str = Form("General"),
    budget: float = Form(0.0),
    deadline: str = Form("")
):
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Workspace name is required.")

    import datetime
    default_deadline = deadline.strip() if deadline.strip() else str(datetime.date.today().replace(year=datetime.date.today().year + 1))

    workspaces = load_workspaces()
    workspace_id = str(uuid.uuid4())

    workspaces[workspace_id] = {
        "id": workspace_id,
        "name": name.strip(),
        "sector": sector.strip() or "General",
        "budget": budget,
        "deadline": default_deadline,
        "compliance_pct": 0.0,
        "win_probability": 0.0,
        "status": "NO-GO",
        "manual_hours_saved": 0.0,
        "requirements": [],
        "drafts": {},
        "is_deleted": False
    }

    save_workspaces(workspaces)
    return workspaces[workspace_id]

@app.post("/api/workspaces/{workspace_id}/edit")
def edit_workspace_info(workspace_id: str, name: str = Form(...), sector: str = Form(...), budget: float = Form(...), deadline: str = Form(...)):
    validate_workspace_data(name, sector, budget, deadline)
    workspaces = load_workspaces()
    if workspace_id not in workspaces:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    workspace = workspaces[workspace_id]
    workspace["name"] = name
    workspace["sector"] = sector
    workspace["budget"] = budget
    workspace["deadline"] = deadline
    
    # Re-calculate win probability with new budget/sector if already analyzed
    if workspace.get("requirements") and workspace.get("win_probability", 0.0) > 0.0:
        update_win_probability_and_decision(workspace)

    save_workspaces(workspaces)
    return workspace

@app.delete("/api/workspaces/{workspace_id}")
def delete_workspace(workspace_id: str):
    workspaces = load_workspaces()
    if workspace_id not in workspaces:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    workspaces[workspace_id]["is_deleted"] = True
    save_workspaces(workspaces)
    return {"status": "success", "message": "Workspace moved to trash"}

@app.post("/api/workspaces/{workspace_id}/recover")
def recover_workspace(workspace_id: str):
    workspaces = load_workspaces()
    if workspace_id not in workspaces:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    workspaces[workspace_id]["is_deleted"] = False
    save_workspaces(workspaces)
    return workspaces[workspace_id]

@app.delete("/api/workspaces/{workspace_id}/permanent")
def delete_workspace_permanently(workspace_id: str):
    workspaces = load_workspaces()
    if workspace_id not in workspaces:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    del workspaces[workspace_id]
    save_workspaces(workspaces)
    return {"status": "success", "message": "Workspace permanently deleted"}

@app.post("/api/workspaces/{workspace_id}/upload")
def upload_rfp(workspace_id: str, file: UploadFile = File(...)):
    workspaces = load_workspaces()
    if workspace_id not in workspaces:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Save uploaded file
    file_ext = os.path.splitext(file.filename)[1]
    saved_filename = f"{workspace_id}{file_ext}"
    file_path = os.path.join(UPLOADS_DIR, saved_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Extract text and parse RFP
    text = ""
    if file_ext.lower() == ".pdf":
        text = extract_pdf_text(file_path)
    elif file_ext.lower() == ".docx":
        text = extract_docx_text(file_path)
    else:
        try:
            os.remove(file_path)
        except:
            pass
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload a PDF or DOCX document."
        )

    # Empty document check
    if not text or not text.strip():
        try:
            os.remove(file_path)
        except:
            pass
        raise HTTPException(
            status_code=400,
            detail="The uploaded document is empty or contains no readable text."
        )

    # Parse RFP requirements, sector, budget
    parsed_data = None
    if GEMINI_API_KEY:
        parsed_data = parse_rfp_gemini(text)
    
    if parsed_data is None:
        print("Using offline rule-based parser...")
        parsed_data = parse_rfp_offline(text)

    # Estimate manual effort hours saved: ~0.5 hours per page of document, min 4 hours
    page_count = 10
    try:
        if file_ext.lower() == ".pdf":
            reader = pypdf.PdfReader(file_path)
            page_count = len(reader.pages)
    except:
        pass
    
    hours_saved = max(4.0, round(page_count * 0.5, 1))

    # Update workspace metadata
    workspace = workspaces[workspace_id]
    workspace["sector"] = parsed_data.get("sector", workspace["sector"])
    workspace["budget"] = parsed_data.get("budget", workspace["budget"])
    workspace["deadline"] = parsed_data.get("deadline", workspace["deadline"])
    workspace["manual_hours_saved"] = hours_saved

    extracted_reqs = parsed_data.get("requirements", [])
    if not extracted_reqs:
        try:
            os.remove(file_path)
        except:
            pass
        raise HTTPException(
            status_code=400,
            detail="The uploaded document does not appear to be a valid RFP or Tender. No compliance requirements could be extracted."
        )

    # Format extracted requirements
    reqs_list = []
    for req in extracted_reqs:
        reqs_list.append({
            "text": req,
            "status": "Pending",
            "matched_cap": None,
            "score": 0.0
        })
    workspace["requirements"] = reqs_list
    workspace["drafts"] = {}

    save_workspaces(workspaces)
    return workspace

@app.post("/api/workspaces/{workspace_id}/analyze")
def analyze_workspace(workspace_id: str):
    global scoring_model, rag_engine
    
    # Dynamic recovery check for models (failsafe)
    if scoring_model is None or rag_engine is None:
        try:
            print("Models not loaded. Attempting dynamic reload...")
            scoring_model = BidScoringModel(DATASET_PATH)
            rag_engine = CapabilityRAG(DATASET_PATH)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Backend models are not initialized. Check if the Excel dataset is at {DATASET_PATH}. Error: {str(e)}"
            )

    workspaces = load_workspaces()
    if workspace_id not in workspaces:
        raise HTTPException(status_code=404, detail="Workspace not found")

    workspace = workspaces[workspace_id]
    requirements = workspace.get("requirements", [])
    
    if not requirements:
        raise HTTPException(status_code=400, detail="No requirements found. Please upload an RFP first.")

    # 1. RAG capability matching
    passed_count = 0
    updated_reqs = []
    drafts = {}

    for req in requirements:
        req_text = req["text"]
        match = rag_engine.match_requirement(req_text)
        
        req_status = match["status"]
        matched_cap_id = match["evidence"]["cap_id"] if match["status"] == "Pass" else None
        
        if req_status == "Pass":
            passed_count += 1

        updated_reqs.append({
            "text": req_text,
            "status": req_status,
            "matched_cap": matched_cap_id,
            "score": match["score"],
            "evidence": match.get("evidence")
        })

        # 2. Draft generation
        gemini_draft = generate_gemini_draft(req_text, match)
        if gemini_draft:
            drafts[req_text] = gemini_draft
        else:
            drafts[req_text] = generate_local_draft(req_text, match)

    workspace["requirements"] = updated_reqs
    workspace["drafts"] = drafts
    workspace["draft_reviews"] = {}   # reset reviews on re-analysis
    update_win_probability_and_decision(workspace)

    save_workspaces(workspaces)
    return workspace

@app.post("/api/workspaces/{workspace_id}/edit-draft")
def edit_proposal_draft(workspace_id: str, requirement_text: str = Form(...), draft_content: str = Form(...)):
    workspaces = load_workspaces()
    if workspace_id not in workspaces:
        raise HTTPException(status_code=404, detail="Workspace not found")

    workspace = workspaces[workspace_id]
    if "drafts" not in workspace:
        workspace["drafts"] = {}
        
    workspace["drafts"][requirement_text] = draft_content

    # Mark as human-edited if it was previously in any review state
    if "draft_reviews" not in workspace:
        workspace["draft_reviews"] = {}
    if requirement_text in workspace["draft_reviews"]:
        existing = workspace["draft_reviews"][requirement_text]
        # Reset approval if content was changed after approving
        if existing.get("approval_status") == "approved":
            existing["approval_status"] = "edited"
            existing["edited_after_approval"] = True

    save_workspaces(workspaces)
    return {"status": "success", "message": "Draft section updated"}


@app.post("/api/workspaces/{workspace_id}/review-draft")
def review_draft(
    workspace_id: str,
    requirement_text: str = Form(...),
    approval_status: str = Form(...),   # "approved" | "rejected" | "pending"
    reviewer_comment: str = Form(""),
    draft_content: str = Form(None)     # optional: save edited content at same time
):
    """
    Bid manager reviews a draft section — approves, rejects, or resets to pending.
    Optionally saves updated draft content in the same call.
    """
    if approval_status not in ("approved", "rejected", "pending"):
        raise HTTPException(status_code=400, detail="approval_status must be 'approved', 'rejected', or 'pending'.")

    workspaces = load_workspaces()
    if workspace_id not in workspaces:
        raise HTTPException(status_code=404, detail="Workspace not found")

    workspace = workspaces[workspace_id]

    if "draft_reviews" not in workspace:
        workspace["draft_reviews"] = {}

    # Save updated draft content if provided
    if draft_content is not None:
        if "drafts" not in workspace:
            workspace["drafts"] = {}
        workspace["drafts"][requirement_text] = draft_content

    workspace["draft_reviews"][requirement_text] = {
        "approval_status": approval_status,
        "reviewer_comment": reviewer_comment,
        "edited_after_approval": False
    }

    save_workspaces(workspaces)

    # Return summary counts so the frontend can update progress bar instantly
    reviews = workspace.get("draft_reviews", {})
    drafts = workspace.get("drafts", {})
    total_sections = len([r for r in workspace.get("requirements", [])
                          if drafts.get(r["text"]) and not drafts[r["text"]].startswith("WARNING")])
    approved_count = sum(1 for v in reviews.values() if v.get("approval_status") == "approved")
    rejected_count = sum(1 for v in reviews.values() if v.get("approval_status") == "rejected")

    return {
        "status": "success",
        "approval_status": approval_status,
        "total_sections": total_sections,
        "approved_count": approved_count,
        "rejected_count": rejected_count
    }


@app.get("/api/workspaces/{workspace_id}/review-summary")
def get_review_summary(workspace_id: str):
    """Returns approval status for all draft sections in a workspace."""
    workspaces = load_workspaces()
    if workspace_id not in workspaces:
        raise HTTPException(status_code=404, detail="Workspace not found")
    workspace = workspaces[workspace_id]
    return {
        "draft_reviews": workspace.get("draft_reviews", {}),
        "drafts": workspace.get("drafts", {})
    }




@app.post("/api/workspaces/{workspace_id}/gap-collaboration")
def save_gap_collaboration(
    workspace_id: str,
    requirement_text: str = Form(...),
    company_name: str = Form(...),
    contact_email: str = Form(""),
    capability_covered: str = Form(""),
    notes: str = Form(""),
    collab_id: str = Form("")      # empty = new record, non-empty = update existing
):
    """
    Save or update a collaboration partner record for a capability gap requirement.
    Each failed requirement can have multiple partner records.
    """
    if not company_name.strip():
        raise HTTPException(status_code=400, detail="Company name is required.")

    workspaces = load_workspaces()
    if workspace_id not in workspaces:
        raise HTTPException(status_code=404, detail="Workspace not found")

    workspace = workspaces[workspace_id]
    if "gap_collaborations" not in workspace:
        workspace["gap_collaborations"] = {}

    # Each requirement maps to a list of partner records
    if requirement_text not in workspace["gap_collaborations"]:
        workspace["gap_collaborations"][requirement_text] = []

    partners = workspace["gap_collaborations"][requirement_text]

    if collab_id:
        # Update existing record by id
        for p in partners:
            if p.get("id") == collab_id:
                p["company_name"]      = company_name.strip()
                p["contact_email"]     = contact_email.strip()
                p["capability_covered"]= capability_covered.strip()
                p["notes"]             = notes.strip()
                break
    else:
        # New record
        import uuid as _uuid
        new_record = {
            "id":                str(_uuid.uuid4()),
            "company_name":      company_name.strip(),
            "contact_email":     contact_email.strip(),
            "capability_covered":capability_covered.strip(),
            "notes":             notes.strip()
        }
        partners.append(new_record)

    save_workspaces(workspaces)
    return {
        "status": "success",
        "gap_collaborations": workspace["gap_collaborations"].get(requirement_text, [])
    }


@app.delete("/api/workspaces/{workspace_id}/gap-collaboration")
def delete_gap_collaboration(
    workspace_id: str,
    requirement_text: str = Form(...),
    collab_id: str = Form(...)
):
    """Remove a single collaboration partner record from a gap requirement."""
    workspaces = load_workspaces()
    if workspace_id not in workspaces:
        raise HTTPException(status_code=404, detail="Workspace not found")

    workspace = workspaces[workspace_id]
    partners = workspace.get("gap_collaborations", {}).get(requirement_text, [])
    workspace.setdefault("gap_collaborations", {})[requirement_text] = [
        p for p in partners if p.get("id") != collab_id
    ]
    save_workspaces(workspaces)
    return {"status": "success"}



@app.post("/api/workspaces/{workspace_id}/financial-analysis")
def run_financial_analysis(workspace_id: str):
    """
    Generate a complete financial evaluation report for the workspace using Gemini.
    Falls back to a deterministic local model if no API key is configured.
    """
    workspaces = load_workspaces()
    if workspace_id not in workspaces:
        raise HTTPException(status_code=404, detail="Workspace not found")

    workspace = workspaces[workspace_id]
    requirements = workspace.get("requirements", [])

    if not requirements:
        raise HTTPException(status_code=400, detail="No requirements found. Please upload and analyse an RFP first.")

    passed  = [r for r in requirements if r.get("status") == "Pass"]
    failed  = [r for r in requirements if r.get("status") == "Fail"]
    total   = len(requirements)
    pass_pct = round((len(passed) / total * 100), 1) if total else 0

    # Build context string for Gemini
    req_lines = []
    for r in requirements:
        status = r.get("status", "Pending")
        text   = r.get("text", "")
        cap    = r.get("matched_cap") or "None"
        domain = ""
        if r.get("evidence"):
            domain = r["evidence"].get("domain", "")
        req_lines.append(f"- [{status}] {text} (Capability: {cap}, Domain: {domain})")

    gap_lines = []
    for r in failed:
        reason = r.get("reason", "No matching capability in library")
        collabs = workspace.get("gap_collaborations", {}).get(r["text"], [])
        collab_str = ", ".join([c["company_name"] for c in collabs]) if collabs else "None identified"
        gap_lines.append(f"- GAP: {r['text']} | Reason: {reason} | Collaboration partners: {collab_str}")

    context = f"""
Project Name: {workspace.get('name', 'Unknown')}
Industry Sector: {workspace.get('sector', 'IT Services')}
Budget: PKR {workspace.get('budget', 0)}M
Deadline: {workspace.get('deadline', 'N/A')}
Win Probability: {workspace.get('win_probability', 0)}%
Compliance Rate: {workspace.get('compliance_pct', 0)}%
Total Requirements: {total}
Requirements Passed: {len(passed)}
Requirements Failed (Gaps): {len(failed)}

Requirements Detail:
{chr(10).join(req_lines)}

Capability Gaps:
{chr(10).join(gap_lines) if gap_lines else "None - all requirements matched"}
"""

    if GEMINI_API_KEY:
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            prompt = f"""You are an AI-powered Financial and Business Proposal Analyst.

Analyse the following bid/proposal workspace data and generate a complete financial evaluation report.

WORKSPACE DATA:
{context}

Generate the report in the following exact JSON structure (no markdown, no backticks, raw JSON only):
{{
  "executive_summary": "2-3 sentence overview of financial viability",
  "features_table": [
    {{"feature": "name", "status": "Completed|Missing|Optional", "priority": "High|Medium|Low", "estimated_value_usd": 0, "dev_hours": 0, "complexity": "Low|Medium|High"}}
  ],
  "missing_features_impact": [
    {{"feature": "name", "monetary_loss_usd": 0, "value_reduction_pct": 0, "business_impact": "explanation"}}
  ],
  "cost_breakdown": {{
    "total_dev_cost_usd": 0,
    "infrastructure_cost_usd": 0,
    "integration_cost_usd": 0,
    "testing_qa_cost_usd": 0,
    "project_management_cost_usd": 0,
    "total_cost_usd": 0
  }},
  "revenue_profit": {{
    "total_project_value_usd": 0,
    "expected_revenue_usd": 0,
    "estimated_profit_usd": 0,
    "profit_margin_pct": 0,
    "break_even_months": 0
  }},
  "roi": {{
    "roi_pct": 0,
    "roi_explanation": "explanation",
    "payback_period": "X months"
  }},
  "financial_risks": [
    {{"risk": "name", "severity": "High|Medium|Low", "likelihood": "High|Medium|Low", "financial_impact_usd": 0, "mitigation": "recommendation"}}
  ],
  "profitability_score": 0,
  "profitability_label": "Highly Profitable|Moderately Profitable|Low Profitability|Financially Risky",
  "recommendations": ["recommendation 1", "recommendation 2"],
  "final_statement": "Based on the uploaded proposal, the estimated project value is $X. The current implementation covers Y% of the required functionality. Missing features reduce the project financial value by Z%. The expected profit margin is P%, making the project [label]."
}}

Use realistic software development cost estimates (Pakistan/South Asia market rates):
- Junior developer: $15-25/hr, Senior: $35-50/hr, average blended $25/hr
- Budget given is PKR millions, convert at 1 PKR = 0.0036 USD
- Be specific and realistic in all numbers based on the actual requirements provided."""

            response = model.generate_content(prompt)
            raw = response.text.strip()
            raw = re.sub(r"^```(?:json)?", "", raw)
            raw = re.sub(r"```$", "", raw).strip()
            result = json.loads(raw)
            workspace["financial_analysis"] = result
            save_workspaces(workspaces)
            return result
        except Exception as e:
            print(f"Gemini financial analysis error: {e}")
            # Fall through to local model

    # ── Local deterministic fallback ─────────────────────────────────────────
    # ── Step 1: counts that accurately reflect analysis state ─────────────────
    # "Pending" means the RFP was uploaded but AI analysis hasn't run yet.
    # Treat pending as unresolved for financial purposes — they are neither
    # confirmed matched nor confirmed gaps, so we use a conservative estimate.
    pending = [r for r in requirements if r.get("status") not in ("Pass", "Fail")]

    # Effective compliance: what fraction is actually matched (Pass)
    compliance_pct_real = round((len(passed) / total * 100), 1) if total else 0

    # For financial value attribution: unresolved (pending) requirements carry
    # partial risk — assume 50% chance they will eventually pass, so they
    # contribute 50% of their proportional value to expected revenue.
    pending_contribution = len(pending) * 0.5
    effective_matched    = len(passed) + pending_contribution
    effective_match_pct  = round((effective_matched / total * 100), 1) if total else 0

    # ── Step 2: cost model ────────────────────────────────────────────────────
    budget_usd    = workspace.get("budget", 10) * 1000000 * 0.0036
    blended_rate  = 25.0   # USD/hr (Pakistan/South Asia blended rate)
    hrs_per_req   = 120    # avg engineering hours per requirement
    total_dev_hrs = total * hrs_per_req
    dev_cost      = total_dev_hrs * blended_rate
    infra_cost    = dev_cost * 0.12
    qa_cost       = dev_cost * 0.15
    pm_cost       = dev_cost * 0.10
    total_cost    = dev_cost + infra_cost + qa_cost + pm_cost

    # ── Step 3: revenue model ─────────────────────────────────────────────────
    project_value = budget_usd

    # Expected revenue = full contract value scaled by effective match percentage.
    # If all requirements are pending (not yet analyzed), we cannot claim 100%
    # — we use the conservative 50% pending contribution above.
    # If all requirements passed, expected revenue = full contract value.
    expected_revenue  = project_value * (effective_match_pct / 100)
    profit            = expected_revenue - total_cost
    margin            = round((profit / expected_revenue * 100), 1) if expected_revenue else 0
    roi_pct           = round((profit / total_cost * 100), 1) if total_cost else 0

    # ── Step 4: gap / missing feature impact ─────────────────────────────────
    # Gaps (Fail) are confirmed missing. Pending are at-risk.
    # Financial loss = confirmed gaps + 50% of pending (risk-weighted)
    gap_risk_count   = len(failed) + len(pending) * 0.5
    missing_loss     = round(gap_risk_count / total * project_value, 0) if total else 0
    # missing_pct = % of project value that is at risk or confirmed lost
    missing_pct      = round(gap_risk_count / total * 100, 1) if total else 0
    # confirmed_gap_pct = only the hard failures
    confirmed_gap_pct = round(len(failed) / total * 100, 1) if total else 0

    # ── Step 5: profitability label & score ──────────────────────────────────
    # The profitability score answers: "Is this bid financially healthy?"
    # It is intentionally separate from win_probability (which answers: "Will we win?").
    # They can legitimately diverge — a bid can have high win chance but poor margin
    # (e.g. we are competitive but under-priced), or low win chance but high margin.
    #
    # Score components:
    #   35% — compliance rate      (are we meeting requirements?)
    #   35% — profitability margin (are we making money if we win?)
    #   20% — win probability      (market signal — how likely is a win?)
    #   10% — gap penalty          (confirmed missing capabilities reduce score)
    #
    # Margin is normalised: 0% margin → 0 pts, 50%+ margin → 50 pts (capped)
    # Negative margin is a hard financial risk → contributes 0 pts to score
    # but is called out explicitly in the label logic below.

    win_prob       = workspace.get("win_probability", 0) or 0
    margin_norm    = max(0.0, min(50.0, margin))          # 0–50% margin → 0–50 pts
    margin_scaled  = (margin_norm / 50.0) * 100.0         # scale to 0–100
    gap_penalty    = min(30.0, len(failed) * 5.0)         # 5 pts per confirmed gap, max 30
    compliance_pts = compliance_pct_real                  # already 0–100

    raw_score = (
        compliance_pts  * 0.35 +
        margin_scaled   * 0.35 +
        win_prob        * 0.20 -
        gap_penalty     * 0.10
    )
    pscore = max(0, min(100, round(raw_score)))

    # If margin is negative the project loses money even if won — cap at Low Profitability
    if margin < 0:
        pscore = min(pscore, 35)   # hard ceiling when money-losing

    if pscore >= 70:   plabel = "Highly Profitable"
    elif pscore >= 50: plabel = "Moderately Profitable"
    elif pscore >= 30: plabel = "Low Profitability"
    else:              plabel = "Financially Risky"

    # ── Step 6: feature table — honest status labels ──────────────────────────
    value_per_req = int(project_value / total) if total else 0
    features_table = []
    for r in requirements:
        raw_status = r.get("status", "Pending")
        if raw_status == "Pass":
            feat_status = "Completed"
            priority    = "High"
        elif raw_status == "Fail":
            feat_status = "Missing"
            priority    = "High"
        else:
            # Pending = uploaded but not yet matched against capability library
            feat_status = "Pending Analysis"
            priority    = "Medium"

        features_table.append({
            "feature":             r["text"][:80],
            "status":              feat_status,
            "priority":            priority,
            "estimated_value_usd": value_per_req,
            "dev_hours":           hrs_per_req,
            "complexity":          "Medium"
        })

    # ── Step 7: missing / at-risk impact ─────────────────────────────────────
    missing_impact = []
    # Confirmed gaps first
    for r in failed:
        missing_impact.append({
            "feature":             r["text"][:80],
            "monetary_loss_usd":   value_per_req,
            "value_reduction_pct": round(100 / total, 1) if total else 0,
            "business_impact":     "Confirmed capability gap. Organisation lacks matching evidence. This requirement will be scored zero by the evaluator unless a collaboration partner is engaged."
        })
    # Pending as at-risk
    for r in pending:
        missing_impact.append({
            "feature":             r["text"][:80],
            "monetary_loss_usd":   int(value_per_req * 0.5),
            "value_reduction_pct": round(50 / total, 1) if total else 0,
            "business_impact":     "Not yet analysed — run AI Analysis to match against capability library. Unresolved requirements carry 50% financial risk until matched."
        })

    # ── Step 8: status summary for narrative ─────────────────────────────────
    if compliance_pct_real == 0 and len(pending) == total:
        status_narrative = (
            f"Requirements have been extracted but AI capability matching has not been run yet. "
            f"Run AI Analysis to resolve {total} pending requirement(s). "
            f"Until then, all requirements carry at-risk status."
        )
    elif len(failed) == 0:
        status_narrative = (
            f"All {total} requirements have been matched successfully against the capability library "
            f"({compliance_pct_real}% compliance rate)."
        )
    else:
        status_narrative = (
            f"{len(passed)} of {total} requirements are matched ({compliance_pct_real}% compliance). "
            f"{len(failed)} confirmed gap(s) and {len(pending)} pending requirement(s) reduce expected revenue."
        )

    break_even_months = max(1, int(total_cost / (expected_revenue / 12))) if expected_revenue else 999

    result = {
        "executive_summary": (
            f"The {workspace.get('name')} bid is evaluated against a PKR {workspace.get('budget')}M contract "
            f"(~${int(project_value):,} USD). {status_narrative} "
            f"Estimated development cost is ${int(total_cost):,}. "
            f"Financial viability is assessed as {plabel} with a profitability score of {pscore}/100."
        ),
        "features_table": features_table,
        "missing_features_impact": missing_impact,
        "cost_breakdown": {
            "total_dev_cost_usd":          int(dev_cost),
            "infrastructure_cost_usd":     int(infra_cost),
            "integration_cost_usd":        int(dev_cost * 0.05),
            "testing_qa_cost_usd":         int(qa_cost),
            "project_management_cost_usd": int(pm_cost),
            "total_cost_usd":              int(total_cost)
        },
        "revenue_profit": {
            "total_project_value_usd": int(project_value),
            "expected_revenue_usd":    int(expected_revenue),
            "estimated_profit_usd":    int(profit),
            "profit_margin_pct":       margin,
            "break_even_months":       break_even_months
        },
        "roi": {
            "roi_pct":          roi_pct,
            "roi_explanation":  f"Based on {effective_match_pct}% effective requirement coverage, for every $1 invested in development, the risk-adjusted return is ${round(1 + roi_pct / 100, 2)}.",
            "payback_period":   f"{break_even_months} months"
        },
        "financial_risks": [
            {
                "risk":                 "Unresolved / pending requirements",
                "severity":             "High" if len(pending) > 0 else "Low",
                "likelihood":           "High" if len(pending) > 0 else "Low",
                "financial_impact_usd": int(len(pending) * value_per_req * 0.5),
                "mitigation":           f"Run AI Analysis to resolve {len(pending)} pending requirement(s) against the capability library."
            },
            {
                "risk":                 "Confirmed capability gaps",
                "severity":             "High" if len(failed) > 2 else ("Medium" if len(failed) > 0 else "Low"),
                "likelihood":           "High" if len(failed) > 0 else "Low",
                "financial_impact_usd": int(missing_loss),
                "mitigation":           "Engage collaboration partners for missing certifications and capabilities. Use the Gap Collaboration feature in each failed requirement."
            },
            {
                "risk":                 "Scope creep",
                "severity":             "Medium",
                "likelihood":           "Medium",
                "financial_impact_usd": int(total_cost * 0.2),
                "mitigation":           "Lock requirements at contract signing and use a formal change-order process for any additions."
            },
            {
                "risk":                 "Timeline overrun",
                "severity":             "Medium",
                "likelihood":           "Low",
                "financial_impact_usd": int(total_cost * 0.1),
                "mitigation":           "Build a 15% buffer into all project timeline estimates. Milestone-based invoicing reduces exposure."
            }
        ],
        "profitability_score": pscore,
        "profitability_label": plabel,
        "recommendations": [
            f"Run AI Analysis first to match all {len(pending)} pending requirement(s) — compliance rate is the single biggest driver of win probability and expected revenue." if len(pending) > 0 else "Compliance rate is fully resolved — focus on proposal quality.",
            f"Address {len(failed)} confirmed gap(s) through the Gap Collaboration feature to add subcontractor/partner coverage." if len(failed) > 0 else "No confirmed gaps — maintain existing capability evidence.",
            "Negotiate contract payment milestones tied to deliverable completion to reduce cash-flow risk.",
            f"Win probability is currently {win_prob}% — improving compliance rate and proposal quality are the two levers most correlated with higher win rates.",
            "Use the AI drafting and Review & Approve workflow to reduce proposal preparation time by 50%+ and improve submission quality."
        ],
        "final_statement": (
            f"Based on the uploaded proposal, the estimated project value is ${int(project_value):,}. "
            f"The current implementation covers {compliance_pct_real}% of the required functionality "
            f"({len(passed)} matched, {len(failed)} gaps, {len(pending)} pending analysis). "
            f"Unresolved and missing requirements put {missing_pct}% of the project's financial value at risk. "
            f"The risk-adjusted expected profit margin is {margin}%, making the project {plabel} "
            f"with a profitability score of {pscore}/100."
        )
    }

    workspace["financial_analysis"] = result
    save_workspaces(workspaces)
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)