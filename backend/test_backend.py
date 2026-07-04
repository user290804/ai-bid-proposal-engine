import os
import sys

# Ensure backend directory is in the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.scoring import BidScoringModel
from backend.rag_engine import CapabilityRAG

DATASET_PATH = r"c:\Users\Moham\OneDrive\Desktop\Hackathon\Problem#1_Sample_Datasets (TEKROWE).xlsx"

def run_tests():
    print("=== STARTING BACKEND AUTOMATED VALIDATION SUITE ===")
    
    # 1. Dataset verification
    if not os.path.exists(DATASET_PATH):
        print(f"FAILED: Excel dataset file not found at {DATASET_PATH}")
        sys.exit(1)
    print("SUCCESS: Excel dataset file path exists and is readable.")

    # 2. Train Win Probability Model
    print("\n--- TEST 1: Training Win Probability Scoring Model ---")
    try:
        model = BidScoringModel(DATASET_PATH)
        if model.pipeline is None:
            raise ValueError("Model pipeline was not created.")
        print("SUCCESS: Win probability model trained successfully.")
    except Exception as e:
        print(f"FAILED: Win probability model training failed: {e}")
        sys.exit(1)

    # 3. Model Scoring predictions check
    print("\n--- TEST 2: Scoring Model Prediction Logic Check ---")
    try:
        # High quality bid
        high_prob = model.predict_win_probability(
            sector="Telecom",
            budget_m=20.0,
            compliance_pct=95.0,
            gaps_found=0,
            doc_pages=120,
            response_time_hrs=100.0
        )
        print(f"High-compliance bid probability: {high_prob}%")

        # Low quality bid
        low_prob = model.predict_win_probability(
            sector="Finance",
            budget_m=120.0,
            compliance_pct=15.0,
            gaps_found=6,
            doc_pages=280,
            response_time_hrs=10.0
        )
        print(f"Low-compliance bid probability: {low_prob}%")

        if high_prob < 15.0 or low_prob > 85.0:
            print("FAILED: Scoring model did not partition outcomes logically.")
            sys.exit(1)
        print("SUCCESS: Scoring model demonstrates logical prediction behavior.")
    except Exception as e:
        print(f"FAILED: Scoring prediction test failed: {e}")
        sys.exit(1)

    # 4. RAG Capability Loading
    print("\n--- TEST 3: Loading Capability RAG Engine ---")
    try:
        rag = CapabilityRAG(DATASET_PATH)
        if not rag.capabilities:
            raise ValueError("RAG capability library loaded 0 records.")
        print(f"SUCCESS: RAG capability library loaded {len(rag.capabilities)} records successfully.")
    except Exception as e:
        print(f"FAILED: RAG Capability loading failed: {e}")
        sys.exit(1)

    # 5. RAG Semantic matching and rule checks
    print("\n--- TEST 4: RAG Semantic Matching & Certificate Check ---")
    try:
        # Check standard semantic retrieval (Cybersecurity)
        query_cyber = "Setup network security protocols and firewalls for local office."
        match_cyber = rag.match_requirement(query_cyber)
        print(f"Query: '{query_cyber}'")
        print(f"Match Status: {match_cyber['status']}")
        if match_cyber['status'] == 'Pass':
            print(f"Matched Domain: {match_cyber['evidence']['domain']}")
            print(f"Matched Summary: {match_cyber['evidence']['summary']}")
        else:
            print(f"Gap Reason: {match_cyber.get('reason')}")
            sys.exit(1)

        # Check certification forcing rule (ISO 27001)
        query_cert = "Must possess ISO 27001 certification."
        match_cert = rag.match_requirement(query_cert)
        print(f"\nQuery: '{query_cert}'")
        print(f"Match Status: {match_cert['status']}")
        if match_cert['status'] == 'Pass':
            print(f"Matched Certification: {match_cert['evidence']['certification']}")
            if "ISO 27001" not in match_cert['evidence']['certification']:
                print("FAILED: ISO 27001 requirement did not enforce certification match.")
                sys.exit(1)
        else:
            print(f"Gap Reason: {match_cert.get('reason')}")
            sys.exit(1)
            
        print("SUCCESS: RAG semantic matching and certification filters are functional.")
    except Exception as e:
        print(f"FAILED: RAG query test failed: {e}")
        sys.exit(1)

    print("\n=== ALL AUTOMATED VALIDATION TESTS PASSED SUCCESSFULLY ===")
    sys.exit(0)

if __name__ == "__main__":
    run_tests()
