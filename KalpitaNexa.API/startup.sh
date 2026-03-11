#!/bin/bash
set -e

# Install dependencies
python3 -m pip install --upgrade pip
pip3 install -r requirements.txt
pip3 install output.tar.gz  # or kalpitaai_agent-0.1.0.tar.gz

# Run FastAPI app
exec uvicorn main:app --host 0.0.0.0 --port 8000