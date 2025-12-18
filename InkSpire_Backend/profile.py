import json
import os
import time
import re
from typing import Any, List, Literal, Dict

from typing_extensions import TypedDict
from dotenv import load_dotenv

# LangChain / LangGraph imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END
from prompts.class_profile_prompt import get_class_profile_prompt

# ======================================================
# 0. ENVIRONMENT
# ======================================================

load_dotenv()


# ======================================================
# 1. DATA STRUCTURES (HITL)
# ======================================================

class HistoryEntry(TypedDict, total=False):
    ts: float
    action: Literal["init", "approve", "reject", "manual_edit", "llm_refine"]
    prompt: str
    old_text: str
    new_text: str


class ReviewedProfile(TypedDict, total=False):
    id: str
    text: str  # JSON string of the class_profile
    status: Literal["pending", "approved", "rejected"]
    history: List[HistoryEntry]


class WorkflowState(TypedDict, total=False):
    # Input JSON with 4 fields
    class_input: Any

    # LLM output JSON string
    class_profile_json: str

    # HITL review object list
    class_profile_review: List[ReviewedProfile]

    # Optional model config
    model: str
    temperature: float
    max_output_tokens: int


# ======================================================
# 2. UTILS
# ======================================================

def clean_json_output(raw: str) -> str:
    """Strip ```json fences from model output."""
    if raw is None:
        return ""
    raw = raw.strip()
    raw = re.sub(r"^```[a-zA-Z]*\n", "", raw)   # remove leading ```json\n
    raw = re.sub(r"\n```$", "", raw)            # remove trailing ```
    return raw.strip()


# ======================================================
# 3. LLM CREATOR & INVOCATION
# ======================================================

def make_llm(state: WorkflowState) -> ChatGoogleGenerativeAI:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY missing.")

    return ChatGoogleGenerativeAI(
        model=state.get("model", "gemini-2.5-flash"),
        temperature=state.get("temperature", 0.3),
        max_output_tokens=state.get("max_output_tokens"),
        api_key=api_key,
    )


def run_chain(llm, prompt, variables, context):
    chain = prompt | llm | StrOutputParser()

    try:
        result = chain.invoke(variables)
    except Exception as e:
        print(f"\n===== ERROR in {context} node =====")
        print(f"Variables: {variables}")
        print(f"Error: {e}")
        print("===== END ERROR =====")
        raise RuntimeError(f"LLM invocation failed in {context}: {e}")

    if not isinstance(result, str):
        raise TypeError(f"{context}: expected string, got {type(result)}")

    return result

# ======================================================
# 5. NODE 1 — CLASS PROFILE GENERATION
# ======================================================

def node_generate_class_profile(state: WorkflowState) -> dict:
    if "class_input" not in state:
        raise KeyError("Missing 'class_input' in state.")

    llm = make_llm(state)
    prompt = get_class_profile_prompt()

    class_input_str = json.dumps(state["class_input"], ensure_ascii=False, indent=2)

    raw = run_chain(
        llm=llm,
        prompt=prompt,
        variables={"class_input": class_input_str},
        context="node_generate_class_profile",
    )

    cleaned = clean_json_output(raw)

    return {"class_profile_json": cleaned}


# ======================================================
# 6. NODE 2 — INIT PROFILE REVIEW OBJECT (HITL)
# ======================================================

def node_init_profile_review(state: WorkflowState) -> dict:
    if "class_profile_json" not in state:
        raise KeyError("Missing 'class_profile_json'")

    now = time.time()

    reviewed = [
        {
            "id": "profile001",
            "text": state["class_profile_json"],
            "status": "pending",
            "history": [{"ts": now, "action": "init"}],
        }
    ]

    return {"class_profile_review": reviewed}


# ======================================================
# 7. HITL FUNCTIONS
# ======================================================

def _ensure_history(profile: ReviewedProfile):
    if "history" not in profile or profile["history"] is None:
        profile["history"] = []


