# Class Profile Data Structure Example

## Database ClassProfile Table Structure

### ClassProfile Table Fields:
- `id`: UUID (primary key)  
- `instructor_id`: UUID (foreign key referencing users table)  
- `course_id`: (UUID, FK → courses.id) Link to a course
- `title`: Text (course name, e.g., "Introduction to Computer Science")  
- `description`: Text (full profile JSON string, current version)  
- `metadata_json`: JSONB (structured metadata including profile and design_consideration)  
- `current_version_id`: UUID (points to the currently active version)  
- `created_at`: TIMESTAMPTZ  
- `updated_at`: TIMESTAMPTZ  

### ClassProfileVersion Table Fields:
- `id`: UUID (primary key)  
- `class_profile_id`: UUID (foreign key)  
- `version_number`: Integer (version number, 1, 2, 3...)  
- `content`: Text (full profile JSON string)  
- `metadata_json`: JSONB (structured metadata)  
- `created_by`: String (creator, e.g., "pipeline" or user UUID)  
- `created_at`: TIMESTAMPTZ  

---

## Full Class Profile JSON Example

### Example 1: Computer Science Course

```json
{
  "class_id": "class_001",
  "profile": {
    "overall_profile": "This is an 11th-grade Computer Science class with 25 students who have mixed prior experience in programming. Some students have taken introductory programming courses, while others are completely new to coding. The class includes multilingual learners who benefit from scaffolded support for technical reading. Students are generally motivated but may struggle with abstract concepts like recursion and data structures. The class meets three times per week for 90 minutes each session.",
    "discipline_paragraph": "Computer Science as a discipline emphasizes computational thinking, algorithmic problem-solving, and systematic approaches to designing solutions. Reading in CS typically involves code examples, technical documentation, algorithm descriptions, and conceptual explanations. The epistemology of CS relies on logical proof, testing, and debugging as primary methods of knowledge validation. Students are expected to trace code execution, understand algorithmic complexity, and apply patterns like recursion and abstraction. Common representational forms include pseudocode, flowcharts, UML diagrams, and actual code in various programming languages. Cross-cutting concepts include abstraction, modularity, efficiency, and correctness.",
    "course_paragraph": "This course focuses on fundamental programming concepts and data structures. Key learning goals include developing the ability to reason about algorithms, understanding time and space complexity, and mastering core data structures such as arrays, linked lists, stacks, queues, and trees. Students will learn to implement and analyze algorithms for searching, sorting, and graph traversal. Important course-level concepts include recursion, dynamic programming, object-oriented design, and algorithm analysis. Key terms include variables, functions, loops, conditionals, arrays, pointers, recursion, time complexity, space complexity, Big O notation, and data structures.",
    "class_paragraph": "This week's session focuses on understanding and implementing recursive algorithms. Specific learning goals include being able to trace recursive function calls, identify base cases and recursive cases, and convert iterative solutions to recursive ones. Students will work with examples involving factorial calculation, Fibonacci sequences, and tree traversal. Key concepts for this session include recursion, base case, recursive case, call stack, and tail recursion. Important terms include recursive function, base case, recursive call, stack frame, and infinite recursion."
  },
  "design_consideration": "Given the mixed experience levels and multilingual learners in this class, scaffolds should provide clear step-by-step explanations of recursive thinking, visual representations of call stacks, and opportunities for students to trace through examples before writing their own code. Scaffolds should break down complex recursive problems into smaller, manageable parts and provide explicit connections between iterative and recursive approaches. For multilingual learners, technical vocabulary should be clearly defined with examples, and code comments should be comprehensive. Visual aids such as call stack diagrams and execution trees will help students understand the flow of recursive algorithms."
}
```

### Example 2: History course

