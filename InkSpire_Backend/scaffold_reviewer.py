"""
scaffold_reviewer.py

A standalone command-line tool for reviewing scaffolds with four actions:
  - approve
  - reject
  - manual edit
  - LLM refine

Usage examples:

1) Run workflow inside this tool, then review:

    python scaffold_reviewer.py --run-workflow

2) Review from a JSON file that contains "annotation_scaffolds_review":

    python scaffold_reviewer.py \
        --input review_list.json \
        --output approved_scaffolds.json
"""

import json
import argparse
from typing import List

from workflow import (
    WorkflowState,
    build_workflow,
    load_reading_chunks_from_jsonl,
    make_llm,
    approve_scaffold,
    reject_scaffold,
    manual_edit_scaffold,
    llm_refine_scaffold,
    export_approved_scaffolds,
)


# ======================================================
# 1. INTERACTIVE REVIEW LOOP
# ======================================================

def interactive_review(
    review_list: List[dict],
    state: WorkflowState | None = None,
):
    """
    Command-line interactive review tool.

    For each scaffold, offers:
      [a] approve
      [r] reject
      [e] manual edit
      [f] LLM refine (requires state + make_llm from workflow)
      [s] skip
      [q] quit

    review_list is modified in-place.
    """
    if not review_list:
        print("No scaffolds to review.")
        return

    llm = None  # lazy init, only if we use refine
    idx = 0
    total = len(review_list)

    while idx < total:
        scaf = review_list[idx]
        print("\n" + "=" * 80)
        print(f"[{idx+1}/{total}] ID: {scaf.get('id')}")
        print("- Fragment -")
        print(scaf.get("fragment", "").strip())
        print("\n- Current Text -")
        print(scaf.get("text", "").strip())
        print(f"\nStatus: {scaf.get('status', 'pending')}")
        history = scaf.get("history", [])
        print(f"History length: {len(history) if history is not None else 0}")

        print("\nChoose an action:")
        print("  [a] approve")
        print("  [r] reject")
        print("  [e] manual edit")
        print("  [f] LLM refine (according to your instruction)")
        print("  [s] skip (do nothing, go to next)")
        print("  [q] quit review")

        choice = input("Your choice (a/r/e/f/s/q): ").strip().lower()

        if choice == "a":
            approve_scaffold(scaf)
            print(f"✅ Approved {scaf.get('id')}")
            idx += 1

        elif choice == "r":
            reject_scaffold(scaf)
            print(f"❌ Rejected {scaf.get('id')}")
            idx += 1

        elif choice == "e":
            print("\nEnter new scaffold text (single line).")
            print("Current text:")
            print(scaf.get("text", "").strip())
            new_text = input("\nNew text: ").strip()
            if new_text:
                manual_edit_scaffold(scaf, new_text)
                print(f"✏️ Edited {scaf.get('id')}.")
                print("You can now:")
                print("  - press [a] to approve this edited scaffold")
                print("  - press [e] again to further edit")
                print("  - press [f] to refine with LLM")
                print("  - press [s] to skip to the next one")
            else:
                print("⚠️ Empty input, no changes made.")
            # Stay on the same scaffold so user can approve/edit/refine/skip
            continue

        elif choice == "f":
            if state is None:
                print("⚠️ LLM refine requires a WorkflowState (for make_llm). Skipping refine.")
                # stay on same scaffold, back to menu
                continue

            if llm is None:
                llm = make_llm(state)

            print("\nDescribe how you want to refine this scaffold.")
            print("For example: 'Simplify the language for multilingual 11th graders.'")
            user_prompt = input("Refinement instruction: ").strip()
            if user_prompt:
                llm_refine_scaffold(scaf, user_prompt, llm)
                print(f"🤖 Refined {scaf.get('id')}.")
                print("You can now:")
                print("  - press [a] to approve this refined scaffold")
                print("  - press [f] again to refine further")
                print("  - press [e] to manually edit")
                print("  - press [s] to skip to the next one")
            else:
                print("⚠️ Empty instruction, no changes made.")
            # Stay on same scaffold
            continue

        elif choice == "s":
            print(f"⏭ Skipped {scaf.get('id')}")
            idx += 1

        elif choice == "q":
            print("🚪 Quit review early.")
            break

        else:
            print("⚠️ Invalid choice, please choose one of a/r/e/f/s/q.")

    print("\nReview session ended.")


