"""
Mock data for Perusall API integration.

This module provides mock data for development and testing when PERUSALL_MOCK_MODE=true.
It simulates the Perusall API responses for courses, readings, assignments, and annotations.
"""

# Mock courses data
MOCK_COURSES = [
    {
        "_id": "CS101",
        "name": "[MOCK] Introduction to Python"
    },
    {
        "_id": "CS201",
        "name": "[MOCK] Data Structures and Algorithms"
    },
    {
        "_id": "DR5mJTuukAD3pyLPn",
        "name": "InkSpire"
    },
    {
        "_id": "wb5jBzqbcK3HwXLyj",
        "name": "EDUC 5913"
    }, 
    {
        "_id": "ufn2ot8zMsdWLGopr", 
        "name": "EDUC 6144-001 202610 - Learning Sciences: Past, Present, Future" 
    }, 
    {
        "_id": "BBcXJhvrzGSMggsu4",
        "name": "Perusall-GSE Instance Testing" 
    }, 
    {
        "_id": "kRyxetmnADMiHXCpm", 
        "name": "EDEN 5050-002 202610 - Foundations of Teaching, Learning & Curriculum" 
    },
]


def get_mock_library_for_course(course_id: str):
    """
    Get mock library (readings/documents) for a given course.

    Args:
        course_id: The Perusall course ID

    Returns:
        List of reading/document objects with _id and name fields
    """
    # CS101 readings
    if course_id == "CS101":
        return [
            {
                "_id": "reading-cs101-1",
                "name": "[MOCK] Chapter 1: Programming Basics"
            },
            {
                "_id": "reading-cs101-2",
                "name": "[MOCK] Chapter 2: Variables and Data Types"
            },
            {
                "_id": "reading-cs101-3",
                "name": "[MOCK] Chapter 3: Control Flow"
            }
        ]

    # CS201 readings
    elif course_id == "CS201":
        return [
            {
                "_id": "reading-cs201-1",
                "name": "[MOCK] Chapter 1: Arrays and Lists"
            },
            {
                "_id": "reading-cs201-2",
                "name": "[MOCK] Chapter 2: Stacks and Queues"
            },
            {
                "_id": "reading-cs201-3",
                "name": "[MOCK] Chapter 3: Trees and Graphs"
            }
        ]

    # Unknown course
    else:
        return []


def get_mock_assignments_for_course(course_id: str):
    """
    Get mock assignments for a given course.

    Args:
        course_id: The Perusall course ID

    Returns:
        List of assignment objects with _id, name, and documents fields
    """
    # CS101 assignments
    if course_id == "CS101":
        return [
            {
                "_id": "assign-cs101-1",
                "name": "[MOCK] Week 1: Introduction to Programming",
                "documents": [
                    {"_id": "reading-cs101-1"}
                ]
            },
            {
                "_id": "assign-cs101-2",
                "name": "[MOCK] Week 2: Variables and Control Flow",
                "documents": [
                    {"_id": "reading-cs101-2"},
                    {"_id": "reading-cs101-3"}
                ]
            }
        ]

    # CS201 assignments
    elif course_id == "CS201":
        return [
            {
                "_id": "assign-cs201-1",
                "name": "[MOCK] Week 1: Linear Data Structures",
                "documents": [
                    {"_id": "reading-cs201-1"},
                    {"_id": "reading-cs201-2"}
                ]
            },
            {
                "_id": "assign-cs201-2",
                "name": "[MOCK] Week 2: Tree Data Structures",
                "documents": [
                    {"_id": "reading-cs201-3"}
                ]
            }
        ]

    # Unknown course
    else:
        return []


def get_mock_annotation_post_response(idx: int):
    """
    Get mock response for posting an annotation.

    Args:
        idx: Index of the annotation in the batch (for unique ID generation)

    Returns:
        Mock API response with annotation ID
    """
    return {
        "_id": f"mock-annotation-{idx}"
    }
