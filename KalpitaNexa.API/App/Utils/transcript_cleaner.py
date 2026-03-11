"""
Transcript Cleaner Utility — Phase 2 (Video Shorts)
=====================================================
Place at: KalpitaNexa/KalpitaNexa.API/App/Utils/transcript_cleaner.py
"""

import re
import logging
import hashlib
from dataclasses import dataclass
from typing import List, Optional
from openai import AzureOpenAI

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SILENCE_GAP_THRESHOLD_SECONDS = 8
MIN_CONTENT_DENSITY = 2.5

TRIVIAL_PHRASES = {
    "just a second", "one second", "yeah", "hi", "hello",
    "can i go", "can i", "hold on", "give me a second",
    "excuse me", "hi again", "yes", "yep", "nope", "no",
    "um", "uh", "hmm", "ok", "okay"
}

FILLER_WORDS = [
    r'\bumm+\b',
    r'\buhh?\b',
    r'\bargh+\b',
    r'\bahh+\b',
    r'\bhmm+\b',
    r'\berm+\b',
]

TECH_TERM_CORRECTIONS = {
    r'\bangler\b': 'Angular',
    r'\breactor\b': 'React',
    r'\btype\s+script\b': 'TypeScript',
    r'\bjava\s+script\b': 'JavaScript',
    r'\bpie\s*thon\b': 'Python',
    r'\bas\s+your\b': 'Azure',
    r'\bsequel\b': 'SQL',
    r'\bno\s+sequel\b': 'NoSQL',
    r'\bmongo\s*d\s*b\b': 'MongoDB',
    r'\bjason\b': 'JSON',
    r'\bget\s+hub\b': 'GitHub',
    r'\bA\s*W\s*S\b': 'AWS',
    r'\bG\s*C\s*P\b': 'GCP',
    r'\bllms?\b': 'LLMs',
    r'\bcollab\b': 'Colab',
    r'\bipynb\b': '.ipynb',
    r'\bjupyter\s+note\s*book\b': 'Jupyter Notebook',
    r'\bvs\s+code\b': 'VS Code',
    r'\bdot\s+net\b': '.NET',
    r'\bC\s+sharp\b': 'C#',
    r'\bsee\s+sharp\b': 'C#',
}

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class RawSegment:
    start_seconds: int
    end_seconds: Optional[int]
    text: str


@dataclass
class CleanSegment:
    start_seconds: int
    end_seconds: int
    original_text: str
    cleaned_text: str


# ---------------------------------------------------------------------------
# TranscriptCleaner
# ---------------------------------------------------------------------------

