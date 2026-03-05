# upload_excel.py
import pandas as pd
import base64
from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex, SimpleField, SearchableField, SearchFieldDataType
)

# --- CONFIGURATION ---
ENDPOINT = "https://kalpitanexa.search.windows.net" 
KEY = ""  # <--- MUST BE ADMIN KEY
INDEX_NAME = "kalpita-rmfm-list"
EXCEL_FILE = "App/Documents/Employee RM_FM.xls"

def create_and_upload():
    print(f"Reading {EXCEL_FILE}...")
    df = pd.read_excel(EXCEL_FILE)

    # 1. Map Excel Headers to Clean Field Names
    # Update the keys on the left to match your EXACT Excel headers
    df = df.rename(columns={
        "Employee Code": "EmployeeCode",
        "Name": "Name",
        "Work email": "WorkEmail",
        "Reporting manager": "ReportingManagerCode", # Column D (IDs)
        "Designation": "Role"
    })

    # 2. Create Index Schema
    index_client = SearchIndexClient(ENDPOINT, AzureKeyCredential(KEY))
    fields = [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SearchableField(name="EmployeeCode", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="Name", type=SearchFieldDataType.String, sortable=True),
        SearchableField(name="WorkEmail", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="ReportingManagerCode", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="Role", type=SearchFieldDataType.String)
    ]
    index = SearchIndex(name=INDEX_NAME, fields=fields)
    index_client.create_or_update_index(index)
    print(f"Index '{INDEX_NAME}' created.")

    # 3. Upload Data
    search_client = SearchClient(ENDPOINT, INDEX_NAME, AzureKeyCredential(KEY))
    documents = []

    for _, row in df.iterrows():
        email = str(row["WorkEmail"]).strip()
        if email.lower() == "nan": continue

        # Generate a safe ID from email
        safe_id = base64.urlsafe_b64encode(email.encode("utf-8")).decode("utf-8")

        doc = {
            "id": safe_id,
            "EmployeeCode": str(row["EmployeeCode"]),
            "Name": str(row["Name"]),
            "WorkEmail": email,
            "ReportingManagerCode": str(row["ReportingManagerCode"]),
            "Role": str(row.get("Role", "Employee"))
        }
        documents.append(doc)

    if documents:
        search_client.upload_documents(documents)
        print(f"Uploaded {len(documents)} records.")

if __name__ == "__main__":
    create_and_upload()