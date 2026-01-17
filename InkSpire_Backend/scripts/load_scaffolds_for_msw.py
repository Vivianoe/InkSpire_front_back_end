#!/usr/bin/env python3
"""
Load real scaffold data from Supabase and output JSON for MSW mock database
"""
import os
import sys
import json
from pathlib import Path
from sqlalchemy import text
from dotenv import load_dotenv

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import SessionLocal

load_dotenv()

# Annotation version IDs from terminal output
ANNOTATION_VERSION_IDS = [
    "7a72c976-c37f-4aea-8e16-2756c175c2ea",
    "2ca40a85-c992-452b-990f-820aa1b4b674",
    "49cc393d-5c48-4cd0-a259-4e4b1a69e673",
    "e286f975-407e-4d4d-a40c-a5ca39c30f1a",
    "7780b731-3f28-4e72-95e8-717e96992cc4",
    "07b03434-6d9d-4306-8f27-fb623384a7b5",
    "2844094e-92d1-4916-be2d-6d0932c49b57",
    "3cf36e8f-4223-4ac2-980f-70a24808f03d",
]

def load_scaffolds():
    """Load scaffolds from database using annotation version IDs"""
    db = SessionLocal()
    
    try:
        # Build IN clause with placeholders
        placeholders = ','.join([f"'{vid}'" for vid in ANNOTATION_VERSION_IDS])
        
        # Query to get scaffold data by annotation version IDs
        query = text(f"""
            SELECT DISTINCT
                sa.id as annotation_id,
                sa.session_id,
                sa.reading_id,
                sa.highlight_text as fragment,
                sa.current_content as text,
                sa.status,
                sav.id as version_id,
                sav.version_number,
                sav.content as version_content,
                sav.change_type
            FROM scaffold_annotations sa
            INNER JOIN scaffold_annotation_versions sav ON sav.annotation_id = sa.id
            WHERE sav.id IN ({placeholders})
            ORDER BY sa.id, sav.version_number
        """)
        
        result = db.execute(query)
        rows = result.fetchall()
        
        if not rows:
            print("No scaffolds found for the given version IDs")
            return None
        
        # Group by annotation_id to get the latest version
        scaffolds_dict = {}
        for row in rows:
            ann_id = str(row[0])
            if ann_id not in scaffolds_dict:
                scaffolds_dict[ann_id] = {
                    "id": ann_id,
                    "session_id": str(row[1]),
                    "reading_id": str(row[2]),
                    "fragment": row[3] or "",
                    "text": row[4] or "",
                    "status": row[5] or "draft",
                    "version_id": str(row[6]),
                    "version_number": row[7],
                    "version_content": row[8] or "",
                    "change_type": row[9] or "generate",
                }
            else:
                # Keep the latest version
                if row[7] > scaffolds_dict[ann_id]["version_number"]:
                    scaffolds_dict[ann_id].update({
                        "version_id": str(row[6]),
                        "version_number": row[7],
                        "version_content": row[8] or "",
                        "change_type": row[9] or "generate",
                        "text": row[8] or row[4] or "",  # Use version content if available
                    })
        
        scaffolds = list(scaffolds_dict.values())
        
        # Get session and reading info
        if scaffolds:
            session_id = scaffolds[0]["session_id"]
            reading_id = scaffolds[0]["reading_id"]
            
            # Get course_id if available (from sessions table)
            course_query = text(f"""
                SELECT course_id 
                FROM sessions 
                WHERE id = '{session_id}'
            """)
            course_result = db.execute(course_query)
            course_row = course_result.fetchone()
            course_id = str(course_row[0]) if course_row else None
            
            output = {
                "course_id": course_id,
                "session_id": session_id,
                "reading_id": reading_id,
                "scaffolds": scaffolds,
            }
            
            return output
        
        return None
        
    except Exception as e:
        print(f"Error loading scaffolds: {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        db.close()

if __name__ == "__main__":
    print("Loading scaffolds from database...")
    data = load_scaffolds()
    
    if data:
        output_file = Path(__file__).parent.parent / "scaffolds_for_msw.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"\n✅ Loaded {len(data['scaffolds'])} scaffolds")
        print(f"📁 Saved to: {output_file}")
        print(f"\nSession ID: {data['session_id']}")
        print(f"Reading ID: {data['reading_id']}")
        print(f"Course ID: {data.get('course_id', 'N/A')}")
        print("\nScaffolds:")
        for i, scaffold in enumerate(data['scaffolds'], 1):
            print(f"  {i}. ID: {scaffold['id']}")
            print(f"     Fragment: {scaffold['fragment'][:50]}...")
            print(f"     Status: {scaffold['status']}")
    else:
        print("❌ Failed to load scaffolds")
