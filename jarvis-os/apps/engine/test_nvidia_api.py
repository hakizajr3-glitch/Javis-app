#!/usr/bin/env python3
"""
Test script to verify NVIDIA API connection
"""

import requests
import os
from dotenv import load_dotenv

load_dotenv()

# API Configuration
INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
API_KEY = os.getenv("NVIDIA_API_KEY")
MODEL = os.getenv("NVIDIA_MODEL", "meta/llama-4-scout-17b-16e-instruct")

print(f"Testing NVIDIA API...")
print(f"Model: {MODEL}")

if not API_KEY:
    print("❌ ERROR: NVIDIA_API_KEY not found in environment variables!")
    print("Please set NVIDIA_API_KEY in your .env file")
    exit(1)

print(f"API Key: {API_KEY[:20]}...")

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "Accept": "application/json"
}

payload = {
    "model": MODEL,
    "messages": [
        {"role": "system", "content": "You are J.A.R.V.I.S., a helpful AI assistant."},
        {"role": "user", "content": "What is 2+2? Answer in one word."}
    ],
    "max_tokens": 100,
    "temperature": 0.7,
    "top_p": 1.0,
    "stream": False
}

try:
    print("\nSending request...")
    response = requests.post(INVOKE_URL, headers=headers, json=payload, timeout=30)
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        if "choices" in data and len(data["choices"]) > 0:
            content = data["choices"][0]["message"]["content"]
            print(f"\n✅ SUCCESS! AI Response: {content}")
        else:
            print(f"⚠️ Unexpected response structure: {data}")
    else:
        print(f"❌ Error: {response.status_code}")
        print(f"Response: {response.text}")
        
except Exception as e:
    print(f"❌ Exception: {e}")