# ======================================================
# 2. LOAD / SAVE HELPERS
# ======================================================

def load_review_list_from_file(path: str) -> list[dict]:
    """
    Load a JSON file that either:
      - is a dict with key "annotation_scaffolds_review", or
      - is a list of ReviewedScaffold objects directly.
    """
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict) and "annotation_scaffolds_review" in data:
        review_list = data["annotation_scaffolds_review"]
    elif isinstance(data, list):
        review_list = data
    else:
        raise ValueError(
            "Input JSON must be either a list, or a dict with key "
            "'annotation_scaffolds_review'."
        )

    if not isinstance(review_list, list):
        raise TypeError("annotation_scaffolds_review must be a list.")

    return review_list


def save_approved_to_file(review_list: list[dict], output_path: str):
    """
    Export approved scaffolds to output_path as:
    {
      "annotation_scaffolds": [
        { "id": "...", "fragment": "...", "text": "..." },
        ...
      ]
    }
    """
    approved_json = export_approved_scaffolds(review_list)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(approved_json, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Saved approved scaffolds to: {output_path}")


# ======================================================
# 3. OPTIONAL: RUN WORKFLOW THEN REVIEW
# ======================================================

def run_workflow_and_review(
    reading_path: str,
    output_path: str | None,
):
    """
    Convenience mode:
      1) Run the workflow (material → focus → scaffold → init_scaffold_review)
      2) Launch interactive review
      3) Optionally save approved scaffolds
    """
    reading_chunks = load_reading_chunks_from_jsonl(reading_path)

    class_profile = {
        "class_id": "class_001",
        "profile": "11th grade CS class with mixed prior experience.",
        "design_consideration": "Multilingual learners need scaffolded support for technical reading."
    }

    reading_info = {
        "assignment_id": "reading01",
        "session_description": "Session 3 of unit on version control and tools.",
        "assignment_description": "Students read about differences between distributed and centralized version control.",
        "assignment_objective": "Students can explain key concepts and compare workflows."
    }

    initial_state: WorkflowState = {
        "reading_chunks": reading_chunks,
        "class_profile": class_profile,
        "reading_info": reading_info,
        "model": "gemini-2.5-flash",
        "temperature": 0.3,
        "max_output_tokens": 8192,
    }

    app = build_workflow()
    final = app.invoke(initial_state)

    review_list = final["annotation_scaffolds_review"]

    print("\n=== START INTERACTIVE REVIEW ===")
    interactive_review(review_list, initial_state)

    if output_path:
        save_approved_to_file(review_list, output_path)
    else:
        print("\n(No output file specified; skipping save.)")


# ======================================================
# 4. CLI ENTRY
# ======================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="Interactive scaffold reviewer (approve/reject/edit/refine)."
    )

    parser.add_argument(
        "--input",
        type=str,
        default=None,
        help="Path to JSON file containing annotation_scaffolds_review "
             "(either list or { 'annotation_scaffolds_review': [...] }).",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="approved_scaffolds.json",
        help="Where to save approved scaffolds JSON.",
    )
    parser.add_argument(
        "--run-workflow",
        action="store_true",
        help="If set, run the workflow inside this tool, then review the results. "
             "In this mode, --input is ignored.",
    )
    parser.add_argument(
        "--reading-path",
        type=str,
        default="reading01_chunks.jsonl",
        help="Path to reading chunks JSONL when using --run-workflow mode.",
    )

    return parser.parse_args()


def main():
    args = parse_args()

    if args.run_workflow:
        # Full pipeline inside reviewer: run workflow → review → save
        run_workflow_and_review(args.reading_path, args.output)
    else:
        if not args.input:
            raise SystemExit(
                "You must provide either --run-workflow or --input <file>. "
                "Run with -h for help."
            )

        review_list = load_review_list_from_file(args.input)
        # In this mode we don't know original WorkflowState, so LLM refine is disabled
        print("\n=== START INTERACTIVE REVIEW (no workflow state, LLM refine disabled) ===")
        interactive_review(review_list, state=None)

        if args.output:
            save_approved_to_file(review_list, args.output)


if __name__ == "__main__":
    main()