class TranscriptCleaner:

    def __init__(self, openai_client: AzureOpenAI, deployment_name: str):
        self._client = openai_client
        self._deployment = deployment_name
        self._cache: dict[str, str] = {}

    # ------------------------------------------------------------------
    # STEP 1 — Parse
    # ------------------------------------------------------------------

    def parse_docx_text(self, raw_text: str) -> List[RawSegment]:
        segments: List[RawSegment] = []

        raw_text = raw_text.replace('\r\n', '\n').replace('\r', '\n')

        lines = raw_text.split('\n')

        i = 0
        while i < len(lines):
            line = lines[i].strip()

            ts_match = re.search(r'(\d+):(\d{2})(?::(\d{2}))?$', line)
            if ts_match:
                g = ts_match.groups()
                if g[2] is not None:
                    seconds = int(g[0]) * 3600 + int(g[1]) * 60 + int(g[2])
                else:
                    seconds = int(g[0]) * 60 + int(g[1])

                text_lines = []
                i += 1
                while i < len(lines):
                    next_line = lines[i].strip()
                    if re.search(r'(\d+):(\d{2})(?::(\d{2}))?$', next_line):
                        break
                    if next_line:
                        text_lines.append(next_line)
                    i += 1

                text = ' '.join(text_lines).strip()
                if text:
                    segments.append(RawSegment(start_seconds=seconds, end_seconds=None, text=text))
            else:
                i += 1

        for i in range(len(segments) - 1):
            segments[i].end_seconds = segments[i + 1].start_seconds
        if segments:
            segments[-1].end_seconds = segments[-1].start_seconds + 30

        logger.info(f"[Parse] Extracted {len(segments)} raw segments")
        return segments

    # ------------------------------------------------------------------
    # STEP 1b — Split Long Segments
    # ------------------------------------------------------------------

    def split_long_segments(self, segments: List[RawSegment], max_duration: int = 120) -> List[RawSegment]:
        """
        Split segments longer than max_duration seconds into sentence-level chunks.
        Distributes timestamps evenly across sentences.
        """
        result = []
        for seg in segments:
            duration = (seg.end_seconds or seg.start_seconds + 30) - seg.start_seconds
            if duration <= max_duration:
                result.append(seg)
                continue

            sentences = re.split(r'(?<=[.!?])\s+', seg.text.strip())
            sentences = [s.strip() for s in sentences if s.strip()]
            if len(sentences) <= 1:
                result.append(seg)
                continue

            time_per_sentence = duration / len(sentences)
            for i, sentence in enumerate(sentences):
                start = seg.start_seconds + int(i * time_per_sentence)
                end = seg.start_seconds + int((i + 1) * time_per_sentence)
                result.append(RawSegment(start_seconds=start, end_seconds=end, text=sentence))

        logger.info(f"[Split] {len(segments)} segments → {len(result)} after splitting long segments")
        return result

    # ------------------------------------------------------------------
    # STEP 2 — Gap Filter
    # ------------------------------------------------------------------

    def filter_dead_segments(self, segments: List[RawSegment]) -> List[RawSegment]:
        if not segments:
            return segments

        kept = []

        for seg in segments:
            duration = (seg.end_seconds or seg.start_seconds + 30) - seg.start_seconds
            char_density = len(seg.text) / max(duration, 1)
            normalized = re.sub(r'[^\w\s]', '', seg.text.lower()).strip()

            is_trivial_phrase = normalized in TRIVIAL_PHRASES
            is_long_silence = duration >= SILENCE_GAP_THRESHOLD_SECONDS
            is_low_density = char_density < MIN_CONTENT_DENSITY

            if (is_long_silence and is_trivial_phrase) or (is_long_silence and is_low_density and len(seg.text) < 20):
                logger.debug(
                    f"[GapFilter] Dropped: {seg.start_seconds}s "
                    f"dur={duration}s density={char_density:.1f} text='{seg.text}'"
                )
                continue

            kept.append(seg)

        logger.info(f"[GapFilter] {len(kept)}/{len(segments)} segments kept ({len(segments)-len(kept)} dropped)")
        return kept

    # ------------------------------------------------------------------
    # STEP 3 — Rule-based Filler Removal
    # ------------------------------------------------------------------

    def remove_fillers(self, segments: List[RawSegment]) -> List[RawSegment]:
        for seg in segments:
            text = seg.text

            for pattern in FILLER_WORDS:
                text = re.sub(pattern, '', text, flags=re.IGNORECASE)

            text = re.sub(r'\b(\w+)[,\s]+\1\b', r'\1', text, flags=re.IGNORECASE)

            text = re.sub(
                r'\b((?:\w+\s+){1,3}\w+)\s+\1\b',
                r'\1',
                text,
                flags=re.IGNORECASE
            )

            for pattern, replacement in TECH_TERM_CORRECTIONS.items():
                text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

            text = re.sub(r'\s{2,}', ' ', text).strip()
            text = re.sub(r'^[,\s]+', '', text)
            text = re.sub(r'\s+([,.])', r'\1', text)

            seg.text = text

        logger.info(f"[RuleClean] Filler removal applied to {len(segments)} segments")
        return segments

    # ------------------------------------------------------------------
    # STEP 4 — GPT Clean Pass
    # ------------------------------------------------------------------

    async def gpt_clean_segments(self, segments: List[RawSegment]) -> List[RawSegment]:
        for seg in segments:
            text = seg.text
            if not text or len(text) < 10:
                continue

            cache_key = hashlib.md5(text.encode()).hexdigest()

            if cache_key in self._cache:
                seg.text = self._cache[cache_key]
                continue

            try:
                response = self._client.chat.completions.create(
                    model=self._deployment,
                    temperature=0.0,
                    max_tokens=300,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a transcription correction assistant for AI/tech training videos. "
                                "Fix ONLY speech-to-text misrecognitions of technical terms. "
                                "Do NOT change sentence structure. "
                                "Do NOT remove content. "
                                "Do NOT add anything new. "
                                "Return ONLY the corrected text, nothing else."
                            )
                        },
                        {
                            "role": "user",
                            "content": f"Fix technical term misrecognitions only:\n\n{text}"
                        }
                    ]
                )
                cleaned = response.choices[0].message.content.strip()
                self._cache[cache_key] = cleaned
                seg.text = cleaned

            except Exception as e:
                logger.warning(
                    f"[GPTClean] Failed for segment at {seg.start_seconds}s: {e}. "
                    f"Using rule-cleaned text as fallback."
                )

        logger.info(f"[GPTClean] Pass complete on {len(segments)} segments")
        return segments

    # ------------------------------------------------------------------
    # STEP 5 — Build Output
    # ------------------------------------------------------------------

    def _build_output(
        self,
        original: List[RawSegment],
        cleaned: List[RawSegment]
    ) -> List[CleanSegment]:
        orig_map = {s.start_seconds: s.text for s in original}
        result = []

        for seg in cleaned:
            result.append(CleanSegment(
                start_seconds=seg.start_seconds,
                end_seconds=seg.end_seconds,
                original_text=orig_map.get(seg.start_seconds, seg.text),
                cleaned_text=seg.text,
            ))

        return result

    # ------------------------------------------------------------------
    # Main Entry Point
    # ------------------------------------------------------------------

    async def clean(self, raw_text: str) -> List[CleanSegment]:
        # Step 1 — Parse into segments
        segments = self.parse_docx_text(raw_text)
        if not segments:
            logger.warning("[Clean] No segments parsed from transcript")
            return []

        # Step 1b — Split long segments into sentence-level chunks
        segments = self.split_long_segments(segments, max_duration=120)

        # Save originals before mutation
        original_segments = [
            RawSegment(s.start_seconds, s.end_seconds, s.text)
            for s in segments
        ]

        # Step 2 — Drop dead/silent segments
        segments = self.filter_dead_segments(segments)

        # Step 3 — Rule-based filler + stutter removal
        segments = self.remove_fillers(segments)

        # Step 4 — GPT technical term correction (disabled — too expensive at scale)
        logger.info(f"[GPTClean] Skipped — using rule-based corrections only")

        # Step 5 — Build final output
        clean_segments = self._build_output(original_segments, segments)

        logger.info(
            f"[Clean] Done. {len(original_segments)} raw → {len(clean_segments)} clean segments"
        )
        return clean_segments