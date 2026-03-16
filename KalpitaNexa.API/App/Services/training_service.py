"""
Service for the Training module.
Contains the orchestration logic for Phase 1: transcript → summary + Q&A.

Place at: KalpitaNexa/KalpitaNexa.API/App/Services/training_service.py

Ported/adapted logic from KalpitaInterviewAI C# transcript_processor reference.
"""

import re
import json
import logging
from typing import Dict, Any, Optional
from .. import config
from openai import AzureOpenAI

from ..Managers.training_sharepoint_manager import TrainingSharePointManager

from ..Utils.prompts import TRAINING_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_CHARS = 120_000   # guard against token limit (mirrors C# implementation)

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

def _build_user_prompt(transcript: str) -> str:
    """
    Build the user prompt with the transcript and detailed formatting instructions.
    """
    return f"""
You are given the transcript of an employee training video.

ANALYZE the transcript and identify ALL major topics discussed.

OUTPUT FORMAT (strict JSON structure):
{{
  "summary": "Topic-wise summary with headings and bullet points...",
  "questions": [
    {{
      "topic": "Topic Name (must match a topic from the summary)",
      "question": "Full question text"
    }}
  ]
}}

SUMMARY FORMATTING REQUIREMENTS:
- Organize by topic headings
- Format example:
  
  **Topic 1: [Topic Name]**
  - Key point about this topic
  - Another important point with specific details
  - Concrete example or tool mentioned
  
  **Topic 2: [Another Topic Name]**
  - Detailed point here
  - Specific workflow or process explained
  
- Each topic must have a clear heading
- Use bullet points (- or •) under each topic
- Be specific and detailed (not vague)
- Include concrete examples, tools, features mentioned
- Balance between clarity and completeness

QUESTIONS REQUIREMENTS:
- Group questions by topic
- Every topic must have at least 2-3 questions
- Generate as many questions as needed to cover ALL content
- NO LIMIT on question count — prioritize complete coverage
- Mix question types:
  • Multiple choice (when appropriate)
  • Direct questions
  • Scenario-based questions
- NO duplicate or rephrased questions
- Test both concepts AND practical application

CRITICAL:
- Return ONLY the JSON
- No markdown code blocks
- No explanations
- Summary must use topic headings
- Questions must reference the exact topic name from summary

TRANSCRIPT:
{transcript}
""".strip()


# ---------------------------------------------------------------------------
# Prompts — Quiz Generation
# ---------------------------------------------------------------------------

QUIZ_SYSTEM_PROMPT = """
You are an expert quiz generator for corporate training assessments.

Your task is to generate multiple-choice questions (MCQs) on a given topic,
based on knowledge from corporate AI/tech training sessions.

RULES:
- Generate exactly 10-12 MCQ questions
- Each question must have exactly 4 options labeled A, B, C, D
- Only ONE option is correct
- Questions must test genuine understanding, not just memorization
- Mix difficulty: 30% easy, 50% medium, 20% hard
- Include a brief explanation (1-2 sentences) for why the correct answer is right
- Questions must be clearly related to the given topic
- Do NOT generate trick questions or ambiguous wording
- You are provided summary material and existing questions purely as REFERENCE
- Use the summary to understand the topic scope and depth
- Use the existing questions to understand the level and style expected
- Do NOT reuse, copy, or rephrase any existing questions
- Generate completely original questions of your own

OUTPUT FORMAT (strict JSON — no markdown, no preamble):
{
  "questions": [
    {
      "question": "Full question text here?",
      "options": ["A) Option one", "B) Option two", "C) Option three", "D) Option four"],
      "correct_answer": "A",
      "explanation": "Brief explanation of why A is correct.",
      "topic": "The topic name"
    }
  ]
}

CRITICAL:
- Return ONLY valid JSON
- No markdown code blocks
- correct_answer must be exactly one of: "A", "B", "C", "D"
- options array must have exactly 4 items, each starting with "A) ", "B) ", "C) ", "D) "
""".strip()


def _build_quiz_prompt(topic: str, context: str) -> str:
    return f"""
Generate 10-12 original MCQ questions on the topic: "{topic}"

The following reference material is provided to guide your understanding of scope and depth.
DO NOT reuse or rephrase any existing questions. Generate entirely your own.

{context}

Return ONLY the JSON. No markdown, no preamble.
""".strip()

# ---------------------------------------------------------------------------
# Helpers (ported from C# transcript_processor reference)
# ---------------------------------------------------------------------------

def _sanitize(content: str) -> str:
    """Remove control characters, normalize line endings, cap length."""
    if not content:
        return content
    content = content.replace('\r\n', '\n').replace('\r', '\n')
    content = ''.join(c for c in content if ord(c) >= 32 or c in '\n\t')
    content = content.replace('\u200B', '')
    return content[:MAX_CHARS]


