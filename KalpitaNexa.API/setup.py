# FILE: setup.py
# ACTION: Replace the entire file with this code.

from setuptools import setup, find_packages

# Read the requirements from the requirements.txt file
with open('requirements.txt') as f:
    requirements = f.read().splitlines()

setup(
    name='kalpitaai_agent',
    version='0.1.0',
    packages=find_packages(),
    include_package_data=True,
    
    install_requires=requirements,
    entry_points={
        'console_scripts': [
            'kalpitaai_agent=main:app',  
        ],
    },
    author='AI agent',
    author_email='Sayan.Dutta@kalpitatechnologies.com',
    description='KalpitaAI Agent using FastAPI',
    keywords='KalpitaAI Agent fastapi ocr',
    classifiers=[
        'Programming Language :: Python :: 3',
        'Framework :: FastAPI',
        'License :: OSI Approved :: MIT License',
        'Operating System :: OS Independent',
    ],
    python_requires='>=3.8',
)