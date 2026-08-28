"""
AI Client - Unified interface for Groq, NVIDIA NIM and OpenAI APIs
"""

import os
import logging
from typing import AsyncGenerator, Optional
import aiohttp
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class AIClient:
    """
    Unified AI client supporting Groq (primary), NVIDIA NIM and OpenAI.
    Groq is fastest and recommended for real-time voice conversations.
    """

    # API endpoints
    GROQ_BASE_URL = "https://api.groq.com/openai/v1"
    NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

    def __init__(self):
        # Primary: Groq (fastest)
        self.groq_api_key = os.getenv("GROQ_API_KEY")
        self.groq_model = os.getenv(
            "GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct"
        )

        # Fallback: NVIDIA
        self.nvidia_api_key = os.getenv("NVIDIA_API_KEY")
        self.nvidia_model = os.getenv(
            "NVIDIA_MODEL", "meta/llama-4-scout-17b-16e-instruct"
        )

        # Fallback: OpenAI
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4o")

        # Determine provider
        if self.groq_api_key:
            self.provider = "groq"
            logger.info(f"Using Groq with model: {self.groq_model}")
        elif self.nvidia_api_key:
            self.provider = "nvidia"
            logger.info(f"Using NVIDIA with model: {self.nvidia_model}")
        elif self.openai_api_key:
            self.provider = "openai"
            logger.info(f"Using OpenAI with model: {self.openai_model}")
        else:
            raise ValueError(
                "No API key configured. Set GROQ_API_KEY, NVIDIA_API_KEY, or OPENAI_API_KEY"
            )

        logger.info(f"AI Client initialized with provider: {self.provider}")

    async def chat_completion(
        self,
        messages: list,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        stream: bool = False,
    ) -> str:
        """
        Get chat completion from AI.

        Args:
            messages: List of message dicts with 'role' and 'content'
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            stream: Whether to stream the response

        Returns:
            Generated text response
        """
        if self.provider == "groq":
            return await self._groq_chat(messages, temperature, max_tokens, stream)
        elif self.provider == "nvidia":
            return await self._nvidia_chat(messages, temperature, max_tokens, stream)
        else:
            return await self._openai_chat(messages, temperature, max_tokens, stream)

    async def _groq_chat(
        self, messages: list, temperature: float, max_tokens: int, stream: bool
    ) -> str:
        """Call Groq API - Fastest for real-time conversations"""

        url = f"{self.GROQ_BASE_URL}/chat/completions"

        headers = {
            "Authorization": f"Bearer {self.groq_api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.groq_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
            "top_p": 1.0,
        }

        logger.info(f"Calling Groq API with model: {self.groq_model}")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, headers=headers, json=payload, timeout=10
                ) as response:
                    logger.info(f"Groq API response status: {response.status}")

                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(
                            f"Groq API error: {response.status} - {error_text}"
                        )
                        raise Exception(f"Groq API error: {response.status}")

                    data = await response.json()
                    logger.info(f"Groq API response received")

                    if "choices" in data and len(data["choices"]) > 0:
                        content = data["choices"][0]["message"]["content"]
                        logger.info(f"Groq AI Response: {content[:100]}...")
                        return content
                    else:
                        logger.error(f"Unexpected Groq response: {data}")
                        return ""

        except Exception as e:
            logger.error(f"Error calling Groq API: {e}")
            # Fallback to NVIDIA if available
            if self.nvidia_api_key:
                logger.info("Falling back to NVIDIA")
                return await self._nvidia_chat(
                    messages, temperature, max_tokens, stream
                )
            raise

    async def _nvidia_chat(
        self, messages: list, temperature: float, max_tokens: int, stream: bool
    ) -> str:
        """Call NVIDIA NIM API"""

        url = f"{self.NVIDIA_BASE_URL}/chat/completions"

        headers = {
            "Authorization": f"Bearer {self.nvidia_api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.nvidia_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
            "top_p": 1.0,
        }

        logger.info(f"Calling NVIDIA API with model: {self.nvidia_model}")
        logger.info(f"Messages: {messages[:100]}...")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, headers=headers, json=payload, timeout=5
                ) as response:
                    logger.info(f"NVIDIA API response status: {response.status}")

                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(
                            f"NVIDIA API error: {response.status} - {error_text}"
                        )
                        if response.status == 403:
                            raise Exception(
                                f"API KEY INVALID (403): Your NVIDIA API key is invalid or expired. Get a new key at build.nvidia.com"
                            )
                        elif response.status == 401:
                            raise Exception(
                                f"API KEY UNAUTHORIZED (401): Your key doesn't have access to model {self.nvidia_model}"
                            )
                        else:
                            raise Exception(f"NVIDIA API error: {response.status}")

                    data = await response.json()
                    logger.info(f"NVIDIA API response received")

                    if "choices" in data and len(data["choices"]) > 0:
                        content = data["choices"][0]["message"]["content"]
                        logger.info(f"AI Response: {content[:100]}...")
                        return content
                    else:
                        logger.error(f"Unexpected NVIDIA response: {data}")
                        return ""

        except Exception as e:
            logger.error(f"Error calling NVIDIA API: {e}")
            # Try fallback to OpenAI if available
            if self.openai_api_key:
                logger.info("Falling back to OpenAI")
                return await self._openai_chat(
                    messages, temperature, max_tokens, stream
                )
            raise

    async def _openai_chat(
        self, messages: list, temperature: float, max_tokens: int, stream: bool
    ) -> str:
        """Call OpenAI API as fallback"""

        try:
            import openai

            client = openai.OpenAI(api_key=self.openai_api_key)

            response = client.chat.completions.create(
                model=self.openai_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
            )

            if stream:
                # Collect streaming response chunks
                content = ""
                for chunk in response:
                    if chunk.choices[0].delta.content:
                        content += chunk.choices[0].delta.content
                return content

            return response.choices[0].message.content

        except Exception as e:
            logger.error(f"Error calling OpenAI API: {e}")
            raise

    async def classify_intent(self, command: str) -> dict:
        """Classify user command intent using AI"""

        messages = [
            {
                "role": "system",
                "content": """You are an intent classifier. Analyze the user's command and classify it into one of these categories:
- file_create: creating new files/documents
- file_read: reading or opening files
- file_edit: modifying existing files
- file_delete: removing files
- file_organize: organizing or cleaning up folders
- browser_navigate: visiting websites
- browser_search: searching the web
- browser_extract: extracting data from web pages
- system_launch: opening applications
- system_info: checking system status
- complex_workflow: multi-step tasks or automation
- communication: sending messages or emails
- general_query: asking questions or seeking information

Return a JSON object with:
- intent: the category
- confidence: 0.0 to 1.0
- entities: key information extracted (paths, URLs, app names, etc.)
- complexity: low, medium, or high
""",
            },
            {"role": "user", "content": f"Classify this command: {command}"},
        ]

        try:
            result = await self.chat_completion(
                messages, temperature=0.3, max_tokens=500
            )
            import json

            return json.loads(result)
        except Exception as e:
            logger.error(f"Intent classification error: {e}")
            return {
                "intent": "general_query",
                "confidence": 0.5,
                "entities": {},
                "complexity": "low",
            }

    async def create_plan(self, goal: str, context: list) -> list:
        """Create execution plan from goal using AI"""

        messages = [
            {
                "role": "system",
                "content": """You are a task planning agent. Break down the user's goal into executable steps.
Each step should specify:
- agent: which agent to use (file, browser, system, communication)
- action: what to do
- params: required parameters

Return a JSON array of steps.""",
            },
            {
                "role": "user",
                "content": f"Create a plan for: {goal}\n\nContext: {context}",
            },
        ]

        try:
            result = await self.chat_completion(
                messages, temperature=0.4, max_tokens=1000
            )
            import json

            return json.loads(result)
        except Exception as e:
            logger.error(f"Plan creation error: {e}")
            return [
                {"agent": "system", "action": "execute", "params": {"command": goal}}
            ]

    async def generate_response(self, command: str, result: dict) -> str:
        """Generate human-friendly response"""

        messages = [
            {
                "role": "system",
                "content": "You are J.A.R.V.I.S., a helpful AI assistant. Provide a brief, professional response about task completion.",
            },
            {
                "role": "user",
                "content": f"The user asked: {command}\n\nResult: {result}\n\nProvide a brief response:",
            },
        ]

        try:
            return await self.chat_completion(messages, temperature=0.7, max_tokens=200)
        except Exception as e:
            logger.error(f"Response generation error: {e}")
            return "Task completed successfully."


# Global client instance
ai_client = None


async def get_ai_client() -> AIClient:
    """Get or create AI client singleton"""
    global ai_client
    if ai_client is None:
        ai_client = AIClient()
    return ai_client