def approve_profile(profile: ReviewedProfile) -> ReviewedProfile:
    _ensure_history(profile)
    profile["status"] = "approved"
    profile["history"].append({"ts": time.time(), "action": "approve"})
    return profile


def reject_profile(profile: ReviewedProfile) -> ReviewedProfile:
    _ensure_history(profile)
    profile["status"] = "rejected"
    profile["history"].append({"ts": time.time(), "action": "reject"})
    return profile


def manual_edit_profile(profile: ReviewedProfile, new_text: str) -> ReviewedProfile:
    _ensure_history(profile)
    old_text = profile["text"]
    profile["text"] = new_text
    profile["history"].append({
        "ts": time.time(),
        "action": "manual_edit",
        "old_text": old_text,
        "new_text": new_text,
    })
    return profile


def llm_refine_profile(profile, user_prompt, llm):
    _ensure_history(profile)
    old_text = profile["text"]

    refine_prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You refine JSON class profiles while keeping the same schema. "
            "Return UPDATED STRICT JSON only."
        ),
        (
            "human",
            "Current JSON:\n{old_text}\n\n"
            "Teacher instruction:\n{user_prompt}\n\n"
            "Return updated JSON."
        ),
    ])

    raw = run_chain(
        llm=llm,
        prompt=refine_prompt,
        variables={"old_text": old_text, "user_prompt": user_prompt},
        context="llm_refine_profile",
    )

    cleaned = clean_json_output(raw)

    profile["text"] = cleaned
    profile["history"].append({
        "ts": time.time(),
        "action": "llm_refine",
        "prompt": user_prompt,
        "old_text": old_text,
        "new_text": cleaned,
    })

    return profile


# ======================================================
# 8. EXPORT APPROVED PROFILE
# ======================================================

def export_approved_profile(review_list: List[ReviewedProfile]) -> dict:
    approved = [p for p in review_list if p["status"] == "approved"]
    if not approved:
        return {"class_profile": None}

    cleaned = clean_json_output(approved[0]["text"])

    try:
        obj = json.loads(cleaned)
    except Exception as e:
        raise ValueError(
            f"export_approved_profile: invalid JSON after cleaning: {e}\n"
            f"Cleaned value:\n{cleaned}"
        )

    return {"class_profile": obj}


# ======================================================
# 9. WORKFLOW GRAPH
# ======================================================

def build_workflow():
    graph = StateGraph(WorkflowState)

    graph.add_node("generate_class_profile", node_generate_class_profile)
    graph.add_node("init_profile_review", node_init_profile_review)

    graph.set_entry_point("generate_class_profile")
    graph.add_edge("generate_class_profile", "init_profile_review")
    graph.add_edge("init_profile_review", END)

    return graph.compile()


# ======================================================
# 10. TEST / DEMO
# ======================================================

def run_demo():
    class_input = {
        "class_id": "class_001",
        "discipline_info": "11th grade computer science course focusing on data and algorithms.",
        "course_info": "Mixed prior knowledge; some new to CS, others in coding clubs.",
        "class_info": (
            "30 students, one third multilingual learners. Several IEPs. Strong interest "
            "in real-world tech projects but struggle with dense readings."
        ),
    }

    initial_state: WorkflowState = {
        "class_input": class_input,
        "model": "gemini-2.5-flash",
        "temperature": 0.3,
        "max_output_tokens": 4096,
    }

    app = build_workflow()
    final = app.invoke(initial_state)

    print("\n=== CLASS PROFILE JSON ===\n")
    print(final["class_profile_json"])

    print("\n=== REVIEW OBJECT ===\n")
    print(json.dumps(final["class_profile_review"], ensure_ascii=False, indent=2))

    # Approve for demonstration
    reviewed = final["class_profile_review"]
    approve_profile(reviewed[0])

    exported = export_approved_profile(reviewed)

    print("\n=== EXPORTED APPROVED PROFILE ===\n")
    print(json.dumps(exported, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        run_demo()
    except Exception as e:
        print("\n=== UNHANDLED ERROR ===")
        print(e)
        print("=== END ERROR ===")