```json
{
  "class_id": "class_002",
  "profile": {
    "overall_profile": "This is a 10th-grade World History class with 30 students from diverse cultural backgrounds. Students have varying reading comprehension levels, with some struggling with primary source documents and historical analysis. The class includes English language learners who need support with academic vocabulary and complex sentence structures. Students are generally engaged with historical narratives but may find primary source analysis challenging. The class meets four times per week for 50 minutes each session.",
    "discipline_paragraph": "History as a discipline emphasizes the analysis of primary and secondary sources, understanding cause and effect relationships, and constructing evidence-based arguments. Reading in history involves primary documents, historical narratives, scholarly articles, and comparative analyses. The epistemology of history relies on evidence evaluation, source criticism, contextualization, and corroboration. Students are expected to identify bias, analyze multiple perspectives, and construct historical arguments supported by evidence. Common representational forms include timelines, maps, charts, political cartoons, photographs, and written documents. Cross-cutting concepts include causation, continuity and change, periodization, and historical significance.",
    "course_paragraph": "This course explores major world civilizations from ancient times to the modern era. Key learning goals include developing historical thinking skills, understanding chronological frameworks, analyzing primary sources, and constructing evidence-based historical arguments. Students will examine political, economic, social, and cultural developments across different regions and time periods. Important course-level concepts include empire, revolution, trade networks, cultural diffusion, and historical causation. Key terms include primary source, secondary source, bias, perspective, chronology, periodization, empire, civilization, trade, and cultural diffusion.",
    "class_paragraph": "This week's session focuses on analyzing the causes and consequences of the Industrial Revolution. Specific learning goals include identifying multiple causes of industrialization, analyzing primary source documents from the period, and understanding how industrialization transformed societies. Students will examine factory conditions, labor movements, and technological innovations. Key concepts for this session include industrialization, urbanization, labor conditions, technological change, and social transformation. Important terms include Industrial Revolution, factory system, urbanization, labor union, steam engine, textile, and working class."
  },
  "design_consideration": "Scaffolds for this class should help students navigate complex primary source documents by breaking down difficult vocabulary, providing historical context, and guiding students through source analysis frameworks. For English language learners, scaffolds should include vocabulary definitions, simplified sentence structures, and visual aids. Scaffolds should help students identify bias and perspective in sources, connect primary sources to broader historical themes, and construct evidence-based arguments. Graphic organizers for cause-and-effect relationships and comparative analysis will support students' historical thinking. Scaffolds should also provide explicit instruction on how to read and interpret different types of historical documents, from letters and diaries to political cartoons and photographs."
}
```

---

## Database Storage Example

### ClassProfile  `description` (full JSON string)：
```json
"{\"class_id\":\"class_001\",\"profile\":{\"overall_profile\":\"This is an 11th-grade Computer Science class...\",\"discipline_paragraph\":\"Computer Science as a discipline...\",\"course_paragraph\":\"This course focuses on...\",\"class_paragraph\":\"This week's session focuses on...\"},\"design_consideration\":\"Given the mixed experience levels...\"}"
```

### ClassProfile `metadata_json`（structured data）：
```json
{
  "class_id": "class_001",
  "profile": {
    "overall_profile": "This is an 11th-grade Computer Science class...",
    "discipline_paragraph": "Computer Science as a discipline...",
    "course_paragraph": "This course focuses on...",
    "class_paragraph": "This week's session focuses on..."
  },
  "design_consideration": "Given the mixed experience levels..."
}
```

---

## API request

### create Class Profile request：
```json
{
  "instructor_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Introduction to Computer Science",
  "course_code": "CS101",
  "description": "Basic programming concepts and data structures",
  "class_input": {
    "class_id": "class_001",
    "discipline_info": {
      "discipline": "Computer Science",
      "subdiscipline": "Programming Fundamentals"
    },
    "course_info": {
      "syllabus_overview": "Introduction to programming",
      "learning_objectives": ["Understand variables", "Master loops", "Learn data structures"]
    },
    "class_info": {
      "class_size": 25,
      "student_background": "Mixed experience levels",
      "prerequisites": "None"
    }
  }
}
```

### API response：
```json
{
  "review": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "text": "{\"class_id\":\"class_001\",\"profile\":{...},\"design_consideration\":\"...\"}",
    "status": "pending",
    "history": [
      {
        "ts": 1705312800.0,
        "action": "init"
      }
    ]
  }
}
```

---

## Key Field Explanation

### class_id: Class identifier (string)

### profile: Object containing four paragraphs:

#### overall_profile: Overall class overview (students, background, needs)

#### discipline_paragraph: Discipline-level characteristics (reading types, epistemology, practices)

#### course_paragraph: Course-level characteristics (learning goals, core concepts, key terms)

#### class_paragraph: Session/class-level characteristics (specific learning goals, concepts, terms)

### design_consideration: Instructional design considerations (scaffold design recommendations)



