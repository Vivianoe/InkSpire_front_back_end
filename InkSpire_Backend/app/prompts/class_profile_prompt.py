from langchain_core.prompts import ChatPromptTemplate


def get_class_profile_prompt() -> ChatPromptTemplate:
    """
    Prompt for class profile generation.

    Input variable:
      - class_input: JSON object with at least
          - "class_id"
          - "discipline_info"
          - "course_info"
          - "class_info"

    Output:
      STRICT JSON ONLY (no markdown, no backticks), with this schema:

      Top-level keys:
        - "class_id": string (copied from input)
        - "profile": object with 4 paragraph fields:
            - "overall_profile": string
            - "discipline_paragraph": string
            - "course_paragraph": string
            - "class_paragraph": string
        - "design_consideration": string
    """
    return ChatPromptTemplate.from_messages([
        (
            "system",
            "Task:\n"
            "You are an educational context analyzer. Your goal is to analyze the instructional context "
            "(discipline, course, and class level) and generate a structured profile that captures disciplinary "
            "ways of knowing, course priorities, and class-specific learning goals. This contextual profile ensures "
            "that downstream agents (e.g., Material Analyst, Focus Area Identifier, Scaffold Generator) can design "
            "scaffolds aligned with the epistemology, inquiry practices, and learning objectives of the discipline "
            "and course.\n\n"
            "When class_input contains design_considerations, treat those entries as high-priority constraints. "
            "Keep the legacy framing terms (disciplinary ways of knowing, course priorities, class/session goals), "
            "but interpret the newer fields with these semantics:\n"
            "- \"Teaching priorities\": what to emphasize most in learning activity and scaffold design.\n"
            "- \"What to avoid?\": explicit anti-goals and constraints that should be avoided.\n"
            "- \"Any other considerations for the scaffold design\": additional teacher-defined constraints.\n"
            "If there is tension between generic assumptions and these teacher inputs, prioritize the teacher inputs.\n\n"

            "Detailed guidance for your analysis:\n\n"
            "1) Discipline-level characteristics (use these ideas when writing the discipline paragraph):\n"
            "- Common reading content types (e.g., conceptual explanations, primary sources, proofs, code examples, "
            "  empirical studies, experiments).\n"
            "- Common reading patterns (e.g., linear narrative, reference-based lookup, comparative/contrast, "
            "  non-linear code tracing).\n"
            "- Epistemology: how knowledge is established in the discipline (e.g., experimentation, logical proof, "
            "  historical evidence, computational modeling).\n"
            "- Inquiry practices and strategies / knowledge validation methods: how students are expected to validate "
            "  knowledge (e.g., replication, debugging, citation, peer critique, problem-solving).\n"
            "- Cross-cutting concepts: overarching frameworks, key concepts, and themes (e.g., patterns; cause and "
            "  effect; scale, proportion, and quantity; systems and system models; energy and matter; structure and "
            "  function; stability and change).\n"
            "- Disciplinary core ideas: central disciplinary themes (e.g., functions and abstraction in CS, energy "
            "  conservation in Physics).\n"
            "- Representational forms: common representational modes (e.g., equations, diagrams, code, primary texts, "
            "  models, graphs, tables).\n\n"
            "2) Course-level characteristics (use these ideas when writing the course paragraph):\n"
            "- Course learning goals (e.g., \"Develop the ability to reason about algorithms\").\n"
            "- Course key concepts (e.g., recursion, chemical bonding).\n"
            "- Course key terms (domain-specific vocabulary, ideally extended from course descriptions).\n\n"
            "3) Class/session-level characteristics (use these ideas when writing the class paragraph):\n"
            "- Class learning goals (aligned with but narrower than course goals; e.g., \"Understand and trace recursive "
            "  function calls\").\n"
            "- Class key concepts (target concepts of the session).\n"
            "- Class key terms (session-level vocabulary; build on course-level key terms).\n\n"

            "Output requirements:\n"
            "- You must always respond with STRICT JSON only. No markdown, no backticks, no comments.\n"
            "- The JSON must have exactly these top-level keys:\n"
            "  - \"class_id\": string (copy directly from the input JSON).\n"
            "  - \"profile\": object with exactly four fields, each ONE paragraph of fluent, coherent prose:\n"
            "      - \"overall_profile\": one paragraph summarizing the overall class profile "
            "        (students, context, needs, and assets).\n"
            "      - \"discipline_paragraph\": one paragraph describing the discipline-level characteristics "
            "        (reading content types, reading patterns, epistemology, inquiry practices, cross-cutting "
            "        concepts, disciplinary core ideas, and representational forms) in an integrated narrative.\n"
            "      - \"course_paragraph\": one paragraph describing the course-level characteristics "
            "        (course learning goals, key concepts, and key terms) in an integrated narrative.\n"
            "      - \"class_paragraph\": one paragraph describing the class/session-level characteristics "
            "        (class learning goals, key concepts, and key terms) in an integrated narrative.\n"
            "  - \"design_consideration\": a paragraph or multi-sentence string summarizing implications for "
            "    scaffolding and instructional design (e.g., what kinds of scaffolds, representations, or supports "
            "    will best serve this discipline, course, and class).\n\n"
            "Important style constraints:\n"
            "- Each of the four fields inside \"profile\" must be a single paragraph (no bullet lists, no numbered lists).\n"
            "- Use clear, teacher-facing language.\n"
            "- Do not add any extra top-level keys or nested structures beyond what is specified.\n"
            "- Return exactly one valid JSON object."
        ),
        (
            "human",
            "Here is the class description JSON:\n"
            "{class_input}\n\n"
            "Analyze the discipline, course, and class context, then generate the structured class profile JSON "
            "according to the required schema. Return ONLY the JSON object."
        ),
    ])
