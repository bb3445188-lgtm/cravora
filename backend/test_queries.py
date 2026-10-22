from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

queries = [
    ("What is the cheapest pizza available?", lambda d: "Margherita" in d["reply"] or "1,290" in d["reply"]),
    ("I want something spicy without beef", lambda d: "beef" not in d["reply"].lower() and len(d["recommended_products"]) > 0),
    ("Suggest a meal for two under Rs. 2,000", lambda d: d["proposed_cart"] is not None and d["proposed_cart"]["subtotal"] <= 2000),
    ("How much will delivery cost?", lambda d: "delivery fee" in d["reply"].lower()),
    ("Show me vegetarian options", lambda d: any("Margherita" in p["name"] for p in d["recommended_products"])),
    ("Make that one a large", lambda d: "Large 13" in d["reply"]),
    ("Add 2 burgers and fries to my cart", lambda d: len(d["agent_actions"]) > 0),
]

all_passed = True
for q, validator in queries:
    r = client.post("/api/ai/chat", json={"message": q, "history": []})
    assert r.status_code == 200, f"Query '{q}' failed with {r.status_code}"
    data = r.json()
    passed = validator(data)
    print(f"[{'PASS' if passed else 'FAIL'}] '{q}' -> Reply: {data['reply'][:90]}...")
    if not passed:
        all_passed = False

if all_passed:
    print("\nALL 7 CONVERSATIONAL TEST QUERIES PASSED PERFECTLY!")
else:
    print("\nSOME QUERIES FAILED VALIDATION")
