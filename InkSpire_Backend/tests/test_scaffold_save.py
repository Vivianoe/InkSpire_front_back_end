#!/usr/bin/env python3
"""
测试脚本：直接使用缓存的 scaffolds 数据测试保存和转换流程
跳过 API 调用，直接测试后续步骤
"""
import os
import sys
import uuid
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
from database import get_db
from reading_scaffold_service import create_scaffold_annotation, scaffold_to_dict
from main import scaffold_to_model

load_dotenv()

# 模拟的 review_list 数据（从工作流输出）
mock_review_list = [
    {
        "id": "scaf001",
        "fragment": "A version control system serves the following purposes, among others. Version control enables multiple people to simultaneously work on a single project.",
        "text": "How might version control be useful in your education research projects?",
        "status": "pending",
        "history": [{"ts": 1234567890.0, "action": "init"}],
        "start_offset": None,
        "end_offset": None,
        "page_number": None,
    },
    {
        "id": "scaf002",
        "fragment": "Version control uses a repository (a database of program versions) and a working copy where you edit files.",
        "text": "What is the difference between a repository and a working copy?",
        "status": "pending",
        "history": [{"ts": 1234567890.0, "action": "init"}],
        "start_offset": None,
        "end_offset": None,
        "page_number": None,
    },
]

def test_scaffold_save_and_convert():
    """测试保存 scaffolds 到数据库并转换为 API 格式"""
    # 使用测试用的 session_id 和 reading_id
    # 你需要替换为实际存在的 ID
    session_id = uuid.UUID("00000000-0000-4000-8000-000000000001")
    reading_id = uuid.UUID("00000000-0000-4000-8000-000000000002")
    
    print("=" * 60)
    print("测试 Scaffold 保存和转换流程")
    print("=" * 60)
    print(f"Session ID: {session_id}")
    print(f"Reading ID: {reading_id}")
    print(f"Mock review_list 数量: {len(mock_review_list)}\n")
    
    # 获取数据库会话
    db = next(get_db())
    
    try:
        # Step 1: 保存 scaffolds 到数据库
        print("Step 1: 保存 scaffolds 到数据库...")
        saved_annotations = []
        for idx, scaf in enumerate(mock_review_list):
            print(f"  保存 scaffold {idx + 1}/{len(mock_review_list)}: {scaf['id']}")
            try:
                annotation = create_scaffold_annotation(
                    db=db,
                    session_id=session_id,
                    reading_id=reading_id,
                    generation_id=None,
                    highlight_text=scaf.get("fragment", ""),
                    current_content=scaf.get("text", ""),
                    start_offset=scaf.get("start_offset"),
                    end_offset=scaf.get("end_offset"),
                    page_number=scaf.get("page_number"),
                    status="draft",
                )
                saved_annotations.append(annotation)
                print(f"    ✓ 成功保存: {annotation.id}")
            except Exception as e:
                print(f"    ✗ 保存失败: {e}")
                import traceback
                traceback.print_exc()
                raise
        
        print(f"\n✓ 成功保存 {len(saved_annotations)} 个 annotations 到数据库\n")
        
        # Step 2: 转换为 API 响应格式
        print("Step 2: 转换为 API 响应格式...")
        api_review_objs = []
        for idx, annotation in enumerate(saved_annotations):
            print(f"  转换 annotation {idx + 1}/{len(saved_annotations)}: {annotation.id}")
            try:
                annotation_dict = scaffold_to_dict(annotation)
                print(f"    scaffold_to_dict 结果: {list(annotation_dict.keys())}")
                print(f"    - id: {annotation_dict.get('id')}")
                print(f"    - fragment: {annotation_dict.get('fragment', '')[:50]}...")
                print(f"    - text: {annotation_dict.get('text', '')[:50]}...")
                print(f"    - status: {annotation_dict.get('status')}")
                print(f"    - history: {len(annotation_dict.get('history', []))} 条记录")
                
                api_obj = scaffold_to_model(annotation_dict)
                api_review_objs.append(api_obj)
                print(f"    ✓ 成功转换")
            except Exception as e:
                print(f"    ✗ 转换失败: {e}")
                import traceback
                traceback.print_exc()
                raise
        
        print(f"\n✓ 成功转换 {len(api_review_objs)} 个 annotations\n")
        
        # Step 3: 验证响应格式
        print("Step 3: 验证响应格式...")
        for idx, api_obj in enumerate(api_review_objs):
            print(f"  API 对象 {idx + 1}:")
            print(f"    - id: {api_obj.id}")
            print(f"    - fragment: {api_obj.fragment[:50]}...")
            print(f"    - text: {api_obj.text[:50]}...")
            print(f"    - status: {api_obj.status}")
            print(f"    - history: {len(api_obj.history)} 条记录")
        
        print("\n" + "=" * 60)
        print("✓ 所有测试通过！")
        print("=" * 60)
        
    except Exception as e:
        print("\n" + "=" * 60)
        print(f"✗ 测试失败: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_scaffold_save_and_convert()