def _clean_json_response(text: str) -> str:
    """Strip markdown fences and extract raw JSON (mirrors C# CleanUpJsonWrapper)."""
    text  = text.strip()
    match = re.match(
        r'^\s*```(?:json)?\s*(.*?)\s*```\s*$', text, re.DOTALL | re.IGNORECASE
    )
    if match:
        text = match.group(1).strip()

    obj_start, obj_end = text.find('{'), text.rfind('}')
    if obj_start >= 0 and obj_end > obj_start:
        return text[obj_start:obj_end + 1]

    arr_start, arr_end = text.find('['), text.rfind(']')
    if arr_start >= 0 and arr_end > arr_start:
        return text[arr_start:arr_end + 1]

    return ""

# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class TrainingService:
    """
    Phase 1: reads transcript from SharePoint, calls Azure OpenAI,
    formats outputs, and writes summary.docx + qa.docx back to SharePoint.
    """

    def __init__(
        self,
        openai_client: AzureOpenAI,
        training_sp_manager: TrainingSharePointManager,
        training_manager=None,
    ):
        self.openai_client = openai_client
        self.sp = training_sp_manager
        self.training_manager = training_manager
        self.deployment_name = "gpt-4.1"

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def process_phase1(self, day_folder_name: str) -> Dict[str, Any]:
        """
        Full Phase 1 pipeline for one Day folder.
        Idempotent – skips steps whose outputs already exist.
        """
        # 1. Check processing_complete.json – skip everything if already done
        status = self.sp.read_processing_status(day_folder_name)
        if status and status.get("phase1Completed"):
            return {
                "day_folder_name": day_folder_name,
                "summary_uploaded": False,
                "qa_uploaded": False,
                "questions_count": 0,
                "message": "Phase 1 already completed. Skipping.",
            }

        # 2. Per-file idempotency checks
        summary_exists = self.sp.output_file_exists(day_folder_name, "summary.docx")
        qa_exists      = self.sp.output_file_exists(day_folder_name, "qa.docx")

        if summary_exists and qa_exists:
            self.sp.upload_processing_status(day_folder_name, phase1=True, phase2=False)
            return {
                "day_folder_name": day_folder_name,
                "summary_uploaded": False,
                "qa_uploaded": False,
                "questions_count": 0,
                "message": "Both outputs already exist. Marked phase1 complete.",
            }

        # 3. Read and sanitize transcript
        transcript_raw   = self.sp.read_transcript(day_folder_name)
        if not transcript_raw or len(transcript_raw.strip()) < 50:
            raise ValueError("Transcript is empty or too short to process.")
        transcript_clean = _sanitize(transcript_raw)

        # 4. Call Azure OpenAI
        ai_result = self._call_openai(transcript_clean)
        summary_text = ai_result.get("summary", "")
        questions    = ai_result.get("questions", [])

        # 5. Upload summary.docx if not already there
        if not summary_exists:
            self._upload_summary(day_folder_name, summary_text)

        # 6. Upload qa.docx if not already there
        if not qa_exists:
            self._upload_qa(day_folder_name, questions)

        # 7. Mark phase1 complete
        self.sp.upload_processing_status(day_folder_name, phase1=True, phase2=False)

        return {
            "day_folder_name": day_folder_name,
            "summary_uploaded": not summary_exists,
            "qa_uploaded": not qa_exists,
            "questions_count": len(questions),
            "message": "Phase 1 completed successfully.",
        }

    # ------------------------------------------------------------------
    # Status check (no AI calls)
    # ------------------------------------------------------------------

    async def get_status(self, day_folder_name: str) -> Dict[str, Any]:
        status = self.sp.read_processing_status(day_folder_name)
        return {
            "day_folder_name": day_folder_name,
            "phase1_completed": bool(status and status.get("phase1Completed")),
            "phase2_completed": bool(status and status.get("phase2Completed")),
            "processed_at":     status.get("processedAt") if status else None,
            "summary_exists":   self.sp.output_file_exists(day_folder_name, "summary.docx"),
            "qa_exists":        self.sp.output_file_exists(day_folder_name, "qa.docx"),
        }

    async def save_quiz_result(self, user_id: str, user_email: str, topic: str, score: int, total_questions: int, tenant_id: str = None, app_id: int = None, questions_json: str = None, prompt_used: str = None) -> Dict[str, Any]:
        if not self.training_manager:
            return {"success": False, "error": "Training manager not available."}
        return self.training_manager.save_quiz_result(user_id, user_email, topic, score, total_questions, tenant_id, app_id, questions_json, prompt_used)

    async def get_quiz_results(self, tenant_id: str = None) -> Dict[str, Any]:
        if not self.training_manager:
            return {"success": False, "error": "Training manager not available."}
        return self.training_manager.get_quiz_results(tenant_id)



    async def get_all_statuses(self) -> Dict[str, Any]:
        folders = self.sp.list_day_folders()
        results = []
        for folder_name in folders:
            status = self.sp.read_processing_status(folder_name)
            phase1_completed = bool(status and status.get("phase1Completed"))
            audio_exists = bool(status and status.get("audioCompleted"))
            shorts_exists = self.sp.file_exists(folder_name, "shorts/shorts_metadata.json")
            results.append({
                "day_folder_name": folder_name,
                "phase1_completed": phase1_completed,
                "phase2_completed": bool(status and status.get("phase2Completed")),
                "audio_exists": audio_exists,
                "shorts_exists": shorts_exists,
                "processed_at": status.get("processedAt") if status else None,
                "summary_exists": phase1_completed,
                "qa_exists": phase1_completed,
            })
        return {"folders": results, "total": len(results)}

    

    # ------------------------------------------------------------------
    # Reprocess (force regeneration)
    # ------------------------------------------------------------------

    async def reprocess_phase1(self, day_folder_name: str) -> Dict[str, Any]:
        """
        Force reprocessing of Phase 1 by deleting existing outputs first.
        Useful when prompt/rules have been updated and you want fresh outputs.
        """
        # Delete existing outputs from SharePoint
        self.sp.delete_output_files(day_folder_name)
        logger.info(f"Deleted existing outputs for '{day_folder_name}' to force reprocessing")

        # Now process fresh
        return await self.process_phase1(day_folder_name)
    
    

    # ------------------------------------------------------------------
    # Generate individual outputs (admin-triggered from Video Analytics)
    # ------------------------------------------------------------------

    async def generate_summary(self, day_folder_name: str) -> Dict[str, Any]:
        """Generate only summary.docx for a Day folder."""
        summary_exists = self.sp.output_file_exists(day_folder_name, "summary.docx")
        if summary_exists:
            return {
                "day_folder_name": day_folder_name,
                "summary_uploaded": False,
                "message": "Summary already exists.",
            }

        transcript_raw = self.sp.read_transcript(day_folder_name)
        if not transcript_raw or len(transcript_raw.strip()) < 50:
            raise ValueError("Transcript is empty or too short to process.")
        transcript_clean = _sanitize(transcript_raw)

        ai_result = self._call_openai(transcript_clean)
        summary_text = ai_result.get("summary", "")
        self._upload_summary(day_folder_name, summary_text)

        # Mark phase1 complete if both files now exist
        qa_exists = self.sp.output_file_exists(day_folder_name, "qa.docx")
        if qa_exists:
            self.sp.upload_processing_status(day_folder_name, phase1=True, phase2=False)

        return {
            "day_folder_name": day_folder_name,
            "summary_uploaded": True,
            "message": "Summary generated successfully.",
        }

    async def generate_qa(self, day_folder_name: str) -> Dict[str, Any]:
        """Generate only qa.docx for a Day folder."""
        qa_exists = self.sp.output_file_exists(day_folder_name, "qa.docx")
        if qa_exists:
            return {
                "day_folder_name": day_folder_name,
                "qa_uploaded": False,
                "questions_count": 0,
                "message": "Q&A already exists.",
            }

        transcript_raw = self.sp.read_transcript(day_folder_name)
        if not transcript_raw or len(transcript_raw.strip()) < 50:
            raise ValueError("Transcript is empty or too short to process.")
        transcript_clean = _sanitize(transcript_raw)

        ai_result = self._call_openai(transcript_clean)
        questions = ai_result.get("questions", [])
        self._upload_qa(day_folder_name, questions)

        # Mark phase1 complete if both files now exist
        summary_exists = self.sp.output_file_exists(day_folder_name, "summary.docx")
        if summary_exists:
            self.sp.upload_processing_status(day_folder_name, phase1=True, phase2=False)

        return {
            "day_folder_name": day_folder_name,
            "qa_uploaded": True,
            "questions_count": len(questions),
            "message": "Q&A generated successfully.",
        }
    
    # -------------------------------------------------------------------------
    # Phase 2 — Video Shorts Generation
    # -------------------------------------------------------------------------

    async def generate_shorts(self, day_folder_name: str, force_reclean: bool = False) -> Dict[str, Any]:
        """
        Full Phase 2 pipeline for a Day folder:
          1. Clean transcript (or load cached cleaned version)
          2. GPT identifies up to 10 key topic clusters with timestamps
          3. Download video from SharePoint
          4. FFmpeg cuts each clip
          5. Upload shorts to output/shorts/ on SharePoint
          6. Return metadata
        """
        import os
        import json
        import tempfile
        import subprocess
        from ..Utils.transcript_cleaner import TranscriptCleaner
        from ..Utils.prompts import SHORTS_IDENTIFICATION_PROMPT

        logger.info(f"[Shorts] Starting for: {day_folder_name}")

        # --- Step 1: Get cleaned transcript (cached or fresh) ---
        cleaned_text = None
        if not force_reclean:
            cleaned_text = self.sp.read_cleaned_transcript(day_folder_name)

        if cleaned_text is None:
            logger.info(f"[Shorts] No cached cleaned transcript — running cleaner")
            raw_transcript = self.sp.read_transcript(day_folder_name)
            if not raw_transcript:
                raise FileNotFoundError(f"No transcript found in '{day_folder_name}'")
            logger.info(f"[Shorts] Transcript preview: {repr(raw_transcript[:300])}")
            
            
            # Normalize line endings and pre-parse directly (bypasses .pyc cache issue)
            import re as _re
            raw_transcript = raw_transcript.replace('\r\n', '\n').replace('\r', '\n')
            test_parts = _re.split(r'\n+(\d+:\d{2}(?::\d{2})?)\n', raw_transcript)
            logger.info(f"[Shorts] Direct parse test: {(len(test_parts)-1)//2} segments found")

            cleaner = TranscriptCleaner(self.openai_client, self.deployment_name)
            clean_segments = await cleaner.clean(raw_transcript)

            # Serialize for caching — store as JSON lines
            cleaned_text = json.dumps([
                {
                    "start_seconds": s.start_seconds,
                    "end_seconds": s.end_seconds,
                    "cleaned_text": s.cleaned_text
                }
                for s in clean_segments
            ], indent=2)
            self.sp.upload_cleaned_transcript(day_folder_name, cleaned_text)
        else:
            logger.info(f"[Shorts] Using cached cleaned transcript")

        segments = json.loads(cleaned_text)

        # --- Step 2: GPT identifies key topic clusters ---
        logger.info(f"[Shorts] Asking GPT to identify key segments ({len(segments)} segments)")
        # Sample segments evenly — send max 200 to GPT to avoid token limits
        max_segments = 200
        if len(segments) > max_segments:
            step = len(segments) // max_segments
            sampled = segments[::step][:max_segments]
        else:
            sampled = segments

        prompt = SHORTS_IDENTIFICATION_PROMPT.replace(
        "{segments_json}",
        json.dumps(sampled, indent=2)
    )

        response = self.openai_client.chat.completions.create(
            model=self.deployment_name,
            temperature=0.2,
            max_tokens=2000,
            messages=[
                {"role": "system", "content": "You are a training video editor. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ]
        )

        raw_json = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        raw_json = re.sub(r'^```(?:json)?\s*', '', raw_json, flags=re.MULTILINE)
        raw_json = re.sub(r'\s*```$', '', raw_json, flags=re.MULTILINE)
        gpt_result = json.loads(raw_json)
        shorts_plan = gpt_result.get("shorts", [])[:10] # enforce max 10
        # Hard enforce max 600s duration — GPT sometimes ignores instructions
        shorts_plan = [s for s in shorts_plan if (s["end_seconds"] - s["start_seconds"]) <= 600]

        if not shorts_plan:
            return {
                "day_folder_name": day_folder_name,
                "shorts_generated": 0,
                "shorts": [],
                "message": "GPT found no key segments worth clipping."
            }

        logger.info(f"[Shorts] GPT identified {len(shorts_plan)} shorts to generate")

        # --- Step 3: Download video from SharePoint to temp file ---
        logger.info(f"[Shorts] Downloading video from SharePoint")
        video_bytes = self.sp.download_video(day_folder_name)
        if not video_bytes:
            raise FileNotFoundError(f"No video file found in '{day_folder_name}'")

        shorts_metadata = []

        with tempfile.TemporaryDirectory() as tmpdir:
            # Write video to temp file
            video_path = os.path.join(tmpdir, "input_video.mp4")
            with open(video_path, "wb") as f:
                f.write(video_bytes)
            logger.info(f"[Shorts] Video written to temp: {video_path} ({len(video_bytes)//1024//1024}MB)")

            # --- Steps 4 & 5: Cut each clip with FFmpeg and upload ---
            for i, short in enumerate(shorts_plan, start=1):
                start = short["start_seconds"]
                end = short["end_seconds"]
                duration = end - start
                filename = f"short_{i}.mp4"
                output_path = os.path.join(tmpdir, filename)

                if duration <= 0:
                    logger.warning(f"[Shorts] Skipping short_{i} — invalid duration ({duration}s)")
                    continue

                # FFmpeg cut — fast stream copy, no re-encode
                ffmpeg_cmd = [
                    "ffmpeg", "-y",
                    "-ss", str(start),
                    "-i", video_path,
                    "-t", str(duration),
                    "-c", "copy",           # stream copy = fast, no quality loss
                    "-avoid_negative_ts", "make_zero",
                    output_path
                ]

                logger.info(f"[Shorts] Cutting short_{i}: {start}s → {end}s ({duration}s)")
                result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)

                if result.returncode != 0:
                    logger.error(f"[Shorts] FFmpeg failed for short_{i}: {result.stderr}")
                    continue

                # Read clip bytes and upload
                with open(output_path, "rb") as f:
                    clip_bytes = f.read()

                sp_url = self.sp.upload_short(day_folder_name, filename, clip_bytes)

                shorts_metadata.append({
                    "short_number": i,
                    "filename": filename,
                    "title": short.get("title", f"Short {i}"),
                    "topic": short.get("topic", ""),
                    "start_seconds": start,
                    "end_seconds": end,
                    "duration_seconds": duration,
                    "sharepoint_url": sp_url,
                    "reason": short.get("reason", "")
                })

                logger.info(f"[Shorts] Uploaded short_{i} to SharePoint")

        logger.info(f"[Shorts] Done. {len(shorts_metadata)}/{len(shorts_plan)} shorts generated")
        # Upload shorts metadata JSON for app integration
        from datetime import datetime
        metadata_payload = {
            "day_folder": day_folder_name,
            "generated_at": datetime.utcnow().isoformat(),
            "shorts": shorts_metadata
        }
        self.sp.upload_short(
            day_folder_name,
            "shorts_metadata.json",
            json.dumps(metadata_payload, indent=2).encode("utf-8")
        )
        logger.info(f"[Shorts] Uploaded shorts_metadata.json")
        return {
            "day_folder_name": day_folder_name,
            "shorts_generated": len(shorts_metadata),
            "shorts": shorts_metadata,
            "message": f"Successfully generated {len(shorts_metadata)} shorts."
        }
# ------------------------------------------------------------------
# Interactive Quiz Generation
# ------------------------------------------------------------------

    async def generate_quiz(self, topic: str) -> Dict[str, Any]:
        """
        Generate a structured MCQ quiz on a given topic.
        Reads all summaries for context, then calls GPT with quiz-specific prompt.
        Returns structured JSON ready for the frontend quiz component.
        """
        context = self._gather_topic_context()
        quiz_data = self._call_openai_quiz(topic, context)
        questions = quiz_data.get("questions", [])

        validated = []
        for q in questions:
            if not all(k in q for k in ("question", "options", "correct_answer", "explanation")):
                logger.warning(f"Skipping malformed quiz question: {q}")
                continue
            if len(q["options"]) != 4:
                logger.warning(f"Skipping question with wrong option count: {q['question'][:50]}")
                continue
            if q["correct_answer"] not in ("A", "B", "C", "D"):
                logger.warning(f"Skipping question with invalid correct_answer: {q['correct_answer']}")
                continue
            validated.append({
                "question": q["question"],
                "options": q["options"],
                "correct_answer": q["correct_answer"],
                "explanation": q.get("explanation", ""),
                "topic": q.get("topic", topic),
            })

        logger.info(f"Quiz generated for topic '{topic}': {len(validated)} questions")
        return {
            "topic": topic,
            "questions": validated,
            "total_questions": len(validated),
        }

    def _gather_topic_context(self) -> str:
        """Read all summaries AND qa docs from SharePoint as reference context for quiz generation."""
        try:
            summaries = self.sp.read_all_summaries()
            qa_docs = self.sp.read_all_qa()

            summary_section = "\n\n".join(
                f"--- {folder} SUMMARY ---\n{text}" for folder, text in summaries.items() if text
            )
            qa_section = "\n\n".join(
                f"--- {folder} EXISTING QUESTIONS ---\n{text}" for folder, text in qa_docs.items() if text
            )

            combined = f"=== SUMMARY REFERENCE ===\n{summary_section}\n\n=== EXISTING QUESTIONS REFERENCE ===\n{qa_section}"
            return combined[:20_000]
        except Exception as e:
            logger.warning(f"Could not gather context for quiz (will use general knowledge): {e}")
            return ""

    def _call_openai_quiz(self, topic: str, context: str) -> dict:
        """Call Azure OpenAI with the quiz prompt and return parsed JSON."""
        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4.1",
                messages=[
                    {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
                    {"role": "user",   "content": _build_quiz_prompt(topic, context)},
                ],
                temperature=0.4,
                max_tokens=4000,
            )
            raw_text = response.choices[0].message.content
        except Exception as e:
            logger.error(f"Azure OpenAI quiz call failed: {e}", exc_info=True)
            raise RuntimeError(f"Quiz AI call failed: {e}")

        json_str = _clean_json_response(raw_text)
        if not json_str:
            raise ValueError(f"Could not parse JSON from quiz AI response: {raw_text[:300]}")

        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            json_str_fixed = self._attempt_json_fix(json_str)
            try:
                return json.loads(json_str_fixed)
            except json.JSONDecodeError:
                raise ValueError(f"Could not parse quiz JSON even after cleanup: {e.msg}")
    # ------------------------------------------------------------------
    # Chat-facing query methods
    # ------------------------------------------------------------------

    async def get_all_video_list(self) -> Dict[str, Any]:
        """
        Returns a clean list of all training sessions available.
        Only returns folder names — no mention of processing status.
        """
        folders = self.sp.list_day_folders()
        # Only include folders that have been processed (have a summary)
        processed = []
        for folder in folders:
            if self.sp.output_file_exists(folder, "summary.docx"):
                processed.append(folder)

        # Parse folder names into clean display format
        # e.g. "Day 2 - AI training - Pavan" → {"day": "Day 2", "trainer": "Pavan", "raw": "..."}
        sessions = []
        for folder in processed:
            parts = folder.split(" - ")
            sessions.append({
                "display_name": folder,
                "day": parts[0].strip() if len(parts) > 0 else folder,
                "trainer": parts[-1].strip() if len(parts) > 1 else "Unknown",
            })

        return {
            "sessions": sessions,
            "total": len(sessions),
        }

    async def get_all_sessions_overview(self) -> Dict[str, Any]:
        """
        Returns a GPT-generated 2-3 line overview of each session.
        Uses all available summaries.
        """
        from ..Utils.prompts import TRAINING_ALL_SESSIONS_OVERVIEW_PROMPT

        summaries = self.sp.read_all_summaries()
        if not summaries:
            return {"response": "No training sessions have been processed yet."}

        summaries_text = "\n\n".join(
            f"=== {folder} ===\n{text}" for folder, text in summaries.items()
        )

        response = self.openai_client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {"role": "user", "content": TRAINING_ALL_SESSIONS_OVERVIEW_PROMPT.format(
                    summaries=summaries_text
                )}
            ],
            temperature=0.2,
            max_tokens=2000,
        )
        return {"response": response.choices[0].message.content}

    async def search_topic_across_all(self, topic: str) -> Dict[str, Any]:
        """
        Searches all processed summaries for content about a specific topic.
        Returns a consolidated GPT-synthesized answer.
        """
        from ..Utils.prompts import TRAINING_TOPIC_SEARCH_PROMPT

        summaries = self.sp.read_all_summaries()
        if not summaries:
            return {"response": "No training sessions have been processed yet."}

        summaries_text = "\n\n".join(
            f"=== {folder} ===\n{text}" for folder, text in summaries.items()
        )

        response = self.openai_client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {"role": "user", "content": TRAINING_TOPIC_SEARCH_PROMPT.format(
                    topic=topic,
                    summaries=summaries_text
                )}
            ],
            temperature=0.2,
            max_tokens=3000,
        )
        return {"response": response.choices[0].message.content}

    async def get_topic_quiz(self, topic: str) -> Dict[str, Any]:
        """
        Extracts questions relevant to a specific topic from all Q&A files.
        """
        from ..Utils.prompts import TRAINING_TOPIC_QUIZ_PROMPT

        qa_data = self.sp.read_all_qa()
        if not qa_data:
            return {"response": "No practice questions are available yet."}

        qa_text = "\n\n".join(
            f"=== {folder} ===\n{text}" for folder, text in qa_data.items()
        )

        response = self.openai_client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {"role": "user", "content": TRAINING_TOPIC_QUIZ_PROMPT.format(
                    topic=topic,
                    qa_content=qa_text
                )}
            ],
            temperature=0.2,
            max_tokens=3000,
        )
        return {"response": response.choices[0].message.content}

    async def get_summary_for_day(self, day_folder_name: str) -> Dict[str, Any]:
        """
        Returns the summary for a specific day folder.
        """
        text = self.sp.read_output_docx(day_folder_name, "summary.docx")
        if not text:
            return {"response": f"No summary is available for '{day_folder_name}' yet."}
        return {"response": text, "session": day_folder_name}

    async def process_audio(self, day_folder_name: str) -> Dict[str, Any]:
        """
        Generate audio recap files from the summary of a Day folder.

        Flow:
        1. Read summary.docx from SharePoint
        2. GPT rewrites each topic as natural spoken audio script
        3. Azure TTS converts each topic → topic_N_audio.mp3
        4. Azure TTS converts full recap → full_recap_audio.mp3
        5. Upload all audio files + audio_metadata.json to output/
        """
        import tempfile
        import os

        # Check if already processed
        status = self.sp.read_processing_status(day_folder_name)
        if status and status.get("audioCompleted"):
            return {
                "day_folder_name": day_folder_name,
                "audio_files_created": 0,
                "message": "Audio already completed. Skipping.",
            }

        # Read summary
        summary_text = self.sp.read_output_docx(day_folder_name, "summary.docx")
        if not summary_text:
            raise FileNotFoundError(f"No summary.docx found for '{day_folder_name}'. Run Phase 1 first.")

        # GPT rewrites summary into spoken audio scripts per topic
        audio_scripts = self._generate_audio_script(summary_text)
        if not audio_scripts:
            raise ValueError("GPT could not generate audio scripts from summary.")

        logger.info(f"Generated {len(audio_scripts)} topic audio scripts for '{day_folder_name}'")

        audio_metadata = []

        with tempfile.TemporaryDirectory() as tmp_dir:
            

            for i, script in enumerate(audio_scripts):
                topic_num = i + 1
                filename = f"topic_{topic_num}_audio.mp3"
                local_path = os.path.join(tmp_dir, filename)

                # Convert to speech
                success = self._text_to_speech(script["spoken_text"], local_path)
                if not success:
                    logger.warning(f"TTS failed for topic {topic_num}, skipping")
                    continue

                # Upload to SharePoint
                with open(local_path, "rb") as f:
                    audio_bytes = f.read()
                sharepoint_url = self.sp.upload_audio(day_folder_name, filename, audio_bytes)

                audio_metadata.append({
                    "audio_id": f"topic_{topic_num}_audio",
                    "filename": filename,
                    "topic": script["topic"],
                    "topic_number": topic_num,
                    "type": "topic",
                    "sharepoint_url": sharepoint_url,
                })
                logger.info(f"Uploaded {filename} for '{day_folder_name}'")

        # Upload audio_metadata.json
        self.sp.upload_audio_metadata(day_folder_name, audio_metadata)

        # Update processing status
        self.sp.upload_processing_status_with_audio(day_folder_name, audio_completed=True)

        return {
            "day_folder_name": day_folder_name,
            "audio_files_created": len(audio_metadata),
            "topics_covered": len([a for a in audio_metadata if a["type"] == "topic"]),
            "message": f"Audio generation completed. {len(audio_metadata)} files created.",
        }
    
    async def reprocess_audio(self, day_folder_name: str) -> Dict[str, Any]:
        """Force regenerate audio by resetting audioCompleted flag."""
        existing = self.sp.read_processing_status(day_folder_name) or {}
        self.sp.upload_processing_status_with_audio(day_folder_name, audio_completed=False)
        logger.info(f"Reset audioCompleted for '{day_folder_name}', reprocessing...")
        return await self.process_audio(day_folder_name)
    
    async def stream_audio_file(self, day_folder_name: str, filename: str) -> bytes:
        """Download audio file from SharePoint and return bytes for streaming."""
        audio_bytes = self.sp.download_audio(day_folder_name, filename)
        if not audio_bytes:
            raise FileNotFoundError(f"Audio file '{filename}' not found for '{day_folder_name}'")
        return audio_bytes

    async def stream_short_file(self, day_folder_name: str, filename: str) -> bytes:
        """Download short video from SharePoint and return bytes for streaming."""
        video_bytes = self.sp.download_short(day_folder_name, filename)
        if not video_bytes:
            raise FileNotFoundError(f"Short '{filename}' not found for '{day_folder_name}'")
        return video_bytes

    def _generate_audio_script(self, summary_text: str) -> list:
        """
        GPT rewrites the summary into natural spoken audio scripts per topic.
        Returns list of {topic, spoken_text} dicts.
        """
        prompt = f"""
You are converting a training session summary into audio scripts for employees.

SUMMARY:
{summary_text}

YOUR TASK:
For each topic in the summary, write a natural spoken explanation that:
- Sounds like a knowledgeable colleague explaining the topic out loud
- Uses conversational language (no bullet points, no markdown, no bold text)
- Flows naturally when read aloud (use transitions like "First...", "Another key point...", "What's important here is...")
- Is detailed enough to be genuinely educational (2-4 minutes when spoken)
- Starts by naming the topic: "In this section, we covered [topic name]..."
- Ends with a brief summary sentence of the key takeaway

OUTPUT FORMAT (strict JSON array, no markdown):
[
  {{
    "topic": "Topic name here",
    "spoken_text": "Full natural spoken script here..."
  }}
]

Return ONLY the JSON array. No explanation.
""".strip()

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4.1",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=6000,
            )
            raw = response.choices[0].message.content
        except Exception as e:
            logger.error(f"GPT audio script generation failed: {e}", exc_info=True)
            raise RuntimeError(f"GPT call failed: {e}")

        raw_stripped = raw.strip()
        arr_start = raw_stripped.find('[')
        arr_end = raw_stripped.rfind(']')
        if arr_start == -1 or arr_end == -1:
            raise ValueError(f"No JSON array in GPT audio script response: {raw_stripped[:200]}")

        return json.loads(raw_stripped[arr_start:arr_end + 1])

    def _text_to_speech(self, text: str, output_path: str) -> bool:
        """
        Convert text to speech using Azure TTS and save as MP3.
        Returns True on success, False on failure.
        """
        import azure.cognitiveservices.speech as speechsdk

        try:
            speech_config = speechsdk.SpeechConfig(
                subscription=config.AZURE_SPEECH_KEY,
                region=config.AZURE_SPEECH_REGION,
            )
            speech_config.set_speech_synthesis_output_format(
                speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
            )
            # Use a natural, clear English voice
            speech_config.speech_synthesis_voice_name = "en-US-JennyNeural"

            audio_config = speechsdk.audio.AudioOutputConfig(filename=output_path)
            synthesizer = speechsdk.SpeechSynthesizer(
                speech_config=speech_config,
                audio_config=audio_config,
            )

            result = synthesizer.speak_text_async(text).get()
            logger.info(f"TTS result reason: {result.reason}")

            if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
                logger.info(f"TTS succeeded: {output_path}")
                return True
            else:
                cancellation_details = result.cancellation_details if result.reason == speechsdk.ResultReason.Canceled else None
                logger.warning(f"TTS failed: {result.reason} — {cancellation_details.error_details if cancellation_details else 'no details'} — {cancellation_details.reason if cancellation_details else ''}")
                return False

        except Exception as e:
            logger.error(f"TTS exception: {e}", exc_info=True)
            return False

    async def get_audio_by_day(self, day_folder_name: str) -> Dict[str, Any]:
        """Returns all available audio files for a specific Day folder."""
        audio_raw = self.sp.read_audio_metadata(day_folder_name)
        return {
            "audio_files": audio_raw,
            "total": len(audio_raw),
            "query": day_folder_name,
        }     



    async def get_qa_for_day(self, day_folder_name: str) -> Dict[str, Any]:
        """
        Returns the Q&A questions for a specific day folder.
        """
        text = self.sp.read_output_docx(day_folder_name, "qa.docx")
        if not text:
            return {"response": f"No practice questions are available for '{day_folder_name}' yet."}
        return {"response": text, "session": day_folder_name}

    async def get_capability_overview(self) -> Dict[str, Any]:
        """
        Returns a topic-by-session capability overview so users know what they can ask about.
        """
        from ..Utils.prompts import TRAINING_CAPABILITY_PROMPT

        summaries = self.sp.read_all_summaries()
        if not summaries:
            return {"response": "No training sessions have been processed yet."}

        summaries_text = "\n\n".join(
            f"=== {folder} ===\n{text}" for folder, text in summaries.items()
        )

        response = self.openai_client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {"role": "user", "content": TRAINING_CAPABILITY_PROMPT.format(
                    summaries=summaries_text
                )}
            ],
            temperature=0.2,
            max_tokens=2000,
        )
        return {"response": response.choices[0].message.content}

    def _match_folder_to_query(self, folders: list, day_number: Optional[int], trainer_name: Optional[str]) -> Optional[str]:
        """
        Matches a day number and/or trainer name to the closest folder name.
        Returns the matched folder name, or None if no match found.
        If multiple folders match (e.g. trainer has multiple days), returns None to trigger clarification.
        """
        matches = []
        for folder in folders:
            folder_lower = folder.lower()
            day_match = False
            trainer_match = False

            if day_number is not None:
                day_match = f"day {day_number}" in folder_lower

            if trainer_name is not None:
                trainer_match = trainer_name.lower() in folder_lower

            if day_number is not None and trainer_name is not None:
                if day_match and trainer_match:
                    matches.append(folder)
            elif day_number is not None:
                if day_match:
                    matches.append(folder)
            elif trainer_name is not None:
                if trainer_match:
                    matches.append(folder)

        if len(matches) == 1:
            return matches[0]
        elif len(matches) > 1:
            return f"AMBIGUOUS:{','.join(matches)}"  # caller handles clarification
        return None

    # ------------------------------------------------------------------
    # Private: AI call
    # ------------------------------------------------------------------

    def _call_openai(self, transcript: str) -> dict:
        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4.1",
                messages=[
                    {"role": "system", "content": TRAINING_SYSTEM_PROMPT},
                    {"role": "user",   "content": _build_user_prompt(transcript)},
                ],
                temperature=0.2,
                max_tokens=8000,  # Increased from 4000 to handle longer responses
            )
            raw_text = response.choices[0].message.content
        except Exception as e:
            logger.error(f"Azure OpenAI call failed: {e}", exc_info=True)
            raise RuntimeError(f"AI call failed: {e}")

        # Log the raw response for debugging
        logger.debug(f"Raw AI response length: {len(raw_text)} chars")

        json_str = _clean_json_response(raw_text)
        if not json_str:
            logger.error(f"Could not extract JSON from AI response. First 500 chars: {raw_text[:500]}")
            raise ValueError(
                f"Could not parse JSON from AI response: {raw_text[:300]}"
            )

        # Try to parse the JSON
        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            # Log the problematic JSON for debugging
            logger.error(f"JSON parsing failed at position {e.pos}: {e.msg}")
            logger.error(f"Problematic JSON substring: {json_str[max(0, e.pos-100):e.pos+100]}")

            # Try to fix common issues
            json_str_fixed = self._attempt_json_fix(json_str)
            try:
                return json.loads(json_str_fixed)
            except json.JSONDecodeError:
                raise ValueError(f"Could not parse JSON even after cleanup: {e.msg} at position {e.pos}")

    def _attempt_json_fix(self, json_str: str) -> str:
        """Attempt to fix common JSON formatting issues"""
        # Replace smart quotes with regular quotes
        json_str = json_str.replace('\u201c', '"').replace('\u201d', '"')
        json_str = json_str.replace('\u2018', "'").replace('\u2019', "'")

        # Remove any trailing commas before closing brackets/braces
        json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)

        # Fix escaped newlines in strings
        json_str = json_str.replace('\n', '\\n')

        return json_str

    # ------------------------------------------------------------------
    # Private: Document builders
    # ------------------------------------------------------------------

    def _upload_summary(self, day_folder_name: str, summary_text: str):
        paragraphs = ["Training Summary", "", summary_text]
        self.sp.upload_docx(day_folder_name, "summary.docx", paragraphs)
        logger.info(f"summary.docx uploaded for '{day_folder_name}'")

    def _upload_qa(self, day_folder_name: str, questions: list):
        """
        Upload questions grouped by topic.
        Expected format: [{"topic": "Topic Name", "question": "Question text"}, ...]
        """
        paragraphs = ["Training Knowledge Check — Questions", ""]

        # Group questions by topic
        topic_questions = {}
        for item in questions:
            topic = item.get('topic', 'General')
            question = item.get('question', '')
            if topic not in topic_questions:
                topic_questions[topic] = []
            topic_questions[topic].append(question)

        # Write questions grouped by topic
        q_num = 1
        for topic, topic_qs in topic_questions.items():
            paragraphs.append(f"**{topic}**")
            paragraphs.append("")
            for q in topic_qs:
                paragraphs.append(f"Q{q_num}. {q}")
                q_num += 1
            paragraphs.append("")

        self.sp.upload_docx(day_folder_name, "qa.docx", paragraphs)
        logger.info(f"qa.docx uploaded for '{day_folder_name}' with {len(questions)} questions across {len(topic_questions)} topics")