# AI-Powered Bid & Proposal Response Engine

Built for CUST Hackathon 2026. An AI-assisted tool that helps automate RFP/tender analysis for bid management — checking compliance, scoring win probability, and generating proposal drafts.

## Features
- Upload and parse RFP/tender documents (PDF)
- Automated compliance checking against requirements
- Win-probability scoring based on historical bid data
- Capability matching: finds relevant past project experience for each tender requirement
- AI-generated proposal draft content
- GO / NO-GO recommendation for each bid

## Tech Stack
- Backend: Python, FastAPI
- Machine Learning: scikit-learn (Random Forest Classifier for bid scoring)
- Retrieval: TF-IDF vectorization + cosine similarity (capability-matching engine)
- Document Parsing: pypdf
- AI Generation: Google Gemini API
- Data: openpyxl (reads historical bid data and capability library from Excel)

## How It Works
1. A tender/RFP document is uploaded and parsed for requirements
2. Each requirement is matched against a capability library using TF-IDF similarity to find supporting evidence
3. A Random Forest model, trained on historical bid data, scores the likelihood of winning the bid
4. The Gemini API generates draft proposal content based on the matched capabilities
5. The system outputs a compliance report and a GO/NO-GO recommendation

## Team
- Tooba Fatima — Backend development (API, ML scoring model, RAG engine)
- Rabia Irfan — Frontend development

## Getting Started

### Backend
1. Clone the repo
   git clone https://github.com/user290804/ai-bid-proposal-engine.git

2. Install dependencies
   pip install -r requirements.txt

3. Create a file named run.bat in the project folder with the following content:
   set GEMINI_API_KEY=your_api_key_here
   python -m uvicorn backend.main:app --reload

   (replace your_api_key_here with your own Gemini API key)

4. Double-click run.bat to start the backend server

### Frontend
1. Open the frontend folder
2. Install dependencies
   npm install
3. Start the dev server
   npm run dev
4. Open the local host link shown in the terminal (usually http://localhost:5173 or similar) in your browser

## Note
This was built for a 24-48 hour hackathon, so the dataset path and some configuration are set up for local demo purposes rather than production deployment.
