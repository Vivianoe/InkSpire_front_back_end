# API Testing Examples and Actual Responses

This document provides real-world testing examples for the Inkspire backend API, including actual request payloads sent and responses received from the Supabase-backed endpoints. Use this as a reference for understanding API behavior with concrete data.

To interactively explore and test these API endpoints using Swagger UI, visit `http://localhost:8000/docs` when the server is running.

## Table of Contents

1. [Health Check](#health-check)
2. [User Authentication](#user-authentication)
3. [Class Profiles](#class-profiles)
4. [Reading Management](#reading-management)
5. [Scaffold Generation](#scaffold-generation)
6. [Perusall Integration](#perusall-integration)

## Health Check

### GET /health

#### Response
```json
{
  "status": "ok"
}
```

---

## User Authentication

**Security Note:** All JWT tokens in this documentation are shown as `JWT_TOKEN` placeholders. In actual usage, replace these with real tokens obtained from the `/api/auth/login` endpoint. Never commit or share real authentication tokens in documentation or version control.

### POST /api/auth/register

#### Request body
```json
{
  "email": "instructor@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "role": "instructor"
}
```

#### Response
```json
{
  "id": "56f0d519-b009-4c21-b75a-4e1496277f39",
  "supabase_user_id": "af468f7f-92eb-4b14-a672-8a80fa5f6d0d",
  "email": "instructor@example.com",
  "name": "John Doe",
  "role": "instructor",
  "created_at": "2025-12-08 12:51:44.374204+00",
  "updated_at": "2025-12-08 12:51:44.374204+00"
}
```

### POST /api/auth/login

#### Request body
```json
{
  "email": "instructor@example.com",
  "password": "SecurePassword123!"
}
```

#### Response
```json
{
  "user": {
    "id": "56f0d519-b009-4c21-b75a-4e1496277f39",
    "supabase_user_id": "af468f7f-92eb-4b14-a672-8a80fa5f6d0d",
    "email": "instructor@example.com",
    "name": "John Doe",
    "role": "instructor",
    "created_at": "2025-12-08T12:51:44.374204+00:00",
    "updated_at": "2025-12-08T12:51:44.374204+00:00"
  },
  "access_token": "JWT_TOKEN",
  "token_type": "bearer",
  "message": "Login successful"
}
```

### GET /api/users/me

#### Authorization Header
```
Authorization: Bearer JWT_TOKEN
```

#### Response
```json
{
  "id": "56f0d519-b009-4c21-b75a-4e1496277f39",
  "supabase_user_id": "af468f7f-92eb-4b14-a672-8a80fa5f6d0d",
  "email": "instructor@example.com",
  "name": "John Doe",
  "role": "instructor",
  "created_at": "2025-12-08T12:51:44.374204+00:00",
  "updated_at": "2025-12-08T12:51:44.374204+00:00"
}
```

### GET /api/users/{user_id}

#### Parameter
user_id = "56f0d519-b009-4c21-b75a-4e1496277f39"

#### Response
```json
{
  "id": "56f0d519-b009-4c21-b75a-4e1496277f39",
  "email": "instructor@example.com",
  "name": "John Doe",
  "role": "instructor",
  "created_at": "2025-12-08T12:51:44.374204+00:00"
}
```

---

## Class Profiles

### POST /api/class-profiles

#### Request body
#### should add design consideration
```json
{
  "instructor_id": "56f0d519-b009-4c21-b75a-4e1496277f39",
  "title": "Introduction to Computer Science",
  "course_code": "CS101",
  "description": "Basic programming concepts and data structures",
  "class_input": {
    "discipline_info": {
      "discipline": "Computer Science",
      "subdiscipline": "Programming Fundamentals"
    },
    "course_info": {
      "syllabus_overview": "Introduction to programming",
      "learning_objectives": ["Understand variables", "Master loops"]
    },
    "class_info": {
      "class_size": 25,
      "student_background": "Mixed experience levels",
      "prerequisites": "None"
    }
  }
}
```

#### Response
```json
{
  "review": {
    "id": "48ff7c21-edb6-4f56-bc56-441688c71626",
    "text": "{\n  \"class_id\": \"CS101_ProgrammingFundamentals_Intro\",\n  \"profile\": {\n    \"overall_profile\": \"This class introduces fundamental programming concepts to a diverse group of 25 students, many of whom have no prior programming experience. The core focus is on establishing foundational knowledge in Computer Science, particularly in the realm of programming fundamentals. Given the mixed experience levels, the instructional approach must cater to novices by providing clear, step-by-step guidance while also offering opportunities for more advanced students to deepen their understanding through challenging applications. The class aims to build a strong base for future computational thinking and problem-solving skills, starting with essential constructs like variables and loops.\",\n    \"discipline_paragraph\": \"In Computer Science, specifically Programming Fundamentals, knowledge is primarily established through logical consistency, systematic testing, and the functional correctness of computational models. Common reading content includes conceptual explanations of algorithms, code examples, and problem specifications, often requiring non-linear code tracing to understand execution flow, or reference-based lookup in documentation. Inquiry practices center on debugging code, validating solutions through comprehensive testing, applying algorithmic problem-solving strategies, and engaging in peer critique of code. Cross-cutting concepts like systems and system models (viewing programs as interacting components), patterns (in algorithms and data structures), and cause and effect (input processing leading to output) are fundamental. Disciplinary core ideas revolve around abstraction, data representation, and the design of algorithms. Representational forms frequently encountered are code itself (in various programming languages or pseudocode), flowcharts, data structure diagrams, and tables for tracing variable states or test cases.\",\n    \"course_paragraph\": \"The 'Introduction to Programming' course aims to equip students with the ability to understand fundamental programming concepts and develop basic computational problem-solving skills. Key course learning goals include understanding the purpose and usage of variables, mastering the implementation and tracing of various loop constructs, and developing a foundational understanding of algorithmic thinking. Central concepts covered in this course encompass variables, data types, operators, conditional statements, iterative structures (loops), basic input/output, and the structure of simple programs. Key terms that students are expected to master include 'variable,' 'integer,' 'string,' 'boolean,' 'assignment,' 'operator,' 'conditional,' 'if/else,' 'loop,' 'for loop,' 'while loop,' 'iteration,' 'function,' 'syntax,' 'error,' and 'debug,' forming the essential vocabulary for early programming endeavors.\",\n    \"class_paragraph\": \"This specific class session focuses on laying the groundwork for basic programming, aligning with the course's introductory objectives. The primary learning goals for this class are to define, declare, and initialize variables of different data types, and to construct and trace simple 'for' and 'while' loops to solve iterative problems. Key concepts targeted in this session include variable declaration, variable assignment, common data types such as integers and strings, the fundamental structure of loop control, understanding iteration, and identifying loop termination conditions. Important terms for this class build upon the course vocabulary and include 'declare,' 'initialize,' 'assign,' 'integer,' 'string,' 'float,' 'boolean,' 'for loop,' 'while loop,' 'iterate,' 'counter,' 'index,' and 'infinite loop,' ensuring students can articulate and apply these foundational programming elements.\"\n  },\n  \"design_consideration\": \"Given the introductory nature and mixed student background, scaffolding should prioritize clear, sequential instruction with ample opportunities for hands-on practice and immediate feedback. Visual aids like code execution visualizers, flowcharts, and diagrams illustrating variable states will be highly beneficial to build accurate mental models of program execution. Scaffolds should include step-by-step guides for tracing code, explicit explanations of common syntax errors, and structured problem-solving templates. Encouraging collaborative learning and providing access to robust debugging tools with guidance on their use will support students in validating their knowledge and developing systematic inquiry practices. Explicitly connecting abstract concepts to concrete code examples and real-world problems will enhance understanding and retention.\"\n}",
    "status": "approved",
    "history": [
      {
        "ts": 1765231061.612085,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": null
      }
    ]
  }
}
```

### POST /api/class-profiles/{profile_id}/approve

#### Parameter
profile_id = "48ff7c21-edb6-4f56-bc56-441688c71626"

#### Request body
```json
{
  "updated_text": "{\n  \"class_id\": \"CS101_ProgrammingFundamentals_Intro\",\n  \"profile\": {\n    \"overall_profile\": \"EDIT 1! This class introduces fundamental programming concepts to a diverse group of 25 students, many of whom have no prior programming experience. The core focus is on establishing foundational knowledge in Computer Science, particularly in the realm of programming fundamentals. Given the mixed experience levels, the instructional approach must cater to novices by providing clear, step-by-step guidance while also offering opportunities for more advanced students to deepen their understanding through challenging applications. The class aims to build a strong base for future computational thinking and problem-solving skills, starting with essential constructs like variables and loops.\",\n    \"discipline_paragraph\": \"EDIT 2! In Computer Science, specifically Programming Fundamentals, knowledge is primarily established through logical consistency, systematic testing, and the functional correctness of computational models. Common reading content includes conceptual explanations of algorithms, code examples, and problem specifications, often requiring non-linear code tracing to understand execution flow, or reference-based lookup in documentation. Inquiry practices center on debugging code, validating solutions through comprehensive testing, applying algorithmic problem-solving strategies, and engaging in peer critique of code. Cross-cutting concepts like systems and system models (viewing programs as interacting components), patterns (in algorithms and data structures), and cause and effect (input processing leading to output) are fundamental. Disciplinary core ideas revolve around abstraction, data representation, and the design of algorithms. Representational forms frequently encountered are code itself (in various programming languages or pseudocode), flowcharts, data structure diagrams, and tables for tracing variable states or test cases.\",\n    \"course_paragraph\": \"EDIT 3! The 'Introduction to Programming' course aims to equip students with the ability to understand fundamental programming concepts and develop basic computational problem-solving skills. Key course learning goals include understanding the purpose and usage of variables, mastering the implementation and tracing of various loop constructs, and developing a foundational understanding of algorithmic thinking. Central concepts covered in this course encompass variables, data types, operators, conditional statements, iterative structures (loops), basic input/output, and the structure of simple programs. Key terms that students are expected to master include 'variable,' 'integer,' 'string,' 'boolean,' 'assignment,' 'operator,' 'conditional,' 'if/else,' 'loop,' 'for loop,' 'while loop,' 'iteration,' 'function,' 'syntax,' 'error,' and 'debug,' forming the essential vocabulary for early programming endeavors.\",\n    \"class_paragraph\": \"This specific class session focuses on laying the groundwork for basic programming, aligning with the course's introductory objectives. The primary learning goals for this class are to define, declare, and initialize variables of different data types, and to construct and trace simple 'for' and 'while' loops to solve iterative problems. Key concepts targeted in this session include variable declaration, variable assignment, common data types such as integers and strings, the fundamental structure of loop control, understanding iteration, and identifying loop termination conditions. Important terms for this class build upon the course vocabulary and include 'declare,' 'initialize,' 'assign,' 'integer,' 'string,' 'float,' 'boolean,' 'for loop,' 'while loop,' 'iterate,' 'counter,' 'index,' and 'infinite loop,' ensuring students can articulate and apply these foundational programming elements.\"\n  },\n  \"design_consideration\": \"Given the introductory nature and mixed student background, scaffolding should prioritize clear, sequential instruction with ample opportunities for hands-on practice and immediate feedback. Visual aids like code execution visualizers, flowcharts, and diagrams illustrating variable states will be highly beneficial to build accurate mental models of program execution. Scaffolds should include step-by-step guides for tracing code, explicit explanations of common syntax errors, and structured problem-solving templates. Encouraging collaborative learning and providing access to robust debugging tools with guidance on their use will support students in validating their knowledge and developing systematic inquiry practices. Explicitly connecting abstract concepts to concrete code examples and real-world problems will enhance understanding and retention.\"\n}"
}
```

#### Response
```json
{
  "class_profile": {
    "class_id": "CS101_ProgrammingFundamentals_Intro",
    "profile": {
      "overall_profile": "EDIT 1! This class introduces fundamental programming concepts to a diverse group of 25 students, many of whom have no prior programming experience. The core focus is on establishing foundational knowledge in Computer Science, particularly in the realm of programming fundamentals. Given the mixed experience levels, the instructional approach must cater to novices by providing clear, step-by-step guidance while also offering opportunities for more advanced students to deepen their understanding through challenging applications. The class aims to build a strong base for future computational thinking and problem-solving skills, starting with essential constructs like variables and loops.",
      "discipline_paragraph": "EDIT 2! In Computer Science, specifically Programming Fundamentals, knowledge is primarily established through logical consistency, systematic testing, and the functional correctness of computational models. Common reading content includes conceptual explanations of algorithms, code examples, and problem specifications, often requiring non-linear code tracing to understand execution flow, or reference-based lookup in documentation. Inquiry practices center on debugging code, validating solutions through comprehensive testing, applying algorithmic problem-solving strategies, and engaging in peer critique of code. Cross-cutting concepts like systems and system models (viewing programs as interacting components), patterns (in algorithms and data structures), and cause and effect (input processing leading to output) are fundamental. Disciplinary core ideas revolve around abstraction, data representation, and the design of algorithms. Representational forms frequently encountered are code itself (in various programming languages or pseudocode), flowcharts, data structure diagrams, and tables for tracing variable states or test cases.",
      "course_paragraph": "EDIT 3! The 'Introduction to Programming' course aims to equip students with the ability to understand fundamental programming concepts and develop basic computational problem-solving skills. Key course learning goals include understanding the purpose and usage of variables, mastering the implementation and tracing of various loop constructs, and developing a foundational understanding of algorithmic thinking. Central concepts covered in this course encompass variables, data types, operators, conditional statements, iterative structures (loops), basic input/output, and the structure of simple programs. Key terms that students are expected to master include 'variable,' 'integer,' 'string,' 'boolean,' 'assignment,' 'operator,' 'conditional,' 'if/else,' 'loop,' 'for loop,' 'while loop,' 'iteration,' 'function,' 'syntax,' 'error,' and 'debug,' forming the essential vocabulary for early programming endeavors.",
      "class_paragraph": "This specific class session focuses on laying the groundwork for basic programming, aligning with the course's introductory objectives. The primary learning goals for this class are to define, declare, and initialize variables of different data types, and to construct and trace simple 'for' and 'while' loops to solve iterative problems. Key concepts targeted in this session include variable declaration, variable assignment, common data types such as integers and strings, the fundamental structure of loop control, understanding iteration, and identifying loop termination conditions. Important terms for this class build upon the course vocabulary and include 'declare,' 'initialize,' 'assign,' 'integer,' 'string,' 'float,' 'boolean,' 'for loop,' 'while loop,' 'iterate,' 'counter,' 'index,' and 'infinite loop,' ensuring students can articulate and apply these foundational programming elements."
    },
    "design_consideration": "Given the introductory nature and mixed student background, scaffolding should prioritize clear, sequential instruction with ample opportunities for hands-on practice and immediate feedback. Visual aids like code execution visualizers, flowcharts, and diagrams illustrating variable states will be highly beneficial to build accurate mental models of program execution. Scaffolds should include step-by-step guides for tracing code, explicit explanations of common syntax errors, and structured problem-solving templates. Encouraging collaborative learning and providing access to robust debugging tools with guidance on their use will support students in validating their knowledge and developing systematic inquiry practices. Explicitly connecting abstract concepts to concrete code examples and real-world problems will enhance understanding and retention."
  }
}
```

### POST /api/class-profiles/{profile_id}/edit

#### Parameter
profile_id = "48ff7c21-edb6-4f56-bc56-441688c71626"

#### Request body
```json
{
  "new_text": "{\n  \"class_id\": \"CS101_ProgrammingFundamentals_Intro\",\n  \"profile\": {\n    \"overall_profile\": \"NEW EDIT 1! This class introduces fundamental programming concepts to a diverse group of 25 students, many of whom have no prior programming experience. The core focus is on establishing foundational knowledge in Computer Science, particularly in the realm of programming fundamentals. Given the mixed experience levels, the instructional approach must cater to novices by providing clear, step-by-step guidance while also offering opportunities for more advanced students to deepen their understanding through challenging applications. The class aims to build a strong base for future computational thinking and problem-solving skills, starting with essential constructs like variables and loops.\",\n    \"discipline_paragraph\": \"NEW EDIT 2! In Computer Science, specifically Programming Fundamentals, knowledge is primarily established through logical consistency, systematic testing, and the functional correctness of computational models. Common reading content includes conceptual explanations of algorithms, code examples, and problem specifications, often requiring non-linear code tracing to understand execution flow, or reference-based lookup in documentation. Inquiry practices center on debugging code, validating solutions through comprehensive testing, applying algorithmic problem-solving strategies, and engaging in peer critique of code. Cross-cutting concepts like systems and system models (viewing programs as interacting components), patterns (in algorithms and data structures), and cause and effect (input processing leading to output) are fundamental. Disciplinary core ideas revolve around abstraction, data representation, and the design of algorithms. Representational forms frequently encountered are code itself (in various programming languages or pseudocode), flowcharts, data structure diagrams, and tables for tracing variable states or test cases.\",\n    \"course_paragraph\": \"NEW EDIT 3! The 'Introduction to Programming' course aims to equip students with the ability to understand fundamental programming concepts and develop basic computational problem-solving skills. Key course learning goals include understanding the purpose and usage of variables, mastering the implementation and tracing of various loop constructs, and developing a foundational understanding of algorithmic thinking. Central concepts covered in this course encompass variables, data types, operators, conditional statements, iterative structures (loops), basic input/output, and the structure of simple programs. Key terms that students are expected to master include 'variable,' 'integer,' 'string,' 'boolean,' 'assignment,' 'operator,' 'conditional,' 'if/else,' 'loop,' 'for loop,' 'while loop,' 'iteration,' 'function,' 'syntax,' 'error,' and 'debug,' forming the essential vocabulary for early programming endeavors.\",\n    \"class_paragraph\": \"This specific class session focuses on laying the groundwork for basic programming, aligning with the course's introductory objectives. The primary learning goals for this class are to define, declare, and initialize variables of different data types, and to construct and trace simple 'for' and 'while' loops to solve iterative problems. Key concepts targeted in this session include variable declaration, variable assignment, common data types such as integers and strings, the fundamental structure of loop control, understanding iteration, and identifying loop termination conditions. Important terms for this class build upon the course vocabulary and include 'declare,' 'initialize,' 'assign,' 'integer,' 'string,' 'float,' 'boolean,' 'for loop,' 'while loop,' 'iterate,' 'counter,' 'index,' and 'infinite loop,' ensuring students can articulate and apply these foundational programming elements.\"\n  },\n  \"design_consideration\": \"Given the introductory nature and mixed student background, scaffolding should prioritize clear, sequential instruction with ample opportunities for hands-on practice and immediate feedback. Visual aids like code execution visualizers, flowcharts, and diagrams illustrating variable states will be highly beneficial to build accurate mental models of program execution. Scaffolds should include step-by-step guides for tracing code, explicit explanations of common syntax errors, and structured problem-solving templates. Encouraging collaborative learning and providing access to robust debugging tools with guidance on their use will support students in validating their knowledge and developing systematic inquiry practices. Explicitly connecting abstract concepts to concrete code examples and real-world problems will enhance understanding and retention.\"\n}"
}
```

#### Response
```json
{
  "review": {
    "id": "48ff7c21-edb6-4f56-bc56-441688c71626",
    "text": "{\n  \"class_id\": \"CS101_ProgrammingFundamentals_Intro\",\n  \"profile\": {\n    \"overall_profile\": \"NEW EDIT 1! This class introduces fundamental programming concepts to a diverse group of 25 students, many of whom have no prior programming experience. The core focus is on establishing foundational knowledge in Computer Science, particularly in the realm of programming fundamentals. Given the mixed experience levels, the instructional approach must cater to novices by providing clear, step-by-step guidance while also offering opportunities for more advanced students to deepen their understanding through challenging applications. The class aims to build a strong base for future computational thinking and problem-solving skills, starting with essential constructs like variables and loops.\",\n    \"discipline_paragraph\": \"NEW EDIT 2! In Computer Science, specifically Programming Fundamentals, knowledge is primarily established through logical consistency, systematic testing, and the functional correctness of computational models. Common reading content includes conceptual explanations of algorithms, code examples, and problem specifications, often requiring non-linear code tracing to understand execution flow, or reference-based lookup in documentation. Inquiry practices center on debugging code, validating solutions through comprehensive testing, applying algorithmic problem-solving strategies, and engaging in peer critique of code. Cross-cutting concepts like systems and system models (viewing programs as interacting components), patterns (in algorithms and data structures), and cause and effect (input processing leading to output) are fundamental. Disciplinary core ideas revolve around abstraction, data representation, and the design of algorithms. Representational forms frequently encountered are code itself (in various programming languages or pseudocode), flowcharts, data structure diagrams, and tables for tracing variable states or test cases.\",\n    \"course_paragraph\": \"NEW EDIT 3! The 'Introduction to Programming' course aims to equip students with the ability to understand fundamental programming concepts and develop basic computational problem-solving skills. Key course learning goals include understanding the purpose and usage of variables, mastering the implementation and tracing of various loop constructs, and developing a foundational understanding of algorithmic thinking. Central concepts covered in this course encompass variables, data types, operators, conditional statements, iterative structures (loops), basic input/output, and the structure of simple programs. Key terms that students are expected to master include 'variable,' 'integer,' 'string,' 'boolean,' 'assignment,' 'operator,' 'conditional,' 'if/else,' 'loop,' 'for loop,' 'while loop,' 'iteration,' 'function,' 'syntax,' 'error,' and 'debug,' forming the essential vocabulary for early programming endeavors.\",\n    \"class_paragraph\": \"This specific class session focuses on laying the groundwork for basic programming, aligning with the course's introductory objectives. The primary learning goals for this class are to define, declare, and initialize variables of different data types, and to construct and trace simple 'for' and 'while' loops to solve iterative problems. Key concepts targeted in this session include variable declaration, variable assignment, common data types such as integers and strings, the fundamental structure of loop control, understanding iteration, and identifying loop termination conditions. Important terms for this class build upon the course vocabulary and include 'declare,' 'initialize,' 'assign,' 'integer,' 'string,' 'float,' 'boolean,' 'for loop,' 'while loop,' 'iterate,' 'counter,' 'index,' and 'infinite loop,' ensuring students can articulate and apply these foundational programming elements.\"\n  },\n  \"design_consideration\": \"Given the introductory nature and mixed student background, scaffolding should prioritize clear, sequential instruction with ample opportunities for hands-on practice and immediate feedback. Visual aids like code execution visualizers, flowcharts, and diagrams illustrating variable states will be highly beneficial to build accurate mental models of program execution. Scaffolds should include step-by-step guides for tracing code, explicit explanations of common syntax errors, and structured problem-solving templates. Encouraging collaborative learning and providing access to robust debugging tools with guidance on their use will support students in validating their knowledge and developing systematic inquiry practices. Explicitly connecting abstract concepts to concrete code examples and real-world problems will enhance understanding and retention.\"\n}",
    "status": "approved",
    "history": [
      {
        "ts": 1765231768.183309,
        "action": "manual_edit",
        "prompt": null,
        "old_text": null,
        "new_text": null
      },
      {
        "ts": 1765231531.495661,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": null
      },
      {
        "ts": 1765231061.612085,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": null
      }
    ]
  }
}
```

### POST /api/class-profiles/{profile_id}/llm-refine

#### Parameter
profile_id = "48ff7c21-edb6-4f56-bc56-441688c71626"

#### Request body
```json
{
  "prompt": "Make the profile more focused on students with no prior programming experience. Emphasize hands-on practice."
}
```

#### Response
```json
{
  "review": {
    "id": "48ff7c21-edb6-4f56-bc56-441688c71626",
    "text": "{\n  \"class_id\": \"CS101_ProgrammingFundamentals_Intro\",\n  \"profile\": {\n    \"overall_profile\": \"This class is specifically designed to introduce fundamental programming concepts to an audience primarily composed of students with no prior programming experience. The core focus is on establishing foundational knowledge in Computer Science, particularly in the realm of programming fundamentals, through a hands-on, ground-up approach. Given the entirely novice experience level, the instructional approach will meticulously cater to absolute beginners, providing clear, step-by-step guidance, frequent opportunities for immediate coding practice, and simplified explanations. The class aims to build a strong base for future computational thinking and problem-solving skills, starting with essential constructs like variables and loops, with an emphasis on students gaining practical experience from their very first coding session.\",\n    \"discipline_paragraph\": \"In Computer Science, specifically Programming Fundamentals, knowledge is primarily established through practical application, guided experimentation, and validating the functional correctness of computational models. Common reading content includes accessible conceptual explanations of algorithms, simplified code examples, and clear problem specifications. For novices, understanding execution flow often involves guided, non-linear code tracing, and learning to interpret documentation requires explicit instruction. Inquiry practices center on highly scaffolded debugging of small code snippets, validating solutions through simple test cases, applying basic algorithmic problem-solving strategies, and engaging in supportive peer critique of code. Cross-cutting concepts like systems and system models (viewing programs as interacting components), patterns (in basic algorithms), and cause and effect (input processing leading to output) are introduced with concrete, relatable examples. Disciplinary core ideas revolve around abstraction, data representation, and the design of algorithms, all presented with an emphasis on hands-on construction. Representational forms frequently encountered are code itself (in an initial programming language), simplified flowcharts, basic data structure diagrams, and tables for tracing variable states or test cases, used as tools for understanding practical execution.\",\n    \"course_paragraph\": \"The 'Introduction to Programming' course aims to equip students with the ability to understand fundamental programming concepts and develop basic computational problem-solving skills through extensive hands-on practice. Key course learning goals include understanding the purpose and usage of variables, mastering the implementation and tracing of various loop constructs, and developing a foundational understanding of algorithmic thinking by building small programs. Central concepts covered in this course encompass variables, data types, operators, conditional statements, iterative structures (loops), basic input/output, and the structure of simple programs, all introduced with immediate opportunities for application. Key terms that students are expected to master include 'variable,' 'integer,' 'string,' 'boolean,' 'assignment,' 'operator,' 'conditional,' 'if/else,' 'loop,' 'for loop,' 'while loop,' 'iteration,' 'function,' 'syntax,' 'error,' and 'debug,' forming the essential vocabulary for early programming endeavors, which students will learn by actively using them in code.\",\n    \"class_paragraph\": \"This specific class session focuses on laying the absolute groundwork for basic programming, aligning with the course's introductory objectives and catering to students with no prior experience. The primary learning goals for this class are to successfully define, declare, and initialize variables of different data types by writing and executing simple code, and to construct and trace basic 'for' and 'while' loops to solve iterative problems in a hands-on environment. Key concepts targeted in this session include variable declaration, variable assignment, common data types such as integers and strings, the fundamental structure of loop control, understanding iteration through practical examples, and identifying loop termination conditions through controlled experimentation. Important terms for this class build upon the course vocabulary and include 'declare,' 'initialize,' 'assign,' 'integer,' 'string,' 'float,' 'boolean,' 'for loop,' 'while loop,' 'iterate,' 'counter,' 'index,' and 'infinite loop,' ensuring students can articulate and practically apply these foundational programming elements through direct coding exercises.\"\n  },\n  \"design_consideration\": \"Given the introductory nature and the absolute lack of prior student background, scaffolding must heavily prioritize clear, sequential instruction with abundant, immediate opportunities for hands-on coding practice and instant feedback. Visual aids like code execution visualizers, simplified flowcharts, and interactive diagrams illustrating variable states will be crucial to build accurate mental models of program execution from scratch. Scaffolds should include highly detailed, step-by-step guides for typing and tracing code, explicit explanations of common syntax errors with how to fix them, and structured problem-solving templates for very small tasks. Encouraging collaborative pair programming and providing access to robust yet simple debugging tools with explicit guidance on their use will support students in validating their knowledge and developing systematic inquiry practices. Explicitly connecting abstract concepts to concrete, executable code examples and highly relatable, simple 'real-world' problems will enhance understanding, build confidence, and reinforce learning through practical application.\"\n}",
    "status": "approved",
    "history": [
      {
        "ts": 1765231890.139465,
        "action": "manual_edit",
        "prompt": null,
        "old_text": null,
        "new_text": null
      },
      {
        "ts": 1765231768.183309,
        "action": "manual_edit",
        "prompt": null,
        "old_text": null,
        "new_text": null
      },
      {
        "ts": 1765231531.495661,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": null
      },
      {
        "ts": 1765231061.612085,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": null
      }
    ]
  }
}
```

### GET /api/class-profiles/{profile_id}

#### Parameter
profile_id = "48ff7c21-edb6-4f56-bc56-441688c71626"

#### Response
```json
{
  "review": {
    "id": "48ff7c21-edb6-4f56-bc56-441688c71626",
    "text": "{\n  \"class_id\": \"CS101_ProgrammingFundamentals_Intro\",\n  \"profile\": {\n    \"overall_profile\": \"This class is specifically designed to introduce fundamental programming concepts to an audience primarily composed of students with no prior programming experience. The core focus is on establishing foundational knowledge in Computer Science, particularly in the realm of programming fundamentals, through a hands-on, ground-up approach. Given the entirely novice experience level, the instructional approach will meticulously cater to absolute beginners, providing clear, step-by-step guidance, frequent opportunities for immediate coding practice, and simplified explanations. The class aims to build a strong base for future computational thinking and problem-solving skills, starting with essential constructs like variables and loops, with an emphasis on students gaining practical experience from their very first coding session.\",\n    \"discipline_paragraph\": \"In Computer Science, specifically Programming Fundamentals, knowledge is primarily established through practical application, guided experimentation, and validating the functional correctness of computational models. Common reading content includes accessible conceptual explanations of algorithms, simplified code examples, and clear problem specifications. For novices, understanding execution flow often involves guided, non-linear code tracing, and learning to interpret documentation requires explicit instruction. Inquiry practices center on highly scaffolded debugging of small code snippets, validating solutions through simple test cases, applying basic algorithmic problem-solving strategies, and engaging in supportive peer critique of code. Cross-cutting concepts like systems and system models (viewing programs as interacting components), patterns (in basic algorithms), and cause and effect (input processing leading to output) are introduced with concrete, relatable examples. Disciplinary core ideas revolve around abstraction, data representation, and the design of algorithms, all presented with an emphasis on hands-on construction. Representational forms frequently encountered are code itself (in an initial programming language), simplified flowcharts, basic data structure diagrams, and tables for tracing variable states or test cases, used as tools for understanding practical execution.\",\n    \"course_paragraph\": \"The 'Introduction to Programming' course aims to equip students with the ability to understand fundamental programming concepts and develop basic computational problem-solving skills through extensive hands-on practice. Key course learning goals include understanding the purpose and usage of variables, mastering the implementation and tracing of various loop constructs, and developing a foundational understanding of algorithmic thinking by building small programs. Central concepts covered in this course encompass variables, data types, operators, conditional statements, iterative structures (loops), basic input/output, and the structure of simple programs, all introduced with immediate opportunities for application. Key terms that students are expected to master include 'variable,' 'integer,' 'string,' 'boolean,' 'assignment,' 'operator,' 'conditional,' 'if/else,' 'loop,' 'for loop,' 'while loop,' 'iteration,' 'function,' 'syntax,' 'error,' and 'debug,' forming the essential vocabulary for early programming endeavors, which students will learn by actively using them in code.\",\n    \"class_paragraph\": \"This specific class session focuses on laying the absolute groundwork for basic programming, aligning with the course's introductory objectives and catering to students with no prior experience. The primary learning goals for this class are to successfully define, declare, and initialize variables of different data types by writing and executing simple code, and to construct and trace basic 'for' and 'while' loops to solve iterative problems in a hands-on environment. Key concepts targeted in this session include variable declaration, variable assignment, common data types such as integers and strings, the fundamental structure of loop control, understanding iteration through practical examples, and identifying loop termination conditions through controlled experimentation. Important terms for this class build upon the course vocabulary and include 'declare,' 'initialize,' 'assign,' 'integer,' 'string,' 'float,' 'boolean,' 'for loop,' 'while loop,' 'iterate,' 'counter,' 'index,' and 'infinite loop,' ensuring students can articulate and practically apply these foundational programming elements through direct coding exercises.\"\n  },\n  \"design_consideration\": \"Given the introductory nature and the absolute lack of prior student background, scaffolding must heavily prioritize clear, sequential instruction with abundant, immediate opportunities for hands-on coding practice and instant feedback. Visual aids like code execution visualizers, simplified flowcharts, and interactive diagrams illustrating variable states will be crucial to build accurate mental models of program execution from scratch. Scaffolds should include highly detailed, step-by-step guides for typing and tracing code, explicit explanations of common syntax errors with how to fix them, and structured problem-solving templates for very small tasks. Encouraging collaborative pair programming and providing access to robust yet simple debugging tools with explicit guidance on their use will support students in validating their knowledge and developing systematic inquiry practices. Explicitly connecting abstract concepts to concrete, executable code examples and highly relatable, simple 'real-world' problems will enhance understanding, build confidence, and reinforce learning through practical application.\"\n}",
    "status": "approved",
    "history": [
      {
        "ts": 1765231890.139465,
        "action": "manual_edit",
        "prompt": null,
        "old_text": null,
        "new_text": null
      },
      {
        "ts": 1765231768.183309,
        "action": "manual_edit",
        "prompt": null,
        "old_text": null,
        "new_text": null
      },
      {
        "ts": 1765231531.495661,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": null
      },
      {
        "ts": 1765231061.612085,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": null
      }
    ]
  }
}
```

### GET /api/class-profiles/instructor/{instructor_id}

#### Parameter
instructor_id = "56f0d519-b009-4c21-b75a-4e1496277f39"

#### Response
```json
{
  "profiles": [
    {
      "id": "48ff7c21-edb6-4f56-bc56-441688c71626",
      "text": "{\n  \"class_id\": \"CS101_ProgrammingFundamentals_Intro\",\n  \"profile\": {\n    \"overall_profile\": \"This class is specifically designed to introduce fundamental programming concepts to an audience primarily composed of students with no prior programming experience. The core focus is on establishing foundational knowledge in Computer Science, particularly in the realm of programming fundamentals, through a hands-on, ground-up approach. Given the entirely novice experience level, the instructional approach will meticulously cater to absolute beginners, providing clear, step-by-step guidance, frequent opportunities for immediate coding practice, and simplified explanations. The class aims to build a strong base for future computational thinking and problem-solving skills, starting with essential constructs like variables and loops, with an emphasis on students gaining practical experience from their very first coding session.\",\n    \"discipline_paragraph\": \"In Computer Science, specifically Programming Fundamentals, knowledge is primarily established through practical application, guided experimentation, and validating the functional correctness of computational models. Common reading content includes accessible conceptual explanations of algorithms, simplified code examples, and clear problem specifications. For novices, understanding execution flow often involves guided, non-linear code tracing, and learning to interpret documentation requires explicit instruction. Inquiry practices center on highly scaffolded debugging of small code snippets, validating solutions through simple test cases, applying basic algorithmic problem-solving strategies, and engaging in supportive peer critique of code. Cross-cutting concepts like systems and system models (viewing programs as interacting components), patterns (in basic algorithms), and cause and effect (input processing leading to output) are introduced with concrete, relatable examples. Disciplinary core ideas revolve around abstraction, data representation, and the design of algorithms, all presented with an emphasis on hands-on construction. Representational forms frequently encountered are code itself (in an initial programming language), simplified flowcharts, basic data structure diagrams, and tables for tracing variable states or test cases, used as tools for understanding practical execution.\",\n    \"course_paragraph\": \"The 'Introduction to Programming' course aims to equip students with the ability to understand fundamental programming concepts and develop basic computational problem-solving skills through extensive hands-on practice. Key course learning goals include understanding the purpose and usage of variables, mastering the implementation and tracing of various loop constructs, and developing a foundational understanding of algorithmic thinking by building small programs. Central concepts covered in this course encompass variables, data types, operators, conditional statements, iterative structures (loops), basic input/output, and the structure of simple programs, all introduced with immediate opportunities for application. Key terms that students are expected to master include 'variable,' 'integer,' 'string,' 'boolean,' 'assignment,' 'operator,' 'conditional,' 'if/else,' 'loop,' 'for loop,' 'while loop,' 'iteration,' 'function,' 'syntax,' 'error,' and 'debug,' forming the essential vocabulary for early programming endeavors, which students will learn by actively using them in code.\",\n    \"class_paragraph\": \"This specific class session focuses on laying the absolute groundwork for basic programming, aligning with the course's introductory objectives and catering to students with no prior experience. The primary learning goals for this class are to successfully define, declare, and initialize variables of different data types by writing and executing simple code, and to construct and trace basic 'for' and 'while' loops to solve iterative problems in a hands-on environment. Key concepts targeted in this session include variable declaration, variable assignment, common data types such as integers and strings, the fundamental structure of loop control, understanding iteration through practical examples, and identifying loop termination conditions through controlled experimentation. Important terms for this class build upon the course vocabulary and include 'declare,' 'initialize,' 'assign,' 'integer,' 'string,' 'float,' 'boolean,' 'for loop,' 'while loop,' 'iterate,' 'counter,' 'index,' and 'infinite loop,' ensuring students can articulate and practically apply these foundational programming elements through direct coding exercises.\"\n  },\n  \"design_consideration\": \"Given the introductory nature and the absolute lack of prior student background, scaffolding must heavily prioritize clear, sequential instruction with abundant, immediate opportunities for hands-on coding practice and instant feedback. Visual aids like code execution visualizers, simplified flowcharts, and interactive diagrams illustrating variable states will be crucial to build accurate mental models of program execution from scratch. Scaffolds should include highly detailed, step-by-step guides for typing and tracing code, explicit explanations of common syntax errors with how to fix them, and structured problem-solving templates for very small tasks. Encouraging collaborative pair programming and providing access to robust yet simple debugging tools with explicit guidance on their use will support students in validating their knowledge and developing systematic inquiry practices. Explicitly connecting abstract concepts to concrete, executable code examples and highly relatable, simple 'real-world' problems will enhance understanding, build confidence, and reinforce learning through practical application.\"\n}",
      "status": "approved",
      "history": [
        {
          "ts": 1765231890.139465,
          "action": "manual_edit",
          "prompt": null,
          "old_text": null,
          "new_text": null
        },
        {
          "ts": 1765231768.183309,
          "action": "manual_edit",
          "prompt": null,
          "old_text": null,
          "new_text": null
        },
        {
          "ts": 1765231531.495661,
          "action": "init",
          "prompt": null,
          "old_text": null,
          "new_text": null
        },
        {
          "ts": 1765231061.612085,
          "action": "init",
          "prompt": null,
          "old_text": null,
          "new_text": null
        }
      ]
    }
  ],
  "total": 1
}
```

### GET /api/class-profiles/{profile_id}/export

#### Parameter
profile_id = "48ff7c21-edb6-4f56-bc56-441688c71626"

#### Response
```json
{
  "class_profile": {
    "class_id": "CS101_ProgrammingFundamentals_Intro",
    "profile": {
      "overall_profile": "This class is specifically designed to introduce fundamental programming concepts to an audience primarily composed of students with no prior programming experience. The core focus is on establishing foundational knowledge in Computer Science, particularly in the realm of programming fundamentals, through a hands-on, ground-up approach. Given the entirely novice experience level, the instructional approach will meticulously cater to absolute beginners, providing clear, step-by-step guidance, frequent opportunities for immediate coding practice, and simplified explanations. The class aims to build a strong base for future computational thinking and problem-solving skills, starting with essential constructs like variables and loops, with an emphasis on students gaining practical experience from their very first coding session.",
      "discipline_paragraph": "In Computer Science, specifically Programming Fundamentals, knowledge is primarily established through practical application, guided experimentation, and validating the functional correctness of computational models. Common reading content includes accessible conceptual explanations of algorithms, simplified code examples, and clear problem specifications. For novices, understanding execution flow often involves guided, non-linear code tracing, and learning to interpret documentation requires explicit instruction. Inquiry practices center on highly scaffolded debugging of small code snippets, validating solutions through simple test cases, applying basic algorithmic problem-solving strategies, and engaging in supportive peer critique of code. Cross-cutting concepts like systems and system models (viewing programs as interacting components), patterns (in basic algorithms), and cause and effect (input processing leading to output) are introduced with concrete, relatable examples. Disciplinary core ideas revolve around abstraction, data representation, and the design of algorithms, all presented with an emphasis on hands-on construction. Representational forms frequently encountered are code itself (in an initial programming language), simplified flowcharts, basic data structure diagrams, and tables for tracing variable states or test cases, used as tools for understanding practical execution.",
      "course_paragraph": "The 'Introduction to Programming' course aims to equip students with the ability to understand fundamental programming concepts and develop basic computational problem-solving skills through extensive hands-on practice. Key course learning goals include understanding the purpose and usage of variables, mastering the implementation and tracing of various loop constructs, and developing a foundational understanding of algorithmic thinking by building small programs. Central concepts covered in this course encompass variables, data types, operators, conditional statements, iterative structures (loops), basic input/output, and the structure of simple programs, all introduced with immediate opportunities for application. Key terms that students are expected to master include 'variable,' 'integer,' 'string,' 'boolean,' 'assignment,' 'operator,' 'conditional,' 'if/else,' 'loop,' 'for loop,' 'while loop,' 'iteration,' 'function,' 'syntax,' 'error,' and 'debug,' forming the essential vocabulary for early programming endeavors, which students will learn by actively using them in code.",
      "class_paragraph": "This specific class session focuses on laying the absolute groundwork for basic programming, aligning with the course's introductory objectives and catering to students with no prior experience. The primary learning goals for this class are to successfully define, declare, and initialize variables of different data types by writing and executing simple code, and to construct and trace basic 'for' and 'while' loops to solve iterative problems in a hands-on environment. Key concepts targeted in this session include variable declaration, variable assignment, common data types such as integers and strings, the fundamental structure of loop control, understanding iteration through practical examples, and identifying loop termination conditions through controlled experimentation. Important terms for this class build upon the course vocabulary and include 'declare,' 'initialize,' 'assign,' 'integer,' 'string,' 'float,' 'boolean,' 'for loop,' 'while loop,' 'iterate,' 'counter,' 'index,' and 'infinite loop,' ensuring students can articulate and practically apply these foundational programming elements through direct coding exercises."
    },
    "design_consideration": "Given the introductory nature and the absolute lack of prior student background, scaffolding must heavily prioritize clear, sequential instruction with abundant, immediate opportunities for hands-on coding practice and instant feedback. Visual aids like code execution visualizers, simplified flowcharts, and interactive diagrams illustrating variable states will be crucial to build accurate mental models of program execution from scratch. Scaffolds should include highly detailed, step-by-step guides for typing and tracing code, explicit explanations of common syntax errors with how to fix them, and structured problem-solving templates for very small tasks. Encouraging collaborative pair programming and providing access to robust yet simple debugging tools with explicit guidance on their use will support students in validating their knowledge and developing systematic inquiry practices. Explicitly connecting abstract concepts to concrete, executable code examples and highly relatable, simple 'real-world' problems will enhance understanding, build confidence, and reinforce learning through practical application."
  }
}
```

---

## Course Basic Info + Design Considerations Edit API

### POST /api/basic-info/edit

#### Request body
```json
{
  "course_id": "50f5ed51-648e-4711-96d4-5d02f31c029e",
  "discipline_info_json": {
    "discipline" : "Computer Science",
    "subdiscipline": "Programming Fundamentals"
  },
  "course_info_json": {
    "syllabus_overview": "Introduction to programming",
    "learning_objectives": ["Understand variables", "Master loops"]
  },
  "class_info_json": {
    "class_size": 25,
    "prerequisites": "None",
    "student_background": "Mixed experience levels"
  }
}
```

#### Response
```json
{
  "message": "Course basic info updated successfully",
  "course_id": "50f5ed51-648e-4711-96d4-5d02f31c029e"
}
```

### POST /api/design-considerations/edit

#### Request body
```json
{
  "course_id": "50f5ed51-648e-4711-96d4-5d02f31c029e",
  "design_consideration": "Multilingual learners need scaffolded support for technical reading. Focus on visual aids and step-by-step explanations."
}
```

#### Response
```json
{
  "success": true,
  "review": {
    "id": "48ff7c21-edb6-4f56-bc56-441688c71626",
    "text": "{\n  \"class_id\": \"CS101_ProgrammingFundamentals_Intro\",\n  \"profile\": {\n    \"overall_profile\": \"This class is specifically designed to introduce fundamental programming concepts to an audience primarily composed of students with no prior programming experience. The core focus is on establishing foundational knowledge in Computer Science, particularly in the realm of programming fundamentals, through a hands-on, ground-up approach. Given the entirely novice experience level, the instructional approach will meticulously cater to absolute beginners, providing clear, step-by-step guidance, frequent opportunities for immediate coding practice, and simplified explanations. The class aims to build a strong base for future computational thinking and problem-solving skills, starting with essential constructs like variables and loops, with an emphasis on students gaining practical experience from their very first coding session.\",\n    \"discipline_paragraph\": \"In Computer Science, specifically Programming Fundamentals, knowledge is primarily established through practical application, guided experimentation, and validating the functional correctness of computational models. Common reading content includes accessible conceptual explanations of algorithms, simplified code examples, and clear problem specifications. For novices, understanding execution flow often involves guided, non-linear code tracing, and learning to interpret documentation requires explicit instruction. Inquiry practices center on highly scaffolded debugging of small code snippets, validating solutions through simple test cases, applying basic algorithmic problem-solving strategies, and engaging in supportive peer critique of code. Cross-cutting concepts like systems and system models (viewing programs as interacting components), patterns (in basic algorithms), and cause and effect (input processing leading to output) are introduced with concrete, relatable examples. Disciplinary core ideas revolve around abstraction, data representation, and the design of algorithms, all presented with an emphasis on hands-on construction. Representational forms frequently encountered are code itself (in an initial programming language), simplified flowcharts, basic data structure diagrams, and tables for tracing variable states or test cases, used as tools for understanding practical execution.\",\n    \"course_paragraph\": \"The 'Introduction to Programming' course aims to equip students with the ability to understand fundamental programming concepts and develop basic computational problem-solving skills through extensive hands-on practice. Key course learning goals include understanding the purpose and usage of variables, mastering the implementation and tracing of various loop constructs, and developing a foundational understanding of algorithmic thinking by building small programs. Central concepts covered in this course encompass variables, data types, operators, conditional statements, iterative structures (loops), basic input/output, and the structure of simple programs, all introduced with immediate opportunities for application. Key terms that students are expected to master include 'variable,' 'integer,' 'string,' 'boolean,' 'assignment,' 'operator,' 'conditional,' 'if/else,' 'loop,' 'for loop,' 'while loop,' 'iteration,' 'function,' 'syntax,' 'error,' and 'debug,' forming the essential vocabulary for early programming endeavors, which students will learn by actively using them in code.\",\n    \"class_paragraph\": \"This specific class session focuses on laying the absolute groundwork for basic programming, aligning with the course's introductory objectives and catering to students with no prior experience. The primary learning goals for this class are to successfully define, declare, and initialize variables of different data types by writing and executing simple code, and to construct and trace basic 'for' and 'while' loops to solve iterative problems in a hands-on environment. Key concepts targeted in this session include variable declaration, variable assignment, common data types such as integers and strings, the fundamental structure of loop control, understanding iteration through practical examples, and identifying loop termination conditions through controlled experimentation. Important terms for this class build upon the course vocabulary and include 'declare,' 'initialize,' 'assign,' 'integer,' 'string,' 'float,' 'boolean,' 'for loop,' 'while loop,' 'iterate,' 'counter,' 'index,' and 'infinite loop,' ensuring students can articulate and practically apply these foundational programming elements through direct coding exercises.\"\n  },\n  \"design_consideration\": \"Multilingual learners need scaffolded support for technical reading. Focus on visual aids and step-by-step explanations.\"\n}",
    "status": "approved",
    "history": [
      {
        "ts": 1765233636.253791,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": null
      },
      {
        "ts": 1765231890.139465,
        "action": "manual_edit",
        "prompt": null,
        "old_text": null,
        "new_text": null
      },
      {
        "ts": 1765231768.183309,
        "action": "manual_edit",
        "prompt": null,
        "old_text": null,
        "new_text": null
      },
      {
        "ts": 1765231531.495661,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": null
      },
      {
        "ts": 1765231061.612085,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": null
      }
    ]
  }
}
```

---

## Reading Management

### POST /api/readings/batch-upload

#### Request body
```json
{
  "instructor_id": "56f0d519-b009-4c21-b75a-4e1496277f39",
  "course_id": "50f5ed51-648e-4711-96d4-5d02f31c029e",
  "readings": [
    {
      "title": "Introduction to Programming",
      "file_path": "readings/cs101/week1/intro_to_programming.pdf",
      "source_type": "uploaded"
    },
    {
      "title": "Variables and Data Types",
      "file_path": "readings/cs101/week1/variables_data_types.pdf",
      "source_type": "uploaded"
    }
  ]
}
```

#### Response

```json
{
  "success": true,
  "created_count": 2,
  "readings": [
    {
      "id": "89969bda-7927-4816-a403-93005bfb0fcc",
      "instructor_id": "56f0d519-b009-4c21-b75a-4e1496277f39",
      "course_id": "50f5ed51-648e-4711-96d4-5d02f31c029e",
      "title": "Introduction to Programming",
      "file_path": "readings/cs101/week1/intro_to_programming.pdf",
      "source_type": "uploaded",
      "created_at": "2025-12-08T22:45:36.456309+00:00"
    },
    {
      "id": "e2d99ed6-94a2-4c02-90ff-0d84d3e5046d",
      "instructor_id": "56f0d519-b009-4c21-b75a-4e1496277f39",
      "course_id": "50f5ed51-648e-4711-96d4-5d02f31c029e",
      "title": "Variables and Data Types",
      "file_path": "readings/cs101/week1/variables_data_types.pdf",
      "source_type": "uploaded",
      "created_at": "2025-12-08T22:45:36.864618+00:00"
    }
  ],
  "errors": []
}
```

### GET /api/readings/

#### Parameters
course_id = "50f5ed51-648e-4711-96d4-5d02f31c029e"
instructor_id = "56f0d519-b009-4c21-b75a-4e1496277f39"

#### Response

```json
{
  "readings": [
    {
      "id": "e2d99ed6-94a2-4c02-90ff-0d84d3e5046d",
      "instructor_id": "56f0d519-b009-4c21-b75a-4e1496277f39",
      "course_id": "50f5ed51-648e-4711-96d4-5d02f31c029e",
      "title": "Variables and Data Types",
      "file_path": "readings/cs101/week1/variables_data_types.pdf",
      "source_type": "uploaded",
      "created_at": "2025-12-08T22:45:36.864618+00:00"
    },
    {
      "id": "89969bda-7927-4816-a403-93005bfb0fcc",
      "instructor_id": "56f0d519-b009-4c21-b75a-4e1496277f39",
      "course_id": "50f5ed51-648e-4711-96d4-5d02f31c029e",
      "title": "Introduction to Programming",
      "file_path": "readings/cs101/week1/intro_to_programming.pdf",
      "source_type": "uploaded",
      "created_at": "2025-12-08T22:45:36.456309+00:00"
    }
  ],
  "total": 2
}
```

---

## Scaffold Generation

### POST /api/generate-scaffolds

#### Request body
```json
{
  "course_id": "50f5ed51-648e-4711-96d4-5d02f31c029e",
  "instructor_id": "56f0d519-b009-4c21-b75a-4e1496277f39",
  "week_number": 1,
  "session_title": "Week 1: Introduction to Programming",
  "reading_id": "89969bda-7927-4816-a403-93005bfb0fcc",
  "session_info_json": {
    "session_description": "Introduction to computer programming",
    "teaching_notes": "Focus on basic concepts"
  },
  "assignment_info_json": {
    "assignment_description": "Read chapter 1 and complete exercises",
    "due_date": "2024-01-22"
  },
  "assignment_goals_json": {
    "learning_objectives": [
      "Understand basic computer programming concepts",
      "Complete reading comprehension"
    ]
  },
  "class_profile": {
    "class_id": "CS101_ProgrammingFundamentals_Intro",
    "profile": "11th grade CS class with mixed prior experience",
    "design_consideration": "Multilingual learners need scaffolded support"
  },
  "reading_chunks": {
    "chunks": [
      {
        "chunk_id": "chunk_001",
        "text": "Data structures are fundamental...",
        "page_number": 1,
        "start_offset": 0,
        "end_offset": 500
      }
    ]
  },
  "reading_info": {
    "assignment_id": "assignment_001",
    "session_description": "Week 1 session",
    "assignment_description": "Read and annotate chapter 1",
    "assignment_objective": "Understand basic data structures"
  }
}
```

#### Response
```json
{
  "material_report_text": "**Material Analysis Report: Introduction to Data Structures**\n\n**Overall Summary**\n\nThis introductory section likely introduces the foundational concept of data structures, explaining their purpose, importance, and potentially a few basic examples. The primary goal would be to establish why organizing data is crucial in programming.\n\n*   **Key Ideas**: Data structures as fundamental tools for organizing and storing data efficiently. The 'why' behind using them (e.g., improving program performance, simplifying data management).\n*   **Likely Student Challenges**: Grasping the abstract nature of data organization, connecting abstract concepts to practical programming scenarios, understanding specialized vocabulary, and potentially distinguishing between data types and data structures. Students with less prior experience might struggle more with the conceptual leap from basic variables to structured data collections.\n*   **Instructional Opportunities**: Emphasize real-world analogies for data organization, provide early and concrete examples, encourage visualization, and connect the concepts directly to problems students might encounter or solve in programming.\n\n---\n\n**Section-Level Annotation: Chunk 001**\n\n**Section Reference**: Chunk 001 (page 1, starting \"Data structures are fundamental...\")\n\n**Content Type**: Conceptual (Assumed to be an introductory explanation of what data structures are and why they are important).\n\n**Cognitive Load Assessment**\n*   **Concept density**: Moderate. While \"Data structures\" is a single term, it encapsulates a significant underlying concept about data organization, efficiency, and algorithms. The omitted content (represented by `...`) likely introduces several key ideas and specialized terms.\n*   **First-encounter terms**: \"Data structure\" itself is likely a new term for many students, especially those with mixed prior experience. Other probable first-encounter terms (depending on the full text) include \"efficiency,\" \"algorithm,\" \"organization,\" and potentially names of specific basic structures (e.g., \"array,\" \"list,\" \"stack,\" \"queue\").\n*   **Abstraction level**: Starts at a general conceptual level (\"fundamental\") and likely moves to defining what a data structure is, potentially with abstract examples before concrete implementations.\n*   **Prerequisites assumed**: Basic understanding of programming concepts like variables, data types, and the general idea of writing code to solve problems. Given \"mixed prior experience\" in CS101, students might have varying comfort levels with these basics.\n*   **Working memory demand**: Moderate. Students need to hold the definition of a data structure, understand its purpose, and potentially begin to differentiate it from simple data types, all while processing new vocabulary.\n\n**Reading Pattern**\n*   **Linear**: Most likely a sequential exposition, moving from a broad statement of importance to definitions and perhaps initial examples.\n\n**Disciplinary Features**\n*   **Core disciplinary ideas**: This section directly introduces a core idea of computer science: the organized management of data. It lays the groundwork for understanding algorithms and program design.\n*   **Cross-cutting concepts**:\n    *   **Structure and Function**: How the organization (structure) of data impacts what can be done with it (function).\n    *   **Systems and System Models**: Data structures can be seen as small systems for organizing information.\n*   **Discourse markers**: The phrase \"Data structures are fundamental...\" immediately signals importance. Other likely markers (if present in `...`) would include \"essential for,\" \"consider this example,\" \"consequently,\" \"therefore,\" \"in contrast.\"\n*   **Knowledge validation**: N/A for an introductory definition section. The focus is on defining and explaining a concept, not proving it.\n*   **Epistemology**: N/A.\n*   **Inquiry practices**: N/A.\n*   **Representation transitions**: Unlikely in a purely conceptual text, unless simple diagrams or pseudo-code examples are introduced within the `...` content.\n\n**Notes (Instructional Considerations for the Teacher)**\n*   **Multilingual Learners (MLLs)**: Pre-teach key vocabulary (e.g., \"fundamental,\" \"structure,\" \"efficient,\" \"organize\"). Provide clear, concise definitions. Use visual aids or analogies to clarify abstract concepts. Allow for peer discussion and clarification.\n*   **Mixed Prior Experience**: Start with very concrete, real-world analogies (e.g., a filing cabinet, a grocery list, a stack of plates) before introducing technical definitions. Clearly differentiate between *what* data structures are (concepts) and *how* they are implemented (code, which will come later).\n*   **Engagement**: Encourage students to brainstorm scenarios where organizing data is crucial, even outside of programming, to build intuition for the 'why' before diving into the 'what' and 'how'.\n*   **Checking for Understanding**: Frequently pause to ask questions like \"What does 'fundamental' mean in this context?\" or \"Why is organizing data important for a computer program?\"",
  "focus_report_json": "```json\n{\n  \"focus_areas\": [\n    {\n      \"id\": \"intro_data_structures\",\n      \"fragment\": \"Data structures are fundamental...\",\n      \"rationales\": \"This segment introduces a core disciplinary idea in Computer Science (Rule 3) – the concept of data structures, which is foundational for all subsequent learning. It carries a high cognitive load (Rule 1) due to the abstract nature of 'data organization,' the introduction of a new, complex term, and the implicit need to understand its purpose (efficiency, management). Given the 'mixed prior experience' and 'multilingual learners' in the class profile, this initial exposure is prone to potential misconceptions (Rule 6), particularly in distinguishing data structures from basic data types. This concept is also directly aligned with the assignment objective (Rule 2).\",\n      \"priority_level\": \"High\",\n      \"suggested_activities\": [\n        \"Pre-teach key vocabulary (e.g., 'fundamental,' 'structure,' 'efficient,' 'organize') using simplified definitions and visual aids tailored for Multilingual Learners.\",\n        \"Facilitate a brief 'think-pair-share' activity asking students to brainstorm real-world examples of organized data (e.g., a grocery list, a bookshelf) to build intuition.\",\n        \"Use concrete, real-world analogies to explain the *purpose* of data structures before introducing technical definitions (e.g., 'Why do we organize books on a shelf instead of throwing them in a pile?').\",\n        \"Explicitly differentiate between 'data types' (like an integer or a string) and 'data structures' (ways to arrange multiple pieces of data) to address potential misconceptions.\",\n        \"Conduct a quick check for understanding: 'In your own words, what is a data structure, and why is it important in programming?'\"\n      ]\n    }\n  ]\n}\n```",
  "scaffold_json": "{\n  \"annotation_scaffolds\": [\n    {\n      \"fragment\": \"Data structures are fundamental...\",\n      \"text\": \"This phrase introduces a key idea in programming. In your own words, what do you think 'data structures' means? Why are they important for organizing information in computer programs?\"\n    }\n  ]\n}",
  "annotation_scaffolds_review": [
    {
      "id": "847a70f6-aee6-4475-9eec-94e24decd4a9",
      "fragment": "Data structures are fundamental...",
      "text": "This phrase introduces a key idea in programming. In your own words, what do you think 'data structures' means? Why are they important for organizing information in computer programs?",
      "status": "pending",
      "history": [
        {
          "ts": 1765238950.925124,
          "action": "init",
          "prompt": null,
          "old_text": null,
          "new_text": "This phrase introduces a key idea in programming. In your own words, what do you think 'data structures' means? Why are they important for organizing information in computer programs?"
        }
      ]
    }
  ],
  "session_id": "bfd7131f-db16-44f6-ba71-2c1df9f6621f",
  "reading_id": "89969bda-7927-4816-a403-93005bfb0fcc"
}
```

### POST /api/reading-scaffolds

#### Request body
```json
{
   "class_profile": {
    "class_id": "CS101_ProgrammingFundamentals_Intro",
    "profile": "11th grade CS class with mixed prior experience",
    "design_consideration": "Multilingual learners need scaffolded support"
  },
  "reading_chunks": {
    "chunks": [
      {
        "chunk_id": "chunk_001",
        "text": "Data structures are fundamental...",
        "page_number": 1,
        "start_offset": 0,
        "end_offset": 500
      }
    ]
  },
  "reading_info": {
    "assignment_id": "assignment_001",
    "session_description": "Week 1 session",
    "assignment_description": "Read and annotate chapter 1",
    "assignment_objective": "Understand basic data structures"
  },
  "session_id": "bfd7131f-db16-44f6-ba71-2c1df9f6621f",
  "reading_id": "89969bda-7927-4816-a403-93005bfb0fcc"
}
```

#### Response

```json
{
  "material_report_text": "## Analysis of Reading Material: Introduction to Data Structures\n\n**Class Profile:** CS101_ProgrammingFundamentals_Intro\n*   **Audience:** 11th-grade CS class with mixed prior experience.\n*   **Design Consideration:** Multilingual learners need scaffolded support.\n\n---\n\n### Overall Summary of Reading Chunk 001\n\nThis initial chunk likely serves as an overarching introduction to the concept of data structures, emphasizing their foundational importance in computer science and programming. It aims to set the stage for why students need to learn about different ways to organize and store data. Given its brevity, it probably lays the groundwork conceptually rather than diving into specific implementations.\n\n### Key Ideas\n\n*   **Fundamental Nature:** Data structures are a core, essential concept in computer science.\n*   **Purpose:** They provide organized ways to store and manage data.\n*   **Underlying Importance:** Implies their role in efficient problem-solving and software development.\n\n### Potential Student Challenges\n\n*   **Abstract Concept:** \"Data structures\" can feel abstract, especially if students haven't encountered specific examples or the practical problems they solve.\n*   **Mixed Prior Experience:** Students with less prior programming experience might struggle to connect this abstract concept to tangible coding tasks, while those with more experience might find the initial introduction too basic.\n*   **Vocabulary for Multilingual Learners:** Terms like \"fundamental,\" \"structures,\" \"organize,\" and \"manage\" might need explicit definition and contextualization for multilingual learners.\n*   **Lack of Concrete Examples:** Without immediate examples, the concept might remain vague, making it hard to grasp its significance.\n\n### Instructional Opportunities\n\n*   **Relate to Real-World Analogies:** Use everyday examples of organized data (e.g., address book, library catalog, shopping list, recipe steps) to make \"data structures\" relatable.\n*   **Connect to Prior Knowledge:** Ask students how they've organized data in previous programming tasks (e.g., using lists, variables) to build a bridge to more formal data structures.\n*   **Emphasize \"Why\":** Focus on the problems data structures solve (e.g., finding information quickly, storing related items together).\n*   **Pre-teach Vocabulary:** Explicitly introduce and define key terms, providing visual aids or examples for multilingual learners.\n*   **Interactive Discussion:** Facilitate a discussion on why \"organization\" is important, both in daily life and in programming.\n\n---\n\n### Section-Level Annotation\n\n**Section Reference:** Chunk 001 (p.1 – Initial Introduction)\n\n**Content Type:** Conceptual\n\n**Cognitive Load Assessment:**\n*   **Concept density:** Low to Moderate. While \"data structures\" is a significant concept, this chunk likely only introduces the overarching idea. Density could increase rapidly if examples or more complex definitions follow immediately.\n*   **First-encounter terms:** \"Data structures\" is the primary new term. Students might implicitly understand \"data\" and \"structure,\" but their combination in this specific disciplinary context is new.\n*   **Abstraction level:** General/Abstract. The statement \"Data structures are fundamental...\" is a high-level generalization. It lacks concrete examples or specific implementations, which keeps it abstract.\n*   **Prerequisites assumed:** Basic understanding of what \"data\" is in a programming context (variables, values). Implicitly, students should understand that programs manipulate information.\n*   **Working memory demand:** Low initially, as it's a declarative statement. However, if students are prompted to *think* about what this implies or how it relates to their prior experience, the demand can rise as they link new information with existing schemas.\n\n**Reading Pattern:** Linear (Sequential exposition)\n*   The chunk serves as an opening statement, setting the context for what follows. It's designed to be read sequentially as an introduction.\n\n**Disciplinary Features:**\n*   **Knowledge validation:** The statement \"Data structures are fundamental...\" asserts a core truth of the discipline. The \"why\" behind this fundamentality (e.g., efficiency, problem-solving, organizing complexity) is implicitly introduced or strongly hinted at.\n*   **Epistemology:** Emphasizes the *utility* and *necessity* of specific organizational methods in computing. It highlights a foundational principle that underpins practical programming.\n*   **Core disciplinary ideas:** This chunk introduces \"data organization\" and \"abstraction\" as core ideas that will be explored through data structures.\n*   **Discourse markers:** \"fundamental\" is a key discourse marker indicating the importance and foundational nature of the topic.\n\n**Notes:**\n*   As this is a very brief opening statement, its primary role is to establish the topic's importance and introduce the key term.\n*   The effectiveness of this chunk heavily depends on the immediate follow-up content. Without concrete examples, analogies, or problem scenarios, the \"fundamental\" nature might not resonate with all students, especially those with less prior experience.\n*   For multilingual learners, ensure that \"fundamental\" is clearly understood, perhaps by providing synonyms or examples of what it means for something to be fundamental in other contexts.",
  "focus_report_json": "```json\n{\n  \"focus_areas\": [\n    {\n      \"id\": \"chunk_001_data_structures_intro\",\n      \"fragment\": \"Data structures are fundamental...\",\n      \"rationales\": \"1. High Cognitive Load Segments: The concept of 'Data structures' is highly abstract and jargon-heavy for students with mixed prior experience. The initial introduction lacks concrete examples, increasing cognitive load. The term 'fundamental' itself can be ambiguous for multilingual learners without explicit definition.\\n2. Key Course/Session Alignment: This segment is directly tied to the assignment objective ('Understand basic data structures') and is the foundational concept for the entire week's session.\\n3. Disciplinary Core Ideas or Threshold Concepts: This introduces a core, foundational idea in computer science – data organization and abstraction – which is crucial for all future learning in the discipline. The text explicitly states it introduces 'core disciplinary ideas' and asserts a 'core truth'.\",\n      \"priority_level\": \"High\",\n      \"suggested_activities\": [\n        \"Initiate a brief discussion using real-world analogies (e.g., a recipe, a phone book, a library catalog) to illustrate how information is organized, making the abstract concept of 'data structures' more concrete.\",\n        \"Pre-teach and explicitly define key vocabulary like 'fundamental' and 'data structures' with multiple synonyms, visual aids, and examples tailored for multilingual learners.\",\n        \"Prompt students to share any prior experiences organizing data in programming (e.g., using lists or variables) to connect new knowledge to existing schemas.\",\n        \"Facilitate an interactive discussion focusing on the 'why': why is it important to organize data effectively in programming, and what problems do data structures solve?\"\n      ]\n    }\n  ]\n}\n```",
  "scaffold_json": "{\n  \"annotation_scaffolds\": [\n    {\n      \"fragment\": \"Data structures are fundamental...\",\n      \"text\": \"The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?\"\n    }\n  ]\n}",
  "annotation_scaffolds_review": [
    {
      "id": "c386abdf-5733-4f00-be0c-12d1e4abe93c",
      "fragment": "Data structures are fundamental...",
      "text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?",
      "status": "pending",
      "history": [
        {
          "ts": 1765239657.861233,
          "action": "init",
          "prompt": null,
          "old_text": null,
          "new_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?"
        }
      ]
    }
  ],
  "session_id": "bfd7131f-db16-44f6-ba71-2c1df9f6621f",
  "reading_id": "89969bda-7927-4816-a403-93005bfb0fcc"
}
```

### POST /api/annotation-scaffolds/{scaffold_id}/approve

#### Parameter
scaffold_id = c386abdf-5733-4f00-be0c-12d1e4abe93c

#### Response
```json
{
  "scaffold": {
    "id": "c386abdf-5733-4f00-be0c-12d1e4abe93c",
    "fragment": "Data structures are fundamental...",
    "text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?",
    "status": "approved",
    "history": [
      {
        "ts": 1765239657.861233,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?"
      },
      {
        "ts": 1765239874.457066,
        "action": "approve",
        "prompt": null,
        "old_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?",
        "new_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?"
      }
    ]
  }
}
```

### POST /api/annotation-scaffolds/{scaffold_id}/edit

#### Parameter
scaffold_id = c386abdf-5733-4f00-be0c-12d1e4abe93c

#### Request body
```json
{
  "new_text": "EDIT 1! The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming? EDIT 2!"
}
```

#### Response
```json
{
  "scaffold": {
    "id": "c386abdf-5733-4f00-be0c-12d1e4abe93c",
    "fragment": "Data structures are fundamental...",
    "text": "EDIT 1! The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming? EDIT 2!",
    "status": "approved",
    "history": [
      {
        "ts": 1765239657.861233,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?"
      },
      {
        "ts": 1765239874.457066,
        "action": "approve",
        "prompt": null,
        "old_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?",
        "new_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?"
      },
      {
        "ts": 1765239967.155022,
        "action": "manual_edit",
        "prompt": null,
        "old_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?",
        "new_text": "EDIT 1! The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming? EDIT 2!"
      }
    ]
  }
}
```

### POST /api/annotation-scaffolds/{scaffold_id}/llm_refine

#### Parameter
scaffold_id = "c386abdf-5733-4f00-be0c-12d1e4abe93c"

#### Request body
```json
{
  "prompt": "Make the explanation more accessible for beginners. Use simpler language and add examples."
}
```

### Response
```json
{
  "scaffold": {
    "id": "c386abdf-5733-4f00-be0c-12d1e4abe93c",
    "fragment": "Data structures are fundamental...",
    "text": "EDIT 1! The text states that 'Data structures are fundamental'. Imagine you're organizing your toys, books, or even your friends' phone numbers. You might put toys in a box, books on a shelf, or phone numbers in a specific list. What do you think a 'data structure' means in computer programming? (Think about how a computer might organize something like a list of high scores, or all the items in a shopping cart.) Why do you think organizing information in these specific ways is so important, or 'fundamental', for computers and programs to work well? (For example, how does organizing help a game quickly find a player's score, or an app show you the right information efficiently?) EDIT 2!",
    "status": "approved",
    "history": [
      {
        "ts": 1765239657.861233,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?"
      },
      {
        "ts": 1765239874.457066,
        "action": "approve",
        "prompt": null,
        "old_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?",
        "new_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?"
      },
      {
        "ts": 1765239967.155022,
        "action": "manual_edit",
        "prompt": null,
        "old_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?",
        "new_text": "EDIT 1! The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming? EDIT 2!"
      },
      {
        "ts": 1765240100.331841,
        "action": "llm_refine",
        "prompt": "LLM refinement",
        "old_text": "EDIT 1! The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming? EDIT 2!",
        "new_text": "EDIT 1! The text states that 'Data structures are fundamental'. Imagine you're organizing your toys, books, or even your friends' phone numbers. You might put toys in a box, books on a shelf, or phone numbers in a specific list. What do you think a 'data structure' means in computer programming? (Think about how a computer might organize something like a list of high scores, or all the items in a shopping cart.) Why do you think organizing information in these specific ways is so important, or 'fundamental', for computers and programs to work well? (For example, how does organizing help a game quickly find a player's score, or an app show you the right information efficiently?) EDIT 2!"
      }
    ]
  }
}
```

### POST /api/annotation-scaffolds/{scaffold_id}/reject

#### Parameter
scaffold_id = "c386abdf-5733-4f00-be0c-12d1e4abe93c"

#### Response
```json
{
  "scaffold": {
    "id": "c386abdf-5733-4f00-be0c-12d1e4abe93c",
    "fragment": "Data structures are fundamental...",
    "text": "EDIT 1! The text states that 'Data structures are fundamental'. Imagine you're organizing your toys, books, or even your friends' phone numbers. You might put toys in a box, books on a shelf, or phone numbers in a specific list. What do you think a 'data structure' means in computer programming? (Think about how a computer might organize something like a list of high scores, or all the items in a shopping cart.) Why do you think organizing information in these specific ways is so important, or 'fundamental', for computers and programs to work well? (For example, how does organizing help a game quickly find a player's score, or an app show you the right information efficiently?) EDIT 2!",
    "status": "rejected",
    "history": [
      {
        "ts": 1765239657.861233,
        "action": "init",
        "prompt": null,
        "old_text": null,
        "new_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?"
      },
      {
        "ts": 1765239874.457066,
        "action": "approve",
        "prompt": null,
        "old_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?",
        "new_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?"
      },
      {
        "ts": 1765239967.155022,
        "action": "manual_edit",
        "prompt": null,
        "old_text": "The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming?",
        "new_text": "EDIT 1! The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming? EDIT 2!"
      },
      {
        "ts": 1765240100.331841,
        "action": "llm_refine",
        "prompt": "LLM refinement",
        "old_text": "EDIT 1! The text states that 'Data structures are fundamental'. In your own words, what do you think a 'data structure' is? Why do you think organizing data in specific ways is 'fundamental' for computer programming? EDIT 2!",
        "new_text": "EDIT 1! The text states that 'Data structures are fundamental'. Imagine you're organizing your toys, books, or even your friends' phone numbers. You might put toys in a box, books on a shelf, or phone numbers in a specific list. What do you think a 'data structure' means in computer programming? (Think about how a computer might organize something like a list of high scores, or all the items in a shopping cart.) Why do you think organizing information in these specific ways is so important, or 'fundamental', for computers and programs to work well? (For example, how does organizing help a game quickly find a player's score, or an app show you the right information efficiently?) EDIT 2!"
      },
      {
        "ts": 1765240217.624031,
        "action": "reject",
        "prompt": null,
        "old_text": "EDIT 1! The text states that 'Data structures are fundamental'. Imagine you're organizing your toys, books, or even your friends' phone numbers. You might put toys in a box, books on a shelf, or phone numbers in a specific list. What do you think a 'data structure' means in computer programming? (Think about how a computer might organize something like a list of high scores, or all the items in a shopping cart.) Why do you think organizing information in these specific ways is so important, or 'fundamental', for computers and programs to work well? (For example, how does organizing help a game quickly find a player's score, or an app show you the right information efficiently?) EDIT 2!",
        "new_text": "EDIT 1! The text states that 'Data structures are fundamental'. Imagine you're organizing your toys, books, or even your friends' phone numbers. You might put toys in a box, books on a shelf, or phone numbers in a specific list. What do you think a 'data structure' means in computer programming? (Think about how a computer might organize something like a list of high scores, or all the items in a shopping cart.) Why do you think organizing information in these specific ways is so important, or 'fundamental', for computers and programs to work well? (For example, how does organizing help a game quickly find a player's score, or an app show you the right information efficiently?) EDIT 2!"
      }
    ]
  }
}
```

### POST /api/annotation-scaffolds/export

#### Parameters (all optional):
assignment_id = "assignment_001"
reading_id = "89969bda-7927-4816-a403-93005bfb0fcc"
session_id = "bfd7131f-db16-44f6-ba71-2c1df9f6621f"

#### Response
```json
{
  "annotation_scaffolds": [
    {
      "id": "c386abdf-5733-4f00-be0c-12d1e4abe93c",
      "fragment": "Data structures are fundamental...",
      "text": "EDIT 1! The text states that 'Data structures are fundamental'. Imagine you're organizing your toys, books, or even your friends' phone numbers. You might put toys in a box, books on a shelf, or phone numbers in a specific list. What do you think a 'data structure' means in computer programming? (Think about how a computer might organize something like a list of high scores, or all the items in a shopping cart.) Why do you think organizing information in these specific ways is so important, or 'fundamental', for computers and programs to work well? (For example, how does organizing help a game quickly find a player's score, or an app show you the right information efficiently?) EDIT 2!"
    }
  ]
}
```

---

## Perusall Integration

### POST /api/perusall/annotations
TBA