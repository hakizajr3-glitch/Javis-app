#!/usr/bin/env python3
"""Test Groq API"""
import requests
import os
from dotenv import load_dotenv
load_dotenv()

url = "https://api.groq.com/openai/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {os.getenv('GROQ_API_KEY')}",
    "Content-Type": "application/json"
}
payload = {
    "model": os.getenv('GROQ_MODEL'),
    "messages": [{"role": "user", "content": "What is 2+3? Answer in one word."}],
    "max_tokens": 50,
    "temperature": 0.7
}

print(f"Testing Groq with model: {os.getenv('GROQ_MODEL')}")
import time
start = time.time()
resp = requests.post(url, headers=headers, json=payload)
end = time.time()

print(f"Status: {resp.status_code}")
print(f"Time: {end-start:.2f}s")
if resp.status_code == 200:
    data = resp.json()
    print(f"✅ Response: {data['choices'][0]['message']['content']}")
else:
    print(f"❌ Error: {resp.text[:200]}")
