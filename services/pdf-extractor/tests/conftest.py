"""
conftest.py — shared pytest fixtures for pdf-extractor tests.
"""
import sys
import os

# Ensure the project root is on sys.path so `app.*` imports resolve
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
