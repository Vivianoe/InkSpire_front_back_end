#!/usr/bin/env python3
"""
检查环境变量配置
"""
import os
from dotenv import load_dotenv
from urllib.parse import urlparse

load_dotenv()

print("=" * 50)
print("环境变量检查")
print("=" * 50)

DATABASE_URL = os.getenv("DATABASE_URL")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

print("\n1. SUPABASE_URL:")
print(f"   {SUPABASE_URL or '❌ 未设置'}")

print("\n2. SUPABASE_SERVICE_ROLE_KEY:")
if SUPABASE_SERVICE_ROLE_KEY:
    print(f"   ✅ 已设置 (长度: {len(SUPABASE_SERVICE_ROLE_KEY)})")
    if "your_" in SUPABASE_SERVICE_ROLE_KEY or "here" in SUPABASE_SERVICE_ROLE_KEY:
        print("   ⚠️  看起来还是占位符，请替换为实际值")
else:
    print("   ❌ 未设置")

print("\n3. DATABASE_URL:")
if DATABASE_URL:
    print(f"   ✅ 已设置")
    # 解析 URL 检查格式
    try:
        parsed = urlparse(DATABASE_URL)
        print(f"   协议: {parsed.scheme}")
        print(f"   主机: {parsed.hostname}")
        print(f"   端口: {parsed.port}")
        print(f"   数据库: {parsed.path[1:] if parsed.path else 'N/A'}")
        
        # 检查密码
        if parsed.password:
            if "[YOUR_PASSWORD]" in DATABASE_URL or "YOUR_PASSWORD" in DATABASE_URL:
                print("   ⚠️  密码还是占位符，请替换为实际密码")
            else:
                print(f"   密码: {'*' * len(parsed.password)} (已设置)")
        else:
            print("   ⚠️  未检测到密码")
            
        # 检查特殊字符
        if any(char in DATABASE_URL for char in ['#', '$', "'", ']']):
            print("   ⚠️  URL 中可能包含特殊字符，需要 URL 编码")
            print("   建议：如果密码包含特殊字符，使用 URL 编码")
            
    except Exception as e:
        print(f"   ❌ URL 格式错误: {e}")
else:
    print("   ❌ 未设置")

print("\n" + "=" * 50)
print("\n💡 提示:")
print("1. DATABASE_URL 格式应该是:")
print("   postgresql://postgres:密码@db.jrcstgmtxnavrkbdcdig.supabase.co:5432/postgres")
print("\n2. 如果密码包含特殊字符，需要 URL 编码:")
print("   @ → %40")
print("   # → %23")
print("   $ → %24")
print("   & → %26")
print("   ' → %27")
print("\n3. 获取数据库密码:")
print("   Supabase Dashboard → Settings → Database → Database password")


