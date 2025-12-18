#!/usr/bin/env python3
"""
直接从数据库读取 annotations 并测试转换和序列化
不需要调用 API，直接从数据库读取数据



使用方法:
1. 激活 venv: source venv/bin/activate
2. 运行脚本: python test_from_db_only.py [session_id]
"""
import os
import sys
import uuid
import json
from pathlib import Path
from fastapi.encoders import jsonable_encoder

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

# 检查是否在 venv 中
if not hasattr(sys, 'real_prefix') and not (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
    print("⚠️  警告: 可能没有激活 venv")
    print("请先运行: source venv/bin/activate")
    print("或者: python -m venv venv && source venv/bin/activate && pip install -r requirements.txt\n")

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel
from typing import List, Literal, Optional

load_dotenv()

# 定义模型，避免导入 main.py（会触发 workflow 依赖）
class HistoryEntryModel(BaseModel):
    ts: float
    action: Literal["init", "approve", "reject", "manual_edit", "llm_refine"]
    prompt: Optional[str] = None
    old_text: Optional[str] = None
    new_text: Optional[str] = None

class ReviewedScaffoldModel(BaseModel):
    id: str
    fragment: str
    text: str
    status: Literal["pending", "approved", "rejected"]
    history: List[HistoryEntryModel]

class ReadingScaffoldsResponse(BaseModel):
    material_report_text: str
    focus_report_json: str
    scaffold_json: str
    annotation_scaffolds_review: List[ReviewedScaffoldModel]
    session_id: Optional[str] = None
    reading_id: Optional[str] = None

def get_db_session():
    """直接创建数据库会话"""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL 环境变量未设置")
    
    try:
        engine = create_engine(database_url)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        return SessionLocal()
    except Exception as e:
        if "psycopg2" in str(e).lower() or "ModuleNotFoundError" in str(type(e).__name__):
            print("\n❌ 错误: 缺少 psycopg2 模块")
            print("请运行: pip install psycopg2-binary")
            print("或者: pip install -r requirements.txt")
            sys.exit(1)
        raise

def find_latest_session_with_annotations():
    """查找最近的有 annotations 的 session"""
    db = get_db_session()
    try:
        result = db.execute(text("""
            SELECT sa.session_id, COUNT(sa.id) as annotation_count, MAX(sa.created_at) as latest_created_at
            FROM scaffold_annotations sa
            GROUP BY sa.session_id
            ORDER BY MAX(sa.created_at) DESC
            LIMIT 1
        """))
        row = result.fetchone()
        if row:
            return str(row[0]), row[1]
        return None, 0
    finally:
        db.close()

def test_from_database(session_id_str: str = None):
    """从数据库读取 annotations 并测试转换和序列化"""
    if not session_id_str:
        print("查找最近的有 annotations 的 session...")
        session_id_str, count = find_latest_session_with_annotations()
        if not session_id_str:
            print("没有找到任何有 annotations 的 session")
            return
        print(f"找到 session: {session_id_str} (有 {count} 个 annotations)\n")
    
    try:
        session_id = uuid.UUID(session_id_str)
    except ValueError as e:
        print(f"错误: 无效的 UUID 格式 - {e}")
        return
    
    print("=" * 60)
    print("从数据库测试 Scaffold 转换和序列化")
    print("=" * 60)
    print(f"Session ID: {session_id}\n")
    
    db = get_db_session()
    
    try:
        # 直接从数据库读取 annotations 和 versions
        print("Step 1: 从数据库读取 annotations 和 versions...")
        query = text("""
            SELECT 
                sa.id,
                sa.session_id,
                sa.reading_id,
                sa.highlight_text,
                sa.current_content,
                sa.status,
                sa.start_offset,
                sa.end_offset,
                sa.page_number,
                sav.id as version_id,
                sav.version_number,
                sav.content as version_content,
                sav.change_type,
                sav.created_at as version_created_at
            FROM scaffold_annotations sa
            LEFT JOIN scaffold_annotation_versions sav ON sav.annotation_id = sa.id
            WHERE sa.session_id = :session_id
            ORDER BY sa.id, sav.version_number
        """)
        
        result = db.execute(query, {"session_id": session_id})
        rows = result.fetchall()
        
        if not rows:
            print("  没有找到 annotations")
            return
        
        # 组织数据
        annotations_dict = {}
        for row in rows:
            ann_id = str(row[0])
            if ann_id not in annotations_dict:
                annotations_dict[ann_id] = {
                    'id': ann_id,
                    'session_id': str(row[1]),
                    'reading_id': str(row[2]),
                    'highlight_text': row[3],
                    'current_content': row[4],
                    'status': row[5],
                    'start_offset': row[6],
                    'end_offset': row[7],
                    'page_number': row[8],
                    'versions': []
                }
            
            if row[9]:  # version_id exists
                annotations_dict[ann_id]['versions'].append({
                    'id': str(row[9]),
                    'version_number': row[10],
                    'content': row[11],
                    'change_type': row[12],
                    'created_at': row[13]
                })
        
        annotations_list = list(annotations_dict.values())
        print(f"  找到 {len(annotations_list)} 个 annotations\n")
        
        # Step 2: 手动构建 history 和转换格式
        print("Step 2: 转换为 API 响应格式...")
        api_review_objs = []
        
        for idx, ann in enumerate(annotations_list):
            print(f"  处理 annotation {idx + 1}/{len(annotations_list)}: {ann['id']}")
            
            # 构建 history
            history = []
            versions = sorted(ann['versions'], key=lambda v: v['version_number'])
            
            if not versions:
                # 如果没有版本，创建一个默认的 init 版本
                history.append({
                    "ts": 0.0,
                    "action": "init",
                    "prompt": None,
                    "old_text": None,
                    "new_text": ann['current_content'],
                })
            else:
                for i, version in enumerate(versions):
                    old_text = None
                    if i > 0:
                        old_text = versions[i - 1]['content']
                    
                    # Map change_type to action
                    change_type = version['change_type']
                    action_map = {
                        "pipeline": "init",
                        "manual_edit": "manual_edit",
                        "llm_edit": "llm_refine",
                        "accept": "approve",
                        "reject": "reject",
                        "revert": "revert",
                    }
                    action = action_map.get(change_type, "init")
                    
                    # Ensure action is valid
                    valid_actions = ["init", "approve", "reject", "manual_edit", "llm_refine"]
                    if action not in valid_actions:
                        print(f"    ⚠ 无效的 action '{action}'，使用 'init'")
                        action = "init"
                    
                    # Get timestamp
                    ts = 0.0
                    if version['created_at']:
                        ts = float(version['created_at'].timestamp())
                    
                    history_entry = {
                        "ts": ts,
                        "action": action,
                        "prompt": None,
                        "old_text": old_text,
                        "new_text": version['content'],
                    }
                    
                    if change_type == "llm_edit":
                        history_entry["prompt"] = "LLM refinement"
                    
                    history.append(history_entry)
            
            # Map status
            status_map = {
                "draft": "pending",
                "accepted": "approved",
                "rejected": "rejected",
            }
            api_status = status_map.get(ann['status'], ann['status'])
            
            # Build annotation dict
            annotation_dict = {
                "id": ann['id'],
                "fragment": ann['highlight_text'],
                "text": ann['current_content'],
                "status": api_status,
                "history": history,
            }
            
            print(f"    - fragment 长度: {len(ann['highlight_text'])}")
            print(f"    - text 长度: {len(ann['current_content'])}")
            print(f"    - status: {api_status}")
            print(f"    - history 数量: {len(history)}")
            
            # Validate history entries
            for hist_idx, hist_entry in enumerate(history):
                action = hist_entry.get("action")
                ts = hist_entry.get("ts")
                if action not in ["init", "approve", "reject", "manual_edit", "llm_refine"]:
                    print(f"      ⚠ history[{hist_idx}] 无效的 action: {action}")
                if not isinstance(ts, (int, float)):
                    print(f"      ⚠ history[{hist_idx}] ts 不是数字: {type(ts)}")
            
            # Try to create ReviewedScaffoldModel
            try:
                api_obj = ReviewedScaffoldModel(**annotation_dict)
                api_review_objs.append(api_obj)
                print(f"    ✓ 成功转换为 ReviewedScaffoldModel")
            except Exception as e:
                print(f"    ✗ 转换失败: {e}")
                print(f"    annotation_dict keys: {list(annotation_dict.keys())}")
                print(f"    history[0] keys: {list(history[0].keys()) if history else 'N/A'}")
                import traceback
                traceback.print_exc()
                raise
        
        print(f"\n✓ 成功转换 {len(api_review_objs)} 个 annotations\n")
        
        # Step 3: 构建响应对象
        print("Step 3: 构建响应对象...")
        try:
            response = ReadingScaffoldsResponse(
                material_report_text="Test material report from database",
                focus_report_json='{"focus_areas": []}',
                scaffold_json='{"annotation_scaffolds": []}',
                annotation_scaffolds_review=api_review_objs,
                session_id=str(session_id),
                reading_id=annotations_list[0]['reading_id'] if annotations_list else None,
            )
            print(f"    ✓ 响应对象构建成功")
            print(f"    - annotation_scaffolds_review 数量: {len(response.annotation_scaffolds_review)}")
        except Exception as e:
            print(f"    ✗ 响应对象构建失败: {e}")
            import traceback
            traceback.print_exc()
            raise
        
        # Step 4: 测试序列化
        print("\nStep 4: 测试响应序列化...")
        try:
            encoded = jsonable_encoder(response)
            
            print(f"Encoded response: {encoded}")
            response_dict = response.model_dump()
            print(f"    ✓ 响应序列化成功")
            print(f"    - 序列化后的 annotation_scaffolds_review 数量: {len(response_dict.get('annotation_scaffolds_review', []))}")
            
            # 尝试 JSON 序列化
            try:
                json_str = json.dumps(response_dict, default=str)

                print(json_str)
                print(f"    ✓ JSON 序列化成功 (长度: {len(json_str)} 字符)")
                print(f"\n✅ 所有测试通过！响应可以成功序列化。")
            except Exception as json_error:
                print(f"    ✗ JSON 序列化失败: {json_error}")
                import traceback
                traceback.print_exc()
                raise
                
        except Exception as serialize_error:
            print(f"    ✗ 响应序列化失败: {serialize_error}")
            import traceback
            traceback.print_exc()
            raise
        
    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 60)
    print("直接从数据库测试 Scaffold 转换和序列化")
    print("=" * 60)
    print("不需要调用 API，直接从数据库读取数据\n")
    
    session_id = sys.argv[1] if len(sys.argv) > 1 else None
    test_from_database(session_id)

