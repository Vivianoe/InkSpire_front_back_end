#!/usr/bin/env python3
"""
测试脚本：从数据库读取已创建的 annotations，测试转换和序列化
不需要调用 API，直接测试响应构建
"""
import os
import sys
import uuid
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
from database import get_db
from reading_scaffold_service import get_scaffold_annotations_by_session, scaffold_to_dict
from main import scaffold_to_model, ReadingScaffoldsResponse

load_dotenv()

def test_from_database(session_id_str: str):
    """从数据库读取 annotations 并测试转换和序列化"""
    print(f"[test_from_database] 开始，session_id_str: {session_id_str}")
    
    try:
        session_id = uuid.UUID(session_id_str)
        print(f"[test_from_database] UUID 解析成功: {session_id}")
    except ValueError as e:
        print(f"错误: 无效的 UUID 格式 - {e}")
        return
    
    print("=" * 60)
    print("从数据库测试 Scaffold 转换和序列化")
    print("=" * 60)
    print(f"Session ID: {session_id}\n")
    
    # 获取数据库会话
    print("[test_from_database] 连接数据库...")
    try:
        db = next(get_db())
        print("[test_from_database] 数据库连接成功")
    except Exception as db_error:
        print(f"[test_from_database] 数据库连接失败: {db_error}")
        import traceback
        traceback.print_exc()
        return
    
    try:
        # Step 1: 从数据库读取 annotations
        print("Step 1: 从数据库读取 annotations...")
        annotations = get_scaffold_annotations_by_session(db, session_id)
        print(f"  找到 {len(annotations)} 个 annotations\n")
        
        if not annotations:
            print("  没有找到 annotations，请先运行 API 创建一些 scaffolds")
            return
        
        # Step 2: 转换为 API 响应格式
        print("Step 2: 转换为 API 响应格式...")
        api_review_objs = []
        for idx, annotation in enumerate(annotations):
            print(f"  转换 annotation {idx + 1}/{len(annotations)}: {annotation.id}")
            try:
                annotation_dict = scaffold_to_dict(annotation)
                print(f"    scaffold_to_dict 结果键: {list(annotation_dict.keys())}")
                
                # 检查必需的字段
                required_fields = ["id", "fragment", "text", "status", "history"]
                missing_fields = [f for f in required_fields if f not in annotation_dict]
                if missing_fields:
                    print(f"    ⚠ 缺少字段: {missing_fields}")
                
                # 检查 history 字段
                history = annotation_dict.get("history", [])
                print(f"    history 数量: {len(history)}")
                for hist_idx, hist_entry in enumerate(history):
                    action = hist_entry.get("action")
                    ts = hist_entry.get("ts")
                    print(f"      history[{hist_idx}]: action={action}, ts={ts} (type: {type(ts)})")
                    if action not in ["init", "approve", "reject", "manual_edit", "llm_refine"]:
                        print(f"      ⚠ 无效的 action: {action}")
                    if not isinstance(ts, (int, float)):
                        print(f"      ⚠ ts 不是数字: {type(ts)}")
                
                api_obj = scaffold_to_model(annotation_dict)
                api_review_objs.append(api_obj)
                print(f"    ✓ 成功转换为 ReviewedScaffoldModel")
            except Exception as e:
                print(f"    ✗ 转换失败: {e}")
                print(f"    annotation_dict 内容: {json.dumps(annotation_dict, indent=2, default=str)}")
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
                reading_id=str(annotations[0].reading_id) if annotations else None,
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
            response_dict = response.model_dump()
            print(f"    ✓ 响应序列化成功")
            print(f"    - 序列化后的 annotation_scaffolds_review 数量: {len(response_dict.get('annotation_scaffolds_review', []))}")
            
            # 检查每个 review 对象
            for idx, review_obj in enumerate(response_dict.get('annotation_scaffolds_review', [])):
                history = review_obj.get('history', [])
                print(f"    Review obj {idx + 1}: history count = {len(history)}")
                for hist_idx, hist_entry in enumerate(history):
                    action = hist_entry.get('action')
                    ts = hist_entry.get('ts')
                    if action not in ["init", "approve", "reject", "manual_edit", "llm_refine"]:
                        print(f"      ⚠ Review obj {idx + 1} history[{hist_idx}] 无效的 action: {action}")
                    if not isinstance(ts, (int, float)):
                        print(f"      ⚠ Review obj {idx + 1} history[{hist_idx}] ts 不是数字: {type(ts)}")
            
            # 尝试 JSON 序列化
            try:
                json_str = json.dumps(response_dict, default=str)
                print(f"    ✓ JSON 序列化成功 (长度: {len(json_str)} 字符)")
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
        
        print("\n" + "=" * 60)
        print("✓ 所有测试通过！")
        print("=" * 60)
        print(f"\n响应对象可以成功序列化，问题可能在其他地方。")
        print(f"请检查后端日志中是否有其他错误信息。")
        
    except Exception as e:
        print("\n" + "=" * 60)
        print(f"✗ 测试失败: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 60)
    print("Scaffold 数据库测试脚本")
    print("=" * 60)
    
    if len(sys.argv) < 2:
        print("\n用法: python test_scaffold_from_db.py <session_id>")
        print("示例: python test_scaffold_from_db.py 550e8400-e29b-41d4-a716-446655440000")
        print("\n提示: 可以从数据库查询最近的 session_id:")
        print("  SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1;")
        print("\n或者查询有 annotations 的 session:")
        print("  SELECT DISTINCT session_id FROM scaffold_annotations ORDER BY created_at DESC LIMIT 1;")
        sys.exit(1)
    
    print(f"\n开始测试，session_id: {sys.argv[1]}\n")
    try:
        test_from_database(sys.argv[1])
    except KeyboardInterrupt:
        print("\n\n测试被用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n未捕获的错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

